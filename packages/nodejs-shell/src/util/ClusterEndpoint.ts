/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode, ClusterBehavior, Endpoint } from "@matter/node";
import { Read, ReadResult } from "@matter/protocol";
import { AttributePath, ClusterId, EventPath, Status } from "@matter/types";
import { MatterNode } from "../MatterNode.js";
import { awaitSeeded } from "./awaitSeeded.js";

export interface ResolvedClusterEndpoint {
    node: ClientNode;
    endpoint: Endpoint;
    behaviorType: ClusterBehavior.Type;
}

/**
 * Connect to `nodeIdStr`, wait for the peer's endpoint structure to seed, and resolve the behavior implementing
 * `clusterId` on `endpointId`. Mirrors the legacy `getDeviceById(endpointId)?.getClusterClientById(clusterId)` lookup
 * (same "not found" message on any failure) so the three cluster-access command files can share one gate.
 */
export async function resolveClusterEndpoint(
    theNode: MatterNode,
    nodeIdStr: string,
    endpointId: number,
    clusterId: number,
): Promise<ResolvedClusterEndpoint | undefined> {
    const node = (await theNode.connectAndGetNodes(nodeIdStr))[0];
    if (!(await awaitSeeded(node))) {
        return undefined;
    }

    const behaviorType = node.endpoints.has(endpointId)
        ? node.endpoints.for(endpointId).behaviors.forCluster(ClusterId(clusterId))
        : undefined;
    if (behaviorType === undefined) {
        console.log(`ERROR: Cluster ${node.peerAddress?.nodeId}/${endpointId}/${clusterId} not found.`);
        return undefined;
    }
    return { node, endpoint: node.endpoints.for(endpointId), behaviorType };
}

/**
 * True only when `name` is a *known-absent* attribute/command of `behaviorType` on `endpoint`.
 *
 * The supported set derives from the behavior's global attribute/command list, which is EMPTY until that list has
 * been read (a narrow window right after connect). An empty set is treated as "not yet known" — the caller proceeds
 * to the live read/invoke rather than false-rejecting a genuinely supported element. Only a populated set that omits
 * `name` is a real "unsupported" answer.
 */
export function elementKnownUnsupported(
    endpoint: Endpoint,
    behaviorType: ClusterBehavior.Type,
    kind: "attributes" | "commands",
    name: string,
): boolean {
    const elements = endpoint.behaviors.elementsOf(behaviorType)[kind];
    return elements.size > 0 && !elements.has(name);
}

/**
 * Live (un-cached) attribute read via the interaction protocol. Used for `--remote` reads and for the numeric
 * by-id command, which (like its legacy predecessor) must work for clusters the node has no behavior for.
 */
export async function readAttributesRemote(
    node: ClientNode,
    attributes: AttributePath[],
    isFabricFiltered: boolean,
): Promise<ReadResult.AttributeValue[]> {
    const values = new Array<ReadResult.AttributeValue>();
    for await (const chunk of node.interaction.read(Read({ attributes, fabricFilter: isFabricFiltered }))) {
        for await (const report of chunk) {
            if (report.kind === "attr-value") {
                values.push(report);
            } else if (report.kind === "attr-status") {
                // A device-declined read (e.g. UnsupportedAttribute/UnsupportedAccess) otherwise reads as empty.
                const { path, status } = report;
                console.log(
                    `ERROR: ${path.endpointId}/${path.clusterId}/${path.attributeId}: ${Status[status] ?? status}`,
                );
            }
        }
    }
    return values;
}

/** Live event read via the interaction protocol (there is no local event cache to read from instead). */
export async function readEventsRemote(
    node: ClientNode,
    events: EventPath[],
    isFabricFiltered: boolean,
): Promise<ReadResult.EventValue[]> {
    const values = new Array<ReadResult.EventValue>();
    for await (const chunk of node.interaction.read(Read({ events, fabricFilter: isFabricFiltered }))) {
        for await (const report of chunk) {
            if (report.kind === "event-value") {
                values.push(report);
            } else if (report.kind === "event-status") {
                const { path, status } = report;
                console.log(`ERROR: ${path.endpointId}/${path.clusterId}/${path.eventId}: ${Status[status] ?? status}`);
            }
        }
    }
    return values;
}
