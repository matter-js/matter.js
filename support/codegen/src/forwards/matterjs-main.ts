/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TsFile } from "#util/TsFile.js";
import { Graph } from "@matter/tools";
import { generateForwards } from "./generate-forwards.js";

/**
 * Generate proxies to re-export key submodules of dependencies.
 */
export async function generateMatterjsMainForwards() {
    const graph = await Graph.load();

    const pkg = graph.get("@matter/main").pkg;

    const types = graph.get("@matter/types");
    const node = graph.get("@matter/node");

    // Cluster definitions
    const clusters = await types.pkg.glob("src/clusters/*.ts");
    generateForwards("@matter/types/clusters", clusters, pkg.resolve(`src/forwards/clusters`), generator);

    // Behaviors
    const behaviors = await node.pkg.glob("src/behaviors/*");
    generateForwards("@matter/node/behaviors", behaviors, pkg.resolve(`src/forwards/behaviors`), generator);

    // Device endpoint types
    const devices = await node.pkg.glob("src/devices/*");
    generateForwards("@matter/node/devices", devices, pkg.resolve(`src/forwards/devices`), generator);

    // System endpoint types
    const endpoints = await node.pkg.glob("src/endpoints/*");
    generateForwards("@matter/node/endpoints", endpoints, pkg.resolve(`src/forwards/endpoints`), generator);

    // Ensure each proxy bootstraps the platform
    function generator(file: TsFile) {
        file.addImport("@matter/main/platform");
    }
}
