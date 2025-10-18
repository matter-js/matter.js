/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassSemantics, cluster, field, FieldModel, Schema, uint8 } from "#index.js";

describe("Schema", () => {
    it("doesn't exist without decoration", () => {
        class Foo {}
        expect(Schema(Foo)).undefined;
    });

    it("exists with class decoration", () => {
        @cluster(1)
        class Foo {}

        expect(Schema(Foo)?.tag).equals("cluster");
    });

    it("exists with field decoration", () => {
        class Foo {
            @field(uint8)
            bar = 4;
        }

        expect(Schema(Foo)?.get(FieldModel, "bar")?.operationalBase).equals(uint8);
    });

    it("exists with extend", () => {
        class Foo {
            static [ClassSemantics.extend](decoration: ClassSemantics) {
                decoration.mutableModel;
            }
        }

        expect(Schema(Foo)).not.undefined;
    });

    it("exists with class decoration on base", () => {
        @cluster(1)
        class Foo {}

        class Bar extends Foo {}

        expect(Schema(Bar)).not.undefined;
    });

    it("exists with class field decoration on base", () => {
        class Foo {
            @field(uint8)
            bar = 4;
        }

        class Bar extends Foo {}

        expect(Schema(Bar)?.get(FieldModel, "bar")?.operationalBase).equals(uint8);
    });

    it("exists with extend on base", () => {
        class Foo {
            static [ClassSemantics.extend](decoration: ClassSemantics) {
                decoration.mutableModel;
            }
        }

        class Bar extends Foo {}

        expect(Schema(Bar)).not.undefined;
    });
});
