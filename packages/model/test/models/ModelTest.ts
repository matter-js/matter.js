/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeElement,
    AttributeModel,
    ClusterModel,
    DatatypeModel,
    FieldModel,
    Matter,
    MatterModel,
    Metatype,
    uint16,
    uint32,
} from "#index.js";

describe("Model", () => {
    describe("parent", () => {
        it("sets before reification", () => {
            const child = new AttributeModel({ id: 1, name: "Foo" });
            const cluster = new ClusterModel({ id: 1, name: "Bar", children: [child] });

            // Cluster is not reified but child should have parent set
            expect(child.parent).equals(cluster);
        });

        it("sets during reification", () => {
            const child = AttributeElement({ id: 1, name: "Foo" });
            const cluster = new ClusterModel({ id: 1, name: "Bar", children: [child] });

            // Force reification and thus instantiation of child
            expect(cluster.children[0].parent).equals(cluster);
        });

        it("sets due to forced reification", () => {
            const grandchild = new FieldModel({ name: "Hmm" });
            const child = AttributeElement({ id: 1, name: "Foo", type: "struct", children: [grandchild] });
            const cluster = new ClusterModel({ id: 1, name: "Bar", children: [child] });

            // The attribute should have been upgraded when added with a model descendent
            expect(grandchild.parent).instanceof(AttributeModel);
            expect(grandchild.parent?.parent).equals(cluster);
        });
    });

    describe("children", () => {
        it("can be added", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children.push({ tag: "datatype", name: "Bar" });
            expect(parent.children.length).equal(1);
            expect(parent.children[0]).instanceof(DatatypeModel);
        });

        it("can be added as model", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children.push(new DatatypeModel({ name: "Bar" }));
            expect(parent.children.length).equal(1);
            expect(parent.children[0]).instanceof(DatatypeModel);
        });

        it("can be removed", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children.push({ tag: "datatype", name: "Bar" });
            const child = parent.children[0];
            child.parent = undefined;
            expect(child.parent).equal(undefined);
            expect(parent.children.length).equal(0);
        });

        it("can be moved", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children.push({ tag: "datatype", name: "Bar" });
            const child = parent.children[0];
            const parent2 = new ClusterModel({ name: "Foo2", children: [child] });
            expect(parent.children.length).equal(0);
            expect(parent2.children.length).equal(1);
            expect(child.parent).equal(parent2);
        });

        it("can be bulk added", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children = [
                { tag: "datatype", name: "Bar1" },
                { tag: "datatype", name: "Bar2" },
            ];
            expect(parent.children.length).equal(2);
            expect(parent.children[0].name).equal("Bar1");
            expect(parent.children[1].name).equal("Bar2");
        });

        it("can be bulk added with model", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children = [new DatatypeModel({ name: "Bar1" }), { tag: "datatype", name: "Bar2" }];
            expect(parent.children.length).equal(2);
            expect(parent.children[0].name).equal("Bar1");
            expect(parent.children[1].name).equal("Bar2");
        });

        it("can be bulk moved", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children = [
                { tag: "datatype", name: "Bar1" },
                { tag: "datatype", name: "Bar2" },
            ];
            const parent2 = new ClusterModel({ name: "Foo2", children: parent.children });
            expect(parent.children.length).equal(0);
            expect(parent2.children.length).equal(2);
            expect(parent2.children[0].name).equal("Bar1");
            expect(parent2.children[1].name).equal("Bar2");
        });

        it("splices correctly", () => {
            const parent = new ClusterModel({ name: "Foo" });

            parent.children = [
                { tag: "datatype", name: "Bar1" },
                { tag: "datatype", name: "Bar2" },
                { tag: "datatype", name: "Bar3" },
            ];

            const removed = parent.children.splice(
                1,
                1,
                { tag: "datatype", name: "Bar4" },
                { tag: "datatype", name: "Bar5" },
            );

            expect(removed.length === 1);
            expect(removed[0].name === "Bar2");
            expect(removed[0].parent === undefined);

            expect(parent.children.length === 4);
            expect(parent.children.map(({ name, parent }) => ({ name, parent: parent?.name }))).deep.equals([
                { name: "Bar1", parent: "Foo" },
                { name: "Bar4", parent: "Foo" },
                { name: "Bar5", parent: "Foo" },
                { name: "Bar3", parent: "Foo" },
            ]);
        });
    });

    describe("all", () => {
        it("finds all models by type", () => {
            expect(Fixtures.matter.all(ClusterModel).length).equal(3);
            expect(Fixtures.matter.all(DatatypeModel).length).equal(82);
        });
    });

    describe("get", () => {
        it("finds by ID", () => {
            expect(Fixtures.matter.get(ClusterModel, 1)).equal(Fixtures.cluster1);
            expect(Fixtures.matter.get(AttributeModel, 1)).equal(Fixtures.globalAttr);
        });

        it("finds by name", () => {
            expect(Fixtures.matter.get(ClusterModel, "Cluster1")).equal(Fixtures.cluster1);
        });
    });

    describe("effectiveType", () => {
        it("uses explicit type", () => {
            expect(Fixtures.cluster1StructAttr.effectiveType).equals("ClusterDatatype");
        });

        it("infers type from parent", () => {
            expect(Fixtures.feature.effectiveType).equals("uint32");
        });
    });

    describe("base", () => {
        it("finds global base type", () => {
            expect(Fixtures.cluster1StructType.base).equal(Fixtures.globalStruct);
        });

        it("finds local base type", () => {
            expect(Fixtures.cluster1StructField1.base).equal(Fixtures.cluster1StructType);
        });

        it("finds inherited base type", () => {
            expect(Fixtures.cluster2StructField.base).equal(Fixtures.cluster1StructType);
        });

        it("is inferred from implied base", () => {
            expect(Fixtures.feature.base?.name).equal(uint32.name);
        });

        it("finds attribute struct", () => {
            expect(Fixtures.cluster1StructAttr.base).equal(Fixtures.cluster1StructType);
        });

        it("is inferred as shadow", () => {
            expect(Fixtures.cluster2Attr2.base).equal(Fixtures.cluster1StructAttr);
        });
    });

    describe("detached models", () => {
        it("resolves types from standard scope", () => {
            const detached = new DatatypeModel({ name: "Foo", type: "uint8" });
            expect(detached.parent === undefined);
            expect(detached.base).equals(Matter.get(DatatypeModel, "uint8"));
            expect(detached.effectiveMetatype).equals("integer");
        });

        it("resolves types from operational base scope", () => {
            const foo = new DatatypeModel({ name: "foo", metatype: "float" });
            const fooAlias = new DatatypeModel({ name: "fooAlias", type: "foo" });
            new MatterModel({
                name: "OtherMatter",
                children: [foo, fooAlias],
            });

            expect(fooAlias.base).equals(foo);

            const detached = fooAlias.extend();
            expect(detached.parent === undefined);
            expect(detached.operationalBase).equals(fooAlias);
            expect(detached.effectiveMetatype).equals("float");
        });
    });

    describe("qualified type names", () => {
        it("resolves reference to attribute in another cluster", () => {
            expect(Fixtures.cluster2Attr3.base).equals(Fixtures.cluster1StructAttr);
        });

        it("resolves absolute reference to datatype in another cluster", () => {
            expect(Fixtures.cluster2Attr4.base).equals(Fixtures.cluster1.get(DatatypeModel, "ClusterDatatype"));
        });

        it("resolves reference to field of global struct", () => {
            expect(Fixtures.cluster2Attr5.base).equals(
                Fixtures.matter.get(DatatypeModel, "Tod")?.get(FieldModel, "hour"),
            );
        });
    });

    describe("metabase", () => {
        it("is discovered via direct inheritance", () => {
            const map32 = Fixtures.matter.get(DatatypeModel, "map32");
            expect(map32).not.undefined;
            const featureMap = Fixtures.matter.get(AttributeModel, "FeatureMap");
            expect(featureMap).not.undefined;
            expect(featureMap?.metabase).equals(map32);
        });

        it("is discovered via parent inheritance", () => {
            const map32 = Fixtures.matter.get(DatatypeModel, "map32");
            expect(map32).not.undefined;
            expect(Fixtures.cluster1.featureMap.metabase).equals(map32);
        });
    });

    describe("effectiveMetatype", () => {
        it("represents global base type", () => {
            expect(Fixtures.cluster1StructType.effectiveMetatype).equal(Metatype.object);
        });

        it("represents local base type", () => {
            expect(Fixtures.cluster1StructField1.effectiveMetatype).equal(Metatype.object);
        });

        it("represents inherited base type", () => {
            expect(Fixtures.cluster2StructField.effectiveMetatype).equal(Metatype.object);
        });

        it("is inferred from implied base type", () => {
            expect(Fixtures.enumValue2.effectiveMetatype).equal(Metatype.integer);
        });
    });

    describe("enum values", () => {
        it("infers ID", () => {
            expect(Fixtures.enumValue2.effectiveId).equal(1);
        });

        it("infers type", () => {
            expect(Fixtures.enumValue2.effectiveType).equal(uint16.name);
        });
    });

    describe("effectiveType", () => {
        it("is inherited on datatype override", () => {
            expect(Fixtures.cluster1StructFieldOverride.effectiveType).equal("strField");
        });

        it("is inherited on secondary datatype override", () => {
            expect(Fixtures.cluster2StructFieldOverride.effectiveType).equal("strField");
        });

        it("is inherited on attribute override", () => {
            expect(Fixtures.cluster2Attr1.effectiveType).equal("byteAttr");
        });
    });
});

namespace Fixtures {
    export const globalStruct = new DatatypeModel({
        name: "GlobalStruct",
        type: "struct",
        children: [
            { tag: "field", name: "numField", type: "uint16" },
            { tag: "field", name: "strField", type: "string" },
        ],
    });

    export const cluster1StructFieldOverride = new FieldModel({ name: "strField" });
    export const cluster1StructType = new DatatypeModel({
        name: "ClusterDatatype",
        type: "GlobalStruct",
        children: [{ tag: "field", name: "numField2", type: "single" }, cluster1StructFieldOverride],
    });

    export const cluster1StructField1 = new FieldModel({ name: "structField", type: "ClusterDatatype" });
    export const cluster1StructAttr = new AttributeModel({ id: 3, name: "structAttr2", type: "ClusterDatatype" });
    export const cluster1ByteAttr = new AttributeModel({ id: 1, name: "byteAttr", type: "uint8" });

    export const globalAttr = new AttributeModel({ id: 1, name: "Attr1" });

    export const feature = new FieldModel({ name: "PIN" });

    export const cluster1 = new ClusterModel({
        id: 1,
        name: "Cluster1",
        children: [
            {
                tag: "attribute",
                id: 0xfffc,
                name: "FeatureMap",
                type: "FeatureMap",
                children: [feature],
            },
            { tag: "attribute", id: 1, name: "byteAttr", type: "uint8" },
            {
                tag: "attribute",
                id: 2,
                name: "structAttr1",
                type: "struct",
                children: [
                    { tag: "field", name: "numField", type: "double" },
                    { tag: "field", name: "enumField", type: "GlobalEnum" },
                    cluster1StructField1,
                ],
            },
            cluster1StructAttr,
            cluster1StructType,
        ],
    });

    export const cluster2StructFieldOverride = new FieldModel({ name: "strField" });
    export const cluster2StructField = new FieldModel({
        id: 1,
        name: "inheritedStruct",
        type: "ClusterDatatype",
        children: [cluster2StructFieldOverride],
    });
    export const cluster2Attr1 = new AttributeModel({ id: 1, name: "byteAttr" });
    export const cluster2Attr2 = new AttributeModel({ id: 3, name: "structAttr2" });
    export const cluster2Attr3 = new AttributeModel({ id: 4, name: "qualifiedAttr1", type: "Cluster1.structAttr2" });
    export const cluster2Attr4 = new AttributeModel({
        id: 5,
        name: "qualifiedAttr2",
        type: "Matter.Cluster1.ClusterDatatype",
    });
    export const cluster2Attr5 = new AttributeModel({
        id: 6,
        name: "qualifiedAttr3",
        type: "Tod.hour",
    });

    export const enumValue2 = new FieldModel({ name: "Value2" });

    export const matter = new MatterModel({
        name: "Fake Matter",
        children: [
            ...Matter.seedGlobals,
            cluster1,
            {
                tag: "cluster",
                id: 2,
                name: "Cluster2",
                type: "Cluster1",
                children: [cluster2StructField, cluster2Attr1, cluster2Attr2, cluster2Attr3, cluster2Attr4],
            },
            { tag: "cluster", id: 3, name: "Cluster3" },
            globalAttr,
            { tag: "datatype", name: "GlobalByte", type: "uint8" },
            globalStruct,
            {
                tag: "datatype",
                type: "enum16",
                name: "GlobalEnum",
                children: [{ tag: "field", name: "Value1" }, enumValue2],
            },
        ],
    });
}
