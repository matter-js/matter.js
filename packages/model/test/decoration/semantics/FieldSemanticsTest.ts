/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Ensure correct initialization order
import "#decoration/semantics/index.js";

import { attribute } from "#decoration/decorators/attribute.js";
import { field } from "#decoration/decorators/field.js";
import { listOf } from "#decoration/decorators/listOf.js";
import { nonvolatile } from "#decoration/decorators/nonvolatile.js";
import { nullable } from "#decoration/decorators/nullable.js";
import { AttributeModel } from "#models/AttributeModel.js";
import { FieldModel } from "#models/index.js";
import { Schema } from "#models/Schema.js";
import { uint16, uint32 } from "#standard/elements/models.js";

describe("FieldSemantics", () => {
    it("sets type", () => {
        class Foo {
            @field(uint32)
            bar = 4;
        }

        const schema = Schema.Required(Foo);
        expect(schema.children.length).equals(1);
        const bar = schema.get(FieldModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.name).equals("bar");
    });

    it("sets attribute ID", () => {
        class Foo {
            @attribute(2, uint32)
            bar = 4;
        }

        const schema = Schema.Required(Foo);
        expect(schema.children.length).equals(1);
        const bar = schema.get(AttributeModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.name).equals("bar");
        expect(bar!.id).equals(2);
    });

    it("sets nullable", () => {
        class Foo {
            @field(uint32, nullable)
            bar = 4;
        }

        const schema = Schema.Required(Foo);
        expect(schema.children.length).equals(1);
        const bar = schema.get(FieldModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.quality.nullable).true;
        expect(bar!.quality.nonvolatile).not.true;
    });

    it("sets nonvolatile", () => {
        class Foo {
            @field(uint32, nonvolatile)
            bar = 4;
        }

        const schema = Schema.Required(Foo);
        expect(schema.children.length).equals(1);
        const bar = schema.get(FieldModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.quality.nullable).not.true;
        expect(bar!.quality.nonvolatile).true;
    });

    it("merges with base class", () => {
        class Obj {
            @field(uint16)
            foo = 4;
        }

        class Obj2 extends Obj {
            @field(uint32)
            bar = 4;
        }

        const schema = Schema.Required(Obj2);

        const foo = schema.conformant.properties.for("foo");
        expect(foo).not.undefined;
        expect(foo!.base).equals(uint16);

        const bar = schema.get(FieldModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.base).equals(uint32);
    });

    it("creates list of struct", () => {
        class Item {
            @field(uint16)
            foo = 4;
        }

        class Container {
            @field(listOf(Item))
            items = Array<Item>;
        }

        const schema = Schema.Required(Container);

        const items = schema.get(FieldModel, "items");
        expect(items).not.undefined;

        const entry = items!.member("entry");
        expect(entry).not.undefined;
        expect(entry!.base).not.undefined;
        expect(entry!.base!.name).equals("Item");
    });
});
