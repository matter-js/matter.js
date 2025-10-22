/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Attribute,
    Command,
    Event,
    GlobalAttributes,
    OptionalAttribute,
    OptionalCommand,
    OptionalEvent,
} from "#cluster/Cluster.js";
import { ClusterType } from "#cluster/ClusterType.js";
import { ClusterTypeModifier } from "#cluster/mutation/ClusterTypeModifier.js";
import { Priority } from "#globals/Priority.js";
import { TlvBoolean } from "#tlv/TlvBoolean.js";
import { TlvUInt8 } from "#tlv/TlvNumber.js";
import { Elements1ish, TestBase, stripFunctions } from "./util.js";

describe("ElementModifier", () => {
    describe("alter", () => {
        it("enables and disables", () => {
            const cluster = ClusterType({
                id: 1,
                name: "Foo",
                revision: 4,

                attributes: {
                    foo: OptionalAttribute(3, TlvUInt8),
                    bar: Attribute(6, TlvUInt8),
                },
            });

            const alterations = {
                attributes: {
                    foo: {
                        optional: false,
                    },
                    bar: {
                        optional: true,
                    },
                },
            } as const;

            // Type: Alteration without optional flag
            type AlteredWithoutOptionalT = ClusterTypeModifier.WithAlterations<
                typeof cluster,
                { attributes: { foo: {} } }
            >;
            const alteredWithoutOptional = {} as AlteredWithoutOptionalT;
            alteredWithoutOptional satisfies typeof cluster;
            const awoFooOptional = {} as AlteredWithoutOptionalT["attributes"]["foo"]["optional"];
            awoFooOptional satisfies true;

            // Type: Entire alteration
            type AlteredT = ClusterTypeModifier.WithAlterations<typeof cluster, typeof alterations>;
            const altered = { attributes: {} } as AlteredT;
            altered.attributes satisfies {};
            altered.attributes.foo satisfies { optional: false };
            altered.attributes.bar satisfies { optional: true };

            // Functional
            const cluster2 = new ClusterTypeModifier(cluster).alter(alterations);
            expect(cluster.attributes.foo.optional).equal(true);
            cluster2.attributes.foo satisfies { optional: false };
            cluster2.attributes.bar satisfies { optional: true };
            expect(cluster2.attributes.foo.optional).equal(false);
        });

        it("handles empty element set alteration", () => {
            // Type: Altered with empty attribute modifications
            const emptyAttrs = {} as ClusterTypeModifier.WithAlterations<ClusterType, { attributes: {} }>;
            emptyAttrs satisfies ClusterType;

            // Type: Altered with empty command modifications
            const emptyCommands = {} as ClusterTypeModifier.WithAlterations<ClusterType, { commands: {} }>;
            emptyCommands satisfies ClusterType;

            // Type: Altered with empty command modifications
            const emptyEvents = {} as ClusterTypeModifier.WithAlterations<ClusterType, { commands: {} }>;
            emptyEvents satisfies ClusterType;
        });
    });

    describe("set", () => {
        it("has correct input values", () => {
            type IsNever<T> = [T] extends [never] ? true : false;

            // Test InputAttributeValues and constituents first as they are the key to set

            // Type: Test AttributesOf
            type Attrs = ClusterType.AttributesOf<ClusterType>;
            ({}) as IsNever<Attrs> satisfies false;
            ({}) as Attrs satisfies {};

            // Type: Test AttributeValues
            type Vals = ClusterType.AttributeValues<ClusterType>;
            ({}) as IsNever<Vals> satisfies false;
            ({}) as Vals satisfies {};
        });

        it("sets default value", () => {
            // Type: Value alterations
            type Alterations = ClusterTypeModifier.AttributeValueAlterations<{}>;
            const alterations = {} as Alterations;
            alterations satisfies { attributes: {} };

            // Type: Untyped cluster & empty values
            type UntypedEmpty = ClusterTypeModifier.WithValues<ClusterType, {}>;
            const untypedEmpty = {} as UntypedEmpty;
            untypedEmpty satisfies ClusterType;

            // Type: Untyped cluster
            type UntypedCluster = ClusterTypeModifier.WithValues<
                ClusterType,
                Partial<ClusterType.AttributeValues<ClusterType>>
            >;
            const untypedCluster = {} as UntypedCluster;
            untypedCluster satisfies ClusterType;

            // Type: Untyped values
            type UntypedValues = ClusterTypeModifier.WithValues<
                typeof TestBase,
                Partial<ClusterType.AttributeValues<typeof TestBase>>
            >;
            const untypedValues = {} as UntypedValues;
            untypedValues satisfies Elements1ish;

            // Type: Empty values
            type EmptyValues = ClusterTypeModifier.WithValues<typeof TestBase, {}>;
            const emptyValues = {} as EmptyValues;
            emptyValues satisfies Elements1ish;

            // Type: Fully specified
            type Set = ClusterTypeModifier.WithValues<typeof TestBase, { attr1: 4 }>;
            const set = {} as Set;
            set satisfies Elements1ish;

            // Functional: Generic cluster
            const generic = new ClusterTypeModifier({ attributes: {} } as ClusterType).set({});
            generic satisfies ClusterType;
            expect(generic.attributes).deep.equal({});

            // Functional: Empty attributes
            const empty = new ClusterTypeModifier(ClusterType({ id: 1, revision: 1, name: "One" })).set({});
            empty satisfies ClusterType;
            expect(stripFunctions(empty.attributes)).deep.equal(stripFunctions(GlobalAttributes({})));

            // Functional: With attribute
            const withAttr = new ClusterTypeModifier(TestBase).set({ attr1: 4 });
            expect(withAttr.attributes.attr1.default).equal(4);
        });
    });

    describe("enable", () => {
        it("disables", () => {
            const cluster = ClusterType({
                id: 1,
                revision: 1,
                name: "Foo",
                attributes: { attr: Attribute(1, TlvBoolean) },
                commands: { cmd: Command(1, TlvBoolean, 1, TlvBoolean) },
                events: { ev: Event(1, Priority.Debug, TlvBoolean) },
            });

            const flags = {
                attributes: { attr: false },
                commands: { cmd: false },
                events: { ev: false },
            } as const;

            type Altered = {
                attributes: { attr: OptionalAttribute<any, any> };
                commands: { cmd: OptionalCommand<any, any, any> };
                events: { ev: OptionalEvent<any, any> };
            };

            // Type: Flags to alterations
            type Alterations = ClusterTypeModifier.ElementFlagAlterations<typeof flags>;
            ({}) as Alterations satisfies {
                attributes: { attr: { optional: true } };
                commands: { cmd: { optional: true } };
                events: { ev: { optional: true } };
            };

            // Type: Fully specified
            type Enabled = ClusterTypeModifier.WithFlags<typeof cluster, typeof flags>;
            ({}) as Enabled satisfies Altered;

            // Functional
            const enabled = new ClusterTypeModifier(cluster).enable(flags);
            enabled satisfies Altered;
            expect(enabled.attributes.attr.optional).equal(true);
            expect(enabled.commands.cmd.optional).equal(true);
            expect(enabled.events.ev.optional).equal(true);
        });

        it("enables", () => {
            const cluster = ClusterType({
                id: 1,
                revision: 1,
                name: "Foo",
                attributes: { attr: OptionalAttribute(1, TlvBoolean) },
                commands: { cmd: OptionalCommand(1, TlvBoolean, 1, TlvBoolean) },
                events: { ev: OptionalEvent(1, Priority.Debug, TlvBoolean) },
            });

            const flags = {
                attributes: { attr: true },
                commands: { cmd: true },
                events: { ev: true },
            } as const;

            type Altered = {
                attributes: { attr: Attribute<any, any> };
                commands: { cmd: Command<any, any, any> };
                events: { ev: Event<any, any> };
            };

            // Type: Flags to alterations
            type Alterations = ClusterTypeModifier.ElementFlagAlterations<typeof flags>;
            ({}) as Alterations satisfies {
                attributes: { attr: { optional: false } };
                commands: { cmd: { optional: false } };
                events: { ev: { optional: false } };
            };

            // Type: Fully specified
            type Enabled = ClusterTypeModifier.WithFlags<typeof cluster, typeof flags>;
            ({}) as Enabled satisfies Altered;

            // Functional
            const disabled = new ClusterTypeModifier(cluster).enable(flags);
            disabled satisfies Altered;
            expect(disabled.attributes.attr.optional).equal(false);
            expect(disabled.commands.cmd.optional).equal(false);
            expect(disabled.events.ev.optional).equal(false);
        });
    });
});
