/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandPipe } from "@matter/testing";
import { execSync } from "node:child_process";
import { constants, openSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { Socket } from "node:net";

export class NamedPipeCommandHandler extends CommandPipe {
    #namedPipeSocket?: Socket;
    #stopping = false;

    #openSocket() {
        if (this.#stopping) {
            return;
        }

        // The socket owns the descriptor and closes it when it closes
        const fd = openSync(this.filename, constants.O_RDONLY | constants.O_NONBLOCK);
        this.#namedPipeSocket = new Socket({ fd });
        console.log(`Named pipe opened: ${this.filename}`);

        this.#namedPipeSocket.on("data", this.onData.bind(this));

        this.#namedPipeSocket.on("error", err => {
            console.log("Named pipe error:", err);
        });

        this.#namedPipeSocket.on("close", () => {
            console.log("Named pipe closed");
            try {
                this.#openSocket(); // Open new Socket for next command
            } catch (error) {
                console.log("Error on reopening named pipe", error);
            }
        });
    }

    override async initialize() {
        execSync(`mkfifo ${this.filename}`);
        console.log(`Named pipe created: ${this.filename}`);

        this.#openSocket();
    }

    override async close() {
        this.#stopping = true;
        this.#namedPipeSocket?.destroy();
        this.#namedPipeSocket = undefined;
        try {
            await unlink(this.filename);
        } catch (error: any) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }
}
