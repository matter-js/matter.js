/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize } from "#general";
import { ClusterModel, Matter, MatterModel } from "#model";
import { ClusterId, Status } from "#types";

/**
 * Detailed status information expanded from status codes.
 *
 * TODO - maybe update codegen to include description in operational models so we can use as detailed error message
 */
export class ExpandedStatus {
    id: string;
    status: Status;
    clusterStatus?: number;

    constructor({ matter, status, cluster, clusterStatus }: ExpandedStatus.Definition) {
        this.status = status ?? Status.Failure;
        this.clusterStatus = clusterStatus;

        let statusStr: undefined | string;
        if (status !== Status.Failure) {
            const name = Status[this.status];
            if (name === undefined) {
                statusStr = `unknown-${this.status}`;
            } else {
                statusStr = decamelize(name);
            }
        }

        if (clusterStatus === undefined) {
            this.id = statusStr ?? "failure";
            return;
        }

        let clusterStr;
        if (typeof cluster === "number") {
            matter ??= Matter;
            const model = matter.get(ClusterModel, cluster);
            if (model === undefined) {
                clusterStr = `cluster-${cluster}`;
            } else {
                clusterStr = decamelize(model.name);
            }
        } else if (cluster) {
            clusterStr = decamelize(cluster.name);
        } else {
            clusterStr = "unknown-cluster";
        }

        if (statusStr === undefined) {
            this.id = clusterStr;
            return;
        }

        this.id = `${statusStr}+${clusterStr}`;
    }
}

export namespace ExpandedStatus {
    export interface Definition {
        matter?: MatterModel;
        status?: Status;
        cluster?: ClusterModel | ClusterId;
        clusterStatus?: number;
    }
}
