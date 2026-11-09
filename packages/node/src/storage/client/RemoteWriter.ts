/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isFabricScopedList } from "#behavior/state/managed/values/ListManager.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { InternalError, isObject, Logger } from "@matter/general";
import { AttributeModel } from "@matter/model";
import { Write, WriteError, WriteResult, type Val } from "@matter/protocol";
import { AttributeId, FabricIndex, Status, type ClusterId, type ClusterType, type EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import { fabricScopedWriteOf } from "./fabric-scoped-writes.js";

const logger = Logger.get("RemoteWriter");

/**
 * Persistence handler for {@link ClientNodeStore}.
 *
 * A remote writer conveys updates to the remote node.  This performs actual persistence for client nodes where the
 * local store is just a cache and the source of truth is on the remote device.
 *
 * Resolves once the peer answered, with a status per attribute in {@link RemoteWriter.Result.statuses}, including those
 * declined locally because the peer's cluster type cannot express them; when every attribute is declined locally,
 * nothing is sent.  Rejects when the peer does not answer, as then nothing is known to have been applied.
 *
 * The device replaces only the entries of our fabric in a fabric-scoped list, stores every written entry under our
 * fabric and ignores the entries of other fabrics.  So for a client peer node the writer sends only our entries of
 * such a list:
 *
 * | Entry of a written fabric-scoped list                                    | Write                 |
 * | ------------------------------------------------------------------------ | --------------------- |
 * | FabricIndex ours or `FabricIndex.OMIT_FABRIC`                            | sent                  |
 * | no FabricIndex                                                           | sent, as ours         |
 * | other FabricIndex (`NO_FABRIC` included), equal to an entry of the cache | left out              |
 * | other FabricIndex (`NO_FABRIC` included), not in the cache               | whole request refused |
 * | not a struct                                                             | whole request refused |
 * | any, while our fabric index on the peer is unknown                       | whole request refused |
 *
 * A refused request rejects with a {@link WriteError} (CONSTRAINT_ERROR) before anything is sent, so the transaction
 * that wrote the list fails.  {@link RemoteWriter.Result.ownEntries} holds the entries sent.  A group node sends its
 * lists as written; its interaction decides.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.13.6
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.2
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.9.1
 */
export interface RemoteWriter {
    (request: RemoteWriter.Request): Promise<RemoteWriter.Result>;
}

const attrCache = new WeakMap<object, Record<string, ClusterType.Attribute>>();

// Canonical decimal, the only spelling under which the datasource produces attribute ID keys
const ID_KEY = /^(0|[1-9]\d*)$/;

export function RemoteWriter(node: ClientNode, structure: ClientStructure): RemoteWriter {
    return async function writeRemote(request: RemoteWriter.Request) {
        const attrWrites = Array<Write.Attribute>();
        const declined = Array<WriteResult.AttributeStatus>();
        const ownEntries = new Map<RemoteWriter.EndpointUpdateRequest, RemoteWriter.OwnEntries>();
        const peerContext = node.clientPeerContext;

        for (const update of request) {
            const { number, behaviorId, values, cached } = update;
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

                let value = values[id];
                if (peerContext !== undefined && isFabricScopedList(attr.schema)) {
                    const { fabricIndexOnPeer: fabricIndex } = peerContext;
                    if (fabricIndex === undefined) {
                        throw new WriteError(
                            { path: `${node}.${number}.${cluster.name}.${attr.name}` },
                            "Cannot write a fabric-scoped list: our fabric index on the peer " +
                                "(commissioning.fabricIndexOnPeer or operationalCredentials.currentFabricIndex) " +
                                "is not known yet; read operationalCredentials.currentFabricIndex first",
                            Status.ConstraintError,
                        );
                    }
                    if (Array.isArray(value)) {
                        const { own, unchanged, misused } = fabricScopedWriteOf(value, cached?.[id], fabricIndex);
                        if (misused !== undefined) {
                            throw new WriteError(
                                { path: `${node}.${number}.${cluster.name}.${attr.name}` },
                                misuseMessage(misused, cached?.[id], fabricIndex),
                                Status.ConstraintError,
                            );
                        }
                        if (unchanged) {
                            logger.debug(
                                `Leaving ${unchanged} entries not of our fabric out of the write of ` +
                                    `${node}.${number}.${cluster.name}.${attr.name}; the device keeps them`,
                            );
                        }
                        value = own;
                        let lists = ownEntries.get(update);
                        if (lists === undefined) {
                            lists = { fabricIndex, lists: {} };
                            ownEntries.set(update, lists);
                        }
                        lists.lists[id] = own;
                    }
                }

                attrWrites.push(
                    Write.Attribute({
                        endpoint: number,
                        cluster: cluster as any,
                        attributes: [attr as any],
                        value,
                    }),
                );
            }
        }

        // Remote statuses first so a device error, not one of ours, is the error a single-failure write surfaces
        const result = attrWrites.length
            ? ((await node.interaction.write(Write(...attrWrites))) as WriteResult.AttributeStatus[])
            : [];
        result.push(...declined);

        return { statuses: result, ownEntries };
    };
}

export namespace RemoteWriter {
    export interface EndpointUpdateRequest {
        number: EndpointNumber;
        behaviorId: string;
        values: Val.Struct;

        /**
         * The cached values of the cluster when the request is sent, against which the entries of other fabrics in a
         * fabric-scoped list are checked.
         */
        cached: Val.Struct | undefined;
    }

    export interface Request extends Array<EndpointUpdateRequest> {}

    export interface Result {
        /**
         * A status per attribute of the request.
         */
        statuses: WriteResult.AttributeStatus[];

        /**
         * Our entries the request sent, for each request entry that held a fabric-scoped list value.
         */
        ownEntries: Map<EndpointUpdateRequest, OwnEntries>;
    }

    /**
     * Our entries of the fabric-scoped lists one request entry sent.  When the device accepts the write, it replaces
     * its entries of {@link fabricIndex} with them and keeps the entries of other fabrics.
     */
    export interface OwnEntries {
        /**
         * Our fabric index on the peer when the request was sent.
         */
        fabricIndex: FabricIndex;

        /**
         * The entries sent, by attribute ID.
         */
        lists: Record<string, Val.List>;
    }
}

const MAY_HAVE_CHANGED = "may have changed since the list was read, so read it again and retry";

/**
 * The reason a write of a fabric-scoped list with {@link misused} is refused, for its {@link WriteError}.
 */
function misuseMessage(misused: Val, cached: Val, fabricIndexOnPeer: FabricIndex) {
    if (!isObject(misused)) {
        return `Cannot write an entry that is not a struct (our fabric index on the peer is ${fabricIndexOnPeer})`;
    }
    const written = misused.fabricIndex;
    const what =
        written === FabricIndex.NO_FABRIC
            ? "an entry of no fabric (FabricIndex.NO_FABRIC)"
            : `an entry with fabricIndex ${String(written)}`;
    const message =
        `Cannot write ${what}: our fabric index on the peer is ${fabricIndexOnPeer}, ` +
        "so write that index or FabricIndex.OMIT_FABRIC";
    const cachesWritten =
        Array.isArray(cached) && cached.some(entry => isObject(entry) && entry.fabricIndex === written);
    if (!cachesWritten) {
        return message;
    }
    return `${message}; the cached entries of that fabric ${MAY_HAVE_CHANGED}`;
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
