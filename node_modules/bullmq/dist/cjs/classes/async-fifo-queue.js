"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncFifoQueue = void 0;
/**
 * AsyncFifoQueue
 *
 * A minimal FIFO queue for asynchronous operations. Allows adding asynchronous operations
 * and consume them in the order they are resolved.
 *
 *  TODO: Optimize using a linked list for the queue instead of an array.
 *  Current implementation requires memory copies when shifting the queue.
 *  For a linked linked implementation, we can exploit the fact that the
 *  maximum number of elements in the list will never exceen the concurrency factor
 *  of the worker, so the nodes of the list could be pre-allocated.
 */
class AsyncFifoQueue {
    constructor(ignoreErrors = false) {
        this.ignoreErrors = ignoreErrors;
        /**
         * A queue of completed promises. As the pending
         * promises are resolved, they are added to this queue.
         */
        this.queue = [];
        /**
         * A set of pending promises.
         */
        this.pending = new Set();
        this.newPromise();
    }
    add(promise) {
        this.pending.add(promise);
        promise
            .then(data => {
            this.pending.delete(promise);
            if (this.queue.length === 0) {
                this.resolvePromise(data);
            }
            this.queue.push(data);
        })
            .catch(err => {
            // Ignore errors
            if (this.ignoreErrors) {
                this.queue.push(undefined);
            }
            this.pending.delete(promise);
            this.rejectPromise(err);
        });
    }
    async waitAll() {
        await Promise.all(this.pending);
    }
    numTotal() {
        return this.pending.size + this.queue.length;
    }
    numPending() {
        return this.pending.size;
    }
    numQueued() {
        return this.queue.length;
    }
    resolvePromise(data) {
        this.resolve(data);
        this.newPromise();
    }
    rejectPromise(err) {
        this.reject(err);
        this.newPromise();
    }
    newPromise() {
        this.nextPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
    async wait() {
        return this.nextPromise;
    }
    async fetch() {
        if (this.pending.size === 0 && this.queue.length === 0) {
            return;
        }
        while (this.queue.length === 0) {
            try {
                await this.wait();
            }
            catch (err) {
                // Ignore errors
                if (!this.ignoreErrors) {
                    console.error('Unexpected Error in AsyncFifoQueue', err);
                }
            }
        }
        return this.queue.shift();
    }
}
exports.AsyncFifoQueue = AsyncFifoQueue;
//# sourceMappingURL=async-fifo-queue.js.map