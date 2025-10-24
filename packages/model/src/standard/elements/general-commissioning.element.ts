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

export const GeneralCommissioning = Cluster(
    { name: "GeneralCommissioning", id: 0x30 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "TC", conformance: "O", constraint: "0", title: "TermsAndConditions" })
    ),
    Attribute({ name: "Breadcrumb", id: 0x0, type: "uint64", access: "RW VA", conformance: "M", default: 0 }),
    Attribute({
        name: "BasicCommissioningInfo", id: 0x1, type: "BasicCommissioningInfo", access: "R V",
        conformance: "M", constraint: "desc", quality: "F"
    }),
    Attribute({
        name: "RegulatoryConfig", id: 0x2, type: "RegulatoryLocationTypeEnum", access: "R V",
        conformance: "M", default: { type: "reference", name: "LocationCapability" }
    }),
    Attribute({
        name: "LocationCapability", id: 0x3, type: "RegulatoryLocationTypeEnum", access: "R V",
        conformance: "M", default: 2, quality: "F"
    }),
    Attribute({
        name: "SupportsConcurrentConnection", id: 0x4, type: "bool", access: "R V", conformance: "M",
        default: true, quality: "F"
    }),
    Attribute({ name: "TcAcceptedVersion", id: 0x5, type: "uint16", access: "R A", conformance: "TC", quality: "N" }),
    Attribute({ name: "TcMinRequiredVersion", id: 0x6, type: "uint16", access: "R A", conformance: "TC", quality: "N" }),
    Attribute({ name: "TcAcknowledgements", id: 0x7, type: "map16", access: "R A", conformance: "TC", quality: "N" }),
    Attribute({
        name: "TcAcknowledgementsRequired", id: 0x8, type: "bool", access: "R A", conformance: "TC",
        default: true, quality: "N"
    }),
    Attribute({ name: "TcUpdateDeadline", id: 0x9, type: "uint32", access: "R A", conformance: "TC", quality: "X N" }),

    Command(
        {
            name: "ArmFailSafe", id: 0x0, access: "A", conformance: "M", direction: "request",
            response: "ArmFailSafeResponse"
        },
        Field({ name: "ExpiryLengthSeconds", id: 0x0, type: "uint16", conformance: "M", default: 900 }),
        Field({ name: "Breadcrumb", id: 0x1, type: "uint64", conformance: "M" })
    ),

    Command(
        { name: "ArmFailSafeResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "ErrorCode", id: 0x0, type: "CommissioningErrorEnum", conformance: "M", default: 0 }),
        Field({ name: "DebugText", id: 0x1, type: "string", conformance: "M", constraint: "max 128" })
    ),

    Command(
        {
            name: "SetRegulatoryConfig", id: 0x2, access: "A", conformance: "M", direction: "request",
            response: "SetRegulatoryConfigResponse"
        },
        Field({ name: "NewRegulatoryConfig", id: 0x0, type: "RegulatoryLocationTypeEnum", conformance: "M" }),
        Field({ name: "CountryCode", id: 0x1, type: "string", conformance: "M", constraint: "2" }),
        Field({ name: "Breadcrumb", id: 0x2, type: "uint64", conformance: "M" })
    ),

    Command(
        { name: "SetRegulatoryConfigResponse", id: 0x3, conformance: "M", direction: "response" },
        Field({ name: "ErrorCode", id: 0x0, type: "CommissioningErrorEnum", conformance: "M", default: 0 }),
        Field({ name: "DebugText", id: 0x1, type: "string", conformance: "M" })
    ),
    Command({
        name: "CommissioningComplete", id: 0x4, access: "F A", conformance: "M", direction: "request",
        response: "CommissioningCompleteResponse"
    }),
    Command(
        { name: "CommissioningCompleteResponse", id: 0x5, conformance: "M", direction: "response" },
        Field({ name: "ErrorCode", id: 0x0, type: "CommissioningErrorEnum", conformance: "M", default: 0 }),
        Field({ name: "DebugText", id: 0x1, type: "string", conformance: "M" })
    ),

    Command(
        {
            name: "SetTcAcknowledgements", id: 0x6, access: "A", conformance: "TC", direction: "request",
            response: "SetTcAcknowledgementsResponse"
        },
        Field({ name: "TcVersion", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "TcUserResponse", id: 0x1, type: "map16", conformance: "M" })
    ),

    Command(
        { name: "SetTcAcknowledgementsResponse", id: 0x7, conformance: "TC", direction: "response" },
        Field({ name: "ErrorCode", id: 0x0, type: "CommissioningErrorEnum", conformance: "M", default: 0 })
    ),

    Datatype(
        { name: "CommissioningErrorEnum", type: "enum8" },
        Field({ name: "Ok", id: 0x0, conformance: "M" }),
        Field({ name: "ValueOutsideRange", id: 0x1, conformance: "M" }),
        Field({ name: "InvalidAuthentication", id: 0x2, conformance: "M" }),
        Field({ name: "NoFailSafe", id: 0x3, conformance: "M" }),
        Field({ name: "BusyWithOtherAdmin", id: 0x4, conformance: "M" }),
        Field({ name: "RequiredTcNotAccepted", id: 0x5, conformance: "TC" }),
        Field({ name: "TcAcknowledgementsNotReceived", id: 0x6, conformance: "TC" }),
        Field({ name: "TcMinVersionNotMet", id: 0x7, conformance: "TC" })
    ),

    Datatype(
        { name: "RegulatoryLocationTypeEnum", type: "enum8" },
        Field({ name: "Indoor", id: 0x0, conformance: "M" }),
        Field({ name: "Outdoor", id: 0x1, conformance: "M" }),
        Field({ name: "IndoorOutdoor", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "BasicCommissioningInfo", type: "struct" },
        Field({ name: "FailSafeExpiryLengthSeconds", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "MaxCumulativeFailsafeSeconds", id: 0x1, type: "uint16", conformance: "M", constraint: "desc" })
    )
);

MatterDefinition.children.push(GeneralCommissioning);
