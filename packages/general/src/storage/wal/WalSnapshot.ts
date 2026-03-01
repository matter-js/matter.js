/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Directory } from "../../fs/Directory.js";
import { Gzip } from "../../util/Gzip.js";
import { type SupportedStorageTypes, fromJson, toJson } from "../StringifyTools.js";
import type { WalCommitId } from "./WalCommit.js";

type StoreData = Record<string, Record<string, SupportedStorageTypes>>;

/**
 * An immutable snapshot of WAL storage state at a specific point in history.
 *
 * Provides synchronous query methods for programmatic access and persistence methods for disk I/O.
 */
export class WalSnapshot {
    readonly commitId: WalCommitId;
    readonly ts: number;
    readonly data: StoreData;

    constructor(commitId: WalCommitId, ts: number, data: StoreData) {
        this.commitId = commitId;
        this.ts = ts;
        this.data = data;
    }

    // --- Programmatic access (synchronous — data is in memory) ---

    /**
     * Get a single value.
     */
    get(contexts: string[], key: string): SupportedStorageTypes | undefined {
        const contextKey = contexts.join(".");
        return this.data[contextKey]?.[key];
    }

    /**
     * Get all keys in a context.
     */
    keys(contexts: string[]): string[] {
        const contextKey = contexts.join(".");
        return Object.keys(this.data[contextKey] ?? {});
    }

    /**
     * Get all values in a context.
     */
    values(contexts: string[]): Record<string, SupportedStorageTypes> {
        const contextKey = contexts.join(".");
        return { ...(this.data[contextKey] ?? {}) };
    }

    /**
     * Get sub-contexts under the given context prefix.
     */
    contexts(contexts: string[]): string[] {
        const contextKey = contexts.length ? contexts.join(".") : "";
        const prefix = contextKey.length ? `${contextKey}.` : "";
        const found = new Set<string>();
        for (const key of Object.keys(this.data)) {
            if (key.startsWith(prefix)) {
                const sub = key.substring(prefix.length).split(".");
                if (sub.length >= 1 && sub[0].length > 0) {
                    found.add(sub[0]);
                }
            }
        }
        return [...found];
    }

    // --- Persistence ---

    /**
     * Write this snapshot to disk (atomic via write+rename).
     */
    async save(dir: Directory, options?: { compress?: boolean; basename?: string }): Promise<void> {
        const compress = options?.compress ?? true;
        const basename = options?.basename ?? "snapshot";

        const snapshot = {
            commitId: this.commitId,
            ts: this.ts,
            data: this.data,
        };

        const json = toJson(snapshot as unknown as SupportedStorageTypes, 2);

        if (compress) {
            const encoded = new TextEncoder().encode(json);

            const tmpFile = dir.file(`${basename}.tmp.json.gz`);
            await tmpFile.write(Gzip.compress([encoded]));
            await tmpFile.rename(`${basename}.json.gz`);

            // Clean up uncompressed file if it exists
            const jsonFile = dir.file(`${basename}.json`);
            if (await jsonFile.exists()) {
                await jsonFile.delete();
            }
        } else {
            const tmpFile = dir.file(`${basename}.tmp.json`);
            await tmpFile.write(json);
            await tmpFile.rename(`${basename}.json`);

            // Clean up compressed file if it exists
            const gzFile = dir.file(`${basename}.json.gz`);
            if (await gzFile.exists()) {
                await gzFile.delete();
            }
        }
    }

    /**
     * Load an existing snapshot from disk, auto-detecting the format.
     */
    static async load(dir: Directory, options?: { basename?: string }): Promise<WalSnapshot | undefined> {
        const basename = options?.basename ?? "snapshot";

        const gzFile = dir.file(`${basename}.json.gz`);
        const jsonFile = dir.file(`${basename}.json`);

        const gzExists = await gzFile.exists();
        const jsonExists = await jsonFile.exists();

        if (!gzExists && !jsonExists) {
            return undefined;
        }

        let text: string;

        let useGz: boolean;
        if (gzExists && jsonExists) {
            const gzMtime = (await gzFile.stat()).mtime;
            const jsonMtime = (await jsonFile.stat()).mtime;
            useGz = gzMtime >= jsonMtime;
        } else {
            useGz = gzExists;
        }

        if (useGz) {
            const chunks = Array<Uint8Array>();
            for await (const chunk of Gzip.decompress(gzFile.readBytes())) {
                chunks.push(chunk);
            }
            const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }
            text = new TextDecoder().decode(combined);
        } else {
            text = await jsonFile.readAllText();
        }

        const parsed = fromJson(text) as unknown as { commitId: WalCommitId; ts?: number; data: StoreData };

        return new WalSnapshot(parsed.commitId, parsed.ts ?? 0, parsed.data);
    }
}
