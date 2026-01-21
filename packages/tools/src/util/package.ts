/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { ignoreError, ignoreErrorSync } from "./errors.js";
import { isFile, maybeReadJsonSync, maybeStatSync } from "./file.js";
import { globSync } from "./glob.js";
import { ImportAliases } from "./import-aliases.js";
import { Progress } from "./progress.js";
import { toolsPath } from "./tools-path.cjs";

export class JsonNotFoundError extends Error {}

export const CONFIG_PATH = `src/build.config.ts`;
export const CODEGEN_PATH = `codegen`;

const packageForPath = {} as Record<string, Package | undefined | null>;

function isDirectory(path: string) {
    return !!ignoreErrorSync("ENOENT", () => statSync(path).isDirectory());
}

export class Package {
    path: string;
    json: PackageJson;
    supportsEsm: boolean;
    supportsCjs: boolean;
    hasSrc: boolean;
    hasTests: boolean;
    hasConfig: boolean;
    isLibrary: boolean;
    #importAliases?: ImportAliases;

    constructor({
        path = ".",
        name,
    }: {
        path?: string;
        name?: string;
    } = {}) {
        const { root, json } = this.findJson("package.json", path, name);
        this.path = root;
        this.json = json;

        const { esm, cjs } = selectFormats(this.json);
        this.supportsEsm = esm;
        this.supportsCjs = cjs;

        this.hasSrc = isDirectory(this.resolve("src"));
        this.hasTests = isDirectory(this.resolve("test"));

        const refs = maybeReadJsonSync(this.resolve("tsconfig.json"))?.references as undefined | { path: string }[];
        if (refs !== undefined) {
            if (!refs.find(ref => this.resolve(ref.path) === this.resolve("src"))) {
                this.hasSrc = false;
            }
            if (!refs.find(ref => this.resolve(ref.path) === this.resolve("test"))) {
                this.hasTests = false;
            }
        }

        this.isLibrary = !!(this.json.main || this.json.module || this.json.exports);

        this.hasConfig = this.hasFile(this.resolve(CONFIG_PATH));
    }

    findJson(filename: string, path: string = this.path, title?: string) {
        path = resolve(path);
        while (true) {
            const json = ignoreErrorSync(["ENOENT", "ENOTDIR"], () =>
                JSON.parse(readFileSync(resolve(path, filename)).toString()),
            );

            if (json) {
                if (title === undefined || json.name === title) {
                    return { root: path, json };
                }
            }
            const parent = dirname(path);
            if (parent === path) {
                throw new JsonNotFoundError(`Could not locate ${title ?? filename}`);
            }
            path = parent;
        }
    }

    get name() {
        return this.json.name ?? `<${this.path}>`;
    }

    get version() {
        return this.json.version ?? "?";
    }

    get exports() {
        return this.json.exports;
    }

    /**
     * Does package forcefully require `CJS` build?
     */
    get requireCjs() {
        return this.json.matter?.requireCjs ?? false
    }

    get hasCodegen() {
        return this.hasDirectory(CODEGEN_PATH);
    }

    resolve(...paths: string[]) {
        return resolve(this.path, ...paths);
    }

    relative(path: string) {
        return relative(this.path, path);
    }

    async glob(pattern: string | string[]) {
        // Glob only understands forward-slash as separator because reasons
        if (typeof pattern === "string") {
            pattern = this.resolve(pattern).replace(/\\/g, "/");
        } else {
            pattern = pattern.map(s => this.resolve(s).replace(/\\/g, "/"));
        }

        // Current glob implementation isn't actually async as this is faster and we only walk small directory trees
        return globSync(pattern);
    }

    start(what: string) {
        const progress = new Progress();
        progress.startup(what, this);
        return progress;
    }

    async lastModified(...paths: string[]) {
        return this.lastModifiedAbsolute(paths.map(p => this.resolve(p)));
    }

    private async lastModifiedAbsolute(paths: string[]) {
        let mtime = 0;
        await Promise.all(
            paths.map(async p => {
                const stats = await ignoreError("ENOENT", async () => await stat(p));
                if (!stats) {
                    return;
                }

                let thisMtime;
                if (stats.isDirectory()) {
                    const paths = (await readdir(p)).map(p2 => resolve(p, p2));
                    thisMtime = await this.lastModifiedAbsolute(paths);
                } else {
                    thisMtime = stats.mtimeMs;
                }
                if (thisMtime > mtime) {
                    mtime = thisMtime;
                }
            }),
        );
        return mtime;
    }

    get dependencies() {
        let result = Array<string>();
        for (const type of ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"]) {
            if (typeof this.json[type] === "object" && this.json[type] !== null) {
                result = [...result, ...Object.keys(this.json[type])];
            }
        }
        return [...new Set(result)];
    }

    get workspace() {
        return Package.workspaceFor(this.path);
    }

    get isWorkspace() {
        return Array.isArray(this.json.workspaces);
    }

    get root(): Package {
        try {
            return this.workspace;
        } catch (e) {
            if (!(e instanceof JsonNotFoundError)) {
                throw e;
            }
        }
        return this;
    }

    static set workingDir(wd: string) {
        workingDir = wd;
    }

    static get workspace() {
        return this.workspaceFor(workingDir);
    }

    static workspaceFor(cwd: string) {
        if (!workspace) {
            workspace = find(cwd, pkg => Array.isArray(pkg.json.workspaces));
        }
        return workspace;
    }

    static get tools() {
        if (!tools) {
            tools = new Package({ path: toolsPath });
        }
        return tools;
    }

    static findExport(name: string, type: "cjs" | "esm" = "esm") {
        return this.workspace.resolveImport(name, type);
    }

    resolveExport(name: string, type: "cjs" | "esm" = "esm") {
        if (!name.startsWith(".")) {
            name = `./${name}`;
        }
        const exportDetail = typeof this.exports === "object" ? this.exports?.[name] : undefined;

        if (typeof exportDetail === "object") {
            const exp = findExportCondition(exportDetail, type);
            if (exp) {
                return this.resolve(exp);
            }
        }

        if (name === ".") {
            if (type === "esm" && this.json.module) {
                return this.resolve(this.json.module);
            }
            if (this.json.main) {
                return this.resolve(this.json.main);
            }
        }

        throw new Error(`Cannot resolve export ${name} in package ${this.name}`);
    }

    findPackage(name: string) {
        let resolveIn = this.path;
        while (true) {
            if (isDirectory(resolve(resolveIn, "node_modules", name))) {
                break;
            }
            const nextResolveIn = dirname(resolveIn);
            if (nextResolveIn === resolveIn) {
                throw new Error(`Cannot find module ${name} from ${this.path}`);
            }
            resolveIn = nextResolveIn;
        }

        return Package.forPath(resolve(resolveIn, "node_modules", name));
    }

    resolveImport(name: string, type: "cjs" | "esm" = "esm") {
        const segments = name.split("/");
        let packageName = segments.shift() as string;
        if (packageName.startsWith("@") && segments.length) {
            packageName = `${packageName}/${segments.shift()}`;
        }

        const pkg = this.findPackage(packageName);

        return pkg.resolveExport(segments.length ? segments.join("/") : ".", type);
    }

    hasFile(path: string) {
        return !!this.#maybeStat(path)?.isFile();
    }

    hasDirectory(path: string) {
        return !!this.#maybeStat(path)?.isDirectory();
    }

    async readFile(path: string) {
        return readFile(this.resolve(path), "utf-8");
    }

    readFileSync(path: string) {
        return readFileSync(this.resolve(path), "utf-8");
    }

    async writeFile(path: string, contents: unknown) {
        await writeFile(this.resolve(path), `${contents}`);
    }

    async save() {
        await this.writeFile(join(this.path, "package.json"), JSON.stringify(this.json, undefined, 4));
    }

    async readJson(path: string) {
        const text = await this.readFile(path);
        try {
            return JSON.parse(text);
        } catch (e) {
            if (!(e instanceof Error)) {
                e = new Error(`${e}`);
            }
            (e as Error).message = `Error parsing "${this.resolve(path)}": ${(e as Error).message}`;
            throw e;
        }
    }

    async writeJson(path: string, value: {}) {
        await this.writeFile(path, JSON.stringify(value, undefined, 4));
    }

    static maybeForPath(path: string) {
        function find(path: string): Package | null {
            let result = packageForPath[path];
            if (result === undefined) {
                if (existsSync(join(path, "package.json"))) {
                    result = new Package({ path });
                } else {
                    const parentDir = dirname(path);
                    if (parentDir === path) {
                        return null;
                    }
                    result = find(parentDir);
                }
                packageForPath[path] = result;
            }
            return result;
        }

        const result = find(path);

        return result ?? undefined;
    }

    static forPath(path: string) {
        const result = this.maybeForPath(path);
        if (result !== undefined) {
            return result;
        }
        throw new Error(`Cannot find package.json for "${path}"`);
    }

    get importAliases(): ImportAliases {
        if (this.#importAliases !== undefined) {
            return this.#importAliases;
        }

        this.#importAliases = new ImportAliases(
            this.json.imports,
            Package.maybeForPath(dirname(this.path))?.importAliases,
        );

        return this.#importAliases;
    }

    get modules() {
        return this.listModules(false);
    }

    get sourceModules() {
        return this.listModules(true);
    }

    /**
     * Create a map of module name -> implementation file.  If "source" is true, searches source files rather than
     * transpiled files.  We do this rather than finding transpilation files then mapping to source files so this works
     * even if there isn't a build.
     */
    listModules(source: boolean, ...conditions: string[]) {
        if (!conditions.length) {
            conditions = [this.supportsEsm ? "import" : "require", "default"];
        }

        const modules = {} as Record<string, string>;

        const exports = this.exports;
        if (typeof exports === "object" && exports !== null) {
            findModules(source, new Set(conditions), modules, this.name, this.path, exports);
        }

        return modules;
    }

    #maybeStat(path: string) {
        return maybeStatSync(this.resolve(path));
    }
}

export type PackageJson = {
    name?: string;
    version?: string;
    imports?: Record<string, string>;
    matter?: {
        test?: boolean;
        requireCjs?: boolean;
    };
    scripts?: Record<string, string>;
    exports?: Exports;
    module?: string;
    main?: string;
    workspaces?: Array<string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    [key: string]: unknown;
};

let workingDir = ".";
let workspace: Package | undefined;
let tools: Package | undefined;

function find(startDir: string, selector: (pkg: Package) => boolean): Package {
    let pkg = new Package({ path: startDir });
    while (!selector(pkg)) {
        pkg = new Package({ path: dirname(pkg.path) });
    }
    return pkg;
}

function selectFormats(json: Record<string, unknown>) {
    let esm: boolean, cjs: boolean;

    if (typeof json !== "object") {
        throw new Error(`Invalid package JSON ${typeof json}`);
    }

    if (json.type === "module") {
        esm = true;
        cjs =
            (json.main !== undefined && json.module !== undefined) ||
            !!Object.values(json.exports ?? {}).find((exp: any) => exp.require);
    } else {
        cjs = true;
        esm = !!json.module || !!Object.values(json.exports ?? {}).find((exp: any) => exp.import);
    }

    return { esm, cjs };
}

function findExportCondition(detail: Record<string, any>, type: "esm" | "cjs"): string | undefined {
    if (type === "esm" && detail.import) {
        let exp = detail.import;
        if (exp && typeof exp !== "string") {
            exp = findExportCondition(exp, type);
        }
        if (exp) {
            return exp;
        }
    }

    let exp = detail.require ?? detail.node ?? detail.default;
    if (exp && typeof exp !== "string") {
        exp = findExportCondition(exp, type);
    }

    if (typeof exp === "string") {
        return exp;
    }
}

type Conditions = { [name: string]: Exports };

type Exports = string | Conditions | Record<string, Conditions>;

function findModules(
    source: boolean,
    conditions: Set<string>,
    target: Record<string, string>,
    prefix: string,
    path: string,
    exports?: Exports,
) {
    if (typeof exports === "string") {
        addModuleGlobs(source, target, prefix, path, exports);
    } else if (Array.isArray(exports)) {
        for (const entry of exports) {
            findModules(source, conditions, target, prefix, path, entry);
        }
    } else if (typeof exports === "object" && exports !== null) {
        let selectedCondition = false;
        for (const key in exports) {
            if (key.startsWith(".")) {
                findModules(source, conditions, target, join(prefix, key), path, exports[key]);
            } else if (!selectedCondition && conditions.has(key)) {
                findModules(source, conditions, target, prefix, path, exports[key]);
                selectedCondition = true;
            }
        }
    } else {
        throw new Error("Malformed exports field in package.json");
    }
}

function addModuleGlobs(source: boolean, target: Record<string, string>, name: string, base: string, pattern: string) {
    let path = join(base, pattern);
    if (source) {
        path = path.replace(/\/dist\/(?:esm|cjs)\//, "/src/");
    }

    if (name.includes("*")) {
        // Wildcard
        if (!name.endsWith("/*")) {
            throw new Error(`Wildcard in module ${name} does not appear as final path segment`);
        }

        name = name.substring(0, name.length - 2);
        const paths = globSync(source ? path.replace(/\.js$/, ".{ts,js,cjs,mjs}") : path);
        if (!paths.length) {
            throw new Error(`No match for module ${name} pattern ${pattern}`);
        }

        const [prefix, suffix] = path.split(/\*+/);
        const prefixLength = prefix === undefined ? 0 : prefix.length;
        const suffixLength = suffix === undefined ? 0 : suffix.length;

        for (const thisPath of paths) {
            const qualifier = thisPath.substring(prefixLength, thisPath.length - suffixLength);
            const thisName = join(name, qualifier);
            target[thisName] = thisPath;
        }
    } else if (path.includes("*")) {
        // A wildcard path is only valid with wildcard name
        throw new Error(`Wildcard in module path "${path}" but not in module "${name}"`);
    } else {
        // No wildcard -- remove directory
        name = name.replace(/\/(?:export|index)$/, "");

        // Look for source if file isn't present
        let found = false;
        if (isFile(path)) {
            found = true;
        } else if (source && path.endsWith(".js")) {
            path = path.replace(/\.js$/, ".ts");
            if (isFile(path)) {
                found = true;
            }
        }

        if (!found) {
            throw new Error(`Module "${name}" path "${path}" not found`);
        }

        target[name] = path;
    }
}
