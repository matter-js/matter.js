/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/index.js";
import { Bytes } from "./Bytes.js";

type Entry = {
    path: string;
    url: string;
    type: "blob" | "tree";
};

type Cache = (name: string, generator: (name: string) => Promise<string>) => Promise<string>;

/**
 * Options for GitHub API requests via fetch
 */
export interface FetchOptions {
    /** Timeout in milliseconds for GitHub API requests */
    timeout?: Duration;
}

export class Directory {
    readonly #cache: Cache;
    readonly #auth?: string;
    readonly #options?: FetchOptions;
    #contents = {} as {
        [key: string]: Entry;
    };

    constructor(
        public readonly url: string,
        cache: Cache,
        options?: FetchOptions,
        auth?: string,
    ) {
        this.#cache = cache;
        this.#auth = auth;
        this.#options = options;
    }

    async ls(): Promise<string[]> {
        await this.load();
        return Object.keys(this.#contents);
    }

    async cd(name: string) {
        const path = name.split("/");
        let result: Directory = this;
        for (const p of path) {
            const entry = await result.find(p);
            if (entry.type !== "tree") throw new Error(`Path "${p}" not a directory`);
            result = new Directory(entry.url, this.#cache, this.#options, this.#auth);
        }
        return result;
    }

    async get(name: string) {
        const entry = await this.find(name);
        if (entry.type !== "blob") throw new Error(`Path "${name}" not a regular file`);
        return await this.fetch(entry.url);
    }

    async getBinary(name: string): Promise<Bytes> {
        const entry = await this.find(name);
        if (entry.type !== "blob") throw new Error(`Path "${name}" not a regular file`);
        return await this.fetchBinary(entry.url);
    }

    private async load() {
        if (Object.keys(this.#contents).length) return;
        const tree = (await JSON.parse(await this.fetch(this.url))).tree;
        if (!tree) throw new Error("No tree in fetch response");
        tree.forEach((e: Entry) => (this.#contents[e.path] = e));
    }

    private async find(name: string) {
        await this.load();
        const entry = this.#contents[name];
        if (!entry) throw new Error(`Path "${name}" not found`);
        return entry;
    }

    private async fetch(url: string) {
        return this.#cache(url.replace(/^https:\/\//, ""), async () => {
            const result = await this.doFetch(url);
            return await result.text();
        });
    }

    private async fetchBinary(url: string): Promise<Bytes> {
        const result = await this.doFetch(url);
        const arrayBuffer = await result.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }

    /**
     * Perform the actual fetch request with common options
     */
    private async doFetch(url: string): Promise<Response> {
        const fetchOptions: RequestInit = {
            headers: {
                accept: "application/vnd.github.raw",
            } as any,
        };

        if (this.#auth) {
            (fetchOptions.headers as any).Authorization = `Bearer ${this.#auth.trim()}`;
        }

        if (this.#options?.timeout) {
            fetchOptions.signal = AbortSignal.timeout(this.#options.timeout);
        }

        const result = await fetch(url, fetchOptions);
        if (result.status !== 200) {
            throw new Error(`HTTP error ${result.statusText} (${result.status}) from ${url}`);
        }

        return result;
    }
}

/**
 * Uber-minimal github client
 */
export class Repo extends Directory {
    constructor(
        org: string,
        repo: string,
        branch: string,
        options?: FetchOptions,
        cache: Cache = (name, generator) => generator(name),
        auth?: string,
    ) {
        super(`https://api.github.com/repos/${org}/${repo}/git/trees/${branch}`, cache, options, auth);
    }
}
