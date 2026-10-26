/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import type { File } from "../../fs/File.js";
import { Bytes } from "../../util/Bytes.js";
import { Gzip } from "../../util/Gzip.js";
import type { MaybeAsyncIterable } from "../../util/Streams.js";

const logger = Logger.get("WalFiles");

/**
 * Replace the content of {@link file} and, if {@link fsync} is set, flush it to persistent storage before returning.
 *
 * Callers write to a temporary file and rename it afterwards.  Without the flush, a power loss after the rename can
 * leave the renamed file empty or truncated on filesystems that delay data writes.
 */
export async function writeSynced(file: File, content: MaybeAsyncIterable<Bytes | string>, fsync: boolean) {
    const handle = await file.open("wal", "w");
    try {
        for await (const chunk of content) {
            await handle.writeHandle(chunk);
        }
        if (fsync) {
            await handle.fsync();
        }
    } catch (error) {
        await handle
            .close()
            .catch(closeError => logger.debug(`Closing ${file.path} after a failed write failed:`, closeError));
        throw error;
    }
    await handle.close();
}

/**
 * Read a gzip-compressed text file completely.
 */
export async function readGzipText(file: File): Promise<string> {
    const chunks = new Array<Uint8Array>();
    for await (const chunk of Gzip.decompress(file.readBytes())) {
        chunks.push(chunk);
    }
    return new TextDecoder().decode(Bytes.of(Bytes.concat(...chunks)));
}
