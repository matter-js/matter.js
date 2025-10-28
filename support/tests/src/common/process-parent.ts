/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, SafePromise } from "@matter/main";
import { afterRun } from "@matter/testing";
import { ChildProcess, fork } from "node:child_process";
import { join } from "node:path";
import { Message } from "./message.js";

const logger = Logger.get("parent-process");

const activeProcesses = new Set<ParentProcess>();

afterRun(async () => {
    while (activeProcesses.size) {
        for (const process of activeProcesses) {
            await process.close();
        }
    }
});

/**
 * A base class for components that manage child processes.
 */
export class ParentProcess {
    #script: string;
    #activeChild?: {
        process: ChildProcess;
        result: Promise<void>;
        outstandingRequests: Map<number, { resolve(): void; reject(error: Error): void }>;
    };
    #closed = false;
    #nextExchangeNo = 1;

    constructor(script: string) {
        this.#script = script;
    }

    async close() {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        if (this.#activeChild) {
            activeProcesses.delete(this);
            this.#activeChild.process.kill("SIGKILL");
            await this.#activeChild.result;
            this.#activeChild = undefined;
        }
    }

    protected send<T extends Message.Acknowledged>(message: Omit<T, "exchangeNo">) {
        const exchangeNo = ++this.#nextExchangeNo;

        return SafePromise.race([
            new Promise<void>((resolve, reject) => {
                this.#child.process.send({ ...message, exchangeNo }, error => {
                    if (error) {
                        reject(error);
                    } else {
                        this.#child.outstandingRequests.set(exchangeNo, { resolve, reject });
                    }
                });
            }),
            this.#child.result,
        ]);
    }

    get #child() {
        if (this.#activeChild) {
            return this.#activeChild;
        }

        const child = fork(join(import.meta.dirname, "..", this.#script), [], { stdio: "pipe" });
        const outstandingRequests = new Map();

        this.#activeChild = {
            process: child,

            result: new Promise((resolve, reject) => {
                let resolved = false;

                child.on("message", (message: Message.Inbound) => {
                    if (typeof message !== "object") {
                        logger.warn("Received non-object message from test controller");
                        return;
                    }

                    switch (message.kind) {
                        case "log":
                            MockLogger.injectExternalMessage("CHILD", message.message);
                            break;

                        case "ack":
                            const response = outstandingRequests.get(message.exchangeNo);
                            if (!response) {
                                logger.error(`Ignoring ack for unknown request #${message.exchangeNo}`);
                                break;
                            }
                            outstandingRequests.delete(message.exchangeNo);
                            if (message.error) {
                                response.reject(new Error(message.error));
                            } else {
                                response.resolve();
                            }
                            break;

                        default:
                            logger.error(
                                `Ignorring unsupported message kind "${(message as Message).kind}" from test controller`,
                            );
                            break;
                    }
                });

                child.on("exit", code => {
                    if (resolved) {
                        return;
                    }
                    if (!this.#closed) {
                        reject(new InternalError(`Premature test controller exit with code ${code}`));
                    }
                    resolve();
                });

                child.on("error", error => {
                    if (resolved) {
                        return;
                    }
                    resolved = true;
                    reject(error);
                });

                child.stdout?.on("data", passOutput);
                child.stderr?.on("data", passOutput);
            }),

            outstandingRequests,
        };

        activeProcesses.add(this);

        return this.#activeChild;
    }
}

function passOutput(output: unknown) {
    let text = `${output}`;
    if (text.endsWith("\n")) {
        text = text.slice(0, text.length - 1);
    }
    for (const line of text.split("\n")) {
        MockLogger.injectExternalMessage("CTL", line);
    }
}
