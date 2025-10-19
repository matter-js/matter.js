/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Import from index to ensure correct initialization order
import { ClassSemantics } from "#decoration/semantics/index.js";

import { cluster } from "#decoration/decorators/cluster.js";
import { datatype } from "#decoration/decorators/datatype.js";
import { field } from "#decoration/decorators/field.js";
import { AttributeModel, ClusterModel, DatatypeModel, MetadataConflictError } from "#index.js";
import { FieldModel } from "#models/FieldModel.js";
import { Schema } from "#models/Schema.js";
import { any, locationdesc, string, struct, uint32, WindowCovering } from "#standard/elements/models.js";

describe("ClassSemantics", () => {
    describe("defines datatypes", () => {
        it("derived", () => {
            @datatype(locationdesc)
            class MyLocation {}

            const schema = Schema.Required(MyLocation);
            expect(schema).equals(locationdesc);
        });

        it("standalone", () => {
            @datatype()
            class MyState {}

            const schema = Schema.Required(MyState);
            expect(schema.tag).equals("datatype");
            expect(schema.name).equals("MyState");
            expect(schema.base).equals(struct);
        });
    });

    describe("defines clusters", () => {
        it("derived", () => {
            @cluster(WindowCovering)
            class MyWindowCoveringState {}

            const schema = Schema.Required(MyWindowCoveringState);
            expect(schema).equals(WindowCovering);
        });

        it("standalone", () => {
            @cluster(12)
            class MyState {}

            const schema = Schema.Required(MyState);
            expect(schema).not.undefined;
            expect(schema.tag).equals("cluster");
            expect(schema.name).equals("MyState");
            expect(schema.base).equals(struct);
            expect(schema.id).equals(12);
        });
    });

    describe("derived classes", () => {
        it("carries from base class", () => {
            @cluster(WindowCovering)
            class BasicBlinds {}

            @cluster()
            class OverengineeredBlinds extends BasicBlinds {}

            const schema = Schema.Required(OverengineeredBlinds);
            expect(schema.tag).equals("cluster");
            expect(schema.name).equals("OverengineeredBlinds");
        });

        it("merges with base class", () => {
            @cluster(WindowCovering)
            class BasicBlinds {}

            class OverengineeredBlinds extends BasicBlinds {
                @field(uint32)
                foo = 4;
            }

            const schema = Schema.Required(OverengineeredBlinds);
            expect(schema.tag).equals("cluster");
            expect(schema.name).equals("OverengineeredBlinds");

            const operationalStatus = schema.conformant.properties.for("operationalStatus");
            expect(operationalStatus).not.undefined;

            const foo = schema.conformant.properties.for("foo");
            expect(foo).not.undefined;
        });
    });

    it("extends with unknown fields but not known fields", () => {
        const BaseCluster = new ClusterModel({ id: 1, name: "Foo" }, new AttributeModel({ id: 2, name: "Baz" }));

        @cluster(BaseCluster)
        class Foo {
            @field()
            foo = 3;
        }

        @datatype()
        class Bar extends Foo {
            // Known via base class decorator
            override foo = 3;

            // Unknown - should be added
            bar = 4;

            // Known via base inheritance
            baz = 5;

            static [ClassSemantics.extend](decoration: ClassSemantics) {
                decoration.defineUnknownMembers(new Bar());
            }
        }

        const schema = Schema.Required(Bar);
        expect(schema.children.length).equals(1);
        const bar = schema.get(FieldModel, "bar");
        expect(bar).not.undefined;
        expect(bar!.base).equals(any);
    });

    describe("final base", () => {
        const frigid = new DatatypeModel({ name: "Frigid" }, new FieldModel({ name: "temp", type: "temperature" }));
        frigid.finalize();

        it("becomes identity without decoration", () => {
            @datatype(frigid)
            class Fridge {}

            expect(Schema(Fridge)).equals(frigid);
        });

        it("becomes base with decoration", () => {
            @datatype(frigid)
            class Fridge {
                @field(string)
                color = "white";
            }

            expect(Schema(Fridge)?.operationalBase).equals(frigid);
        });
    });

    describe("mutable model", () => {
        it("is available when not final", () => {
            @datatype()
            class Foo {}

            ClassSemantics.of(Foo).mutableModel;
        });

        it("is not available when final", () => {
            @datatype()
            class Foo {}

            Schema(Foo);

            expect(() => {
                ClassSemantics.of(Foo).mutableModel;
            }).throws(MetadataConflictError, "Cannot modify final semantics of Foo");
        });
    });

    describe("new field", () => {
        it("is possible when not final", () => {
            @datatype()
            class Foo {}

            ClassSemantics.of(Foo).fieldFor("hockey");
        });

        it("is not available when final", () => {
            @datatype()
            class Foo {}

            Schema(Foo);

            expect(() => {
                ClassSemantics.of(Foo).fieldFor("football");
            }).throws(MetadataConflictError, "Cannot install field football because semantics are final");
        });
    });
});
