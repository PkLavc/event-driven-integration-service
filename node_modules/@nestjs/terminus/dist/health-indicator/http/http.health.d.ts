/// <reference types="node" />
import { type URL } from 'url';
import { ConsoleLogger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type Observable } from 'rxjs';
import { type AxiosRequestConfig, type AxiosResponse } from './axios.interfaces';
import { HealthIndicator, type HealthIndicatorResult } from '..';
interface HttpClientLike {
    request<T = any>(config: any): Observable<AxiosResponse<T>>;
}
/**
 * The HTTPHealthIndicator contains health indicators
 * which are used for health checks related to HTTP requests
 *
 * @publicApi
 * @module TerminusModule
 */
export declare class HttpHealthIndicator extends HealthIndicator {
    private readonly moduleRef;
    private readonly logger;
    private nestJsAxios;
    constructor(moduleRef: ModuleRef, logger: ConsoleLogger);
    /**
     * Checks if the dependant packages are present
     */
    private checkDependantPackages;
    private getHttpService;
    /**
     * Prepares and throw a HealthCheckError
     * @param key The key which will be used for the result object
     * @param error The thrown error
     *
     * @throws {HealthCheckError}
     */
    private generateHttpError;
    /**
     * Checks if the given url response in the given timeout
     * and returns a result object corresponding to the result
     * @param key The key which will be used for the result object
     * @param url The url which should be request
     * @param options Optional axios options
     *
     * @throws {HealthCheckError} In case the health indicator failed
     *
     * @example
     * httpHealthIndicator.pingCheck('google', 'https://google.com', { timeout: 800 })
     */
    pingCheck(key: string, url: string, { httpClient, ...options }?: AxiosRequestConfig & {
        httpClient?: HttpClientLike;
    }): Promise<HealthIndicatorResult>;
    responseCheck<T>(key: string, url: URL | string, callback: (response: AxiosResponse<T>) => boolean | Promise<boolean>, { httpClient, ...options }?: AxiosRequestConfig & {
        httpClient?: HttpClientLike;
    }): Promise<HealthIndicatorResult>;
}
export {};
