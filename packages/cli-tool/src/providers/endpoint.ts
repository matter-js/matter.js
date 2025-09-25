/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Peers, ServerNode } from "#node";
import { Endpoint } from "#node";
import { Directory, Stat } from "#stat.js";

const STATIC = new Set(["act", "start", "factoryReset", "run", "set", "visit", "nodes", "parts", "behaviors"]);

const BEHAVIOR_PREFIX = "behavior_";
const PART_PREFIX = "part_";
const NODE_PREFIX = "node_";

Stat.provide(endpoint => {
    if (!isEndpoint(endpoint)) {
        return;
    }

    return Directory({
        definitionAt(path) {
            if (STATIC.has(path)) {
                return (endpoint as unknown as Record<string, unknown>)[path];
            }

            const nodes = (endpoint as ServerNode).peers as Peers | undefined;

            if (path.startsWith(BEHAVIOR_PREFIX)) {
                const id = path.slice(BEHAVIOR_PREFIX.length);

                // TODO - use act() to obtain an agent when evaluating in node context
                const behavior = endpoint.behaviors.supported[id];
                if (behavior) {
                    return behavior;
                }
            } else if (path.startsWith(PART_PREFIX)) {
                const id = path.slice(PART_PREFIX.length);
                const part = endpoint.parts.get(id);
                if (part) {
                    return part;
                }
            } else if (nodes && path.startsWith(NODE_PREFIX)) {
                const id = path.slice(NODE_PREFIX.length);
                const node = nodes.get(id);
                if (node) {
                    return node;
                }
            }

            // TODO - see comment above
            const behavior = endpoint.behaviors.supported[path];
            if (behavior) {
                return behavior;
            }

            const part = endpoint.parts.get(path);
            if (part) {
                return part;
            }

            const node = nodes?.get(path);
            if (node) {
                return node;
            }
        },

        paths() {
            if (!endpoint.lifecycle.isPartsReady) {
                return endpoint.construction.then(listPaths);
            }

            return listPaths(endpoint);
        },
    });
});

function isEndpoint(item: unknown): item is Endpoint {
    return item instanceof Endpoint;
}

function listPaths(endpoint: Endpoint) {
    const paths = new Set<string>();

    for (const command of STATIC) {
        if ((endpoint as any)[command] !== undefined) {
            paths.add(command);
        }
    }

    for (const basename in endpoint.behaviors.supported) {
        if (paths.has(basename)) {
            continue;
        }
        paths.add(basename);
    }

    for (const part of endpoint.parts) {
        let basename = part.id;
        if (paths.has(basename)) {
            basename = `${PART_PREFIX}${basename}`;
        }
        paths.add(basename);
    }

    const nodes = (endpoint as ServerNode).peers;
    if (nodes !== undefined) {
        for (const node of nodes) {
            let basename = node.id;
            if (paths.has(basename)) {
                basename = `${NODE_PREFIX}${basename}`;
            }
            paths.add(basename);
        }
    }

    return [...paths];
}
