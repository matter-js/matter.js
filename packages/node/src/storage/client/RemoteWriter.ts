/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { InternalError, MaybePromise } from "@matter/general";
import { Write, WriteResult, type Val } from "@matter/protocol";
import { Status, type ClusterId, type ClusterType, type EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";

/**
 * Persistence handler for {@link ClientNodeStore}.
 *
 * A remote writer conveys updates to the remote node.  This performs actual persistence for client nodes where the
 * local store is just a cache and the source of truth is on the remote device.
 *
 * The optional {@link RemoteWriter.FailureHandler} is invoked with the per-attribute failure statuses before the
 * write rejects, giving callers a chance to compensate local cache state for declined writes.
 */
export interface RemoteWriter {
    (request: RemoteWriter.Request, onFailure?: RemoteWriter.FailureHandler): Promise<void>;
}

const attrCache = new WeakMap<object, Record<string, ClusterType.Attribute>>();

export function RemoteWriter(node: ClientNode, structure: ClientStructure): RemoteWriter {
    return async function writeRemote(request: RemoteWriter.Request, onFailure?: RemoteWriter.FailureHandler) {
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
                        cluster: cluster as any,
                        attributes: [attrs[id] as any],
                        value: values[id],
                    }),
                );
            }
        }

        const write = Write(...attrWrites);
        const result = (await node.interaction.write(write)) as WriteResult.AttributeStatus[];

        if (onFailure) {
            const failures = result.filter(s => s.status !== Status.Success);
            if (failures.length) {
                await onFailure(failures);
            }
        }

        WriteResult.assertSuccess(result);
    };
}

export namespace RemoteWriter {
    export interface EndpointUpdateRequest {
        number: EndpointNumber;
        behaviorId: string;
        values: Val.Struct;
    }

    export interface Request extends Array<EndpointUpdateRequest> {}

    export type FailureHandler = (failures: WriteResult.AttributeStatus[]) => MaybePromise<void>;
}

function attrsFor(cluster: ClusterType) {
    let attrs = attrCache.get(cluster);
    if (attrs) {
        return attrs;
    }
    const nsAttrs = cluster.attributes as Record<string, ClusterType.Attribute> | undefined;
    attrs = {};
    if (nsAttrs) {
        for (const attr of Object.values(nsAttrs)) {
            attrs[attr.id] = attr;
        }
    }
    attrCache.set(cluster, attrs);
    return attrs;
}
