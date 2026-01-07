/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Container } from "./container.js";
import { Docker } from "./docker.js";

/**
 * Builder for a group of containers.
 */
export class Composition {
    #docker: Docker;
    #name: string;
    #abort = new AbortController();
    #parts: Record<string, { ct: Container; closed: Promise<void> }> = {};
    #defaultConfig: Partial<Container.Configuration>;

    constructor(docker: Docker, name: string, defaultConfig?: Partial<Container.Configuration>) {
        this.#docker = docker;
        this.#name = name;
        this.#defaultConfig = defaultConfig ?? {};
    }

    get closed() {
        return Promise.allSettled(Object.values(this.#parts).map(part => part.closed)).then(result => {
            const errors = result
                .map(r => (r.status === "rejected" ? r.reason : undefined))
                .filter(cause => cause !== undefined);
            if (errors.length) {
                const error = new AggregateError(`Error in composition ${this.#name} containers`);
                error.errors = errors;
            }
        });
    }

    get(name: string) {
        const part = this.#parts[name];

        if (this.#abort.signal.aborted) {
            throw new Error(`Cannot access container ${name} because composition ${this.#name} is closed`);
        }
        if (part === undefined) {
            throw new Error(`Container ${name} does not exist in composition ${this.#name}`);
        }

        const { ct } = part;
        if (ct === undefined) {
            throw new Error(`Container ${name} in composition ${this.#name} is not ready`);
        }

        return ct;
    }

    close() {
        if (this.#abort.signal.aborted) {
            return this.closed;
        }

        this.#abort.abort();

        return this.closed;
    }

    async add(
        config: Partial<Container.Configuration> & {
            name: string;
            recreate?: boolean;
            autoKill?: boolean;
            waitForStartup?: (ct: Container) => Promise<void>;
            onExit?: () => void | Promise<void>;
            onError?: (cause: Error) => void | Promise<void>;
        },
    ) {
        const { name, recreate, autoKill, waitForStartup, onExit, onError } = config;
        if (this.#abort.signal.aborted) {
            throw new Error(`Cannot start container ${name} because composition ${this.#name} is closed`);
        }
        if (name in this.#parts) {
            throw new Error(`Container ${name} is already defined in composition ${this.#name}`);
        }

        config = { ...this.#defaultConfig, ...config, name: `${this.#name}-${name}` };
        if (config.image === undefined) {
            throw new Error(
                `No image specified for container ${name} and there is no default image for composition ${this.#name}`,
            );
        }

        let ct: Container;
        if (recreate) {
            ct = await this.#docker
                .erase(config.name)
                .then(() => this.#docker.start(config as Container.Configuration));
        } else {
            ct = await this.#docker.open(config as Container.Configuration & { name: string });
        }

        if (waitForStartup) {
            await waitForStartup(ct);
        }

        const closed = ct
            .wait({ condition: "not-running", abortSignal: this.#abort.signal })
            .then(async () => {
                if (autoKill) {
                    try {
                        await ct.kill();
                    } catch (e) {
                        // Container may not be running; just ignore regardless
                    }
                    return onExit?.();
                }
            })
            .catch(cause => {
                cause.message = `Error in ${config.name}: ${cause.message}`;
                if (onError) {
                    return onError(cause);
                } else {
                    throw cause;
                }
            })
            .finally(() => delete this.#parts[name]);

        this.#parts[name] = {
            ct,
            closed,
        };

        return ct;
    }
}
