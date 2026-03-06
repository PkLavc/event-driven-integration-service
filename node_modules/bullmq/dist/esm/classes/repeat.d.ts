import { RepeatBaseOptions, RepeatableJob, RepeatOptions } from '../interfaces';
import { JobsOptions } from '../types';
import { Job } from './job';
import { QueueBase } from './queue-base';
import { RedisConnection } from './redis-connection';
export declare class Repeat extends QueueBase {
    private repeatStrategy;
    private repeatKeyHashAlgorithm;
    constructor(name: string, opts: RepeatBaseOptions, Connection?: typeof RedisConnection);
    addNextRepeatableJob<T = any, R = any, N extends string = string>(name: N, data: T, opts: JobsOptions, skipCheckExists?: boolean): Promise<Job<T, R, N> | undefined>;
    private createNextJob;
    removeRepeatable(name: string, repeat: RepeatOptions, jobId?: string): Promise<number>;
    removeRepeatableByKey(repeatJobKey: string): Promise<number>;
    private keyToData;
    getRepeatableJobs(start?: number, end?: number, asc?: boolean): Promise<RepeatableJob[]>;
    getRepeatableCount(): Promise<number>;
    private hash;
    private getRepeatJobId;
}
export declare const getNextMillis: (millis: number, opts: RepeatOptions) => number | undefined;
