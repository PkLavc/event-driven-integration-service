"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scriptLoader = exports.ScriptLoader = exports.ScriptLoaderError = void 0;
const script_loader_1 = require("./script-loader");
Object.defineProperty(exports, "ScriptLoader", { enumerable: true, get: function () { return script_loader_1.ScriptLoader; } });
var script_loader_2 = require("./script-loader");
Object.defineProperty(exports, "ScriptLoaderError", { enumerable: true, get: function () { return script_loader_2.ScriptLoaderError; } });
const scriptLoader = new script_loader_1.ScriptLoader();
exports.scriptLoader = scriptLoader;
//# sourceMappingURL=index.js.map