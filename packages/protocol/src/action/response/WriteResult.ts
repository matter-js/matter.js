/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Write } from "#action/request/Write.js";
import { ExpandedPath } from "#common/ExpandedPath.js";
import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { PathError } from "#common/PathError.js";
import { MatterAggregateError } from "#general";
import { Status, type AttributeId, type AttributePath, type ClusterId, type EndpointNumber, type NodeId } from "#types";

export type WriteResult<T extends Write = Write> = Promise<
    T extends { suppressResponse: true } ? void : WriteResult.AttributeStatus[]
>;

export namespace WriteResult {
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

    export function assertSuccess(result: AttributeStatus[]) {
        const errors = result
            .filter(attr => attr.status !== Status.Success)
            .map(attr => {
                const path = ExpandedPath({ ...attr, kind: "attribute" });
                const status = new ExpandedStatus(attr);
                return new PathError({ path, status });
            });

        if (!errors.length) {
            return;
        }

        if (errors.length === 1) {
            throw errors[0];
        }

        throw new MatterAggregateError(errors, "Multiple writes failed");
    }
}
