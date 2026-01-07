/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackchannelCommand } from "../device/backchannel.js";

const utf8 = new TextDecoder();

/**
 * Implements back-channel communication between CHIP and the local subject.
 *
 * Must be extended to implement actual communication.
 */
export abstract class CommandPipe {
    #filename: string;
    #subject: BackchannelCommand.Subject;

    constructor(subject: BackchannelCommand.Subject, filename: string) {
        this.#subject = subject;
        this.#filename = filename;
    }

    static filenameFor(app: string) {
        return `/tmp/chip_${app}_fifo_${process.pid}`;
    }

    get filename() {
        return this.#filename;
    }

    abstract initialize(): Promise<void>;
    abstract close(): Promise<void>;

    protected onData(line: string | Uint8Array) {
        if (typeof line !== "string") {
            line = utf8.decode(line);
        }

        let data: Record<string, unknown>;
        try {
            data = JSON.parse(line);
        } catch (error) {
            console.error("Error parsing pipe command:", error);
            return;
        }

        if (typeof data !== "object" || data === null) {
            console.error("Pipe command is not an object:", data);
            return;
        }

        if (typeof data.Name !== "string") {
            console.error("Pipe command does not have a name:", data);
            return;
        }

        data.Name = data.Name.slice(0, 1).toLowerCase() + data.Name.slice(1);

        data = Object.fromEntries(
            Object.entries(data).map(([k, v]) => {
                k = k.slice(0, 1).toLowerCase() + k.slice(1);
                return [k, v];
            }),
        );

        try {
            const result = this.#subject.backchannel(data as BackchannelCommand);
            if (result) {
                result.catch(listenerError);
            }
        } catch (error) {
            listenerError(error);
        }

        function listenerError(error: unknown) {
            console.error("Unhandled error in pipe command listener:", error);
        }
    }
}
