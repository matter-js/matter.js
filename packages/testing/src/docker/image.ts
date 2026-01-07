/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import Dockerode from "dockerode";
import { Docker } from "./docker.js";
import { DockerError } from "./errors.js";

export interface Image {
    inspect(): Promise<Dockerode.ImageInspectInfo>;
}

/**
 * Create an image by name.
 */
export function Image(docker: Docker, name: string): Image;

/**
 * Wrap a {@link Dockerode.Image}.
 */
export function Image(docker: Docker, image: Dockerode.Image): Image;

export function Image(docker: Docker, definition: string | Dockerode.Image): Image {
    let image;

    if (typeof definition === "string") {
        image = docker.intf.getImage(definition);
    } else {
        image = definition;
    }

    return {
        inspect() {
            return DockerError.adapt(image.inspect());
        },
    };
}
