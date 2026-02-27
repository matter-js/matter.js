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
 * Manages periodic snapshots of the in-memory store.
 */
export class WalSnapshot {
    readonly #storageDir: Directory;
    readonly #compress: boolean;

    constructor(storageDir: Directory, compress = true) {
        this.#storageDir = storageDir;
        this.#compress = compress;
    }

    /**
     * Load an existing snapshot from disk, auto-detecting the format.
     */
    async load(): Promise<{ commitId: WalCommitId; data: StoreData } | undefined> {
        const gzFile = this.#storageDir.file("snapshot.json.gz");
        const jsonFile = this.#storageDir.file("snapshot.json");

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

        const parsed = fromJson(text) as unknown as { commitId: WalCommitId; data: StoreData };

        return {
            commitId: parsed.commitId,
            data: parsed.data,
        };
    }

    /**
     * Write a snapshot of the current state to disk (atomic via write+rename).
     */
    async run(commitId: WalCommitId, currentState: StoreData): Promise<void> {
        const snapshot = {
            commitId,
            data: currentState,
        };

        const json = toJson(snapshot as unknown as SupportedStorageTypes, 2);

        if (this.#compress) {
            const encoded = new TextEncoder().encode(json);

            const tmpFile = this.#storageDir.file("snapshot.tmp.json.gz");
            await tmpFile.write(Gzip.compress([encoded]));
            await tmpFile.rename("snapshot.json.gz");

            // Clean up uncompressed file if it exists
            const jsonFile = this.#storageDir.file("snapshot.json");
            if (await jsonFile.exists()) {
                await jsonFile.delete();
            }
        } else {
            const tmpFile = this.#storageDir.file("snapshot.tmp.json");
            await tmpFile.write(json);
            await tmpFile.rename("snapshot.json");

            // Clean up compressed file if it exists
            const gzFile = this.#storageDir.file("snapshot.json.gz");
            if (await gzFile.exists()) {
                await gzFile.delete();
            }
        }
    }
}
