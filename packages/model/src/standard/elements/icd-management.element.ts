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
    FieldElement as Field,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const IcdManagement = Cluster(
    { name: "IcdManagement", id: 0x46, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CIP", conformance: "LITS, O", constraint: "0", title: "CheckInProtocolSupport" }),
        Field({ name: "UAT", conformance: "LITS, O", constraint: "1", title: "UserActiveModeTrigger" }),
        Field({ name: "LITS", conformance: "O", constraint: "2", title: "LongIdleTimeSupport" }),
        Field({ name: "DSLS", conformance: "[LITS]", constraint: "3", title: "DynamicSitLitSupport" })
    ),

    Attribute({
        name: "IdleModeDuration", id: 0x0, type: "uint32", access: "R V", conformance: "M",
        constraint: "1 to 64800", default: 1, quality: "F"
    }),
    Attribute({
        name: "ActiveModeDuration", id: 0x1, type: "uint32", access: "R V", conformance: "M", default: 300,
        quality: "F"
    }),
    Attribute({
        name: "ActiveModeThreshold", id: 0x2, type: "uint16", access: "R V", conformance: "M", default: 300,
        quality: "F"
    }),

    Attribute(
        {
            name: "RegisteredClients", id: 0x3, type: "list", access: "R F A", conformance: "CIP",
            constraint: "desc", default: [], quality: "N"
        },
        Field({ name: "entry", type: "MonitoringRegistrationStruct" })
    ),

    Attribute(
        { name: "IcdCounter", id: 0x4, type: "uint32", access: "R A", conformance: "CIP", default: 0, quality: "N C" }
    ),
    Attribute({
        name: "ClientsSupportedPerFabric", id: 0x5, type: "uint16", access: "R V", conformance: "CIP",
        constraint: "min 1", default: 1, quality: "F"
    }),
    Attribute({
        name: "UserActiveModeTriggerHint", id: 0x6, type: "UserActiveModeTriggerBitmap", access: "R V",
        conformance: "UAT", constraint: "desc", default: 0, quality: "F"
    }),
    Attribute({
        name: "UserActiveModeTriggerInstruction", id: 0x7, type: "string", access: "R V",
        conformance: "desc", constraint: "max 128", quality: "F"
    }),
    Attribute({ name: "OperatingMode", id: 0x8, type: "OperatingModeEnum", access: "R V", conformance: "LITS" }),
    Attribute({
        name: "MaximumCheckInBackoff", id: 0x9, type: "uint32", access: "R V", conformance: "CIP",
        constraint: "idleModeDuration to 64800", default: 1, quality: "F"
    }),

    Command(
        {
            name: "RegisterClient", id: 0x0, access: "F M", conformance: "CIP", direction: "request",
            response: "RegisterClientResponse"
        },
        Field({ name: "CheckInNodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "MonitoredSubject", id: 0x1, type: "subject-id", conformance: "M" }),
        Field({ name: "Key", id: 0x2, type: "octstr", conformance: "M", constraint: "16" }),
        Field({ name: "VerificationKey", id: 0x3, type: "octstr", conformance: "O", constraint: "16" }),
        Field({ name: "ClientType", id: 0x4, type: "ClientTypeEnum", conformance: "M" })
    ),

    Command(
        { name: "RegisterClientResponse", id: 0x1, conformance: "CIP", direction: "response" },
        Field({ name: "IcdCounter", id: 0x0, type: "uint32", conformance: "M" })
    ),

    Command(
        {
            name: "UnregisterClient", id: 0x2, access: "F M", conformance: "CIP", direction: "request",
            response: "status"
        },
        Field({ name: "CheckInNodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "VerificationKey", id: 0x1, type: "octstr", conformance: "O", constraint: "16" })
    ),

    Command(
        {
            name: "StayActiveRequest", id: 0x3, access: "O", conformance: "LITS, O", direction: "request",
            response: "StayActiveResponse"
        },
        Field({ name: "StayActiveDuration", id: 0x0, type: "uint32", conformance: "M" })
    ),

    Command(
        { name: "StayActiveResponse", id: 0x4, conformance: "LITS, O", direction: "response" },
        Field({ name: "PromisedActiveDuration", id: 0x0, type: "uint32", conformance: "M", constraint: "desc" })
    ),

    Datatype(
        { name: "UserActiveModeTriggerBitmap", type: "map32" },
        Field({ name: "PowerCycle", constraint: "0" }),
        Field({ name: "SettingsMenu", constraint: "1" }),
        Field({ name: "CustomInstruction", constraint: "2" }),
        Field({ name: "DeviceManual", constraint: "3" }),
        Field({ name: "ActuateSensor", constraint: "4" }),
        Field({ name: "ActuateSensorSeconds", constraint: "5" }),
        Field({ name: "ActuateSensorTimes", constraint: "6" }),
        Field({ name: "ActuateSensorLightsBlink", constraint: "7" }),
        Field({ name: "ResetButton", constraint: "8" }),
        Field({ name: "ResetButtonLightsBlink", constraint: "9" }),
        Field({ name: "ResetButtonSeconds", constraint: "10" }),
        Field({ name: "ResetButtonTimes", constraint: "11" }),
        Field({ name: "SetupButton", constraint: "12" }),
        Field({ name: "SetupButtonSeconds", constraint: "13" }),
        Field({ name: "SetupButtonLightsBlink", constraint: "14" }),
        Field({ name: "SetupButtonTimes", constraint: "15" }),
        Field({ name: "AppDefinedButton", constraint: "16" })
    ),

    Datatype(
        { name: "ClientTypeEnum", type: "enum8" },
        Field({ name: "Permanent", id: 0x0, conformance: "M" }),
        Field({ name: "Ephemeral", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "OperatingModeEnum", type: "enum8" },
        Field({ name: "Sit", id: 0x0, conformance: "M" }),
        Field({ name: "Lit", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "MonitoringRegistrationStruct", type: "struct" },
        Field({ name: "CheckInNodeId", id: 0x1, type: "node-id", access: "S", conformance: "M", quality: "N" }),
        Field({ name: "MonitoredSubject", id: 0x2, type: "subject-id", access: "S", conformance: "M", quality: "N" }),
        Field({ name: "Key", id: 0x3, access: "F", conformance: "D" }),
        Field({
            name: "ClientType", id: 0x4, type: "ClientTypeEnum", access: "S", conformance: "M", default: 0,
            quality: "N"
        }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(IcdManagement);
