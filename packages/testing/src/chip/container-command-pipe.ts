/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackchannelCommand } from "../device/backchannel.js";
import { Container } from "../docker/container.js";
import { Terminal } from "../docker/terminal.js";
import { CommandPipe } from "./command-pipe.js";

export const FIFO_PATH = "/command-pipe.fifo";

/**
 * A command pipe that reads commands from a Docker container.
 */
export class ContainerCommandPipe extends CommandPipe {
    #container: Container;
    #deactivate?: () => void;
    #stopped?: Promise<void>;

    constructor(container: Container, subject: BackchannelCommand.Subject) {
        super(subject, "/command-pipe.fifo");
        this.#container = container;
    }

    override async initialize() {
        // We create a single FIFO for the container and symlink to the hard-coded name expected by CHIP
        await this.#container.createPipe(FIFO_PATH);

        this.#stopped = this.#processCommands();
    }

    async installForApp(name: string) {
        await this.#container.exec(["ln", "-sf", this.filename, ContainerCommandPipe.filenameFor(name)]);
    }

    override async close() {
        this.#deactivate?.();
        this.#deactivate = undefined;

        await this.#stopped;
        this.#stopped = undefined;
    }

    async #processCommands() {
        let commands: Terminal<string> | undefined;
        try {
            commands = await this.#container.exec(
                ["bash", "-c", `while true; do cat ${FIFO_PATH}; done`],
                Terminal.StdoutLine,
            );

            const deactivated = new Promise<void>(resolve => {
                this.#deactivate = resolve;
            });

            const iterator = commands[Symbol.asyncIterator]();

            while (true) {
                const command = await Promise.race([
                    deactivated,
                    iterator.next().then(result => result.value as string),
                ]);
                if (command === undefined) {
                    break;
                }
                this.onData(command);
            }
            await deactivated;
        } finally {
            if (commands) {
                try {
                    await commands.close();
                } catch (e) {
                    console.warn(`Error closing command proxy for ${this.filename}:`, e);
                }
            }

            try {
                await this.#container.delete(this.filename, { force: true });
            } catch (e) {
                console.warn(`Error deleting FIFO ${this.filename}:`, e);
            }
        }
    }
}
