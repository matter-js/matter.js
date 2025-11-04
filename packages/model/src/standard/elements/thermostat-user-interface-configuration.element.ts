/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    DatatypeElement as Datatype,
    FieldElement as Field
} from "../../elements/index.js";

export const ThermostatUserInterfaceConfiguration = Cluster(
    { name: "ThermostatUserInterfaceConfiguration", id: 0x204, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute({ name: "TemperatureDisplayMode", id: 0x0, type: "TemperatureDisplayModeEnum", access: "RW VO", conformance: "M" }),
    Attribute({ name: "KeypadLockout", id: 0x1, type: "KeypadLockoutEnum", access: "RW VM", conformance: "M" }),
    Attribute({
        name: "ScheduleProgrammingVisibility", id: 0x2, type: "ScheduleProgrammingVisibilityEnum",
        access: "RW VM", conformance: "O", default: 0
    }),
    Datatype(
        { name: "TemperatureDisplayModeEnum", type: "enum8" },
        Field({ name: "Celsius", id: 0x0, conformance: "M" }),
        Field({ name: "Fahrenheit", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "KeypadLockoutEnum", type: "enum8" },
        Field({ name: "NoLockout", id: 0x0, conformance: "M" }),
        Field({ name: "Lockout1", id: 0x1, conformance: "M" }),
        Field({ name: "Lockout2", id: 0x2, conformance: "M" }),
        Field({ name: "Lockout3", id: 0x3, conformance: "M" }),
        Field({ name: "Lockout4", id: 0x4, conformance: "M" }),
        Field({ name: "Lockout5", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "ScheduleProgrammingVisibilityEnum", type: "enum8" },
        Field({ name: "ScheduleProgrammingPermitted", id: 0x0, conformance: "M" }),
        Field({ name: "ScheduleProgrammingDenied", id: 0x1, conformance: "M" })
    )
);

MatterDefinition.children.push(ThermostatUserInterfaceConfiguration);
