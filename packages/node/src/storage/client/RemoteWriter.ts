/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Write, WriteResult, type Val } from "#protocol";
import type { ClusterId, ClusterType, EndpointNumber } from "#types";
import type { ClientNodeStore } from "./ClientNodeStore.js";

/**
 * Persistence handler for {@link ClientNodeStore}.
 *
 * A remote writer conveys updates to the remote node.  This performs actual persistence for client nodes where the
 * local store is just a cache and the source of truth is on the remote device.
 */
export interface RemoteWriter {
    (request: RemoteWriter.Request): Promise<void>;
}

const attrCache = new WeakMap<ClusterType, Record<string, ClusterType.Attribute>>();

export function RemoteWriter(node: ClientNode, structure: ClientStructure): RemoteWriter {
    return async function writeRemote(request: RemoteWriter.Request) {
        const attrWrites = Array<Write.Attribute>();
        for (const { number, behaviorId, values } of request) {
            const cluster = structure.clusterFor(number, Number.parseInt(behaviorId) as ClusterId);
            if (cluster === undefined) {
                throw new InternalError(`Cannot remote write to non-cluster behavior ${behaviorId}`);
            }
            const attrs = attrsFor(cluster);

            for (const id in values) {
                const attr = attrs[id];
                if (attr === undefined) {
                    if (id.startsWith("__")) {
                        continue;
                    }

                    throw new InternalError(`Cannot write unknown attribute ${id} for ${behaviorId}`);
                }

                attrWrites.push(
                    Write.Attribute({
                        endpoint: number,
                        cluster,
                        attributes: [attrs[id]],
                        value: values[id],
                    }),
                );
            }
        }

        const write = Write(...attrWrites);
        await WriteResult.assertSuccess(node.interaction.write(write));
    };
}

export namespace RemoteWriter {
    export interface EndpointUpdateRequest {
        number: EndpointNumber;
        behaviorId: string;
        values: Val.Struct;
    }

    export interface Request extends Array<EndpointUpdateRequest> {}
}

function attrsFor(cluster: ClusterType) {
    let attrs = attrCache.get(cluster);
    if (attrs) {
        return attrs;
    }
    attrs = Object.fromEntries(Object.values(cluster.attributes).map(attr => [attr.id, attr]));
    attrCache.set(cluster, attrs);
    return attrs;
}
