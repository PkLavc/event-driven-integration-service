import { HealthIndicator } from '../health-indicator';
type PingCommandSignature = {
    [Key in string]?: number;
};
type PrismaClientDocument = {
    $runCommandRaw: (command: PingCommandSignature) => any;
};
type PrismaClientSQL = {
    $queryRawUnsafe: (query: string) => any;
};
type PrismaClient = PrismaClientDocument | PrismaClientSQL;
export interface PrismaClientPingCheckSettings {
    /**
     * The amount of time the check should require in ms
     */
    timeout?: number;
}
/**
 * The PrismaHealthIndicator contains health indicators
 * which are used for health checks related to Prisma
 *
 * @publicApi
 * @module TerminusModule
 */
export declare class PrismaHealthIndicator extends HealthIndicator {
    constructor();
    private pingDb;
    /**
     * Checks if the Prisma responds in (default) 1000ms and
     * returns a result object corresponding to the result
     *
     * @param key The key which will be used for the result object
     * @param prismaClient PrismaClient
     * @param options The options for the ping
     */
    pingCheck(key: string, prismaClient: PrismaClient, options?: PrismaClientPingCheckSettings): Promise<any>;
}
export {};
