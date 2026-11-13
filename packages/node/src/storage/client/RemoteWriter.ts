/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvalidGroupOperationError } from "#endpoint/errors.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { InternalError } from "@matter/general";
import { AttributeModel, type DataModelPath } from "@matter/model";
import { Write, WriteResult, type Val } from "@matter/protocol";
import {
    AttributeId,
    Status,
    type ClusterId,
    type ClusterType,
    type EndpointNumber,
    type FabricIndex,
} from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import { FabricScopedListWrite } from "./FabricScopedListWrite.js";

/**
 * Persistence handler for {@link ClientNodeStore}.
 *
 * A remote writer conveys updates to the remote node.  This performs actual persistence for client nodes where the
 * local store is just a cache and the source of truth is on the remote device.
 *
 * The datasource has a write prepared per cluster in the transaction's settled step, before any participant commits,
 * so a refusal rejects the transaction before any Write Request goes out.  The prepared writes of the node's clusters
 * are then sent in one Write Request.
 */
export interface RemoteWriter {
    /**
     * Decide whether {@link proposal} may go to the remote node, and prepare it for {@link send}.  Synchronous, and
     * writes nothing.
     *
     * A peer receives only our entries of a fabric-scoped list; see {@link FabricScopedListWrite}.  Every write of a
     * fabric-scoped list to a peer needs our fabric index on the peer, also one of a value that is not a list.
     *
     * @throws WriteError with CONSTRAINT_ERROR to refuse a fabric-scoped list
     */
    prepare(proposal: RemoteWriter.Proposal): RemoteWriter.PreparedWrite;

    /**
     * Refuse every state change on a node that takes no writes through its endpoints.
     *
     * @param path the path of the values the change is for
     * @throws InvalidGroupOperationError for a group node
     */
    assertWritable(path: DataModelPath): void;

    /**
     * Send {@link writes} in one Write Request.
     *
     * Resolves with a status per attribute once the peer answered, including those declined locally because the peer's
     * cluster type cannot express them; when every attribute is declined locally, nothing is sent.  Rejects when the
     * peer does not answer, as then nothing is known to have been applied.
     */
    send(writes: RemoteWriter.PreparedWrite[]): Promise<WriteResult.AttributeStatus[]>;
}

const attrCache = new WeakMap<object, Record<string, ClusterType.Attribute>>();

// Canonical decimal, the only spelling under which the datasource produces attribute ID keys
const ID_KEY = /^(0|[1-9]\d*)$/;

export function RemoteWriter(node: ClientNode, structure: ClientStructure): RemoteWriter {
    function clusterFor(number: EndpointNumber, behaviorId: string) {
        const clusterId = Number.parseInt(behaviorId) as ClusterId;
        const cluster = structure.clusterFor(number, clusterId);
        if (cluster === undefined) {
            throw new InternalError(`Cannot remote write to non-cluster behavior ${behaviorId}`);
        }
        return { clusterId, cluster };
    }

    return {
        assertWritable(path) {
            if (node.nodeType === "group") {
                throw new InvalidGroupOperationError(
                    `Cannot write ${path}: writing state on a group endpoint is not supported; ` +
                        "use group.interaction.write() with a group path",
                );
            }
        },

        prepare({ number, behaviorId, values, cached, path }) {
            const { clusterId, cluster } = clusterFor(number, behaviorId);
            const attrs = attrsFor(cluster);
            const attributes = new Array<Write.Attribute>();
            const declined = new Array<WriteResult.AttributeStatus>();
            const sent: Val.Struct = {};
            let cacheMerges: Map<string, (cached: Val) => Val> | undefined;
            let fabricIndex: FabricIndex | undefined;

            for (const id in values) {
                if (id.startsWith("__")) {
                    continue;
                }

                const attr = attrs[id];
                if (attr === undefined) {
                    declined.push(declineFor(number, clusterId, behaviorId, id));
                    continue;
                }

                let value = values[id];

                if (attr.schema.fabricScopedList) {
                    // Every write of a fabric-scoped list needs our index, also one of a value that is not a list
                    const attributePath = path.at(attr.schema.propertyName);
                    fabricIndex ??= FabricScopedListWrite.requireFabricIndex(node.fabricIndexOnPeer, attributePath);
                    if (Array.isArray(value)) {
                        const entries = FabricScopedListWrite.entriesToSend(
                            value,
                            cached?.[id],
                            fabricIndex,
                            attributePath,
                            entrySchemaOf(attr.schema, attributePath),
                        );
                        const index = fabricIndex;
                        (cacheMerges ??= new Map<string, (cached: Val) => Val>()).set(id, cachedList =>
                            FabricScopedListWrite.cachedAfterWrite(cachedList, entries, index),
                        );
                        value = entries;
                    }
                }

                sent[id] = value;
                attributes.push(
                    Write.Attribute({
                        endpoint: number,
                        cluster: cluster as any,
                        attributes: [attr as any],
                        value,
                    }),
                );
            }

            return { number, behaviorId, values: sent, attributes, declined, cacheMerges };
        },

        async send(writes) {
            const attributes = writes.flatMap(write => write.attributes);

            // Remote statuses first so a device error, not one of ours, is the error a single-failure write surfaces
            const result = attributes.length
                ? ((await node.interaction.write(Write(...attributes))) as WriteResult.AttributeStatus[])
                : [];
            result.push(...writes.flatMap(write => write.declined));

            return result;
        },
    };
}

function entrySchemaOf(schema: AttributeModel, path: DataModelPath) {
    const entrySchema = schema.listEntry;
    if (entrySchema === undefined) {
        throw new InternalError(`Fabric-scoped list ${path} has no entry schema`);
    }
    return entrySchema;
}

export namespace RemoteWriter {
    /**
     * The values a transaction proposes for one cluster of the remote node.
     */
    export interface Proposal {
        number: EndpointNumber;
        behaviorId: string;
        values: Val.Struct;

        /**
         * The cached values of the cluster, against which an entry of another fabric in a fabric-scoped list is
         * checked.
         */
        cached: Val.Struct | undefined;

        /**
         * The path of the values, for a refusal.
         */
        path: DataModelPath;
    }

    /**
     * The values to send for one cluster, as {@link RemoteWriter.prepare} decided.
     */
    export interface PreparedWrite {
        number: EndpointNumber;
        behaviorId: string;

        /**
         * The values sent, by attribute ID.  A fabric-scoped list holds only our entries.
         */
        values: Val.Struct;

        /**
         * The attribute writes of {@link values} for the Write Request.
         */
        attributes: Write.Attribute[];

        /**
         * The statuses of the attributes declined locally because the peer's cluster type cannot express them.
         */
        declined: WriteResult.AttributeStatus[];

        /**
         * For an attribute whose cached value does not simply become the value sent, the value to cache once the peer
         * accepted the write, from the value cached then.  For a fabric-scoped list the device replaced only our
         * entries, so the cached entries of other fabrics stay.
         */
        cacheMerges?: ReadonlyMap<string, (cached: Val) => Val>;
    }
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
