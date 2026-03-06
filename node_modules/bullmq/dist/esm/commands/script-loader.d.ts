import { RedisClient } from '../interfaces';
export interface Command {
    name: string;
    options: {
        numberOfKeys: number;
        lua: string;
    };
}
/**
 * Script metadata
 */
export interface ScriptMetadata {
    /**
     * Name of the script
     */
    name: string;
    numberOfKeys?: number;
    /**
     * The path to the script. For includes, this is the normalized path,
     * whereas it may not be normalized for the top-level parent
     */
    path: string;
    /**
     * The raw script content
     */
    content: string;
    /**
     * A hash of the normalized path for easy replacement in the parent
     */
    token: string;
    /**
     * Metadata on the scripts that this script includes
     */
    includes: ScriptMetadata[];
}
export declare class ScriptLoaderError extends Error {
    /**
     * The include stack
     */
    readonly includes: string[];
    readonly line: number;
    readonly position: number;
    constructor(message: string, path: string, stack?: string[], line?: number, position?: number);
}
/**
 * Lua script loader with include support
 */
export declare class ScriptLoader {
    /**
     * Map an alias to a path
     */
    private pathMapper;
    private clientScripts;
    /**
     * Cache commands by dir
     */
    private commandCache;
    private rootPath;
    constructor();
    /**
     * Add a script path mapping. Allows includes of the form "<includes>/utils.lua" where `includes` is a user
     * defined path
     * @param name - the name of the mapping. Note: do not include angle brackets
     * @param mappedPath - if a relative path is passed, it's relative to the *caller* of this function.
     * Mapped paths are also accepted, e.g. "~/server/scripts/lua" or "<base>/includes"
     */
    addPathMapping(name: string, mappedPath: string): void;
    /**
     * Resolve the script path considering path mappings
     * @param scriptName - the name of the script
     * @param stack - the include stack, for nicer errors
     */
    resolvePath(scriptName: string, stack?: string[]): string;
    /**
     * Recursively collect all scripts included in a file
     * @param file - the parent file
     * @param cache - a cache for file metadata to increase efficiency. Since a file can be included
     * multiple times, we make sure to load it only once.
     * @param stack - internal stack to prevent circular references
     */
    private resolveDependencies;
    /**
     * Parse a (top-level) lua script
     * @param filename - the full path to the script
     * @param content - the content of the script
     * @param cache - cache
     */
    parseScript(filename: string, content: string, cache?: Map<string, ScriptMetadata>): Promise<ScriptMetadata>;
    /**
     * Construct the final version of a file by interpolating its includes in dependency order.
     * @param file - the file whose content we want to construct
     * @param processed - a cache to keep track of which includes have already been processed
     */
    interpolate(file: ScriptMetadata, processed?: Set<string>): string;
    loadCommand(filename: string, cache?: Map<string, ScriptMetadata>): Promise<Command>;
    /**
     * Load redis lua scripts.
     * The name of the script must have the following format:
     *
     * cmdName-numKeys.lua
     *
     * cmdName must be in camel case format.
     *
     * For example:
     * moveToFinish-3.lua
     *
     */
    loadScripts(dir?: string, cache?: Map<string, ScriptMetadata>): Promise<Command[]>;
    /**
     * Attach all lua scripts in a given directory to a client instance
     * @param client - redis client to attach script to
     * @param pathname - the path to the directory containing the scripts
     */
    load(client: RedisClient, pathname: string, cache?: Map<string, ScriptMetadata>): Promise<void>;
    /**
     * Clears the command cache
     */
    clearCache(): void;
}
