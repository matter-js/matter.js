/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { type MaybeAsyncIterable, Stream } from "./Streams.js";

/**
 * Gzip compression/decompression utilities with runtime feature detection.
 */
export namespace Gzip {
    /**
     * Whether the runtime supports gzip compression via CompressionStream/DecompressionStream.
     */
    export const isAvailable = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

    /**
     * Gzip-compress a byte stream.
     */
    export function compress(source: MaybeAsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
        if (!isAvailable) {
            throw new ImplementationError("Gzip compression is not supported in this runtime");
        }

        const compressed = Stream.from(source).pipeThrough(
            new CompressionStream("gzip") as ReadableWritablePair<Uint8Array, Uint8Array>,
        );

        return Stream.iterable(compressed);
    }

    /**
     * Gzip-decompress a byte stream.
     */
    export function decompress(source: MaybeAsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
        if (!isAvailable) {
            throw new ImplementationError("Gzip decompression is not supported in this runtime");
        }

        const decompressed = Stream.from(source).pipeThrough(
            new DecompressionStream("gzip") as ReadableWritablePair<Uint8Array, Uint8Array>,
        );

        return Stream.iterable(decompressed);
    }
}
