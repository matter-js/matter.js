/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const ZoneManagement = Cluster(
    { name: "ZoneManagement", id: 0x550, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "TWODCART", conformance: "O", constraint: "0", title: "TwoDimensionalCartesianZone" }),
        Field({ name: "PERZONESENS", conformance: "[TWODCART]", constraint: "1", title: "PerZoneSensitivity" }),
        Field({ name: "USERDEFINED", conformance: "[TWODCART]", constraint: "2", title: "UserDefined" }),
        Field({ name: "FOCUSZONES", conformance: "[USERDEFINED]", constraint: "3", title: "FocusZones" })
    ),

    Attribute({
        name: "MaxUserDefinedZones", id: 0x0, type: "uint8", access: "R V", conformance: "USERDEFINED",
        constraint: "min 5", quality: "F"
    }),
    Attribute({ name: "MaxZones", id: 0x1, type: "uint8", access: "R V", conformance: "M", constraint: "min 1", quality: "F" }),

    Attribute(
        {
            name: "Zones", id: 0x2, type: "list", access: "R V", conformance: "M", constraint: "0 to maxZones",
            quality: "N"
        },
        Field({ name: "entry", type: "ZoneInformationStruct" })
    ),

    Attribute(
        {
            name: "Triggers", id: 0x3, type: "list", access: "R V", conformance: "M",
            constraint: "0 to maxZones", quality: "N"
        },
        Field({ name: "entry", type: "ZoneTriggerControlStruct" })
    ),

    Attribute({
        name: "SensitivityMax", id: 0x4, type: "uint8", access: "R V", conformance: "M",
        constraint: "2 to 10", quality: "F"
    }),
    Attribute({
        name: "Sensitivity", id: 0x5, type: "uint8", access: "RW VO", conformance: "!PERZONESENS",
        constraint: "1 to sensitivityMax", quality: "N"
    }),
    Attribute({
        name: "TwoDCartesianMax", id: 0x6, type: "TwoDCartesianVertexStruct", access: "R V",
        conformance: "TWODCART", quality: "F"
    }),
    Event(
        { name: "ZoneTriggered", id: 0x0, access: "V", conformance: "M", priority: "info" },
        Field({ name: "Zone", id: 0x0, type: "ZoneID", conformance: "M" }),
        Field({ name: "Reason", id: 0x1, type: "ZoneEventTriggeredReasonEnum", conformance: "M" })
    ),
    Event(
        { name: "ZoneStopped", id: 0x1, access: "V", conformance: "M", priority: "info" },
        Field({ name: "Zone", id: 0x0, type: "ZoneID", conformance: "M" }),
        Field({ name: "Reason", id: 0x1, type: "ZoneEventStoppedReasonEnum", conformance: "M" })
    ),

    Command(
        {
            name: "CreateTwoDCartesianZone", id: 0x0, access: "M", conformance: "TWODCART & USERDEFINED",
            direction: "request", response: "CreateTwoDCartesianZoneResponse"
        },
        Field({ name: "Zone", id: 0x0, type: "TwoDCartesianZoneStruct", conformance: "M" })
    ),

    Command(
        {
            name: "CreateTwoDCartesianZoneResponse", id: 0x1, conformance: "TWODCART & USERDEFINED",
            direction: "response"
        },
        Field({ name: "ZoneId", id: 0x0, type: "ZoneID", conformance: "M" })
    ),

    Command(
        {
            name: "UpdateTwoDCartesianZone", id: 0x2, access: "M", conformance: "TWODCART & USERDEFINED",
            direction: "request", response: "status"
        },
        Field({ name: "ZoneId", id: 0x0, type: "ZoneID", conformance: "M" }),
        Field({ name: "Zone", id: 0x1, type: "TwoDCartesianZoneStruct", conformance: "M" })
    ),

    Command(
        {
            name: "RemoveZone", id: 0x3, access: "M", conformance: "USERDEFINED", direction: "request",
            response: "status"
        },
        Field({ name: "ZoneId", id: 0x0, type: "ZoneID", conformance: "M" })
    ),

    Command(
        {
            name: "CreateOrUpdateTrigger", id: 0x4, access: "M", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "Trigger", id: 0x0, type: "ZoneTriggerControlStruct", conformance: "M" })
    ),

    Command(
        { name: "RemoveTrigger", id: 0x5, access: "M", conformance: "M", direction: "request", response: "status" },
        Field({ name: "ZoneId", id: 0x0, type: "ZoneID", conformance: "M" })
    ),
    Datatype({ name: "ZoneTypeEnum", type: "enum8" }, Field({ name: "TwoDcartZone", id: 0x0, conformance: "M" })),

    Datatype(
        { name: "ZoneUseEnum", type: "enum8" },
        Field({ name: "Motion", id: 0x0, conformance: "M" }),
        Field({ name: "Privacy", id: 0x1, conformance: "M" }),
        Field({ name: "Focus", id: 0x2, conformance: "FOCUSZONES" })
    ),

    Datatype(
        { name: "ZoneSourceEnum", type: "enum8" },
        Field({ name: "Mfg", id: 0x0, conformance: "M" }),
        Field({ name: "User", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "ZoneEventTriggeredReasonEnum", type: "enum8" },
        Field({ name: "Motion", id: 0x0, conformance: "M" })
    ),
    Datatype(
        { name: "ZoneEventStoppedReasonEnum", type: "enum8" },
        Field({ name: "ActionStopped", id: 0x0, conformance: "M" }),
        Field({ name: "Timeout", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "TwoDCartesianVertexStruct", type: "struct" },
        Field({ name: "X", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "Y", id: 0x1, type: "uint16", conformance: "M" })
    ),

    Datatype(
        { name: "TwoDCartesianZoneStruct", type: "struct" },
        Field({ name: "Name", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "Use", id: 0x1, type: "ZoneUseEnum", conformance: "M" }),
        Field(
            { name: "Vertices", id: 0x2, type: "list", conformance: "M", constraint: "3 to 12" },
            Field({ name: "entry", type: "TwoDCartesianVertexStruct" })
        ),
        Field({ name: "Color", id: 0x3, type: "string", conformance: "O", constraint: "7, 9" })
    ),

    Datatype(
        { name: "ZoneInformationStruct", type: "struct" },
        Field({ name: "ZoneId", id: 0x0, type: "ZoneID", conformance: "M" }),
        Field({ name: "ZoneType", id: 0x1, type: "ZoneTypeEnum", conformance: "M" }),
        Field({ name: "ZoneSource", id: 0x2, type: "ZoneSourceEnum", conformance: "M" }),
        Field({
            name: "TwoDCartesianZone", id: 0x3, type: "TwoDCartesianZoneStruct",
            conformance: "TWODCART & ZoneType == TwoDCARTZone"
        })
    ),

    Datatype(
        { name: "ZoneTriggerControlStruct", type: "struct" },
        Field({ name: "ZoneId", id: 0x0, type: "ZoneID", conformance: "M" }),
        Field({ name: "InitialDuration", id: 0x1, type: "elapsed-s", conformance: "M", constraint: "1 to 65535" }),
        Field({
            name: "AugmentationDuration", id: 0x2, type: "elapsed-s", conformance: "M",
            constraint: "max initialDuration"
        }),
        Field({ name: "MaxDuration", id: 0x3, type: "elapsed-s", conformance: "M", constraint: "min initialDuration" }),
        Field({ name: "BlindDuration", id: 0x4, type: "elapsed-s", conformance: "M" }),
        Field({ name: "Sensitivity", id: 0x5, type: "uint8", conformance: "PERZONESENS", constraint: "1 to sensitivityMax" })
    ),

    Datatype({ name: "ZoneID", type: "uint16" })
);

MatterDefinition.children.push(ZoneManagement);
