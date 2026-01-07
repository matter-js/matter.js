/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import { Graph } from "@matter/tools";
import { generateForwards } from "./generate-forwards.js";

/**
 * Generate proxies to re-export key submodules of dependencies.
 */
export async function generateProjectChipMatterjsForwards() {
    const graph = await Graph.load();

    const pkg = graph.get("@project-chip/matter.js").pkg;

    const node = graph.get("@matter/node");

    // Behaviors
    const behaviors = await node.pkg.glob("src/behaviors/*");
    generateForwards("@matter/node/behaviors", behaviors, pkg.resolve(`src/forwards/behaviors`));

    // Tags
    const tags = await node.pkg.glob("src/tags/*");
    generateForwards("@matter/node/tags", tags, pkg.resolve(`src/forwards/tags`), (file, submodule) => {
        file.addReexport(`@matter/node`, submodule);
        return false;
    });

    // Device endpoint types
    const devices = await createEndpointMap(node, "src/devices/*", "Device");
    generateForwards("@matter/node/devices", devices, pkg.resolve(`src/forwards/devices`));

    // System endpoint types
    const endpoints = await createEndpointMap(node, "src/endpoints/*", "Endpoint");
    generateForwards("@matter/node/endpoints", endpoints, pkg.resolve(`src/forwards/endpoints`));
}

// Old naming convention was "OnOffDevice" rather than "on-off"; generate this mapping
async function createEndpointMap(node: Graph.Node, path: string, suffix: string) {
    const files = await node.pkg.glob(path);
    return Object.fromEntries(
        files.map(name => {
            name = name.replace(/\.ts$/, "").replace(/^.*\//, "");
            return [camelize(name, true) + suffix, name];
        }),
    );
}
