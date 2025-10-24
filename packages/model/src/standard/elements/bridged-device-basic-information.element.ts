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
    CommandElement as Command
} from "../../elements/index.js";

export const BridgedDeviceBasicInformation = Cluster(
    { name: "BridgedDeviceBasicInformation", id: 0x39, type: "BasicInformation" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 5 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "BIS", conformance: "O", constraint: "20", title: "BridgedIcdSupport" })
    ),
    Attribute({ name: "DataModelRevision", id: 0x0, conformance: "X" }),
    Attribute({ name: "VendorName", id: 0x1, conformance: "desc" }),
    Attribute({ name: "VendorId", id: 0x2, conformance: "desc" }),
    Attribute({ name: "ProductName", id: 0x3, conformance: "O" }),
    Attribute({ name: "ProductId", id: 0x4, conformance: "desc" }),
    Attribute({ name: "NodeLabel", id: 0x5, conformance: "O" }),
    Attribute({ name: "Location", id: 0x6, conformance: "X" }),
    Attribute({ name: "HardwareVersion", id: 0x7, conformance: "O" }),
    Attribute({ name: "HardwareVersionString", id: 0x8, conformance: "O" }),
    Attribute({ name: "SoftwareVersion", id: 0x9, conformance: "O" }),
    Attribute({ name: "SoftwareVersionString", id: 0xa, conformance: "O" }),
    Attribute({ name: "ManufacturingDate", id: 0xb, conformance: "O" }),
    Attribute({ name: "PartNumber", id: 0xc, conformance: "O" }),
    Attribute({ name: "ProductUrl", id: 0xd, conformance: "O" }),
    Attribute({ name: "ProductLabel", id: 0xe, conformance: "O" }),
    Attribute({ name: "SerialNumber", id: 0xf, conformance: "O" }),
    Attribute({ name: "LocalConfigDisabled", id: 0x10, conformance: "X" }),
    Attribute({ name: "Reachable", id: 0x11, conformance: "M" }),
    Attribute({ name: "UniqueId", id: 0x12, conformance: "M" }),
    Attribute({ name: "CapabilityMinima", id: 0x13, conformance: "X" }),
    Attribute({ name: "ProductAppearance", id: 0x14, conformance: "O" }),
    Attribute({ name: "SpecificationVersion", id: 0x15, conformance: "X" }),
    Attribute({ name: "MaxPathsPerInvoke", id: 0x16, conformance: "X" }),
    Attribute({ name: "ConfigurationVersion", id: 0x18, conformance: "P, O" }),
    Event({ name: "StartUp", id: 0x0, conformance: "O", priority: "critical" }),
    Event({ name: "ShutDown", id: 0x1, conformance: "O", priority: "critical" }),
    Event(
        { name: "Leave", id: 0x2, conformance: "O", priority: "critical" },
        Field({ name: "FabricIndex", id: 0x0, conformance: "X" })
    ),
    Event({ name: "ReachableChanged", id: 0x3, conformance: "M", priority: "critical" }),
    Event(
        { name: "ActiveChanged", id: 0x80, access: "V", conformance: "BIS", priority: "info" },
        Field({ name: "PromisedActiveDuration", id: 0x0, type: "uint32", conformance: "M", constraint: "desc" })
    ),
    Command(
        { name: "KeepActive", id: 0x80, access: "O", conformance: "BIS", direction: "request", response: "status" },
        Field({ name: "StayActiveDuration", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "TimeoutMs", id: 0x1, type: "uint32", conformance: "M", constraint: "30000 to 3600000" })
    )
);

MatterDefinition.children.push(BridgedDeviceBasicInformation);
