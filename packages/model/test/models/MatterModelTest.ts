/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeElement,
    AttributeModel,
    ClusterModel,
    DatatypeModel,
    DeviceTypeModel,
    ElementTag,
    FieldModel,
    Matter,
    MatterModel,
} from "@matter/model";

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

    describe("lookups", () => {
        it("resolve the same models as the scope does", () => {
            const lookups = [
                [Matter.clusters, ElementTag.Cluster],
                [Matter.deviceTypes, ElementTag.DeviceType],
                [Matter.datatypes, ElementTag.Datatype],
                [Matter.fields, ElementTag.Field],
                [Matter.attributes, ElementTag.Attribute],
            ] as const;

            for (const [index, tag] of lookups) {
                const members = Matter.scope.membersOf(Matter, { tags: [tag] });
                expect([...index]).deep.equals([...members]);
                for (const model of members) {
                    if (model.id !== undefined) {
                        expect(index(model.id), `${model} by ID`).equals(members(model.id));
                    }
                    expect(index(model.name), `${model} by name`).equals(members(model.name));
                }
            }
        });

        it("match names in canonical camel case", () => {
            const onOff = Matter.clusters("OnOff");
            expect(onOff?.id).equals(6);
            expect(Matter.clusters("onOff")).equals(onOff);
            expect(Matter.clusters("on-off")).equals(onOff);
        });

        it("see a cluster added to the standard model after the first lookup", () => {
            expect(Matter.clusters(0xfff4_fc10)).undefined;

            const custom = new ClusterModel({ id: 0xfff4_fc10, name: "LateCustomCluster" });
            Matter.children.push(custom);
            try {
                expect(Matter.clusters(0xfff4_fc10)).equals(custom);
                expect(Matter.clusters("LateCustomCluster")).equals(custom);
                expect(Matter.clusters("lateCustomCluster")).equals(custom);
                expect([...Matter.clusters]).contains(custom);
            } finally {
                Matter.children.splice(Matter.children.indexOf(custom), 1);
            }

            expect(Matter.clusters(0xfff4_fc10)).undefined;
            expect(Matter.clusters("LateCustomCluster")).undefined;
        });

        it("follow ID and name changes of a child", () => {
            const cluster = new ClusterModel({ id: 0xfff4_fc20, name: "Before" });
            const model = new MatterModel({ name: "Test", children: [cluster] });
            expect(model.clusters(0xfff4_fc20)).equals(cluster);

            cluster.id = 0xfff4_fc21;
            cluster.name = "After";

            expect(model.clusters(0xfff4_fc20)).undefined;
            expect(model.clusters("Before")).undefined;
            expect(model.clusters(0xfff4_fc21)).equals(cluster);
            expect(model.clusters("after")).equals(cluster);
        });

        it("find no model for names of Object.prototype members", () => {
            for (const name of ["constructor", "toString", "__proto__"]) {
                expect(Matter.clusters(name), name).undefined;
                expect(Matter.deviceTypes(name), name).undefined;
            }
        });

        it("reuse the index until the children change", () => {
            const model = new MatterModel({
                name: "Test",
                children: [new ClusterModel({ id: 0xfff4_fc40, name: "A" })],
            });
            const index = model.clusters;
            expect(model.clusters).equals(index);

            const [a] = model.children;
            a.id = 0xfff4_fc40;
            a.name = "A";
            model.children[0] = a;
            expect(model.clusters, "writes that change nothing keep the index").equals(index);

            model.children.push(new ClusterModel({ id: 0xfff4_fc41, name: "B" }));

            expect(model.clusters).not.equals(index);
            expect([...model.clusters].map(({ name }) => name)).deep.equals(["A", "B"]);
        });

        it("follow changes to the base of an extended model", () => {
            const base = new MatterModel({
                name: "Base",
                children: [new ClusterModel({ id: 0xfff4_fc61, name: "A" })],
            });
            const extended = base.extend();
            expect(extended.clusters(0xfff4_fc62)).undefined;

            const added = new ClusterModel({ id: 0xfff4_fc62, name: "B" });
            base.children.push(added);

            expect(extended.clusters(0xfff4_fc62)).equals(added);
        });

        it("include the base's members in an extended model", () => {
            const extended = Matter.extend({}, new ClusterModel({ id: 0xfff4_fc60, name: "Extra" }));

            expect(extended.clusters.length).equals(Matter.clusters.length + 1);
            expect(extended.clusters(6)).equals(Matter.clusters(6));
            expect(extended.clusters("Extra")?.id).equals(0xfff4_fc60);
            expect(extended.deviceTypes("BridgedNode")).equals(Matter.deviceTypes("BridgedNode"));
        });

        it("return the first of two clusters with the same ID", () => {
            const first = new ClusterModel({ id: 0xfff4_fc30, name: "First" });
            const second = new ClusterModel({ id: 0xfff4_fc30, name: "Second" });
            const model = new MatterModel({ name: "Test", children: [first, second] });

            expect(model.clusters(0xfff4_fc30)).equals(first);
        });

        it("resolve ID 0", () => {
            const zero = new ClusterModel({ id: 0, name: "Zero" });
            const model = new MatterModel({ name: "Test", children: [zero] });
            expect(model.clusters(0)).equals(zero);

            const later = new ClusterModel({ id: 0, name: "LaterZero" });
            model.children.splice(0, 1, later);
            expect(model.clusters(0)).equals(later);
        });

        it("return only models of the requested element type", () => {
            const field = new FieldModel({ id: 0xfff4_0001, name: "Shared", type: "uint8" });
            const attribute = new AttributeModel({ id: 0xfff4_0001, name: "Shared", type: "uint8" });
            const model = new MatterModel({ name: "Test", children: [field, attribute] });

            expect(model.fields(0xfff4_0001)).equals(field);
            expect(model.fields("Shared")).equals(field);
            expect(model.attributes(0xfff4_0001)).equals(attribute);
            expect([...model.fields]).deep.equals([field]);
            expect(model.deviceTypes(0xfff4_0001)).undefined;
            expect(model.get(DeviceTypeModel, "Shared")).undefined;
        });
    });

    describe("permanentDatatypes", () => {
        it("keeps a seed datatype replaced by one of the same name", () => {
            const original = new DatatypeModel({ name: "seed", type: "uint8", isSeed: true });
            const model = new MatterModel({ name: "Test", children: [original] });
            expect(model.permanentDatatypes.seed).equals(original);

            const replacement = new DatatypeModel({ name: "seed", type: "uint16", isSeed: true });
            model.children.splice(0, 1, replacement);

            expect(model.permanentDatatypes.seed).equals(replacement);
        });

        it("follows the rename of a seed datatype", () => {
            const seed = new DatatypeModel({ name: "before", type: "uint8", isSeed: true });
            const model = new MatterModel({ name: "Test", children: [seed] });
            expect(model.permanentDatatypes.before).equals(seed);

            seed.name = "after";

            expect(model.permanentDatatypes.before).undefined;
            expect(model.permanentDatatypes.after).equals(seed);
        });

        it("lists only seed datatypes", () => {
            const seed = new DatatypeModel({ name: "seed", type: "uint8", isSeed: true });
            const model = new MatterModel({ name: "Test", children: [seed] });
            expect(model.permanentDatatypes.seed).equals(seed);

            model.children.push(new ClusterModel({ id: 0xfff4_fc50, name: "seed" }));
            model.children.push(new DatatypeModel({ name: "other", type: "uint8" }));

            expect(model.permanentDatatypes.seed).equals(seed);
            expect(Object.keys(model.permanentDatatypes)).deep.equals(["seed"]);
            expect(model.permanentDatatypes.constructor).undefined;
        });
    });
});
