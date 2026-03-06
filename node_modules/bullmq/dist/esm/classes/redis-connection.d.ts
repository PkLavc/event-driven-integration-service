/// <reference types="node" />
import { EventEmitter } from 'events';
import { ConnectionOptions, RedisClient } from '../interfaces';
interface RedisCapabilities {
    canDoubleTimeout: boolean;
}
export interface RawCommand {
    content: string;
    name: string;
    keys: number;
}
export declare class RedisConnection extends EventEmitter {
    private readonly shared;
    private readonly blocking;
    static minimumVersion: string;
    static recommendedMinimumVersion: string;
    closing: boolean;
    capabilities: RedisCapabilities;
    protected _client: RedisClient;
    private readonly opts;
    private readonly initializing;
    private version;
    private skipVersionCheck;
    private handleClientError;
    private handleClientClose;
    private handleClientReady;
    constructor(opts?: ConnectionOptions, shared?: boolean, blocking?: boolean, skipVersionCheck?: boolean);
    private checkBlockingOptions;
    /**
     * Waits for a redis client to be ready.
     * @param redis - client
     */
    static waitUntilReady(client: RedisClient): Promise<void>;
    get client(): Promise<RedisClient>;
    protected loadCommands(version?: string, providedScripts?: Record<string, RawCommand>): void;
    private init;
    disconnect(wait?: boolean): Promise<void>;
    reconnect(): Promise<void>;
    close(): Promise<void>;
    private getRedisVersion;
    get redisVersion(): string;
}
export {};
