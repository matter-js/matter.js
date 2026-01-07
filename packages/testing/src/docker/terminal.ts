/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from "node:stream";
import { promisify } from "node:util";
import { asyncLinesOf, textOf } from "../util/text.js";
import type { Docker } from "./docker.js";
import { NonZeroExitError } from "./errors.js";

/**
 * A "terminal" is an API for reading and writing data to a running process.
 *
 * We support two types:
 *
 *   * {@link Terminal.Raw} emits chunks of bytes, tagged with "stderr" and "stdout" depending on source
 *   * {@link Terminal.Line} is line oriented and emits a string for each line
 */
export interface Terminal<OutputT> extends AsyncIterable<OutputT> {
    write(content: unknown): Promise<void>;
    close(): Promise<void>;
    consume(): Promise<OutputT>;
}

export namespace Terminal {
    export interface Factory<OutputT = unknown> {
        (docker: Docker, stream: NodeJS.ReadWriteStream, exited: Promise<void>): Terminal<OutputT>;
    }

    export interface Chunk extends Uint8Array {
        source?: "stdout" | "stderr";
    }

    export function Raw(docker: Docker, stream: NodeJS.ReadWriteStream, exited: Promise<void>): Terminal<Chunk> {
        const buffer = Array<Chunk>();
        let closed = false;
        let signalReadReady: () => void;
        let readReady: Promise<void>;
        resetBuffer();

        stream.on("close", () => {
            closed = true;
            signalReadReady();
        });

        const stdout = createOutputStream("stdout");
        const stderr = createOutputStream("stderr");

        docker.intf.modem.demuxStream(stream, stdout, stderr);
        const write = promisify(stream.write).bind(stream) as (content: Uint8Array | string) => Promise<void>;

        // Exited promise should never be unhandled; it's only relevant if the streams close without error
        exited.catch(() => {});

        return {
            async write(content: {}) {
                if (content === undefined || content === null) {
                    return;
                }

                if (typeof content === "object" && Symbol.asyncIterator in content) {
                    for await (const chunk of content as AsyncIterable<unknown>) {
                        await this.write(chunk);
                    }
                } else if (typeof content === "string" || content instanceof Uint8Array) {
                    await write(content);
                } else if (ArrayBuffer.isView(content)) {
                    await write(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
                } else if (typeof content === "object" && Symbol.iterator in content) {
                    for (const chunk of content as Iterable<unknown>) {
                        await this.write(chunk);
                    }
                } else {
                    await write(content.toString());
                }
            },

            async close() {
                if (closed) {
                    return;
                }

                await promisify(stream.end).bind(stream)();

                // In the case of an exec socket closing one side is insufficient for Dockerode to terminate the stream;
                // need to actually destroy it to ensure close
                if ("destroy" in stream && typeof stream.destroy === "function") {
                    stream.destroy();
                }
            },

            async consume(): Promise<Uint8Array> {
                const chunks = Array<Uint8Array>();
                let length = 0;
                try {
                    for await (const chunk of this) {
                        chunks.push(chunk);
                        length += chunk.length;
                    }
                } catch (e) {
                    // With non-zero exit errors the message is probably in the data we were collecting, so include that
                    // in the error message
                    if (e instanceof NonZeroExitError) {
                        let message = textOf(join());
                        if (message.length > 256) {
                            message = message.slice(0, 256) + "…";
                        }
                        e = new NonZeroExitError(e.code, message);
                    }

                    throw e;
                }

                return join();

                function join() {
                    const output = new Uint8Array(length);
                    let pos = 0;
                    for (const chunk of chunks) {
                        output.set(chunk, pos);
                        pos += chunk.length;
                    }
                    return output;
                }
            },

            [Symbol.asyncIterator]: function (): AsyncIterator<Chunk, any, any> {
                return {
                    async next() {
                        while (!closed || buffer.length) {
                            await readReady;

                            let result;
                            if (buffer.length) {
                                result = {
                                    done: false,
                                    value: buffer.shift()!,
                                };

                                if (!buffer.length && !closed) {
                                    resetBuffer();
                                }

                                return result;
                            }

                            if (!closed) {
                                resetBuffer();
                            }
                        }

                        await exited;

                        return {
                            done: true,
                            value: undefined,
                        };
                    },
                };
            },
        };

        function resetBuffer() {
            readReady = new Promise(resolve => {
                signalReadReady = resolve;
            });
        }

        function createOutputStream(source: "stdout" | "stderr") {
            // We do not need a real stream.  demuxStream only invokes the "write" method and we don't want buffering
            return {
                write(chunk: Buffer) {
                    if (!(chunk instanceof Uint8Array)) {
                        throw new Error("Input chunk is not a byte array");
                    }
                    (chunk as Chunk).source = source;
                    buffer.push(chunk as Chunk);
                    signalReadReady();
                },
            } as Writable;
        }
    }

    export function Line(docker: Docker, stream: NodeJS.ReadWriteStream, exited: Promise<void>): Terminal<string> {
        const raw = Raw(docker, stream, exited);
        return createLineTerminal(raw);
    }

    export function StdoutLine(docker: Docker, stream: NodeJS.ReadWriteStream, exited: Promise<void>) {
        const raw = Raw(docker, stream, exited);
        return createLineTerminal(raw, chunk => (chunk.source === "stdout" ? chunk : undefined));
    }
}

function createLineTerminal(
    raw: Terminal<Terminal.Chunk>,
    filter?: (chunk: Terminal.Chunk) => Terminal.Chunk | undefined,
): Terminal<string> {
    return {
        write(content: string | Uint8Array) {
            return raw.write(content);
        },

        close() {
            return raw.close();
        },

        consume() {
            return raw.consume().then(textOf);
        },

        [Symbol.asyncIterator]() {
            return asyncLinesOf(raw, filter);
        },
    };
}
