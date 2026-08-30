/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Diagnostic, InternalError, Logger, MaybePromise } from "@matter/general";
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
 * The optional {@link RemoteWriter.FailureHandler} is invoked with the per-attribute failure statuses before the
 * write rejects, giving callers a chance to compensate local cache state for declined writes.
 */
export interface RemoteWriter {
    (request: RemoteWriter.Request, onFailure?: RemoteWriter.FailureHandler): Promise<void>;
}

const logger = Logger.get("RemoteWriter");

const attrCache = new WeakMap<object, Record<string, ClusterType.Attribute>>();

// Canonical decimal, the only spelling under which the datasource produces attribute ID keys
const ID_KEY = /^(0|[1-9]\d*)$/;

export function RemoteWriter(node: ClientNode, structure: ClientStructure): RemoteWriter {
    return async function writeRemote(request: RemoteWriter.Request, onFailure?: RemoteWriter.FailureHandler) {
        const attrWrites = Array<Write.Attribute>();
        const attempted = Array<WriteResult.ConcreteAttributePath>();
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

                attempted.push({ endpointId: number, clusterId, attributeId: attr.id });
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
        let result: WriteResult.AttributeStatus[];
        try {
            result = attrWrites.length
                ? ((await node.interaction.write(Write(...attrWrites))) as WriteResult.AttributeStatus[])
                : [];
        } catch (e) {
            // Without an answer we cannot know what the peer applied.  The caller sees this write as failed, so the
            // mirror must not keep the values either; a later report corrects us if the device did apply them.
            if (onFailure) {
                await onFailure([
                    ...attempted.map(path => ({ kind: "attr-status", path, status: Status.Failure }) as const),
                    ...declined,
                ]);
            }
            throw e;
        }
        result.push(...declined);

        if (onFailure) {
            const failures = result.filter(s => s.status !== Status.Success);
            if (failures.length) {
                await onFailure(failures);
                warnPartialAcceptance(node, attempted, failures);
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

    /**
     * Invoked with the per-attribute failures before a write rejects.  {@link unanswered} distinguishes a peer that
     * declined — an authoritative answer — from one that never responded, where a report may already have told us
     * the write landed.
     */
    export type FailureHandler = (failures: WriteResult.AttributeStatus[], unanswered?: boolean) => MaybePromise<void>;
}

/**
 * Report attributes the peer accepted in a write that nonetheless fails as a whole.
 *
 * A failed transaction skips its post-commit phase, so no change events fire for these values even though they are
 * live on both sides.  Without this the acceptance is invisible until the peer next reports the attribute.
 */
function warnPartialAcceptance(
    node: ClientNode,
    attempted: WriteResult.ConcreteAttributePath[],
    failures: WriteResult.AttributeStatus[],
) {
    const failed = new Set(failures.map(f => pathKey(f.path)));
    const accepted = attempted.filter(path => !failed.has(pathKey(path)));
    if (!accepted.length) {
        return;
    }

    logger.notice(
        `Peer ${node.id} applied ${accepted.length} of ${attempted.length} attribute writes, but the write failed as a whole so no change events fire for them:`,
        Diagnostic.list(accepted.map(pathKey)),
    );
}

function pathKey(path: WriteResult.ConcreteAttributePath) {
    return `${path.endpointId}.${path.clusterId}.${path.attributeId}`;
}

/**
 * Status for an attribute the peer's cluster type cannot express as a write.
 *
 * Global attributes are read-only, so `UnsupportedWrite` is what a device would answer.  Any other unmapped ID is one
 * we cannot encode — either the peer does not have it or we could not derive a type for it — and `UnsupportedAttribute`
 * is the closest status for both.  Declining rather than throwing keeps the write result per-attribute, so cache
 * compensation still runs for the values the caller attempted.
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
