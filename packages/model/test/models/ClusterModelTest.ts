/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterElement, ClusterModel, DatatypeModel, MatterModel } from "@matter/model";

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

    describe("bindable", () => {
        const cluster = (name: string) => MatterModel.standard.clusters.require(name, ClusterModel);

        it("survives conversion to an element and back", () => {
            const element = new ClusterModel({ name: "Fixture", id: 0xfff1, bindable: false }).toElement();

            expect(element.bindable).false;
            expect(new ClusterModel(element).bindable).false;
        });

        it("survives cloning", () => {
            expect(new ClusterModel({ name: "Fixture", id: 0xfff1, bindable: false }).clone().bindable).false;
        });

        it("is false for the clusters whose client chooses its peer itself", () => {
            for (const name of ["OtaSoftwareUpdateProvider", "WebRtcTransportProvider", "WebRtcTransportRequestor"]) {
                expect(cluster(name).bindable, name).false;
                expect(cluster(name).effectiveBindable, name).false;
            }
        });

        it("is effective for every other cluster", () => {
            for (const name of ["Identify", "Groups", "OnOff", "LevelControl"]) {
                expect(cluster(name).bindable, name).undefined;
                expect(cluster(name).effectiveBindable, name).true;
            }
        });

        it("is inherited through an extension", () => {
            expect(cluster("WebRtcTransportProvider").extend().effectiveBindable).false;
            expect(cluster("OnOff").extend().effectiveBindable).true;
        });

        it("of an extension overrides the cluster it derives from", () => {
            expect(cluster("WebRtcTransportProvider").extend({ bindable: true }).effectiveBindable).true;
        });
    });

    describe("effectiveClassification", () => {
        const cluster = (name: string) => MatterModel.standard.clusters.require(name, ClusterModel);

        it("is the cluster's own classification", () => {
            expect(cluster("OnOff").effectiveClassification).equals(ClusterElement.Classification.Application);
            expect(cluster("Identify").effectiveClassification).equals(ClusterElement.Classification.EndpointUtility);
        });

        it("is inherited through an extension", () => {
            const extended = cluster("OnOff").extend();

            expect(extended.classification).undefined;
            expect(extended.effectiveClassification).equals(ClusterElement.Classification.Application);
        });

        it("of an extension overrides the cluster it derives from", () => {
            expect(
                cluster("OnOff").extend({ classification: ClusterElement.Classification.NodeUtility })
                    .effectiveClassification,
            ).equals(ClusterElement.Classification.NodeUtility);
        });

        it("is undefined when no cluster in the chain sets it", () => {
            expect(new ClusterModel({ name: "Fixture", id: 0xfff1 }).effectiveClassification).undefined;
        });
    });
});
