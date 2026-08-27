/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { enum8, uint8 } from "#index.js";
import { AttributeModel, ClusterModel, DatatypeModel, MatterModel } from "#models/index.js";

describe("ValueModel", () => {
    describe("effectiveQuality", () => {
        it("merges an extension's qualities with the base's", () => {
            const base = new AttributeModel({ id: 1, name: "Attr", type: "uint8", quality: "N T" });
            const extended = base.extend({ quality: "X" });

            expect(extended.effectiveQuality.nonvolatile).equals(true);
            expect(extended.effectiveQuality.atomic).equals(true);
            expect(extended.effectiveQuality.nullable).equals(true);
        });

        it("drops a quality the extension removes", () => {
            const base = new AttributeModel({ id: 1, name: "Attr", type: "uint8", quality: "N T" });
            const extended = base.extend({ quality: "!N" });

            expect(extended.effectiveQuality.nonvolatile).equals(undefined);
            expect(extended.effectiveQuality.atomic).equals(true);
            expect(base.effectiveQuality.nonvolatile).equals(true);
        });
    });

    describe("primitiveBase", () => {
        /** A chain of enums of the stated depth, the way the specification states a status code */
        function chained(depth: number, ...extra: DatatypeModel[]) {
            const datatypes = new Array<DatatypeModel>();
            for (let i = 0; i < depth; i++) {
                datatypes.push(
                    new DatatypeModel({ name: `Enum${i}`, type: i ? `Enum${i - 1}` : enum8.name, metatype: "enum" }),
                );
            }

            const attribute = new AttributeModel({ name: "Bounded", id: 1, type: `Enum${depth - 1}` });
            new MatterModel(
                {},
                uint8.clone(),
                enum8.clone(),
                new ClusterModel({ name: "Test", id: 0xfff1 }, ...datatypes, ...extra, attribute),
            );

            return attribute;
        }

        it("resolves a type that states an enum of an enum", () => {
            expect(chained(1).primitiveBase?.name).equals(uint8.name);
        });

        // The specification states no chain this long, and the model states no limit on one
        it("resolves a chain longer than a handful", () => {
            expect(chained(9).primitiveBase?.name).equals(uint8.name);
        });

        // Two definitions that state each other resolve forever, where one that states itself resolves to nothing
        it("states no primitive for definitions that state each other", () => {
            const attribute = chained(
                1,
                new DatatypeModel({ name: "Ay", type: "Bee", metatype: "enum" }),
                new DatatypeModel({ name: "Bee", type: "Ay", metatype: "enum" }),
            );
            attribute.type = "Ay";

            expect(attribute.primitiveBase).undefined;
        });
    });
});
