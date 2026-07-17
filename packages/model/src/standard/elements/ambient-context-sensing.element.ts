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
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const AmbientContextSensing = Cluster(
    { name: "AmbientContextSensing", id: 0x431, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "HA", conformance: "P, O.a+", constraint: "0", title: "HumanActivity" }),
        Field({ name: "OC", conformance: "P, O.a+", constraint: "1", title: "ObjectCounting" }),
        Field({ name: "OI", conformance: "P, O.a+", constraint: "2", title: "ObjectIdentification" }),
        Field({ name: "AUD", conformance: "P, O.a+", constraint: "3", title: "SoundIdentification" }),
        Field({ name: "PRED", conformance: "P, O", constraint: "4", title: "PredictedActivity" })
    ),

    Attribute({ name: "HumanActivityDetected", id: 0x0, type: "bool", access: "R V", conformance: "P, HA" }),
    Attribute({ name: "ObjectIdentified", id: 0x1, type: "bool", access: "R V", conformance: "P, OI" }),
    Attribute({ name: "AudioContextDetected", id: 0x2, type: "bool", access: "R V", conformance: "P, AUD" }),

    Attribute(
        {
            name: "AmbientContextType", id: 0x3, type: "list", access: "R V", conformance: "P, HA | OI | AUD",
            constraint: "1 to simultaneousDetectionLimit"
        },
        Field({ name: "entry", type: "AmbientContextTypeStruct" })
    ),

    Attribute(
        {
            name: "AmbientContextTypeSupported", id: 0x4, type: "list", access: "R V",
            conformance: "P, HA | OI | AUD", constraint: "max 50"
        },
        Field({ name: "entry", type: "ModeSelect.SemanticTagStruct" })
    ),

    Attribute({ name: "ObjectCountThresholdReached", id: 0x5, type: "bool", access: "R V", conformance: "P, OC & OI" }),
    Attribute({
        name: "ObjectCountConfig", id: 0x6, type: "ObjectCountConfigStruct", access: "RW VM",
        conformance: "P, OC & OI", quality: "N"
    }),
    Attribute({
        name: "ObjectCount", id: 0x7, type: "uint16", access: "R V", conformance: "P, [OC & OI]",
        constraint: "min 1", default: 0
    }),
    Attribute({
        name: "SimultaneousDetectionLimit", id: 0x8, type: "uint8", access: "R V", conformance: "P, M",
        constraint: "1 to 10", quality: "F"
    }),
    Attribute({
        name: "HoldTime", id: 0x9, type: "uint16", access: "RW VM", conformance: "P, M",
        constraint: "holdTimeLimits.holdTimeMin to holdTimeLimits.holdTimeMax", quality: "N"
    }),
    Attribute({ name: "HoldTimeLimits", id: 0xa, type: "HoldTimeLimitsStruct", access: "R V", conformance: "P, M", quality: "F" }),

    Attribute(
        {
            name: "PredictedActivity", id: 0xb, type: "list", access: "R V", conformance: "P, PRED",
            constraint: "max 20"
        },
        Field({ name: "entry", type: "PredictedActivityStruct" })
    ),

    Event(
        {
            name: "AmbientContextDetectStarted", id: 0x0, access: "V",
            conformance: "P, HA | OI | AUD | OC & OI", priority: "info"
        },
        Field({
            name: "AmbientContextDetected", id: 0x0, type: "AmbientContextTypeStruct",
            conformance: "P, HA | OI | OC | AUD"
        }),
        Field({ name: "ObjectCountThresholdReached", id: 0x1, type: "bool", conformance: "P, OC & OI" }),
        Field({
            name: "ObjectCount", id: 0x2, type: "uint16", conformance: "P, [OC & OI]", constraint: "min 1",
            default: null
        })
    ),

    Event(
        {
            name: "AmbientContextDetectEnded", id: 0x1, access: "V", conformance: "P, HA | OI | AUD | OC & OI",
            priority: "info"
        },
        Field({ name: "EventStartTimePos", id: 0x0, type: "posix-ms", conformance: "P, O.a" })
    ),

    Datatype(
        { name: "HoldTimeLimitsStruct", type: "struct" },
        Field({ name: "HoldTimeMin", id: 0x0, type: "uint16", conformance: "P, M", constraint: "min 1" }),
        Field({ name: "HoldTimeMax", id: 0x1, type: "uint16", conformance: "P, M", constraint: "min maxOf(holdTimeMin, 10)" }),
        Field({
            name: "HoldTimeDefault", id: 0x2, type: "uint16", conformance: "P, M",
            constraint: "holdTimeMin to holdTimeMax"
        })
    ),

    Datatype(
        { name: "AmbientContextTypeStruct", type: "struct" },
        Field(
            { name: "AmbientContextSensed", id: 0x0, type: "list", conformance: "P, M", constraint: "max 2" },
            Field({ name: "entry", type: "ModeSelect.SemanticTagStruct" })
        )
    ),

    Datatype(
        { name: "ObjectCountConfigStruct", type: "struct" },
        Field({ name: "CountingObject", id: 0x0, type: "ModeSelect.SemanticTagStruct", conformance: "P, M" }),
        Field({ name: "ObjectCountThreshold", id: 0x1, type: "uint16", conformance: "P, M", constraint: "min 1" })
    ),

    Datatype(
        { name: "PredictedActivityStruct", type: "struct" },
        Field({ name: "StartTimestamp", id: 0x0, type: "epoch-s", conformance: "P, M", constraint: "max endTimestamp - 1" }),
        Field({ name: "EndTimestamp", id: 0x1, type: "epoch-s", conformance: "P, M", constraint: "min startTimestamp + 1" }),

        Field(
            {
                name: "AmbientContextType", id: 0x2, type: "list", conformance: "P, HA | OI | AUD",
                constraint: "max 100"
            },
            Field({ name: "entry", type: "ModeSelect.SemanticTagStruct" })
        ),

        Field({ name: "CrowdDetected", id: 0x3, type: "bool", conformance: "P, OC" }),
        Field({ name: "CrowdCount", id: 0x4, type: "uint8", conformance: "P, [OC]", constraint: "1 to 254" }),
        Field({ name: "Confidence", id: 0x5, type: "percent", conformance: "P, M" })
    )
);

MatterDefinition.children.push(AmbientContextSensing);
