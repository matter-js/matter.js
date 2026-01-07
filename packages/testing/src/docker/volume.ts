/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Docker } from "./docker.js";
import { DockerError } from "./errors.js";

export interface Volume {
    name: string;
    open(): Promise<void>;
    erase(): Promise<void>;
}

export function Volume(docker: Docker, name: string) {
    async function open() {
        try {
            await DockerError.adapt(docker.intf.createVolume({ Name: name }));
        } catch (e) {
            DockerError.accept(e, 500);
        }
    }

    async function erase() {
        const volume = docker.intf.getVolume(name);
        try {
            await DockerError.adapt(volume.remove());
        } catch (e) {
            DockerError.accept(e, 404);
        }
    }

    return {
        name,
        open,
        erase,
    };
}
