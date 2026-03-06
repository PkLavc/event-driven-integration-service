import * as fs from 'fs';
import { URL } from 'url';
import * as path from 'path';
import { v4 } from 'uuid';
// Note: this Polyfill is only needed for Node versions < 15.4.0
import { AbortController } from 'node-abort-controller';
import { delay, DELAY_TIME_1, isNotConnectionError, isRedisInstance, WORKER_SUFFIX, } from '../utils';
import { QueueBase } from './queue-base';
import { Repeat } from './repeat';
import { ChildPool } from './child-pool';
import { Job } from './job';
import { RedisConnection } from './redis-connection';
import sandbox from './sandbox';
import { AsyncFifoQueue } from './async-fifo-queue';
import { DelayedError, RateLimitError, RATE_LIMIT_ERROR, WaitingChildrenError, } from './errors';
// 10 seconds is the maximum time a BRPOPLPUSH can block.
const maximumBlockTimeout = 10;
/**
 *
 * This class represents a worker that is able to process jobs from the queue.
 * As soon as the class is instantiated and a connection to Redis is established
 * it will start processing jobs.
 *
 */
export class Worker extends QueueBase {
    static RateLimitError() {
        return new RateLimitError();
    }
    constructor(name, processor, opts = {}, Connection) {
        super(name, Object.assign(Object.assign({}, opts), { blockingConnection: true }), Connection);
        this.abortDelayController = null;
        this.blockUntil = 0;
        this.drained = false;
        this.extendLocksTimer = null;
        this.limitUntil = 0;
        this.waiting = null;
        this.running = false;
        this.opts = Object.assign({ drainDelay: 5, concurrency: 1, lockDuration: 30000, maxStalledCount: 1, stalledInterval: 30000, autorun: true, runRetryDelay: 15000 }, this.opts);
        if (this.opts.stalledInterval <= 0) {
            throw new Error('stalledInterval must be greater than 0');
        }
        this.concurrency = this.opts.concurrency;
        this.opts.lockRenewTime =
            this.opts.lockRenewTime || this.opts.lockDuration / 2;
        this.id = v4();
        if (processor) {
            if (typeof processor === 'function') {
                this.processFn = processor;
            }
            else {
                // SANDBOXED
                if (processor instanceof URL) {
                    if (!fs.existsSync(processor)) {
                        throw new Error(`URL ${processor} does not exist in the local file system`);
                    }
                    processor = processor.href;
                }
                else {
                    const supportedFileTypes = ['.js', '.ts', '.flow', '.cjs'];
                    const processorFile = processor +
                        (supportedFileTypes.includes(path.extname(processor)) ? '' : '.js');
                    if (!fs.existsSync(processorFile)) {
                        throw new Error(`File ${processorFile} does not exist`);
                    }
                }
                const mainFile = this.opts.useWorkerThreads
                    ? 'main-worker.js'
                    : 'main.js';
                let mainFilePath = path.join(path.dirname(module.filename), `${mainFile}`);
                try {
                    fs.statSync(mainFilePath); // would throw if file not exists
                }
                catch (_) {
                    mainFilePath = path.join(process.cwd(), `dist/cjs/classes/${mainFile}`);
                    fs.statSync(mainFilePath);
                }
                this.childPool = new ChildPool({
                    mainFile: mainFilePath,
                    useWorkerThreads: this.opts.useWorkerThreads,
                });
                this.processFn = sandbox(processor, this.childPool).bind(this);
            }
            if (this.opts.autorun) {
                this.run().catch(error => this.emit('error', error));
            }
        }
        const connectionName = this.clientName(WORKER_SUFFIX);
        this.blockingConnection = new RedisConnection(isRedisInstance(opts.connection)
            ? opts.connection.duplicate({ connectionName })
            : Object.assign(Object.assign({}, opts.connection), { connectionName }), false, true, opts.skipVersionCheck);
        this.blockingConnection.on('error', error => this.emit('error', error));
        this.blockingConnection.on('ready', () => setTimeout(() => this.emit('ready'), 0));
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    off(eventName, listener) {
        super.off(eventName, listener);
        return this;
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
    callProcessJob(job, token) {
        return this.processFn(job, token);
    }
    createJob(data, jobId) {
        return this.Job.fromJSON(this, data, jobId);
    }
    /**
     *
     * Waits until the worker is ready to start processing jobs.
     * In general only useful when writing tests.
     *
     */
    async waitUntilReady() {
        await super.waitUntilReady();
        return this.blockingConnection.client;
    }
    set concurrency(concurrency) {
        if (typeof concurrency !== 'number' ||
            concurrency < 1 ||
            !isFinite(concurrency)) {
            throw new Error('concurrency must be a finite number greater than 0');
        }
        this.opts.concurrency = concurrency;
    }
    get repeat() {
        return new Promise(async (resolve) => {
            if (!this._repeat) {
                const connection = await this.client;
                this._repeat = new Repeat(this.name, Object.assign(Object.assign({}, this.opts), { connection }));
                this._repeat.on('error', e => this.emit.bind(this, e));
            }
            resolve(this._repeat);
        });
    }
    async run() {
        if (!this.processFn) {
            throw new Error('No process function is defined.');
        }
        if (this.running) {
            throw new Error('Worker is already running.');
        }
        try {
            this.running = true;
            if (this.closing) {
                return;
            }
            await this.startStalledCheckTimer();
            const jobsInProgress = new Set();
            this.startLockExtenderTimer(jobsInProgress);
            const asyncFifoQueue = (this.asyncFifoQueue =
                new AsyncFifoQueue());
            let tokenPostfix = 0;
            const client = await this.client;
            const bclient = await this.blockingConnection.client;
            while (!this.closing) {
                let numTotal = asyncFifoQueue.numTotal();
                while (!this.waiting &&
                    numTotal < this.opts.concurrency &&
                    (!this.limitUntil || numTotal == 0)) {
                    const token = `${this.id}:${tokenPostfix++}`;
                    const fetchedJob = this.retryIfFailed(() => this._getNextJob(client, bclient, token, { block: true }), this.opts.runRetryDelay);
                    asyncFifoQueue.add(fetchedJob);
                    numTotal = asyncFifoQueue.numTotal();
                    if (this.waiting && numTotal > 1) {
                        // We have a job waiting but we have others that we could start processing already
                        break;
                    }
                    // We await here so that we fetch jobs in sequence, this is important to avoid unnecessary calls
                    // to Redis in high concurrency scenarios.
                    const job = await fetchedJob;
                    // No more jobs waiting but we have others that could start processing already
                    if (!job && numTotal > 1) {
                        break;
                    }
                    // If there are potential jobs to be processed and blockUntil is set, we should exit to avoid waiting
                    // for processing this job.
                    if (this.blockUntil) {
                        break;
                    }
                }
                // Since there can be undefined jobs in the queue (when a job fails or queue is empty)
                // we iterate until we find a job.
                let job;
                do {
                    job = await asyncFifoQueue.fetch();
                } while (!job &&
                    asyncFifoQueue.numTotal() > 0 &&
                    asyncFifoQueue.numQueued() > 0);
                if (job) {
                    const token = job.token;
                    asyncFifoQueue.add(this.retryIfFailed(() => this.processJob(job, token, () => asyncFifoQueue.numTotal() <= this.opts.concurrency, jobsInProgress), this.opts.runRetryDelay));
                }
            }
            this.running = false;
            return asyncFifoQueue.waitAll();
        }
        catch (error) {
            this.running = false;
            throw error;
        }
    }
    /**
     * Returns a promise that resolves to the next job in queue.
     * @param token - worker token to be assigned to retrieved job
     * @returns a Job or undefined if no job was available in the queue.
     */
    async getNextJob(token, { block = true } = {}) {
        return this._getNextJob(await this.client, await this.blockingConnection.client, token, { block });
    }
    async _getNextJob(client, bclient, token, { block = true } = {}) {
        var _a;
        if (this.paused) {
            if (block) {
                await this.paused;
            }
            else {
                return;
            }
        }
        if (this.closing) {
            return;
        }
        if (this.drained && block && !this.limitUntil && !this.waiting) {
            this.waiting = this.waitForJob(bclient);
            try {
                const jobId = await this.waiting;
                return this.moveToActive(client, token, jobId);
            }
            catch (err) {
                // Swallow error if locally paused or closing since we did force a disconnection
                if (!(this.paused || this.closing) &&
                    isNotConnectionError(err)) {
                    throw err;
                }
            }
            finally {
                this.waiting = null;
            }
        }
        else {
            if (this.limitUntil) {
                (_a = this.abortDelayController) === null || _a === void 0 ? void 0 : _a.abort();
                this.abortDelayController = new AbortController();
                await this.delay(this.limitUntil, this.abortDelayController);
            }
            return this.moveToActive(client, token);
        }
    }
    /**
     * Overrides the rate limit to be active for the next jobs.
     *
     * @param expireTimeMs - expire time in ms of this rate limit.
     */
    async rateLimit(expireTimeMs) {
        await this.client.then(client => client.set(this.keys.limiter, Number.MAX_SAFE_INTEGER, 'PX', expireTimeMs));
    }
    async moveToActive(client, token, jobId) {
        // If we get the special delayed job ID, we pick the delay as the next
        // block timeout.
        if (jobId && jobId.startsWith('0:')) {
            this.blockUntil = parseInt(jobId.split(':')[1]) || 0;
            // Remove marker from active list.
            await client.lrem(this.keys.active, 1, jobId);
            if (this.blockUntil > 0) {
                return;
            }
        }
        const [jobData, id, limitUntil, delayUntil] = await this.scripts.moveToActive(client, token, jobId);
        this.updateDelays(limitUntil, delayUntil);
        return this.nextJobFromJobData(jobData, id, token);
    }
    async waitForJob(bclient) {
        if (this.paused) {
            return;
        }
        try {
            const opts = this.opts;
            if (!this.closing) {
                let blockTimeout = Math.max(this.blockUntil
                    ? (this.blockUntil - Date.now()) / 1000
                    : opts.drainDelay, 0);
                let jobId;
                // Blocking for less than 50ms is useless.
                if (blockTimeout > 0.05) {
                    blockTimeout = this.blockingConnection.capabilities.canDoubleTimeout
                        ? blockTimeout
                        : Math.ceil(blockTimeout);
                    // We restrict the maximum block timeout to 10 second to avoid
                    // blocking the connection for too long in the case of reconnections
                    // reference: https://github.com/taskforcesh/bullmq/issues/1658
                    blockTimeout = Math.min(blockTimeout, maximumBlockTimeout);
                    jobId = await bclient.brpoplpush(this.keys.wait, this.keys.active, blockTimeout);
                }
                else {
                    jobId = await bclient.rpoplpush(this.keys.wait, this.keys.active);
                }
                this.blockUntil = 0;
                return jobId;
            }
        }
        catch (error) {
            if (isNotConnectionError(error)) {
                this.emit('error', error);
            }
            if (!this.closing) {
                await this.delay();
            }
        }
        finally {
            this.waiting = null;
        }
    }
    /**
     *
     * This function is exposed only for testing purposes.
     */
    async delay(milliseconds, abortController) {
        await delay(milliseconds || DELAY_TIME_1, abortController);
    }
    updateDelays(limitUntil = 0, delayUntil = 0) {
        this.limitUntil = Math.max(limitUntil, 0) || 0;
        this.blockUntil = Math.max(delayUntil, 0) || 0;
    }
    async nextJobFromJobData(jobData, jobId, token) {
        if (!jobData) {
            if (!this.drained) {
                this.emit('drained');
                this.drained = true;
            }
        }
        else {
            this.drained = false;
            const job = this.createJob(jobData, jobId);
            job.token = token;
            if (job.opts.repeat) {
                const repeat = await this.repeat;
                await repeat.addNextRepeatableJob(job.name, job.data, job.opts);
            }
            return job;
        }
    }
    async processJob(job, token, fetchNextCallback = () => true, jobsInProgress) {
        if (!job || this.closing || this.paused) {
            return;
        }
        const handleCompleted = async (result) => {
            if (!this.connection.closing) {
                const completed = await job.moveToCompleted(result, token, fetchNextCallback() && !(this.closing || this.paused));
                this.emit('completed', job, result, 'active');
                const [jobData, jobId, limitUntil, delayUntil] = completed || [];
                this.updateDelays(limitUntil, delayUntil);
                return this.nextJobFromJobData(jobData, jobId, token);
            }
        };
        const handleFailed = async (err) => {
            if (!this.connection.closing) {
                try {
                    if (err.message == RATE_LIMIT_ERROR) {
                        this.limitUntil = await this.moveLimitedBackToWait(job, token);
                        return;
                    }
                    if (err instanceof DelayedError ||
                        err.message == 'DelayedError' ||
                        err instanceof WaitingChildrenError ||
                        err.name == 'WaitingChildrenError') {
                        return;
                    }
                    await job.moveToFailed(err, token);
                    this.emit('failed', job, err, 'active');
                }
                catch (err) {
                    this.emit('error', err);
                    // It probably means that the job has lost the lock before completion
                    // A worker will (or already has) moved the job back
                    // to the waiting list (as stalled)
                }
            }
        };
        this.emit('active', job, 'waiting');
        const inProgressItem = { job, ts: Date.now() };
        try {
            jobsInProgress.add(inProgressItem);
            const result = await this.callProcessJob(job, token);
            return await handleCompleted(result);
        }
        catch (err) {
            return handleFailed(err);
        }
        finally {
            jobsInProgress.delete(inProgressItem);
        }
    }
    /**
     *
     * Pauses the processing of this queue only for this worker.
     */
    async pause(doNotWaitActive) {
        if (!this.paused) {
            this.paused = new Promise(resolve => {
                this.resumeWorker = function () {
                    resolve();
                    this.paused = null; // Allow pause to be checked externally for paused state.
                    this.resumeWorker = null;
                };
            });
            await (!doNotWaitActive && this.whenCurrentJobsFinished());
            this.emit('paused');
        }
    }
    /**
     *
     * Resumes processing of this worker (if paused).
     */
    resume() {
        if (this.resumeWorker) {
            this.resumeWorker();
            this.emit('resumed');
        }
    }
    /**
     *
     * Checks if worker is paused.
     *
     * @returns true if worker is paused, false otherwise.
     */
    isPaused() {
        return !!this.paused;
    }
    /**
     *
     * Checks if worker is currently running.
     *
     * @returns true if worker is running, false otherwise.
     */
    isRunning() {
        return this.running;
    }
    /**
     *
     * Closes the worker and related redis connections.
     *
     * This method waits for current jobs to finalize before returning.
     *
     * @param force - Use force boolean parameter if you do not want to wait for
     * current jobs to be processed.
     *
     * @returns Promise that resolves when the worker has been closed.
     */
    close(force = false) {
        if (this.closing) {
            return this.closing;
        }
        this.closing = (async () => {
            var _a;
            this.emit('closing', 'closing queue');
            (_a = this.abortDelayController) === null || _a === void 0 ? void 0 : _a.abort();
            const client = await this.blockingConnection.client;
            this.resume();
            await Promise.resolve()
                .finally(() => {
                return force || this.whenCurrentJobsFinished(false);
            })
                .finally(() => {
                var _a;
                const closePoolPromise = (_a = this.childPool) === null || _a === void 0 ? void 0 : _a.clean();
                if (force) {
                    // since we're not waiting for the job to end attach
                    // an error handler to avoid crashing the whole process
                    closePoolPromise === null || closePoolPromise === void 0 ? void 0 : closePoolPromise.catch(err => {
                        console.error(err); // TODO: emit error in next breaking change version
                    });
                    return;
                }
                return closePoolPromise;
            })
                .finally(() => clearTimeout(this.extendLocksTimer))
                .finally(() => clearTimeout(this.stalledCheckTimer))
                .finally(() => client.disconnect())
                .finally(() => this.connection.close())
                .finally(() => this.emit('closed'));
            this.closed = true;
        })();
        return this.closing;
    }
    /**
     *
     * Manually starts the stalled checker.
     * The check will run once as soon as this method is called, and
     * then every opts.stalledInterval milliseconds until the worker is closed.
     * Note: Normally you do not need to call this method, since the stalled checker
     * is automatically started when the worker starts processing jobs after
     * calling run. However if you want to process the jobs manually you need
     * to call this method to start the stalled checker.
     *
     * @see {@link https://docs.bullmq.io/patterns/manually-fetching-jobs}
     */
    async startStalledCheckTimer() {
        if (!this.opts.skipStalledCheck) {
            clearTimeout(this.stalledCheckTimer);
            if (!this.closing) {
                try {
                    await this.checkConnectionError(() => this.moveStalledJobsToWait());
                    this.stalledCheckTimer = setTimeout(async () => {
                        await this.startStalledCheckTimer();
                    }, this.opts.stalledInterval);
                }
                catch (err) {
                    this.emit('error', err);
                }
            }
        }
    }
    startLockExtenderTimer(jobsInProgress) {
        if (!this.opts.skipLockRenewal) {
            clearTimeout(this.extendLocksTimer);
            if (!this.closed) {
                this.extendLocksTimer = setTimeout(async () => {
                    // Get all the jobs whose locks expire in less than 1/2 of the lockRenewTime
                    const now = Date.now();
                    const jobsToExtend = [];
                    for (const item of jobsInProgress) {
                        const { job, ts } = item;
                        if (!ts) {
                            item.ts = now;
                            continue;
                        }
                        if (ts + this.opts.lockRenewTime / 2 < now) {
                            item.ts = now;
                            jobsToExtend.push(job);
                        }
                    }
                    try {
                        if (jobsToExtend.length) {
                            await this.extendLocks(jobsToExtend);
                        }
                    }
                    catch (err) {
                        this.emit('error', err);
                    }
                    this.startLockExtenderTimer(jobsInProgress);
                }, this.opts.lockRenewTime / 2);
            }
        }
    }
    /**
     * Returns a promise that resolves when active jobs are cleared
     *
     * @returns
     */
    async whenCurrentJobsFinished(reconnect = true) {
        //
        // Force reconnection of blocking connection to abort blocking redis call immediately.
        //
        if (this.waiting) {
            // If we are not going to reconnect, we will not wait for the disconnection.
            await this.blockingConnection.disconnect(reconnect);
        }
        else {
            reconnect = false;
        }
        if (this.asyncFifoQueue) {
            await this.asyncFifoQueue.waitAll();
        }
        reconnect && (await this.blockingConnection.reconnect());
    }
    async retryIfFailed(fn, delayInMs) {
        const retry = 1;
        do {
            try {
                return await fn();
            }
            catch (err) {
                this.emit('error', err);
                if (delayInMs) {
                    await this.delay(delayInMs);
                }
                else {
                    return;
                }
            }
        } while (retry);
    }
    async extendLocks(jobs) {
        try {
            const multi = (await this.client).multi();
            for (const job of jobs) {
                await this.scripts.extendLock(job.id, job.token, this.opts.lockDuration, multi);
            }
            const result = (await multi.exec());
            for (const [err, jobId] of result) {
                if (err) {
                    // TODO: signal process function that the job has been lost.
                    this.emit('error', new Error(`could not renew lock for job ${jobId}`));
                }
            }
        }
        catch (err) {
            this.emit('error', err);
        }
    }
    async moveStalledJobsToWait() {
        const chunkSize = 50;
        const [failed, stalled] = await this.scripts.moveStalledJobsToWait();
        stalled.forEach((jobId) => this.emit('stalled', jobId, 'active'));
        const jobPromises = [];
        for (let i = 0; i < failed.length; i++) {
            jobPromises.push(Job.fromId(this, failed[i]));
            if ((i + 1) % chunkSize === 0) {
                this.notifyFailedJobs(await Promise.all(jobPromises));
                jobPromises.length = 0;
            }
        }
        this.notifyFailedJobs(await Promise.all(jobPromises));
    }
    notifyFailedJobs(failedJobs) {
        failedJobs.forEach((job) => this.emit('failed', job, new Error('job stalled more than allowable limit'), 'active'));
    }
    moveLimitedBackToWait(job, token) {
        return this.scripts.moveJobFromActiveToWait(job.id, token);
    }
}
//# sourceMappingURL=worker.js.map