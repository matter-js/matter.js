/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Ensure the correct initialization order
import "#decoration/semantics/index.js";

import { attribute } from "#decoration/decorators/attribute.js";
import { command } from "#decoration/decorators/command.js";
import { datatype } from "#decoration/decorators/datatype.js";
import { field } from "#decoration/decorators/field.js";
import { listOf } from "#decoration/decorators/listOf.js";
import { nonvolatile } from "#decoration/decorators/nonvolatile.js";
import { nullable } from "#decoration/decorators/nullable.js";
import { response } from "#decoration/decorators/response.js";
import { writable } from "#decoration/index.js";
import { AttributeModel } from "#models/AttributeModel.js";
import { CommandModel, FieldModel } from "#models/index.js";
import { Schema } from "#models/Schema.js";
import { uint16, uint32, uint8 } from "#standard/elements/models.js";

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
        expect(bar!.access.readable).true;
        expect(bar!.access.writable).false;
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
        expect(bar!.access.readable).true;
        expect(bar!.access.writable).false;
    });

    it("sets writable", () => {
        class Foo {
            @attribute(0x1, uint32, writable)
            bar = 4;
        }

        const schema = Schema.Required(Foo);
        expect(schema.children.length).equals(1);
        const bar = schema.get(AttributeModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.quality.nullable).not.true;
        expect(bar!.quality.nonvolatile).not.true;
        expect(bar!.access.readable).true;
        expect(bar!.access.writable).true;
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

    it("sets command response", () => {
        class Worker {
            @command(1, uint8)
            @response(2, uint32)
            work() {}
        }

        const schema = Schema(Worker)!;
        expect(schema).not.undefined;
        expect(schema.children.length).equals(2);

        const work = schema.get(CommandModel, "work")!;
        expect(work).not.undefined;
        expect(work.id).equals(1);
        expect(work.name).equals("work");
        expect(work.isRequest).true;

        const rsp = work.responseModel!;
        expect(rsp).not.undefined;
        expect(rsp.id).equals(2);
        expect(rsp.name).equals("workResponse");
        expect(rsp.isResponse).true;
    });

    it("adds a command without response", () => {
        @datatype()
        class FooParameter {
            @field(listOf(uint32))
            list!: number[];
        }

        class Foo {
            @command(2, FooParameter)
            myMethod(_params: FooParameter) {}
        }

        const schema = Schema.Required(Foo);
        expect(schema.children.length).equals(1);
        const myMethod = schema.get(CommandModel, "myMethod");
        expect(myMethod).not.undefined;
        expect(myMethod!.name).equals("myMethod");
        expect(myMethod!.direction).is.undefined;
        expect(myMethod!.response).is.undefined;
        expect(myMethod!.id).equals(2);

        expect(myMethod!.responseModel).is.undefined;
    });
});
