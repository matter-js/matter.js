/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { build as esbuild, Format } from "esbuild";
import { Hash } from "node:crypto";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { ignoreError } from "../util/errors.js";
import { CONFIG_PATH, Package } from "../util/package.js";

export const BUILD_INFO_LOCATION = "build/info.json";
export const COMPILED_CONFIG_PATH = "build/build.config.js";

export interface BuildInformation {
    /**
     * Time of last build.  Compared to source files to determine whether build is dirty.
     */
    timestamp?: string;

    /**
     * API signature.  Used by dependents to determine whether they need to rebuild after we do.
     */
    apiSha?: string;

    /**
     * API signature of each dependency.  Compared to apiSha of each dependency during dirty detection.
     */
    dependencyApiShas?: Record<string, string>;
}

export class Project {
    pkg: Package;
    #config?: Project.Config;
    #configured?: boolean;

    constructor(source: Package | string = ".") {
        if (typeof source === "string") {
            this.pkg = new Package({ path: source });
        } else {
            this.pkg = source;
        }

        if (!this.pkg.hasSrc) {
            throw new Error(
                `Found package ${this.pkg.json.name} but src directory is not present or not referenced in tsconfig.json`,
            );
        }
    }

    async buildSource(format: Format) {
        await this.#build(format, "src", `dist/${format}`);
        await this.#configureFormat("dist", format, true);
    }

    async buildTests(format: Format) {
        if (this.pkg.hasDirectory("test")) {
            await this.#build(format, "test", `build/${format}/test`);
        }

        const src = join("dist", format);
        const dest = join("build", format, "src");

        try {
            const destPath = this.pkg.resolve(dest);
            await mkdir(dirname(destPath), { recursive: true });
            await ignoreError("EEXIST", async () => await symlink(join("..", "..", src), destPath));
        } catch (e) {
            if ((e as any).code === "EPERM" && platform() === "win32") {
                // If developer mode is not enabled, we can't create a symlink on Windows.  Copy instead
                await cp(this.pkg.resolve(src), this.pkg.resolve(dest), {
                    recursive: true,
                    force: true,
                });
            } else {
                throw e;
            }
        }
        await this.#configureFormat("build", format, false);
    }

    async clean() {
        for (const dir of ["build", "dist"]) {
            await rm(this.pkg.resolve(dir), { recursive: true, force: true });
        }
    }

    get hasDeclarations() {
        return this.pkg.hasDirectory("build/types");
    }

    async hashDeclarations(apiSha: Hash) {
        if (!this.pkg.isLibrary) {
            return;
        }

        let path;
        if (this.pkg.supportsEsm) {
            path = "esm";
        } else if (this.pkg.supportsCjs) {
            path = "cjs";
        } else {
            return;
        }

        const declarations = (await this.pkg.glob(`dist/${path}/**/*.d.{ts,mts,cts}`)).sort();
        for (const file of declarations) {
            apiSha.update(file);
            apiSha.update(await readFile(file));
        }
    }

    async recordBuildInfo(info: BuildInformation) {
        await mkdir(this.pkg.resolve("build"), { recursive: true });
        info.timestamp = new Date().toISOString();
        await writeFile(this.pkg.resolve(BUILD_INFO_LOCATION), JSON.stringify(info, undefined, 4));
    }

    async configure() {
        if (this.#configured) {
            return this.#config;
        }

        if (!this.pkg.hasConfig) {
            return {};
        }

        const configPath = this.pkg.resolve(CONFIG_PATH);
        const outfile = this.pkg.resolve(COMPILED_CONFIG_PATH).replaceAll("\\", "/");

        await esbuild({
            entryPoints: [configPath],
            outfile,
            sourcemap: true,
        });

        this.#config = (await import(`file://${outfile}`)) as Project.Config | undefined;
        this.#configured = true;

        if (this.#config?.startup) {
            await this.#config?.startup({
                project: this,
            });
        }

        return this.#config;
    }

    /**
     * Copy files into dist for supported formats.
     */
    async copyToDist(source: string, dest: string) {
        const formats = Array<string>();
        if (this.pkg.supportsEsm) {
            formats.push("esm");
        }
        if (this.pkg.supportsCjs) {
            formats.push("cjs");
        }
        for (const format of formats) {
            await cp(this.pkg.resolve(source), this.pkg.resolve(join("dist", format, dest)), {
                recursive: true,
                force: true,
            });
        }
    }

    async #build(format: Format, indir: string, outdir: string) {
        const entryPoints = await this.#targetsOf(indir, outdir, "ts", "js");

        const configPath = this.pkg.resolve(CONFIG_PATH);
        for (const entry of entryPoints) {
            if (entry.in === configPath) {
                continue;
            }
            entry.out = entry.out.replace(/\.[jt]s$/, "");
        }

        await esbuild({
            entryPoints,
            outdir: this.pkg.path,
            format,
            sourcemap: true,
            sourcesContent: false,
            absWorkingDir: dirname(this.pkg.resolve(indir)),

            // This is necessary to downlevel "using"
            target: "es2022",

            logOverride: {
                "direct-eval": "silent",
            },
        });

        for (const entry of await this.#targetsOf(indir, outdir, "cjs", "mjs", "d.cts", "d.mts")) {
            await cp(entry.in, entry.out);
        }
    }

    async #configureFormat(dir: string, format: Format, isDist: boolean) {
        // Build import map
        let { imports } = this.pkg.json;
        if (isDist && typeof imports === "object") {
            imports = { ...imports };
            for (const key in imports) {
                const value = imports[key];
                if (typeof value === "string") {
                    imports[key] = value.replace(/^\.\/src\//, "./");
                }
            }
        }

        // Write package.json
        const path = this.pkg.resolve(`${dir}/${format}/package.json`);
        const json: Record<string, unknown> = {
            type: format === "cjs" ? "commonjs" : "module",
            imports,
        };
        await writeFile(path, JSON.stringify(json, undefined, 4));
    }

    async #targetsOf(indir: string, outdir: string, ...extensions: string[]) {
        const inputPrefixLength = this.pkg.resolve(indir).length + 1;
        outdir = this.pkg.resolve(outdir).replace(/\\/g, "/");

        return (await this.pkg.glob(extensions.map(ext => `${indir}/**/*.${ext}`))).map(file => ({
            in: file,
            out: `${outdir}/${file.slice(inputPrefixLength)}`,
        }));
    }
}

export namespace Project {
    export interface Context {
        project: Project;
    }

    export interface Config {
        startup?: (context: Context) => Promise<void>;
        before?: (context: Context) => Promise<void>;
        after?: (context: Context) => Promise<void>;
    }
}
