/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeModel,
    ClusterElement,
    ClusterModel,
    CommandModel,
    DatatypeModel,
    EventModel,
    FieldModel,
    Matter,
    MatterModel,
} from "@matter/model";

describe("ClusterModel", () => {
    describe("member lookups", () => {
        function cluster(name: string, id: number, ...children: (AttributeModel | CommandModel)[]) {
            return new ClusterModel({ name, id, children });
        }

        it("reuse the index until the cluster changes", () => {
            const subject = cluster("Subject", 0xfff4_fc00, new AttributeModel({ id: 1, name: "A", type: "uint8" }));
            const index = subject.attributes;
            expect(subject.attributes).equals(index);

            const added = new AttributeModel({ id: 2, name: "B", type: "uint8" });
            subject.children.push(added);

            expect(subject.attributes).not.equals(index);
            expect(subject.attributes(2)).equals(added);
        });

        it("see an attribute added to a standard cluster after the first lookup", () => {
            const onOff = Matter.clusters(6)!.clone();
            expect(onOff.attributes(0xfff4_0000)).undefined;

            const extension = new AttributeModel({
                id: 0xfff4_0000,
                name: "Extension",
                type: "uint8",
                conformance: "O",
            });
            onOff.children.push(extension);

            expect(onOff.attributes(0xfff4_0000)).equals(extension);
            expect(onOff.attributes("extension")).equals(extension);
        });

        it("follow changes to the base cluster", () => {
            const base = cluster("Base", 0xfff4_fc01, new AttributeModel({ id: 1, name: "A", type: "uint8" }));
            const derived = new ClusterModel({ name: "Derived", id: 0xfff4_fc02, type: "Base" });
            new MatterModel({ name: "Test", children: [base, derived] });
            expect(derived.attributes(1)?.name).equals("A");
            expect(derived.commands(1)).undefined;

            const command = new CommandModel({ id: 1, name: "Go", direction: "request" });
            base.children.push(command);

            expect(derived.commands(1)).equals(command);
        });

        it("follow a base cluster assigned after the first lookup", () => {
            const base = cluster("Base", 0xfff4_fc05, new AttributeModel({ id: 1, name: "A", type: "uint8" }));
            const derived = new ClusterModel({ name: "Derived", id: 0xfff4_fc06 });
            new MatterModel({ name: "Test", children: [base, derived] });
            const index = derived.attributes;
            expect(index(1)).undefined;
            expect(derived.attributes).equals(index);

            derived.type = "Base";

            expect(derived.attributes(1)?.name).equals("A");
        });

        it("follow changes to events, datatypes and fields", () => {
            const subject = cluster("Subject", 0xfff4_fc07);
            const before = [subject.events, subject.datatypes, subject.fields];

            const event = new EventModel({ id: 1, name: "Happened", priority: "info" });
            const datatype = new DatatypeModel({ name: "Thing", type: "uint8" });
            const field = new FieldModel({ id: 2, name: "Extra", type: "uint8" });
            subject.children.push(event, datatype, field);

            expect([subject.events, subject.datatypes, subject.fields]).not.deep.equals(before);
            expect(subject.events(1)).equals(event);
            expect(subject.datatypes("Thing")).equals(datatype);
            expect(subject.fields(2)).equals(field);
        });

        it("follow changes to the base of a cluster made with extend", () => {
            const base = cluster("Base", 0xfff4_fc08);
            const extension = base.extend();
            expect(extension.attributes(1)).undefined;

            const attribute = new AttributeModel({ id: 1, name: "A", type: "uint8" });
            base.children.push(attribute);

            expect(extension.attributes(1)).equals(attribute);
        });

        it("keep non-attribute members when only the root changes", () => {
            const subject = cluster("Subject", 0xfff4_fc09);
            const root = new MatterModel({ name: "Test", children: [subject] });
            const commands = subject.commands;
            const attributes = subject.attributes;

            root.children.push(new ClusterModel({ name: "Other", id: 0xfff4_fc0a }));

            expect(subject.commands).equals(commands);
            expect(subject.attributes).not.equals(attributes);
        });

        it("follow changes to the global attributes of the root", () => {
            const subject = cluster("Subject", 0xfff4_fc03);
            const root = new MatterModel({ name: "Test", children: [subject] });
            expect(subject.attributes(0xfffd)).undefined;

            const revision = new AttributeModel({ id: 0xfffd, name: "ClusterRevision", type: "uint16" });
            root.children.push(revision);

            expect(subject.attributes(0xfffd)).equals(revision);
        });
    });

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
