/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior, ClusterId, Identity, MaybePromise, VendorId } from "@matter/main";
import {
    AttributeElement,
    ClusterElement,
    ClusterModel,
    CommandElement,
    EventElement,
    FieldElement,
} from "@matter/main/model";
import {
    Attribute,
    ClusterRegistry,
    Command,
    Event,
    MutableCluster,
    Priority,
    TlvField,
    TlvInt16,
    TlvNullable,
    TlvObject,
    TlvString,
    TypeFromSchema,
} from "@matter/main/types";

/** Define the Cluster ID, custom clusters use a special extended formt that also contains the Vendor Id */
const myFancyClusterId = ClusterId.buildVendorSpecific(VendorId(0xfff4), 0xfc00);

/**
 * Defines the Cluster on Tlv Schema level in a special namespace structure to match the official cluster
 * structures of matter.js.
 * All places that contains "MyFancy..." belong to the custom cluster details, all rest can be left statically like the
 * given names.
 * For more examples and usages of features in such clusters and how the code should look then check the standard
 * cluster Tlv definitions in packages/matter.js/cluster/definitions/*
 */
export namespace MyFancyOwnFunctionality {
    /**
     * Input to the MyFancyOwnFunctionality myFancyCommand command
     */
    export const TlvMyFancyCommandRequest = TlvObject({ value: TlvField(0, TlvString) });

    /**
     * Response of the MyFancyOwnFunctionality myFancyCommand command
     */
    export const TlvMyFancyCommandResponse = TlvObject({ response: TlvField(0, TlvString) });

    /**
     * Event for the MyFancyOwnFunctionality myFancyEvent event
     */
    export const TlvMyFancyEvent = TlvObject({ eventValue: TlvField(0, TlvString) });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: myFancyClusterId,
        name: "MyFancyOwnFunctionality",
        revision: 1,

        attributes: {
            /** My fancy attribute */
            myFancyValue: Attribute(0x0, TlvNullable(TlvInt16)),
        },

        commands: {
            /** My fancy command */
            myFancyCommand: Command(0x1, TlvMyFancyCommandRequest, 0x2, TlvMyFancyCommandResponse),
        },

        events: {
            /** My fancy event */
            myFancyEvent: Event(0x5, Priority.Info, TlvMyFancyEvent),
        },
    });

    /**
     * My Fancy Cluster
     *
     * This cluster provides an interface to some fancy custom functions.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    export const Complete = Cluster;
}

export type MyFancyOwnFunctionalityCluster = MyFancyOwnFunctionality.Cluster;
export const MyFancyOwnFunctionalityCluster = MyFancyOwnFunctionality.Cluster;
ClusterRegistry.register(MyFancyOwnFunctionality.Complete);

/**
 * matter.js Model Schema for the cluster, need to match with the Tlv Schema above.
 * See more details in packages/matter.js/behavior/definitions/*
 */
const MyFancySchema = ClusterElement({
    name: "MyFancyOwnFunctionality",
    id: myFancyClusterId,
    classification: "application",
    description: "My Fancy Functionality",

    children: [
        AttributeElement({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

        AttributeElement({
            name: "MyFancyValue",
            id: 0x0,
            type: "int16",
            access: "R V",
            conformance: "M",
            quality: "X",
        }),

        CommandElement({
            name: "MyFancyCommand",
            id: 0x1,
            access: "O",
            conformance: "M",
            direction: "request",
            response: "MyFancyCommandResponse",

            children: [FieldElement({ name: "value", id: 0x0, type: "string", conformance: "M" })],
        }),
        CommandElement({
            name: "MyFancyCommandResponse",
            id: 0x2,
            conformance: "M",
            direction: "request",

            children: [FieldElement({ name: "response", id: 0x0, type: "string", conformance: "M" })],
        }),

        EventElement({
            name: "MyFancyEvent",
            id: 0x5,
            access: "V",
            conformance: "O",
            priority: "info",
            children: [
                FieldElement({
                    name: "EventValue",
                    id: 0x0,
                    type: "string",
                    conformance: "M",
                }),
            ],
        }),
    ],
});

/**
 * Interface definitions - exposes the Implementation interface for the cluster and some types to be used in the
 * cluster implementations.
 */
export type MyFancyCommandRequest = TypeFromSchema<typeof MyFancyOwnFunctionality.TlvMyFancyCommandRequest>;
export type MyFancyCommandResponse = TypeFromSchema<typeof MyFancyOwnFunctionality.TlvMyFancyCommandResponse>;
export type MyFancyEvent = TypeFromSchema<typeof MyFancyOwnFunctionality.TlvMyFancyEvent>;

export namespace MyFancyOwnFunctionalityInterface {
    export interface Base {
        myFancyCommand(request: MyFancyCommandRequest): MaybePromise<MyFancyCommandResponse>;
    }
}

export type MyFancyOwnFunctionalityInterface = {
    components: [{ flags: {}; methods: MyFancyOwnFunctionalityInterface.Base }];
};

/**
 * Behavior definition for the cluster command handler implementation
 */
export const MyFancyOwnFunctionalityBehavior = ClusterBehavior.withInterface<MyFancyOwnFunctionalityInterface>().for(
    MyFancyOwnFunctionality.Cluster,
    new ClusterModel(MyFancySchema),
);

type MyFancyOwnFunctionalityBehaviorType = InstanceType<typeof MyFancyOwnFunctionalityBehavior>;
export interface MyFancyOwnFunctionalityBehavior extends MyFancyOwnFunctionalityBehaviorType {}
type StateType = InstanceType<typeof MyFancyOwnFunctionalityBehavior.State>;
export namespace MyFancyOwnFunctionalityBehavior {
    export interface State extends StateType {}
}
