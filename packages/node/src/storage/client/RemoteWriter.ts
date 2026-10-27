/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { InternalError } from "@matter/general";
import { AttributeModel } from "@matter/model";
import { Write, WriteResult, type Val } from "@matter/protocol";
import { AttributeId, Status, type ClusterId, type ClusterType, type EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";

/**
 * Persistence handler for {@link ClientNodeStore}.
 *
 * A remote writer conveys updates to the remote node.  This performs actual persistence for client nodes where the
 * local store is just a cache and the source of truth is on the remote device.
 *
 * Resolves with a status per attribute once the peer answered, including those declined locally because the peer's
 * cluster type cannot express them; when every attribute is declined locally, nothing is sent.  Rejects when the peer
 * does not answer, as then nothing is known to have been applied.
 */
export interface RemoteWriter {
    (request: RemoteWriter.Request): Promise<WriteResult.AttributeStatus[]>;
}

const attrCache = new WeakMap<object, Record<string, ClusterType.Attribute>>();

// Canonical decimal, the only spelling under which the datasource produces attribute ID keys
const ID_KEY = /^(0|[1-9]\d*)$/;

export function RemoteWriter(node: ClientNode, structure: ClientStructure): RemoteWriter {
    return async function writeRemote(request: RemoteWriter.Request) {
        const attrWrites = Array<Write.Attribute>();
        const declined = Array<WriteResult.AttributeStatus>();

        for (const { number, behaviorId, values } of request) {
            const clusterId = Number.parseInt(behaviorId) as ClusterId;
            const cluster = structure.clusterFor(number, clusterId);
            if (cluster === undefined) {
                throw new InternalError(`Cannot remote write to non-cluster behavior ${behaviorId}`);
            }
            const attrs = attrsFor(cluster);

            for (const id in values) {
                if (id.startsWith("__")) {
                    continue;
                }

                const attr = attrs[id];
                if (attr === undefined) {
                    declined.push(declineFor(number, clusterId, behaviorId, id));
                    continue;
                }

                attrWrites.push(
                    Write.Attribute({
                        endpoint: number,
                        cluster: cluster as any,
                        attributes: [attr as any],
                        value: values[id],
                    }),
                );
            }
        }

        // Remote statuses first so a device error, not one of ours, is the error a single-failure write surfaces
        const result = attrWrites.length
            ? ((await node.interaction.write(Write(...attrWrites))) as WriteResult.AttributeStatus[])
            : [];
        result.push(...declined);

        return result;
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

/**
 * Status for an attribute the peer's cluster type cannot express as a write.
 *
 * Global attributes are read-only, so `UnsupportedWrite` is what a device would answer.  Any other unmapped ID is one
 * we cannot encode — either the peer does not have it or we could not derive a type for it — and `UnsupportedAttribute`
 * is the closest status for both.  Declining rather than throwing keeps the write result per-attribute, so the
 * attributes the peer accepted in the same write still reach the local cache.
 */
function declineFor(endpointId: EndpointNumber, clusterId: ClusterId, behaviorId: string, key: string) {
    if (!ID_KEY.test(key)) {
        throw new InternalError(`Cannot remote write attribute keyed by name (${key}) for ${behaviorId}`);
    }
    const attributeId = Number(key);

    return {
        kind: "attr-status",
        path: { endpointId, clusterId, attributeId: AttributeId(attributeId, false) },
        status: AttributeModel.globalIds.has(attributeId) ? Status.UnsupportedWrite : Status.UnsupportedAttribute,
    } satisfies WriteResult.AttributeStatus;
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
