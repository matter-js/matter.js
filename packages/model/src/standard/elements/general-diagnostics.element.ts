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
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const GeneralDiagnostics = Cluster(
    { name: "GeneralDiagnostics", id: 0x33, quality: "K" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DMTEST", conformance: "desc", constraint: "0", title: "DataModelTest" })
    ),
    Attribute(
        { name: "NetworkInterfaces", id: 0x0, type: "list", access: "R V", conformance: "M", constraint: "max 8" },
        Field({ name: "entry", type: "NetworkInterface" })
    ),
    Attribute({ name: "RebootCount", id: 0x1, type: "uint16", access: "R V", conformance: "M", quality: "N" }),
    Attribute({ name: "UpTime", id: 0x2, type: "uint64", access: "R V", conformance: "M", quality: "C" }),
    Attribute({ name: "TotalOperationalHours", id: 0x3, type: "uint32", access: "R V", conformance: "O", quality: "N C" }),
    Attribute({ name: "BootReason", id: 0x4, type: "BootReasonEnum", access: "R V", conformance: "O" }),
    Attribute(
        { name: "ActiveHardwareFaults", id: 0x5, type: "list", access: "R V", conformance: "O", constraint: "max 11" },
        Field({ name: "entry", type: "HardwareFaultEnum" })
    ),
    Attribute(
        { name: "ActiveRadioFaults", id: 0x6, type: "list", access: "R V", conformance: "O", constraint: "max 7" },
        Field({ name: "entry", type: "RadioFaultEnum" })
    ),
    Attribute(
        { name: "ActiveNetworkFaults", id: 0x7, type: "list", access: "R V", conformance: "O", constraint: "max 4" },
        Field({ name: "entry", type: "NetworkFaultEnum" })
    ),
    Attribute({ name: "TestEventTriggersEnabled", id: 0x8, type: "bool", access: "R V", conformance: "M" }),
    Attribute({ name: "DoNotUse", id: 0x9, conformance: "X" }),

    Event(
        { name: "HardwareFaultChange", id: 0x0, access: "V", conformance: "O", priority: "critical" },
        Field(
            { name: "Current", id: 0x0, type: "list", conformance: "M", constraint: "max 11" },
            Field({ name: "entry", type: "HardwareFaultEnum" })
        ),
        Field(
            { name: "Previous", id: 0x1, type: "list", conformance: "M", constraint: "max 11" },
            Field({ name: "entry", type: "HardwareFaultEnum" })
        )
    ),

    Event(
        { name: "RadioFaultChange", id: 0x1, access: "V", conformance: "O", priority: "critical" },
        Field(
            { name: "Current", id: 0x0, type: "list", conformance: "M", constraint: "max 7" },
            Field({ name: "entry", type: "RadioFaultEnum" })
        ),
        Field(
            { name: "Previous", id: 0x1, type: "list", conformance: "M", constraint: "max 7" },
            Field({ name: "entry", type: "RadioFaultEnum" })
        )
    ),

    Event(
        { name: "NetworkFaultChange", id: 0x2, access: "V", conformance: "O", priority: "critical" },
        Field(
            { name: "Current", id: 0x0, type: "list", conformance: "M", constraint: "max 4" },
            Field({ name: "entry", type: "NetworkFaultEnum" })
        ),
        Field(
            { name: "Previous", id: 0x1, type: "list", conformance: "M", constraint: "max 4" },
            Field({ name: "entry", type: "NetworkFaultEnum" })
        )
    ),

    Event(
        { name: "BootReason", id: 0x3, access: "V", conformance: "M", priority: "critical" },
        Field({ name: "BootReason", id: 0x0, type: "BootReasonEnum", conformance: "M" })
    ),
    Command(
        { name: "TestEventTrigger", id: 0x0, access: "M", conformance: "M", direction: "request", response: "status" },
        Field({ name: "EnableKey", id: 0x0, type: "octstr", conformance: "M", constraint: "16" }),
        Field({ name: "EventTrigger", id: 0x1, type: "uint64", conformance: "M" })
    ),
    Command({
        name: "TimeSnapshot", id: 0x1, access: "O", conformance: "M", direction: "request",
        response: "TimeSnapshotResponse"
    }),
    Command(
        { name: "TimeSnapshotResponse", id: 0x2, conformance: "M", direction: "response" },
        Field({ name: "SystemTimeMs", id: 0x0, type: "systime-ms", conformance: "M" }),
        Field({ name: "PosixTimeMs", id: 0x1, type: "posix-ms", conformance: "M", default: null, quality: "X" })
    ),

    Command(
        {
            name: "PayloadTestRequest", id: 0x3, access: "M", conformance: "DMTEST", direction: "request",
            response: "PayloadTestResponse"
        },
        Field({ name: "EnableKey", id: 0x0, type: "octstr", conformance: "M", constraint: "16" }),
        Field({ name: "Value", id: 0x1, type: "uint8", conformance: "M" }),
        Field({ name: "Count", id: 0x2, type: "uint16", conformance: "M", constraint: "max 2048" })
    ),

    Command(
        { name: "PayloadTestResponse", id: 0x4, conformance: "DMTEST", direction: "response" },
        Field({ name: "Payload", id: 0x0, type: "octstr", conformance: "M", constraint: "max 2048" })
    ),

    Datatype(
        { name: "HardwareFaultEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "Radio", id: 0x1, conformance: "O" }),
        Field({ name: "Sensor", id: 0x2, conformance: "O" }),
        Field({ name: "ResettableOverTemp", id: 0x3, conformance: "O" }),
        Field({ name: "NonResettableOverTemp", id: 0x4, conformance: "O" }),
        Field({ name: "PowerSource", id: 0x5, conformance: "O" }),
        Field({ name: "VisualDisplayFault", id: 0x6, conformance: "O" }),
        Field({ name: "AudioOutputFault", id: 0x7, conformance: "O" }),
        Field({ name: "UserInterfaceFault", id: 0x8, conformance: "O" }),
        Field({ name: "NonVolatileMemoryError", id: 0x9, conformance: "O" }),
        Field({ name: "TamperDetected", id: 0xa, conformance: "O" })
    ),

    Datatype(
        { name: "RadioFaultEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "WiFiFault", id: 0x1, conformance: "O" }),
        Field({ name: "CellularFault", id: 0x2, conformance: "O" }),
        Field({ name: "ThreadFault", id: 0x3, conformance: "O" }),
        Field({ name: "NfcFault", id: 0x4, conformance: "O" }),
        Field({ name: "BleFault", id: 0x5, conformance: "O" }),
        Field({ name: "EthernetFault", id: 0x6, conformance: "O" })
    ),

    Datatype(
        { name: "NetworkFaultEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "HardwareFailure", id: 0x1, conformance: "O" }),
        Field({ name: "NetworkJammed", id: 0x2, conformance: "O" }),
        Field({ name: "ConnectionFailed", id: 0x3, conformance: "O" })
    ),

    Datatype(
        { name: "InterfaceTypeEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "WiFi", id: 0x1, conformance: "O" }),
        Field({ name: "Ethernet", id: 0x2, conformance: "O" }),
        Field({ name: "Cellular", id: 0x3, conformance: "O" }),
        Field({ name: "Thread", id: 0x4, conformance: "O" })
    ),

    Datatype(
        { name: "BootReasonEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "PowerOnReboot", id: 0x1, conformance: "M" }),
        Field({ name: "BrownOutReset", id: 0x2, conformance: "M" }),
        Field({ name: "SoftwareWatchdogReset", id: 0x3, conformance: "M" }),
        Field({ name: "HardwareWatchdogReset", id: 0x4, conformance: "M" }),
        Field({ name: "SoftwareUpdateCompleted", id: 0x5, conformance: "M" }),
        Field({ name: "SoftwareReset", id: 0x6, conformance: "M" })
    ),

    Datatype(
        { name: "NetworkInterface", type: "struct" },
        Field({ name: "Name", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "IsOperational", id: 0x1, type: "bool", conformance: "M" }),
        Field({
            name: "OffPremiseServicesReachableIPv4", id: 0x2, type: "bool", conformance: "M", default: null,
            quality: "X"
        }),
        Field({
            name: "OffPremiseServicesReachableIPv6", id: 0x3, type: "bool", conformance: "M", default: null,
            quality: "X"
        }),
        Field({ name: "HardwareAddress", id: 0x4, type: "hwadr", conformance: "M" }),
        Field(
            { name: "IPv4Addresses", id: 0x5, type: "list", conformance: "M", constraint: "max 4" },
            Field({ name: "entry", type: "ipv4adr" })
        ),
        Field(
            { name: "IPv6Addresses", id: 0x6, type: "list", conformance: "M", constraint: "max 8" },
            Field({ name: "entry", type: "ipv6adr" })
        ),
        Field({ name: "Type", id: 0x7, type: "InterfaceTypeEnum", conformance: "M" })
    )
);

MatterDefinition.children.push(GeneralDiagnostics);
