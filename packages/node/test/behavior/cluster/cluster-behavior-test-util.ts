/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { ClusterTyping } from "@matter/types";
import {
    Attribute,
    ClusterType,
    Command,
    Event,
    OptionalAttribute,
    OptionalCommand,
    OptionalEvent,
    Priority,
    TlvArray,
    TlvBoolean,
    TlvByteString,
    TlvString,
    TlvUInt8,
} from "@matter/types";
import { My } from "./my-cluster.js";
import { MySchema } from "./my-schema.js";

export { My, MySchema };

export const MyCluster = My;
export type MyCluster = typeof My;

export interface MyClusterTyping extends ClusterTyping {
    Attributes: My.Attributes;
    Commands: My.Commands;
    Events: My.Events;
    Features: My.Features;
    Components: My.Components;
}

export const BaseBehavior = ClusterBehavior.for(My, MySchema);

export class MyBehavior extends BaseBehavior {}

/**
 * A plain immutable ClusterType for testing backward compatibility with legacy cluster definitions.
 */
export const MyObsoleteCluster = ClusterType({
    id: 0x1234_fc01,
    name: "MyCluster",
    revision: 1,

    attributes: {
        reqAttr: Attribute(1, TlvString, { default: "hello" }),
        optAttr: OptionalAttribute(2, TlvBoolean, { default: true }),
        condAttr: OptionalAttribute(12, TlvUInt8, { default: 4 }),
        condOptAttr1: OptionalAttribute(13, TlvUInt8, { default: 4 }),
        condOptAttr2: OptionalAttribute(14, TlvUInt8, { default: 4 }),
        optList: OptionalAttribute(20, TlvArray(TlvByteString.bound({ maxLength: 500 }))),
    },

    commands: {
        reqCmd: Command(5, TlvString, 5, TlvString),
        optCmd: OptionalCommand(6, TlvBoolean, 6, TlvBoolean),
    },

    events: {
        reqEv: Event(7, Priority.Critical, TlvString),
        optEv: OptionalEvent(8, Priority.Debug, TlvString),
    },
});

export const MyObsoleteBehavior = ClusterBehavior.for(MyObsoleteCluster, MySchema);
