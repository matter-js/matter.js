/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { ClusterId, Status } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

describe("ExpandedStatus", () => {
    it("defaults to Failure", () => {
        const status = new ExpandedStatus({});

        expect(status.status).equal(Status.Failure);
        expect(status.id).equal("failure");
    });

    it("decamelizes a known status name", () => {
        const status = new ExpandedStatus({ status: Status.UnsupportedAttribute });

        expect(status.id).equal("unsupported-attribute");
    });

    it("labels an unknown status code", () => {
        const status = new ExpandedStatus({ status: 9999 as Status });

        expect(status.id).equal("unknown-9999");
    });

    it("resolves a cluster name for a cluster status with a known cluster id", () => {
        const status = new ExpandedStatus({ status: Status.Failure, cluster: OnOff.id, clusterStatus: 1 });

        expect(status.clusterStatus).equal(1);
        expect(status.id).equal("on-off");
    });

    it("combines status and cluster names", () => {
        const status = new ExpandedStatus({
            status: Status.UnsupportedAttribute,
            cluster: OnOff.id,
            clusterStatus: 1,
        });

        expect(status.id).equal("unsupported-attribute+on-off");
    });

    it("labels an unknown cluster id", () => {
        const status = new ExpandedStatus({ status: Status.Failure, cluster: ClusterId(0x1234), clusterStatus: 1 });

        expect(status.id).equal("cluster-4660");
    });

    it("labels a cluster status with no cluster", () => {
        const status = new ExpandedStatus({ status: Status.Failure, clusterStatus: 1 });

        expect(status.id).equal("unknown-cluster");
    });
});
