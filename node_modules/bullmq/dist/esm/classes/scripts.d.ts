/**
 * Includes all the scripts needed by the queue and jobs.
 */
/// <reference types="node" />
import { JobJson, JobJsonRaw, MinimalJob, MoveToWaitingChildrenOpts, ParentOpts, RedisClient, KeepJobs } from '../interfaces';
import { JobState, JobType, FinishedStatus, FinishedPropValAttribute, MinimalQueue, RedisJobOptions } from '../types';
import { ChainableCommander } from 'ioredis';
export type JobData = [JobJsonRaw | number, string?];
export declare class Scripts {
    protected queue: MinimalQueue;
    protected version: string;
    moveToFinishedKeys: (string | undefined)[];
    constructor(queue: MinimalQueue);
    execCommand(client: RedisClient | ChainableCommander, commandName: string, args: any[]): any;
    isJobInList(listKey: string, jobId: string): Promise<boolean>;
    private addDelayedJob;
    private addPrioritizedJob;
    private addParentJob;
    addJob(client: RedisClient, job: JobJson, opts: RedisJobOptions, jobId: string, parentOpts?: ParentOpts): Promise<string>;
    pause(pause: boolean): Promise<void>;
    private removeRepeatableArgs;
    removeRepeatable(repeatJobId: string, repeatJobKey: string): Promise<number>;
    remove(jobId: string, removeChildren: boolean): Promise<number>;
    extendLock(jobId: string, token: string, duration: number, client?: RedisClient | ChainableCommander): Promise<number>;
    updateData<T = any, R = any, N extends string = string>(job: MinimalJob<T, R, N>, data: T): Promise<void>;
    updateProgress<T = any, R = any, N extends string = string>(jobId: string, progress: number | object): Promise<void>;
    protected moveToFinishedArgs<T = any, R = any, N extends string = string>(job: MinimalJob<T, R, N>, val: any, propVal: FinishedPropValAttribute, shouldRemove: undefined | boolean | number | KeepJobs, target: FinishedStatus, token: string, timestamp: number, fetchNext?: boolean): (string | number | boolean | Buffer)[];
    protected getKeepJobs(shouldRemove: undefined | boolean | number | KeepJobs, workerKeepJobs: undefined | KeepJobs): KeepJobs;
    moveToFinished(jobId: string, args: (string | number | boolean | Buffer)[]): Promise<any[]>;
    finishedErrors(code: number, jobId: string, command: string, state?: string): Error;
    private drainArgs;
    drain(delayed: boolean): Promise<void>;
    private getRangesArgs;
    getRanges(types: JobType[], start?: number, end?: number, asc?: boolean): Promise<[string][]>;
    private getCountsArgs;
    getCounts(types: JobType[]): Promise<number[]>;
    moveToCompletedArgs<T = any, R = any, N extends string = string>(job: MinimalJob<T, R, N>, returnvalue: R, removeOnComplete: boolean | number | KeepJobs, token: string, fetchNext?: boolean): (string | number | boolean | Buffer)[];
    moveToFailedArgs<T = any, R = any, N extends string = string>(job: MinimalJob<T, R, N>, failedReason: string, removeOnFailed: boolean | number | KeepJobs, token: string, fetchNext?: boolean): (string | number | boolean | Buffer)[];
    isFinished(jobId: string, returnValue?: boolean): Promise<number | [number, string]>;
    getState(jobId: string): Promise<JobState | 'unknown'>;
    changeDelay(jobId: string, delay: number): Promise<void>;
    private changeDelayArgs;
    changePriority(jobId: string, priority?: number, lifo?: boolean): Promise<void>;
    private changePriorityArgs;
    moveToDelayedArgs(jobId: string, timestamp: number, token: string, delay: number): (string | number)[];
    saveStacktraceArgs(jobId: string, stacktrace: string, failedReason: string): string[];
    moveToWaitingChildrenArgs(jobId: string, token: string, opts?: MoveToWaitingChildrenOpts): string[];
    moveToDelayed(jobId: string, timestamp: number, delay: number, token?: string): Promise<void>;
    /**
     * Move parent job to waiting-children state.
     *
     * @returns true if job is successfully moved, false if there are pending dependencies.
     * @throws JobNotExist
     * This exception is thrown if jobId is missing.
     * @throws JobLockNotExist
     * This exception is thrown if job lock is missing.
     * @throws JobNotInState
     * This exception is thrown if job is not in active state.
     */
    moveToWaitingChildren(jobId: string, token: string, opts?: MoveToWaitingChildrenOpts): Promise<boolean>;
    /**
     * Remove jobs in a specific state.
     *
     * @returns Id jobs from the deleted records.
     */
    cleanJobsInSet(set: string, timestamp: number, limit?: number): Promise<string[]>;
    retryJobArgs(jobId: string, lifo: boolean, token: string): (string | number)[];
    protected moveJobsToWaitArgs(state: FinishedStatus | 'delayed', count: number, timestamp: number): (string | number)[];
    retryJobs(state?: FinishedStatus, count?: number, timestamp?: number): Promise<number>;
    promoteJobs(count?: number): Promise<number>;
    /**
     * Attempts to reprocess a job
     *
     * @param job -
     * @param state - The expected job state. If the job is not found
     * on the provided state, then it's not reprocessed. Supported states: 'failed', 'completed'
     *
     * @returns Returns a promise that evaluates to a return code:
     * 1 means the operation was a success
     * 0 means the job does not exist
     * -1 means the job is currently locked and can't be retried.
     * -2 means the job was not found in the expected set
     */
    reprocessJob<T = any, R = any, N extends string = string>(job: MinimalJob<T, R, N>, state: 'failed' | 'completed'): Promise<void>;
    moveToActive(client: RedisClient, token: string, jobId?: string): Promise<any[]>;
    promote(jobId: string): Promise<void>;
    /**
     * Looks for unlocked jobs in the active queue.
     *
     * The job was being worked on, but the worker process died and it failed to renew the lock.
     * We call these jobs 'stalled'. This is the most common case. We resolve these by moving them
     * back to wait to be re-processed. To prevent jobs from cycling endlessly between active and wait,
     * (e.g. if the job handler keeps crashing),
     * we limit the number stalled job recoveries to settings.maxStalledCount.
     */
    moveStalledJobsToWait(): Promise<[string[], string[]]>;
    /**
     * Moves a job back from Active to Wait.
     * This script is used when a job has been manually rate limited and needs
     * to be moved back to wait from active status.
     *
     * @param client - Redis client
     * @param jobId - Job id
     * @returns
     */
    moveJobFromActiveToWait(jobId: string, token: string): Promise<any>;
    obliterate(opts: {
        force: boolean;
        count: number;
    }): Promise<number>;
    /**
     * Paginate a set or hash keys.
     * @param opts
     *
     */
    paginate(key: string, opts: {
        start: number;
        end: number;
        fetchJobs?: boolean;
    }): Promise<{
        cursor: string;
        items: {
            id: string;
            v?: any;
            err?: string;
        }[];
        total: number;
        jobs?: JobJsonRaw[];
    }>;
}
export declare function raw2NextJobData(raw: any[]): any[];
