/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpandedPath } from "#common/ExpandedPath.js";
import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { PathError } from "#common/PathError.js";
import { MatterAggregateError } from "#general";
import { Status, type AttributeId, type AttributePath, type ClusterId, type EndpointNumber, type NodeId } from "#types";

export type WriteResult = AsyncIterable<WriteResult.Chunk>;

export namespace WriteResult {
    export type Chunk = Iterable<AttributeStatus>;

    export interface ConcreteAttributePath extends AttributePath {
        nodeId?: NodeId;
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attributeId: AttributeId;
        listIndex?: number | null;
    }

    export interface AttributeStatus {
        kind: "attr-status";
        path: ConcreteAttributePath;
        status: Status;
        clusterStatus?: number;
    }

    export async function assertSuccess(result: WriteResult) {
        const errors = new Array<PathError>();

        for await (const chunk of result) {
            for (const attr of chunk) {
                if (attr.status !== Status.Success) {
                    const path = ExpandedPath({ ...attr, kind: "attribute" });
                    const status = new ExpandedStatus(attr);
                    errors.push(new PathError({ path, status }));
                }
            }
        }

        if (!errors.length) {
            return;
        }

        if (errors.length === 1) {
            throw errors[0];
        }

        throw new MatterAggregateError(errors, "Multiple writes failed");
    }
}
