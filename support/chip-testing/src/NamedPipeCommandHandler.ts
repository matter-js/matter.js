/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandPipe } from "@matter/testing";
import { execSync } from "node:child_process";
import { constants } from "node:fs";
import { FileHandle, open, unlink } from "node:fs/promises";
import { Socket } from "node:net";

export class NamedPipeCommandHandler extends CommandPipe {
    #namedPipe?: FileHandle;
    #namedPipeSocket?: Socket;
    #stopping = false;

    async #openSocket() {
        if (this.#stopping) {
            return;
        }
        if (this.#namedPipe !== undefined) {
            try {
                await this.#namedPipe.close();
            } catch (error: any) {
                // EBADF can happen if the pipe is already closed from outside, so ignore that case
                if (error.code !== "EBADF") {
                    console.log("Error closing named pipe:", error);
                }
            }
        }

        this.#namedPipe = await open(this.filename, constants.O_RDONLY | constants.O_NONBLOCK);
        this.#namedPipeSocket = new Socket({ fd: this.#namedPipe.fd });
        console.log(`Named pipe opened: ${this.filename}`);

        this.#namedPipeSocket.on("data", this.onData.bind(this));

        this.#namedPipeSocket.on("error", err => {
            console.log("Named pipe error:", err);
        });

        this.#namedPipeSocket.on("close", () => {
            console.log("Named pipe closed");
            this.#openSocket().catch(error => console.log("Error on reopening named pipe", error)); // Open new Socket for next command
        });
    }

    override async initialize() {
        execSync(`mkfifo ${this.filename}`);
        console.log(`Named pipe created: ${this.filename}`);

        await this.#openSocket();
    }

    override async close() {
        this.#stopping = true;
        try {
            await this.#namedPipe?.close();
            this.#namedPipeSocket?.destroy();
        } catch (error) {
            console.log("Error closing named pipe:", error);
        }
        this.#namedPipe = undefined;
        this.#namedPipeSocket = undefined;
        await unlink(this.filename);
    }
}
