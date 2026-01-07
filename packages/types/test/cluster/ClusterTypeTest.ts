/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Attribute, Cluster, OptionalAttribute, OptionalCommand, OptionalEvent } from "#cluster/Cluster.js";
import { ClusterType } from "#cluster/ClusterType.js";
import { Branded } from "#general";
import { Priority } from "#globals/Priority.js";
import { TlvNumberSchema, TlvUInt8 } from "#tlv/TlvNumber.js";
import { TlvSchema } from "#tlv/TlvSchema.js";
import { stripFunctions } from "./mutation/util.js";

const BaseFoo = {
    id: 1,
    name: "Foo",
    revision: 1,

    attributes: {
        attr: OptionalAttribute(2, TlvUInt8),
    },

    commands: {
        cmd: OptionalCommand(3, TlvUInt8, 3, TlvUInt8),
    },

    events: {
        ev: OptionalEvent(4, Priority.Debug, TlvUInt8),
    },
} as const;

const FooCluster = ClusterType(BaseFoo);
type FooCluster = typeof FooCluster;

type SatisfactoryFoo = {
    id: Branded<1, "ClusterId">;
    name: "Foo";
    revision: 1;

    attributes: {
        attr: {
            //id: Branded<2, "AttributeId">,
            schema: TlvSchema<number>;
            optional: true;
        };
    };

    commands: {
        cmd: {
            //requestId: Branded<3, "CommandId">,
            requestSchema: TlvSchema<number>;
            //responseId: Branded<3, "CommandId">,
            responseSchema: TlvSchema<number>;
            optional: true;
        };
    };

    events: {
        ev: {
            //id: Branded<4, "EventId">,
            //priority: Priority.Debug,
            schema: TlvSchema<number>;
            optional: true;
        };
    };
};

type IsNever<T> = [T] extends [never] ? true : false;
type EmptyObject = Record<string, never>;

describe("ClusterType", () => {
    describe("factory", () => {
        it("agrees with Cluster", () => {
            const clusterCluster = Cluster(BaseFoo);
            FooCluster satisfies typeof clusterCluster;

            const expected = stripFunctions(clusterCluster);
            const actual = stripFunctions(FooCluster);

            // Test some fields individually to make it easier to diagnose conflicts with no visual changes

            for (const key in clusterCluster.attributes) {
                expect(actual.attributes[key]).deep.equal(expected.attributes[key]);
            }

            for (const key in clusterCluster) {
                expect(actual[key]).deep.equal(expected[key]);
            }

            expect(actual).deep.equal(expected);
        });

        it("type defines correctly", () => {
            ({}) as FooCluster satisfies SatisfactoryFoo;
        });

        it("factory defines correctly", () => {
            ({}) as FooCluster satisfies SatisfactoryFoo;

            expect(FooCluster.id).equal(1);
            expect(FooCluster.name).equal("Foo");
            expect(FooCluster.revision).equal(1);
            expect(FooCluster.attributes.attr.id).equal(2);
            expect(FooCluster.attributes.attr.schema).instanceof(TlvNumberSchema);
        });
    });

    describe("element type extraction", () => {
        describe("works for attributes", () => {
            type Attrs = ClusterType.AttributesOf<FooCluster>;
            ({}) as IsNever<Attrs> satisfies false;
            ({}) as Attrs satisfies { attr: { schema: TlvSchema<number> } };
            ({}) as Omit<Attrs, "attr"> satisfies EmptyObject;
        });

        describe("works for commands", () => {
            type Commands = ClusterType.CommandsOf<FooCluster>;
            ({}) as IsNever<Commands> satisfies false;
            ({}) as Commands satisfies { cmd: { requestSchema: TlvSchema<number>; responseSchema: TlvSchema<number> } };
            ({}) as Omit<Commands, "cmd"> satisfies EmptyObject;
        });

        describe("works for events", () => {
            type Events = ClusterType.EventsOf<FooCluster>;
            ({}) as IsNever<Events> satisfies false;
            ({}) as Events satisfies { ev: { schema: TlvSchema<number> } };
            ({}) as Omit<Events, "ev"> satisfies EmptyObject;
        });

        describe("works for ClusterType attributes", () => {
            type Attrs = ClusterType.AttributesOf<ClusterType>;
            ({}) as IsNever<Attrs> satisfies false;
            ({}) as Attrs satisfies EmptyObject;
        });

        describe("works for ClusterType commands", () => {
            type Commands = ClusterType.CommandsOf<ClusterType>;
            ({}) as IsNever<Commands> satisfies false;
            ({}) as Commands satisfies EmptyObject;
        });

        describe("works for ClusterType events", () => {
            type Events = ClusterType.EventsOf<ClusterType>;
            ({}) as IsNever<Events> satisfies false;
            ({}) as Events satisfies EmptyObject;
        });
    });

    describe("attribute values", () => {
        describe("works for attributes", () => {
            type Vals = ClusterType.AttributeValues<
                FooCluster & {
                    attributes: {
                        req: Attribute<number, {}>;
                    };
                }
            >;
            ({}) as IsNever<Vals> satisfies false;
            ({}) as Vals satisfies { attr?: number; req: number };
            ({}) as Omit<Vals, "attr" | "req"> satisfies EmptyObject;
        });

        describe("works for input attributes", () => {
            type Vals = ClusterType.AttributeValues<
                FooCluster & {
                    attributes: {
                        req: Attribute<number, {}>;
                    };
                }
            >;
            ({}) as IsNever<Vals> satisfies false;
            ({}) as Vals satisfies { attr?: number; req?: number };
            ({}) as Omit<Vals, "attr" | "req"> satisfies EmptyObject;
        });

        describe("works for ClusterType", () => {
            type Vals = ClusterType.AttributeValues<ClusterType>;
            ({}) as IsNever<Vals> satisfies false;
            ({}) as Vals satisfies EmptyObject;
        });
    });
});
