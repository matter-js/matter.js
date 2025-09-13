/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader } from "#util/index.js";

/**
 * A stream reader that reads bytes from a stream and provides a way to skip bytes.
 */
export class BytesStreamReader {
    #streamReader: ReadableStreamDefaultReader<Bytes>;
    #dataReader?: DataReader;
    #streamEndReached = false;

    constructor(streamReader: ReadableStreamDefaultReader<Bytes>) {
        this.#streamReader = streamReader;
    }

    async *read(chunkSize: number) {
        while (true) {
            if (this.#streamEndReached) {
                // End of the stream already reached, so there is no more data
                // This case can happen when bytes were skipped
                return;
            }
            // No data or not enough data available, read more data from the stream
            if (this.#dataReader === undefined || this.#dataReader.remainingBytesCount < chunkSize) {
                const { value, done } = await this.#streamReader.read();
                if (value === undefined || done) {
                    // We are done and have no more data to read, send out the rest if there is any
                    if (this.#dataReader !== undefined) {
                        yield this.#dataReader.remainingBytes;
                    }
                    break;
                }

                if (this.#dataReader !== undefined) {
                    this.#dataReader = new DataReader(Bytes.concat(this.#dataReader.remainingBytes, value));
                } else {
                    this.#dataReader = new DataReader(value);
                }
            }
            // If we have enough data available, just return the next chunk
            if (this.#dataReader !== undefined && this.#dataReader.remainingBytesCount >= chunkSize) {
                yield this.#dataReader.readByteArray(chunkSize);

                if (this.#dataReader !== undefined && this.#dataReader.remainingBytesCount === 0) {
                    this.#dataReader = undefined;
                }
            }
        }
    }

    /**
     * Tries to skip the desired number of bytes, returns the actual number of skipped bytes.
     * This skip() method should be called when no read() chunk is also awaited!
     */
    async skip(desiredSkippedBytes: number): Promise<number> {
        if (this.#streamEndReached) {
            // End of the stream already reached, so there is no more data
            // This case can happen when bytes were skipped
            return 0;
        }
        // We have enough data to just skip the bytes
        if (this.#dataReader !== undefined && this.#dataReader.remainingBytesCount >= desiredSkippedBytes) {
            this.#dataReader.offset = this.#dataReader.offset + desiredSkippedBytes;
            if (this.#dataReader.remainingBytesCount === 0) {
                this.#dataReader = undefined;
            }
            return desiredSkippedBytes;
        }

        // Otherwise, loop through the stream until we have enough data to skip
        let skippedBytes = desiredSkippedBytes - (this.#dataReader?.remainingBytesCount ?? 0);
        this.#dataReader = undefined;
        while (true) {
            const { value, done } = await this.#streamReader.read();
            if (value === undefined || done) {
                this.#streamEndReached = true;
                // No more data to skip, return the number of bytes we could skip
                return desiredSkippedBytes - skippedBytes;
            }

            if (value.byteLength <= skippedBytes) {
                // The current chunk is too small (or exactly the necessary length), handle that case
                skippedBytes -= value.byteLength;
                if (skippedBytes === 0) {
                    return desiredSkippedBytes;
                }
                continue;
            }
            // We got more data than needed, so remember partial data
            this.#dataReader = new DataReader(value);
            this.#dataReader.offset = skippedBytes;
            return desiredSkippedBytes;
        }
    }
}
