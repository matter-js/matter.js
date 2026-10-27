/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Write } from "#action/request/Write.js";
import { ResultStatus } from "#action/response/ResultStatus.js";
import { ExpandedPath } from "#common/ExpandedPath.js";
import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { PathError, ReceivedPathError } from "#common/PathError.js";
import { MatterAggregateError } from "@matter/general";
import {
    Status,
    type AttributeId,
    type AttributePath,
    type ClusterId,
    type EndpointNumber,
    type NodeId,
} from "@matter/types";

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

    export interface AttributeStatus extends ResultStatus {
        kind: "attr-status";
        path: ConcreteAttributePath;
    }

    export function assertSuccess(result: AttributeStatus[]) {
        const errors = result
            .filter(attr => attr.status !== Status.Success)
            .map(attr => {
                const definition = {
                    path: ExpandedPath({ ...attr, kind: "attribute" }),
                    status: new ExpandedStatus({ ...attr, cluster: attr.path.clusterId }),
                };
                return attr.received ? new ReceivedPathError(definition) : new PathError(definition);
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
