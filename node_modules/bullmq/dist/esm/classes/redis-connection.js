import { EventEmitter } from 'events';
import { default as IORedis } from 'ioredis';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { CONNECTION_CLOSED_ERROR_MSG } from 'ioredis/built/utils';
import { decreaseMaxListeners, increaseMaxListeners, isNotConnectionError, isRedisCluster, isRedisInstance, isRedisVersionLowerThan, } from '../utils';
import { version } from '../version';
import * as scripts from '../scripts';
const overrideMessage = [
    'BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null',
    'and will be overridden by BullMQ.',
].join(' ');
const deprecationMessage = [
    'BullMQ: DEPRECATION WARNING! Your redis options maxRetriesPerRequest must be null.',
    'On the next versions having this settings will throw an exception',
].join(' ');
export class RedisConnection extends EventEmitter {
    constructor(opts, shared = false, blocking = true, skipVersionCheck = false) {
        super();
        this.shared = shared;
        this.blocking = blocking;
        this.capabilities = {
            canDoubleTimeout: false,
        };
        if (!isRedisInstance(opts)) {
            this.checkBlockingOptions(overrideMessage, opts);
            this.opts = Object.assign({ port: 6379, host: '127.0.0.1', retryStrategy: function (times) {
                    return Math.max(Math.min(Math.exp(times), 20000), 1000);
                } }, opts);
            if (this.blocking) {
                this.opts.maxRetriesPerRequest = null;
            }
        }
        else {
            this._client = opts;
            // Test if the redis instance is using keyPrefix
            // and if so, throw an error.
            if (this._client.options.keyPrefix) {
                throw new Error('BullMQ: ioredis does not support ioredis prefixes, use the prefix option instead.');
            }
            if (isRedisCluster(this._client)) {
                this.opts = this._client.options.redisOptions;
            }
            else {
                this.opts = this._client.options;
            }
            this.checkBlockingOptions(deprecationMessage, this.opts);
        }
        this.skipVersionCheck =
            skipVersionCheck || !!(this.opts && this.opts.skipVersionCheck);
        this.handleClientError = (err) => {
            this.emit('error', err);
        };
        this.handleClientClose = () => {
            this.emit('close');
        };
        this.handleClientReady = () => {
            this.emit('ready');
        };
        this.initializing = this.init();
        this.initializing.catch(err => this.emit('error', err));
    }
    checkBlockingOptions(msg, options) {
        if (this.blocking && options && options.maxRetriesPerRequest) {
            console.error(msg);
        }
    }
    /**
     * Waits for a redis client to be ready.
     * @param redis - client
     */
    static async waitUntilReady(client) {
        if (client.status === 'ready') {
            return;
        }
        if (client.status === 'wait') {
            return client.connect();
        }
        if (client.status === 'end') {
            throw new Error(CONNECTION_CLOSED_ERROR_MSG);
        }
        let handleReady;
        let handleEnd;
        let handleError;
        try {
            await new Promise((resolve, reject) => {
                let lastError;
                handleError = (err) => {
                    lastError = err;
                };
                handleReady = () => {
                    resolve();
                };
                handleEnd = () => {
                    reject(lastError || new Error(CONNECTION_CLOSED_ERROR_MSG));
                };
                increaseMaxListeners(client, 3);
                client.once('ready', handleReady);
                client.on('end', handleEnd);
                client.once('error', handleError);
            });
        }
        finally {
            client.removeListener('end', handleEnd);
            client.removeListener('error', handleError);
            client.removeListener('ready', handleReady);
            decreaseMaxListeners(client, 3);
        }
    }
    get client() {
        return this.initializing;
    }
    loadCommands(version, providedScripts) {
        const finalScripts = providedScripts || scripts;
        for (const property in finalScripts) {
            // Only define the command if not already defined
            const commandName = `${finalScripts[property].name}:${version}`;
            if (!this._client[commandName]) {
                this._client.defineCommand(commandName, {
                    numberOfKeys: finalScripts[property].keys,
                    lua: finalScripts[property].content,
                });
            }
        }
    }
    async init() {
        if (!this._client) {
            this._client = new IORedis(this.opts);
        }
        increaseMaxListeners(this._client, 3);
        this._client.on('error', this.handleClientError);
        // ioredis treats connection errors as a different event ('close')
        this._client.on('close', this.handleClientClose);
        this._client.on('ready', this.handleClientReady);
        await RedisConnection.waitUntilReady(this._client);
        this.loadCommands(version);
        this.version = await this.getRedisVersion();
        if (this.skipVersionCheck !== true && !this.closing) {
            if (isRedisVersionLowerThan(this.version, RedisConnection.minimumVersion)) {
                throw new Error(`Redis version needs to be greater or equal than ${RedisConnection.minimumVersion} Current: ${this.version}`);
            }
            if (isRedisVersionLowerThan(this.version, RedisConnection.recommendedMinimumVersion)) {
                console.warn(`It is highly recommended to use a minimum Redis version of ${RedisConnection.recommendedMinimumVersion}
           Current: ${this.version}`);
            }
        }
        this.capabilities = {
            canDoubleTimeout: !isRedisVersionLowerThan(this.version, '6.0.0'),
        };
        return this._client;
    }
    async disconnect(wait = true) {
        const client = await this.client;
        if (client.status !== 'end') {
            let _resolve, _reject;
            if (!wait) {
                return client.disconnect();
            }
            const disconnecting = new Promise((resolve, reject) => {
                increaseMaxListeners(client, 2);
                client.once('end', resolve);
                client.once('error', reject);
                _resolve = resolve;
                _reject = reject;
            });
            client.disconnect();
            try {
                await disconnecting;
            }
            finally {
                decreaseMaxListeners(client, 2);
                client.removeListener('end', _resolve);
                client.removeListener('error', _reject);
            }
        }
    }
    async reconnect() {
        const client = await this.client;
        return client.connect();
    }
    async close() {
        if (!this.closing) {
            this.closing = true;
            try {
                await this.initializing;
                if (!this.shared) {
                    await this._client.quit();
                }
            }
            catch (error) {
                if (isNotConnectionError(error)) {
                    throw error;
                }
            }
            finally {
                this._client.off('error', this.handleClientError);
                this._client.off('close', this.handleClientClose);
                this._client.off('ready', this.handleClientReady);
                decreaseMaxListeners(this._client, 3);
                this.removeAllListeners();
            }
        }
    }
    async getRedisVersion() {
        const doc = await this._client.info();
        const redisPrefix = 'redis_version:';
        const maxMemoryPolicyPrefix = 'maxmemory_policy:';
        const lines = doc.split('\r\n');
        let redisVersion;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf(maxMemoryPolicyPrefix) === 0) {
                const maxMemoryPolicy = lines[i].substr(maxMemoryPolicyPrefix.length);
                if (maxMemoryPolicy !== 'noeviction') {
                    console.warn(`IMPORTANT! Eviction policy is ${maxMemoryPolicy}. It should be "noeviction"`);
                }
            }
            if (lines[i].indexOf(redisPrefix) === 0) {
                redisVersion = lines[i].substr(redisPrefix.length);
            }
        }
        return redisVersion;
    }
    get redisVersion() {
        return this.version;
    }
}
RedisConnection.minimumVersion = '5.0.0';
RedisConnection.recommendedMinimumVersion = '6.2.0';
//# sourceMappingURL=redis-connection.js.map