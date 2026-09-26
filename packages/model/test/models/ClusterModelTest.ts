/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, DatatypeModel, MatterModel } from "@matter/model";

describe("ClusterModel", () => {
    describe("statusCodes", () => {
        it("resolves the codes of a cluster that defines them", () => {
            const codes = MatterModel.standard.clusters.require("DoorLock", ClusterModel).statusCodes;

            expect(codes?.name).equals("StatusCodeEnum");
            expect(codes?.children.map(child => child.name)).deep.equals(["Duplicate", "Occupied"]);
        });

        it("resolves nothing for a cluster that defines none", () => {
            expect(MatterModel.standard.clusters.require("Groups", ClusterModel).statusCodes).undefined;
        });

        it("resolves nothing for a childless definition", () => {
            const cluster = new ClusterModel({
                name: "Empty",
                id: 0xfff1,
                children: [new DatatypeModel({ name: "StatusCodeEnum", type: "enum8" })],
            });

            expect(cluster.statusCodes).undefined;
        });

        it("inherits the codes of the cluster it derives from", () => {
            const base = MatterModel.standard.clusters.require("DoorLock", ClusterModel);
            const derived = base.extend({ name: "DerivedLock", id: 0xfff2 });

            expect(derived.statusCodes?.name).equals("StatusCodeEnum");
        });
    });
});
