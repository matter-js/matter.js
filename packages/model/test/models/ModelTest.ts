/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeElement,
    AttributeModel,
    ClusterModel,
    CommandModel,
    DatatypeModel,
    ElementTag,
    FieldModel,
    Matter,
    MatterModel,
    Metatype,
    Model,
    uint16,
    uint32,
} from "#index.js";
import { ImplementationError } from "@matter/general";

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

            expect(removed.length).equals(1);
            expect(removed[0].name).equals("Bar2");
            expect(removed[0].parent).undefined;

            expect(parent.children.length).equals(4);
            expect(parent.children.map(({ name, parent }) => ({ name, parent: parent?.name }))).deep.equals([
                { name: "Bar1", parent: "Foo" },
                { name: "Bar4", parent: "Foo" },
                { name: "Bar5", parent: "Foo" },
                { name: "Bar3", parent: "Foo" },
            ]);
        });

        it("keeps parent and lookups when splice reorders own children", () => {
            const parent = new ClusterModel({ name: "Foo" });
            parent.children = [
                { tag: "attribute", id: 1, name: "A" },
                { tag: "attribute", id: 2, name: "B" },
            ];
            const [a, b] = parent.children;
            expect(parent.get(AttributeModel, 1)).equals(a);

            const removed = parent.children.splice(0, 2, b, a);

            expect(removed).deep.equals([a, b]);
            expect([...parent.children]).deep.equals([b, a]);
            expect(a.parent).equals(parent);
            expect(b.parent).equals(parent);
            expect(parent.get(AttributeModel, 1)).equals(a);
            expect(parent.get(AttributeModel, "B")).equals(b);
        });

        it("resolves duplicate IDs in list order after splice", () => {
            const parent = new ClusterModel({ name: "Foo", children: [{ tag: "attribute", id: 1, name: "Later" }] });
            expect(parent.get(AttributeModel, 1)?.name).equals("Later");

            const earlier = new AttributeModel({ id: 1, name: "Earlier" });
            parent.children.splice(0, 0, earlier);

            expect(parent.get(AttributeModel, 1)).equals(earlier);
            expect(parent.all(AttributeModel, 1).map(({ name }) => name)).deep.equals(["Earlier", "Later"]);
        });

        it("resolves duplicate IDs in list order after a child moves by index assignment", () => {
            const parent = new ClusterModel({
                name: "Foo",
                children: [
                    { tag: "attribute", id: 1, name: "First" },
                    { tag: "attribute", id: 1, name: "Second" },
                ],
            });
            const [first, second] = parent.children;
            expect(parent.get(AttributeModel, 1)).equals(first);

            parent.children[2] = first;

            expect([...parent.children]).deep.equals([second, first]);
            expect(parent.get(AttributeModel, 1)).equals(second);
        });

        it("indexes fields without ID by their current position", () => {
            const struct = new DatatypeModel({
                name: "Foo",
                type: "struct",
                children: [new FieldModel({ name: "First" }), new FieldModel({ name: "Second" })],
            });
            const second = struct.children[1];
            expect(struct.children.select(1)).equals(second);

            struct.children.splice(0, 1);

            expect(struct.children.select(0)).equals(second);
            expect(struct.children.select(1)).undefined;
        });

        it("updates lookups when children are deleted or truncated", () => {
            const parent = new ClusterModel({
                name: "Foo",
                children: [
                    { tag: "attribute", id: 1, name: "A" },
                    { tag: "attribute", id: 2, name: "B" },
                ],
            });
            expect(parent.get(AttributeModel, 2)?.name).equals("B");

            parent.children.length = 1;
            expect(parent.get(AttributeModel, 2)).undefined;

            delete parent.children[0];
            expect(parent.get(AttributeModel, 1)).undefined;
        });

        describe("array methods", () => {
            function abcd() {
                const parent = new ClusterModel({
                    name: "Foo",
                    children: ["A", "B", "C", "D"].map((name, i) => ({ tag: "attribute", id: i + 1, name })),
                });
                const children = [...parent.children];
                const names = () => parent.children.map(({ name }) => name).join("");
                const ownedBy = (model: Model) =>
                    children.filter(child => child.parent === model).map(({ name }) => name);
                return { parent, children, names, ownedBy };
            }

            it("reverse keeps every child", () => {
                const { parent, names, ownedBy } = abcd();
                expect(parent.children.reverse()).equals(parent.children);
                expect(names()).equals("DCBA");
                expect(ownedBy(parent)).deep.equals(["A", "B", "C", "D"]);
                expect(parent.get(AttributeModel, 1)?.name).equals("A");
            });

            it("sort keeps every child", () => {
                const { parent, names, ownedBy } = abcd();
                parent.children.sort((a, b) => b.name.localeCompare(a.name));
                expect(names()).equals("DCBA");
                expect(ownedBy(parent)).deep.equals(["A", "B", "C", "D"]);
            });

            it("sort compares models of children given as elements", () => {
                const parent = new ClusterModel({
                    name: "Foo",
                    children: [
                        { tag: "attribute", id: 1, name: "A" },
                        { tag: "attribute", id: 2, name: "B" },
                    ],
                });

                parent.children.sort((a, b) => {
                    expect(a).instanceof(AttributeModel);
                    expect(b).instanceof(AttributeModel);
                    return b.name.localeCompare(a.name);
                });

                expect(parent.children.map(({ name }) => name)).deep.equals(["B", "A"]);
            });

            it("shift and pop remove and disown one child", () => {
                const { parent, children, names, ownedBy } = abcd();
                expect(parent.children.shift()).equals(children[0]);
                expect(parent.children.pop()).equals(children[3]);
                expect(names()).equals("BC");
                expect(ownedBy(parent)).deep.equals(["B", "C"]);
                expect(parent.get(AttributeModel, 1)).undefined;
            });

            it("unshift adds and adopts", () => {
                const { parent, names } = abcd();
                const z = new AttributeModel({ id: 26, name: "Z" });
                expect(parent.children.unshift(z)).equals(5);
                expect(names()).equals("ZABCD");
                expect(z.parent).equals(parent);
                expect(parent.get(AttributeModel, 26)).equals(z);
            });

            it("moves a child that is inserted again", () => {
                const { parent, children, names, ownedBy } = abcd();
                parent.children.push(children[0]);
                expect(names()).equals("BCDA");
                parent.children.unshift(children[3]);
                expect(names()).equals("DBCA");
                parent.children.splice(3, 0, children[1]);
                expect(names()).equals("DCBA");
                parent.children.splice(-2, 0, children[0]);
                expect(names()).equals("DCAB");
                expect(ownedBy(parent)).deep.equals(["A", "B", "C", "D"]);
                expect(parent.children.pop()).equals(children[1]);
                expect(new ClusterModel({ name: "Empty" }).children.shift()).undefined;
            });

            it("refuses to list a model twice", () => {
                const { parent, names } = abcd();
                const z = new AttributeModel({ id: 26, name: "Z" });
                expect(() => parent.children.splice(0, 0, z, z)).throws(ImplementationError);
                expect(names()).equals("ABCD");
                expect(z.parent).undefined;
            });

            it("does not support fill and copyWithin", () => {
                const { parent, children, names } = abcd();
                expect(() => parent.children.fill(children[0])).throws(ImplementationError);
                expect(() => parent.children.copyWithin(0, 1)).throws(ImplementationError);
                expect(names()).equals("ABCD");
            });

            it("clamps the position of a moved child to the list", () => {
                const { parent, children, names } = abcd();
                expect(parent.children.push(children[0])).equals(4);
                expect(names()).equals("BCDA");
                parent.children.splice(-10, 0, children[2]);
                expect(names()).equals("CBDA");
                parent.children.splice(99, 0, children[1]);
                expect(names()).equals("CDAB");
                parent.children.splice(-10, 1, children[2]);
                expect(names()).equals("CDAB");
                expect(children[3].parent).equals(parent);
            });

            it("does not grow by setting length", () => {
                const { parent, names } = abcd();
                parent.children.length = 10;
                expect(parent.children.length).equals(4);
                expect(names()).equals("ABCD");
            });

            it("splice resolves its arguments as Array.prototype.splice does", () => {
                const { parent, children, names, ownedBy } = abcd();
                parent.children.splice(2.5, 0, children[2]);
                expect(names()).equals("ABCD");
                parent.children.splice(2.5, 0, children[0]);
                expect(names()).equals("BACD");

                expect(parent.children.splice(2).map(({ name }) => name)).deep.equals(["C", "D"]);
                expect(names()).equals("BA");
                expect(ownedBy(parent)).deep.equals(["A", "B"]);
            });

            it("index assignment disowns the replaced child", () => {
                const { parent, children, names, ownedBy } = abcd();
                const z = new AttributeModel({ id: 26, name: "Z" });
                parent.children[1] = z;
                expect(names()).equals("AZCD");
                expect(ownedBy(parent)).deep.equals(["A", "C", "D"]);
                expect(z.parent).equals(parent);
                expect(children[1].parent).undefined;
            });

            it("moves a child from another model", () => {
                const { parent, children, names } = abcd();
                const other = new ClusterModel({ name: "Other" });
                other.children.push(children[1], children[2]);
                expect(names()).equals("AD");
                expect(other.children.map(({ name }) => name)).deep.equals(["B", "C"]);
                expect(children[1].parent).equals(other);
                expect(parent.get(AttributeModel, 2)).undefined;
                expect(other.get(AttributeModel, 2)).equals(children[1]);
            });

            it("refuses changes once finalized and keeps a child moved from it", () => {
                const { parent, children, names } = abcd();
                parent.finalize();
                expect(() => parent.children.push(new AttributeModel({ id: 26, name: "Z" }))).throws(
                    ImplementationError,
                );
                expect(() => parent.children.reverse()).throws(ImplementationError);

                const other = new ClusterModel({ name: "Other" });
                expect(() => other.children.push(children[0])).throws(ImplementationError);
                expect(names()).equals("ABCD");
                expect(other.children.length).equals(0);
                expect(children[0].parent).equals(parent);
            });

            it("length truncation disowns the removed children", () => {
                const { parent, names, ownedBy } = abcd();
                parent.children.length = 2;
                expect(names()).equals("AB");
                expect(ownedBy(parent)).deep.equals(["A", "B"]);
            });

            it("delete removes and disowns the child without leaving a hole", () => {
                const { parent, children, names, ownedBy } = abcd();

                delete parent.children[0];

                expect(names()).equals("BCD");
                expect(ownedBy(parent)).deep.equals(["B", "C", "D"]);
                expect(children[0].parent).undefined;
            });

            it("delete on children given as elements leaves no hole", () => {
                const parent = new ClusterModel({
                    name: "Foo",
                    children: [
                        { tag: "attribute", id: 1, name: "A" },
                        { tag: "attribute", id: 2, name: "B" },
                    ],
                });

                delete parent.children[0];

                expect(parent.children.length).equals(1);
                expect(parent.get(AttributeModel, 2)?.name).equals("B");
            });

            it("all and select visit children in list order", () => {
                const parent = new ClusterModel({
                    name: "Foo",
                    children: [
                        { tag: "attribute", id: 1, name: "Same" },
                        { tag: "attribute", id: 2, name: "Other" },
                        { tag: "attribute", id: 3, name: "Same" },
                    ],
                });

                expect(parent.all(AttributeModel).map(({ id }) => id)).deep.equals([1, 2, 3]);
                expect(parent.children.select(child => child.id !== 1)?.id).equals(2);
                const [, other] = parent.children;
                expect(
                    parent.children.select(child => child.id !== 1, ElementTag.Attribute, new Set([other]))?.id,
                ).equals(3);
                expect(parent.children.select(() => true, ElementTag.Command)).undefined;
            });
        });

        it("finds no child for names of Object.prototype members", () => {
            const parent = new ClusterModel({ name: "Foo", children: [{ tag: "attribute", id: 1, name: "A" }] });

            for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
                expect(parent.get(AttributeModel, name), name).undefined;
                expect(parent.children.select(name), name).undefined;
                expect(parent.all(AttributeModel, name), name).deep.equals([]);
            }
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
            expect(Fixtures.matter.clusters(1)).equal(Fixtures.cluster1);
            expect(Fixtures.matter.attributes(1)).equal(Fixtures.globalAttr);
        });

        it("finds by name", () => {
            expect(Fixtures.matter.clusters("Cluster1")).equal(Fixtures.cluster1);
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
            expect(detached.base).equals(Matter.datatypes("uint8"));
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
            expect(Fixtures.cluster2Attr4.base).equals(Fixtures.cluster1.datatypes("ClusterDatatype"));
        });

        it("resolves reference to field of global struct", () => {
            expect(Fixtures.cluster2Attr5.base).equals(Fixtures.matter.datatypes("Tod")?.fields("hour"));
        });
    });

    describe("metabase", () => {
        it("is discovered via direct inheritance", () => {
            const map32 = Fixtures.matter.datatypes("map32");
            expect(map32).not.undefined;
            const featureMap = Fixtures.matter.attributes("FeatureMap");
            expect(featureMap).not.undefined;
            expect(featureMap?.metabase).equals(map32);
        });

        it("is discovered via parent inheritance", () => {
            const map32 = Fixtures.matter.datatypes("map32");
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

    describe("resolve", () => {
        it("resolves single segment", () => {
            expect(Fixtures.cluster1.resolve("structAttr2")).equals(Fixtures.cluster1StructAttr);
        });

        it("resolves qualified path through nested fields", () => {
            expect(Fixtures.cluster1.resolve("structAttr1.structField")).equals(Fixtures.cluster1StructField1);
        });

        it("stops at scope boundary", () => {
            // Cluster1 is a sibling cluster, not reachable within the cluster boundary
            const cluster2 = Fixtures.matter.clusters("Cluster2");
            expect(cluster2?.resolve("Cluster1.structAttr2")).undefined;
        });

        it("falls back to outerResolve", () => {
            // outerResolve provides a synthetic scope not in cluster1's natural hierarchy
            const outerResolve = (path: string[]) => {
                if (path[0] === "outerCommand") {
                    return Fixtures.outerCommand.member(path[1]);
                }
            };
            const result = Fixtures.cluster1.resolve("outerCommand.outerField", { outerResolve });
            expect(result).equals(Fixtures.outerField);
        });

        it("returns undefined for unknown name", () => {
            expect(Fixtures.cluster1.resolve("nonExistent")).undefined;
        });

        it("returns undefined for unknown qualified path", () => {
            expect(Fixtures.cluster1.resolve("structAttr1.nonExistent")).undefined;
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

    export const outerField = new FieldModel({ name: "outerField", type: "uint8" });
    export const outerCommand = new CommandModel({
        id: 1,
        name: "outerCommand",
        children: [outerField],
    });

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
