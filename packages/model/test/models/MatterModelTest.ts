/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement, AttributeModel, ClusterModel, Matter } from "@matter/model";

const ACCESS_CONTROL_ID = 0x1f;

describe("MatterModel", () => {
    describe("withClusters", () => {
        it("appends a cluster with a new ID", () => {
            const custom = new ClusterModel({ id: 0xfff4_fc00, name: "MyCustomCluster" });

            const model = Matter.withClusters(custom);

            expect(model.clusters(0xfff4_fc00)?.name).equals("MyCustomCluster");
            expect([...model.clusters].length).equals([...Matter.clusters].length + 1);
        });

        it("replaces a cluster with an existing ID rather than adding a duplicate", () => {
            const extendedAccessControl = Matter.clusters(ACCESS_CONTROL_ID)!.extend(
                {},
                AttributeElement({ id: 0xfff4_0000, name: "MyCounter", type: "uint32", conformance: "O" }),
            );

            const model = Matter.withClusters(extendedAccessControl);

            const resolved = model.clusters(ACCESS_CONTROL_ID);
            expect(resolved?.get(AttributeModel, "MyCounter")).not.undefined;
            expect([...model.clusters].length).equals([...Matter.clusters].length);
        });

        it("does not mutate the source model", () => {
            const custom = new ClusterModel({ id: 0xfff4_fc01, name: "Ephemeral" });

            Matter.withClusters(custom);

            expect(Matter.clusters(0xfff4_fc01)).undefined;
            expect(Matter.clusters(ACCESS_CONTROL_ID)?.get(AttributeModel, "MyCounter")).undefined;
        });
    });
});
