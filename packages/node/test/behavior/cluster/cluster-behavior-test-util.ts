/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { MaybePromise } from "#general";
import { AttributeElement, ClusterModel, CommandElement, EventElement, FieldElement } from "#model";
import {
    Attribute,
    BitFlag,
    Command,
    Event,
    MutableCluster,
    OptionalAttribute,
    OptionalCommand,
    OptionalEvent,
    Priority,
    TlvBoolean,
    TlvNoResponse,
    TlvString,
    TlvUInt8,
} from "#types";

export namespace My {
    export enum Feature {
        Awesome = "Awesome",
    }

    export const AwesomeComponent = MutableCluster.Component({
        attributes: {
            awesomeSauce: Attribute(9, TlvUInt8),
        },

        commands: {
            becomeAwesome: Command(10, TlvUInt8, 10, TlvNoResponse),
        },

        events: {
            becameAwesome: Event(11, Priority.Info, TlvUInt8),
        },
    });

    export const Base = MutableCluster.Component({
        id: 1,
        revision: 1,
        name: "MyCluster",

        features: {
            awesome: BitFlag(0),
        },

        // Note -- not a good way to test it automatically but including comments inline below so we can manually
        // confirm that types are homomorphic and thus convey comments and code location

        attributes: {
            /** This attribute is required */
            reqAttr: Attribute(1, TlvString, { default: "hello" }),

            /** This attribute is optional */
            optAttr: OptionalAttribute(2, TlvBoolean, { default: true }),

            /** This attribute is conditionally mandatory */
            condAttr: OptionalAttribute(12, TlvUInt8, { default: 4 }),

            /** This attribute is conditionally optional */
            condOptAttr1: OptionalAttribute(13, TlvUInt8, { default: 4 }),

            /** This attribute is conditionally optional */
            condOptAttr2: OptionalAttribute(14, TlvUInt8, { default: 4 }),
        },

        commands: {
            /** This command is required */
            reqCmd: Command(5, TlvString, 5, TlvString),

            /** This command is optional */
            optCmd: OptionalCommand(6, TlvBoolean, 6, TlvBoolean),
        },

        events: {
            /** This event is required */
            reqEv: Event(7, Priority.Critical, TlvString),

            /** This event is optional */
            optEv: OptionalEvent(8, Priority.Debug, TlvString),
        },

        extensions: MutableCluster.Extensions({ flags: { awesome: true }, component: AwesomeComponent }),
    });

    export const Cluster = MutableCluster(Base);
}

export const MyCluster = My.Cluster;
export type MyCluster = typeof MyCluster;

export const MySchema = new ClusterModel({
    id: 1,
    name: "MyCluster",

    children: [
        AttributeElement({ id: 1, name: "ReqAttr", type: "string", conformance: "M", default: "hello" }),
        AttributeElement({ id: 2, name: "OptAttr", type: "bool", conformance: "O", default: true }),
        CommandElement({ id: 5, name: "ReqCmd", response: "ReqResponse", type: "string", conformance: "M" }),
        CommandElement({ id: 5, name: "ReqResponse", direction: "response", type: "string", conformance: "M" }),
        CommandElement({ id: 6, name: "OptCmd", response: "ReqResponse", type: "string", conformance: "O" }),
        CommandElement({ id: 6, name: "OptResponse", direction: "response", type: "string", conformance: "O" }),
        EventElement({ id: 7, name: "ReqEv", priority: "critical", type: "string", conformance: "M" }),
        EventElement({ id: 8, name: "OptEv", priority: "debug", type: "string", conformance: "O" }),

        AttributeElement(
            {
                name: "FeatureMap",
                id: 0xfffc,
                type: "FeatureMap",
            },

            FieldElement({
                name: "AWE",
                constraint: "0",
                description: "Awesome",
                details: "That which makes me more awesome.",
            }),
        ),

        AttributeElement({ id: 9, name: "AwesomeSauce", conformance: "AWE", type: "uint8" }),
        CommandElement({ id: 10, name: "BecomeAwesome", conformance: "AWE", type: "uint8" }),
        EventElement({ id: 11, name: "BecameAwesome", conformance: "AWE", type: "uint8", priority: "info" }),
        AttributeElement({ id: 12, name: "CondAttr", conformance: "OptAttr", type: "uint8", default: 4 }),
        AttributeElement({ id: 13, name: "CondOptAttr1", conformance: "[OptAttr]", type: "uint8", default: 4 }),
        AttributeElement({
            id: 14,
            name: "CondOptAttr2",
            conformance: "[CondOptAttr2 > 4]",
            type: "uint8",
            default: 4,
        }),
    ],
});

interface MyClusterBaseInterface {
    reqCmd(request: string): MaybePromise<string>;
    optCmd(request: boolean): MaybePromise<boolean>;
}

interface MyClusterAwesomeInterface {
    becomeAwesome(request: number): MaybePromise;
}

interface MyClusterInterface {
    components: [
        {
            flags: {};
            methods: MyClusterBaseInterface;
        },

        {
            flags: { awesome: true };
            methods: MyClusterAwesomeInterface;
        },
    ];
}

export const BaseBehavior = ClusterBehavior.withInterface<MyClusterInterface>().for(MyCluster, MySchema);

export class MyBehavior extends BaseBehavior {}
