/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdir } from "node:fs/promises";

import Dockerode from "dockerode";
import { Composition } from "./composition.js";
import { Container } from "./container.js";
import { DockerError } from "./errors.js";

/**
 * A high-level docker control API specialized for our purposes.
 */
export class Docker {
    #intf = new Dockerode();

    get intf() {
        return this.#intf;
    }

    /**
     * Build a composition of multiple containers.
     */
    compose(name: string, config?: Partial<Container.Configuration>) {
        return new Composition(this, name, config);
    }

    /**
     * Ensure a container doesn't exist regardless of current state.
     */
    async erase(name: string) {
        const info = await this.containerStatus(name);
        if (info) {
            const ct = Container(this, this.#intf.getContainer(info.id));
            try {
                await ct.remove(true);
            } catch (e) {
                DockerError.accept(e, 404, 409);
            }
            return ct;
        }
    }

    /**
     * Obtain a running {@link Container}.  Connects to existing container or creates a new container.
     */
    async open(options: Container.Configuration & { name: string }) {
        const info = await this.containerStatus(options.name);
        if (info) {
            const ct = Container(this, this.#intf.getContainer(info.id));
            if (!info.isRunning) {
                await ct.start();
            }
            return ct;
        }

        const ct = await this.create(options);
        await ct.start();
        return ct;
    }

    async containerStatus(name: string) {
        try {
            const inspect = await DockerError.adapt(this.#intf.getContainer(name).inspect());
            return {
                name,
                id: inspect.Id,
                isRunning: inspect.State.Status === "running",
            };
        } catch (e) {
            DockerError.accept(e, 404);
        }
    }

    async create(config: Container.Configuration): Promise<Container> {
        return Container(this, config);
    }

    async start(config: Container.Configuration): Promise<Container> {
        const ct = await this.create(config);
        await DockerError.adapt(ct.start());
        return ct;
    }

    async pull(nameAndTag: string, platform?: string) {
        const imageConfig = {
            fromImage: nameAndTag,
        } as { fromImage: string; platform?: string };

        if (platform !== undefined) {
            imageConfig.platform = platform;
        }

        const progress = await DockerError.adapt(this.#intf.createImage(imageConfig));
        await new Promise<void>((resolve, reject) => {
            this.#intf.modem.followProgress(progress, error => {
                if (error) {
                    reject(DockerError.translate(error));
                }
                resolve();
            });
        });
    }

    async buildImage(name: string, path: string) {
        const files = await readdir(path);

        const stream = await DockerError.adapt(
            this.#intf.buildImage(
                {
                    context: path,
                    src: files,
                },
                {
                    t: name,
                },
            ),
        );

        await new Promise<void>((resolve, reject) => {
            this.#intf.modem.followProgress(stream, (error, result) => {
                if (error) {
                    reject(DockerError.translate(error));
                }

                const finalMessage = result[result.length - 1];
                const errorMessage = finalMessage?.error ?? finalMessage?.errorDetail?.message;
                if (errorMessage) {
                    reject(new Error(errorMessage));
                }

                resolve();
            });
        });
    }
}

export namespace Docker {
    export interface NetworkConfig {
        name: string;
        hostInterfaceName?: string;
        containerInterfacePrefix?: string;
        subnets?: string[];
    }
}
