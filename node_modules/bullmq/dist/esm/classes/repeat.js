import { __rest } from "tslib";
import { parseExpression } from 'cron-parser';
import { createHash } from 'crypto';
import { QueueBase } from './queue-base';
export class Repeat extends QueueBase {
    constructor(name, opts, Connection) {
        super(name, opts, Connection);
        this.repeatStrategy =
            (opts.settings && opts.settings.repeatStrategy) || getNextMillis;
        this.repeatKeyHashAlgorithm =
            (opts.settings && opts.settings.repeatKeyHashAlgorithm) || 'md5';
    }
    async addNextRepeatableJob(name, data, opts, skipCheckExists) {
        var _a;
        // HACK: This is a temporary fix to enable easy migration from bullmq <3.0.0
        // to >= 3.0.0. It should be removed when moving to 4.x.
        const repeatOpts = Object.assign({}, opts.repeat);
        (_a = repeatOpts.pattern) !== null && _a !== void 0 ? _a : (repeatOpts.pattern = repeatOpts.cron);
        delete repeatOpts.cron;
        const prevMillis = opts.prevMillis || 0;
        const currentCount = repeatOpts.count ? repeatOpts.count + 1 : 1;
        if (typeof repeatOpts.limit !== 'undefined' &&
            currentCount > repeatOpts.limit) {
            return;
        }
        let now = Date.now();
        if (!(typeof repeatOpts.endDate === undefined) &&
            now > new Date(repeatOpts.endDate).getTime()) {
            return;
        }
        now = prevMillis < now ? now : prevMillis;
        const nextMillis = await this.repeatStrategy(now, repeatOpts, name);
        const pattern = repeatOpts.pattern;
        const hasImmediately = Boolean((repeatOpts.every || pattern) && repeatOpts.immediately);
        const offset = hasImmediately ? now - nextMillis : undefined;
        if (nextMillis) {
            // We store the undecorated opts.jobId into the repeat options
            if (!prevMillis && opts.jobId) {
                repeatOpts.jobId = opts.jobId;
            }
            const repeatJobKey = getRepeatKey(name, repeatOpts);
            let repeatableExists = true;
            if (!skipCheckExists) {
                // Check that the repeatable job hasn't been removed
                // TODO: a lua script would be better here
                const client = await this.client;
                repeatableExists = !!(await client.zscore(this.keys.repeat, repeatJobKey));
            }
            const { immediately } = repeatOpts, filteredRepeatOpts = __rest(repeatOpts, ["immediately"]);
            // The job could have been deleted since this check
            if (repeatableExists) {
                return this.createNextJob(name, nextMillis, repeatJobKey, Object.assign(Object.assign({}, opts), { repeat: Object.assign({ offset }, filteredRepeatOpts) }), data, currentCount, hasImmediately);
            }
        }
    }
    async createNextJob(name, nextMillis, repeatJobKey, opts, data, currentCount, hasImmediately) {
        const client = await this.client;
        //
        // Generate unique job id for this iteration.
        //
        const jobId = this.getRepeatJobId(name, nextMillis, this.hash(repeatJobKey), opts.repeat.jobId);
        const now = Date.now();
        const delay = nextMillis + (opts.repeat.offset ? opts.repeat.offset : 0) - now;
        const mergedOpts = Object.assign(Object.assign({}, opts), { jobId, delay: delay < 0 || hasImmediately ? 0 : delay, timestamp: now, prevMillis: nextMillis, repeatJobKey });
        mergedOpts.repeat = Object.assign(Object.assign({}, opts.repeat), { count: currentCount });
        await client.zadd(this.keys.repeat, nextMillis.toString(), repeatJobKey);
        return this.Job.create(this, name, data, mergedOpts);
    }
    async removeRepeatable(name, repeat, jobId) {
        const repeatJobKey = getRepeatKey(name, Object.assign(Object.assign({}, repeat), { jobId }));
        const repeatJobId = this.getRepeatJobId(name, '', this.hash(repeatJobKey), jobId || repeat.jobId);
        return this.scripts.removeRepeatable(repeatJobId, repeatJobKey);
    }
    async removeRepeatableByKey(repeatJobKey) {
        const data = this.keyToData(repeatJobKey);
        const repeatJobId = this.getRepeatJobId(data.name, '', this.hash(repeatJobKey), data.id);
        return this.scripts.removeRepeatable(repeatJobId, repeatJobKey);
    }
    keyToData(key, next) {
        const data = key.split(':');
        const pattern = data.slice(4).join(':') || null;
        return {
            key,
            name: data[0],
            id: data[1] || null,
            endDate: parseInt(data[2]) || null,
            tz: data[3] || null,
            pattern,
            next,
        };
    }
    async getRepeatableJobs(start = 0, end = -1, asc = false) {
        const client = await this.client;
        const key = this.keys.repeat;
        const result = asc
            ? await client.zrange(key, start, end, 'WITHSCORES')
            : await client.zrevrange(key, start, end, 'WITHSCORES');
        const jobs = [];
        for (let i = 0; i < result.length; i += 2) {
            jobs.push(this.keyToData(result[i], parseInt(result[i + 1])));
        }
        return jobs;
    }
    async getRepeatableCount() {
        const client = await this.client;
        return client.zcard(this.toKey('repeat'));
    }
    hash(str) {
        return createHash(this.repeatKeyHashAlgorithm).update(str).digest('hex');
    }
    getRepeatJobId(name, nextMillis, namespace, jobId) {
        const checksum = this.hash(`${name}${jobId || ''}${namespace}`);
        return `repeat:${checksum}:${nextMillis}`;
        // return `repeat:${jobId || ''}:${name}:${namespace}:${nextMillis}`;
        //return `repeat:${name}:${namespace}:${nextMillis}`;
    }
}
function getRepeatKey(name, repeat) {
    const endDate = repeat.endDate ? new Date(repeat.endDate).getTime() : '';
    const tz = repeat.tz || '';
    const pattern = repeat.pattern;
    const suffix = (pattern ? pattern : String(repeat.every)) || '';
    const jobId = repeat.jobId ? repeat.jobId : '';
    return `${name}:${jobId}:${endDate}:${tz}:${suffix}`;
}
export const getNextMillis = (millis, opts) => {
    const pattern = opts.pattern;
    if (pattern && opts.every) {
        throw new Error('Both .pattern and .every options are defined for this repeatable job');
    }
    if (opts.every) {
        return (Math.floor(millis / opts.every) * opts.every +
            (opts.immediately ? 0 : opts.every));
    }
    const currentDate = opts.startDate && new Date(opts.startDate) > new Date(millis)
        ? new Date(opts.startDate)
        : new Date(millis);
    const interval = parseExpression(pattern, Object.assign(Object.assign({}, opts), { currentDate }));
    try {
        return interval.next().getTime();
    }
    catch (e) {
        // Ignore error
    }
};
//# sourceMappingURL=repeat.js.map