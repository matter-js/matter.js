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

export const NetworkCommissioning = Cluster(
    { name: "NetworkCommissioning", id: 0x31 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "WI", conformance: "O.a", constraint: "0", title: "WiFiNetworkInterface" }),
        Field({ name: "TH", conformance: "O.a", constraint: "1", title: "ThreadNetworkInterface" }),
        Field({ name: "ET", conformance: "O.a", constraint: "2", title: "EthernetNetworkInterface" })
    ),

    Attribute({ name: "MaxNetworks", id: 0x0, type: "uint8", access: "R A", conformance: "M", constraint: "min 1", quality: "F" }),

    Attribute(
        {
            name: "Networks", id: 0x1, type: "list", access: "R A", conformance: "M",
            constraint: "max maxNetworks", default: []
        },
        Field({ name: "entry", type: "NetworkInfoStruct" })
    ),

    Attribute({
        name: "ScanMaxTimeSeconds", id: 0x2, type: "uint8", access: "R V", conformance: "WI | TH",
        constraint: "desc", quality: "F"
    }),
    Attribute({
        name: "ConnectMaxTimeSeconds", id: 0x3, type: "uint8", access: "R V", conformance: "WI | TH",
        constraint: "desc", quality: "F"
    }),
    Attribute({ name: "InterfaceEnabled", id: 0x4, type: "bool", access: "RW VA", conformance: "M", default: true, quality: "N" }),
    Attribute({
        name: "LastNetworkingStatus", id: 0x5, type: "NetworkCommissioningStatusEnum", access: "R A",
        conformance: "M", default: null, quality: "X"
    }),
    Attribute({
        name: "LastNetworkId", id: 0x6, type: "octstr", access: "R A", conformance: "M",
        constraint: "1 to 32", default: null, quality: "X"
    }),
    Attribute({
        name: "LastConnectErrorValue", id: 0x7, type: "int32", access: "R A", conformance: "M",
        default: null, quality: "X"
    }),

    Attribute(
        {
            name: "SupportedWiFiBands", id: 0x8, type: "list", access: "R V", conformance: "WI",
            constraint: "min 1", quality: "F"
        },
        Field({ name: "entry", type: "WiFiBandEnum" })
    ),

    Attribute({
        name: "SupportedThreadFeatures", id: 0x9, type: "ThreadCapabilitiesBitmap", access: "R V",
        conformance: "TH", quality: "F"
    }),
    Attribute({ name: "ThreadVersion", id: 0xa, type: "uint16", access: "R V", conformance: "TH", quality: "F" }),

    Command(
        {
            name: "ScanNetworks", id: 0x0, access: "A", conformance: "WI | TH", direction: "request",
            response: "ScanNetworksResponse"
        },
        Field({
            name: "Ssid", id: 0x0, type: "octstr", conformance: "[WI]", constraint: "1 to 32", default: null,
            quality: "X"
        }),
        Field({ name: "Breadcrumb", id: 0x1, type: "uint64", conformance: "O" })
    ),

    Command(
        { name: "ScanNetworksResponse", id: 0x1, conformance: "WI | TH", direction: "response" },
        Field({
            name: "NetworkingStatus", id: 0x0, type: "NetworkCommissioningStatusEnum", conformance: "M",
            constraint: "desc"
        }),
        Field({ name: "DebugText", id: 0x1, type: "string", conformance: "O", constraint: "max 512" }),
        Field(
            { name: "WiFiScanResults", id: 0x2, type: "list", conformance: "WI", constraint: "desc" },
            Field({ name: "entry", type: "WiFiInterfaceScanResultStruct" })
        ),
        Field(
            { name: "ThreadScanResults", id: 0x3, type: "list", conformance: "TH", constraint: "desc" },
            Field({ name: "entry", type: "ThreadInterfaceScanResultStruct" })
        )
    ),

    Command(
        {
            name: "AddOrUpdateWiFiNetwork", id: 0x2, access: "A", conformance: "WI", direction: "request",
            response: "NetworkConfigResponse"
        },
        Field({ name: "Ssid", id: 0x0, type: "octstr", conformance: "M", constraint: "max 32" }),
        Field({ name: "Credentials", id: 0x1, type: "octstr", conformance: "M", constraint: "max 64" }),
        Field({ name: "Breadcrumb", id: 0x2, type: "uint64", conformance: "O" })
    ),

    Command(
        {
            name: "AddOrUpdateThreadNetwork", id: 0x3, access: "A", conformance: "TH", direction: "request",
            response: "NetworkConfigResponse"
        },
        Field({ name: "OperationalDataset", id: 0x0, type: "octstr", conformance: "M", constraint: "max 254" }),
        Field({ name: "Breadcrumb", id: 0x1, type: "uint64", conformance: "O" })
    ),

    Command(
        {
            name: "RemoveNetwork", id: 0x4, access: "A", conformance: "WI | TH", direction: "request",
            response: "NetworkConfigResponse"
        },
        Field({ name: "NetworkId", id: 0x0, type: "octstr", conformance: "M", constraint: "1 to 32" }),
        Field({ name: "Breadcrumb", id: 0x1, type: "uint64", conformance: "O" })
    ),

    Command(
        { name: "NetworkConfigResponse", id: 0x5, conformance: "WI | TH", direction: "response" },
        Field({
            name: "NetworkingStatus", id: 0x0, type: "NetworkCommissioningStatusEnum", conformance: "M",
            constraint: "desc"
        }),
        Field({ name: "DebugText", id: 0x1, type: "string", conformance: "O", constraint: "max 512" }),
        Field({
            name: "NetworkIndex", id: 0x2, type: "uint8", conformance: "NetworkingStatus == Success",
            constraint: "max maxNetworks - 1"
        })
    ),

    Command(
        {
            name: "ConnectNetwork", id: 0x6, access: "A", conformance: "WI | TH", direction: "request",
            response: "ConnectNetworkResponse"
        },
        Field({ name: "NetworkId", id: 0x0, type: "octstr", conformance: "M", constraint: "1 to 32" }),
        Field({ name: "Breadcrumb", id: 0x1, type: "uint64", conformance: "O" })
    ),

    Command(
        { name: "ConnectNetworkResponse", id: 0x7, conformance: "WI | TH", direction: "response" },
        Field({ name: "NetworkingStatus", id: 0x0, type: "NetworkCommissioningStatusEnum", conformance: "M" }),
        Field({ name: "DebugText", id: 0x1, type: "string", conformance: "O" }),
        Field({ name: "ErrorValue", id: 0x2, type: "int32", conformance: "M", quality: "X" })
    ),

    Command(
        {
            name: "ReorderNetwork", id: 0x8, access: "A", conformance: "WI | TH", direction: "request",
            response: "NetworkConfigResponse"
        },
        Field({ name: "NetworkId", id: 0x0, type: "octstr", conformance: "M", constraint: "1 to 32" }),
        Field({ name: "NetworkIndex", id: 0x1, type: "uint8", conformance: "M", constraint: "desc" }),
        Field({ name: "Breadcrumb", id: 0x2, type: "uint64", conformance: "O" })
    ),

    Datatype(
        { name: "WiFiSecurityBitmap", type: "map8" },
        Field({ name: "Unencrypted", constraint: "0" }),
        Field({ name: "Wep", constraint: "1" }),
        Field({ name: "WpaPersonal", constraint: "2" }),
        Field({ name: "Wpa2Personal", constraint: "3" }),
        Field({ name: "Wpa3Personal", constraint: "4" })
    ),

    Datatype(
        { name: "ThreadCapabilitiesBitmap", type: "map16" },
        Field({ name: "IsBorderRouterCapable", constraint: "0" }),
        Field({ name: "IsRouterCapable", constraint: "1" }),
        Field({ name: "IsSleepyEndDeviceCapable", constraint: "2" }),
        Field({ name: "IsFullThreadDevice", constraint: "3" }),
        Field({ name: "IsSynchronizedSleepyEndDeviceCapable", constraint: "4" })
    ),

    Datatype(
        { name: "WiFiBandEnum", type: "enum8" },
        Field({ name: "2G4", id: 0x0, conformance: "O.b+" }),
        Field({ name: "3G65", id: 0x1, conformance: "O.b+" }),
        Field({ name: "5G", id: 0x2, conformance: "O.b+" }),
        Field({ name: "6G", id: 0x3, conformance: "O.b+" }),
        Field({ name: "60G", id: 0x4, conformance: "O.b+" }),
        Field({ name: "1G", id: 0x5, conformance: "O.b+" })
    ),

    Datatype(
        { name: "NetworkCommissioningStatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "OutOfRange", id: 0x1, conformance: "M" }),
        Field({ name: "BoundsExceeded", id: 0x2, conformance: "M" }),
        Field({ name: "NetworkIdNotFound", id: 0x3, conformance: "M" }),
        Field({ name: "DuplicateNetworkId", id: 0x4, conformance: "M" }),
        Field({ name: "NetworkNotFound", id: 0x5, conformance: "M" }),
        Field({ name: "RegulatoryError", id: 0x6, conformance: "M" }),
        Field({ name: "AuthFailure", id: 0x7, conformance: "M" }),
        Field({ name: "UnsupportedSecurity", id: 0x8, conformance: "M" }),
        Field({ name: "OtherConnectionFailure", id: 0x9, conformance: "M" }),
        Field({ name: "Ipv6Failed", id: 0xa, conformance: "M" }),
        Field({ name: "IpBindFailed", id: 0xb, conformance: "M" }),
        Field({ name: "UnknownError", id: 0xc, conformance: "M" })
    ),

    Datatype(
        { name: "NetworkInfoStruct", type: "struct" },
        Field({ name: "NetworkId", id: 0x0, type: "octstr", conformance: "M", constraint: "1 to 32" }),
        Field({ name: "Connected", id: 0x1, type: "bool", conformance: "M" })
    ),

    Datatype(
        { name: "WiFiInterfaceScanResultStruct", type: "struct" },
        Field({ name: "Security", id: 0x0, type: "WiFiSecurityBitmap", conformance: "WI" }),
        Field({ name: "Ssid", id: 0x1, type: "octstr", conformance: "WI", constraint: "max 32" }),
        Field({ name: "Bssid", id: 0x2, type: "octstr", conformance: "WI", constraint: "6" }),
        Field({ name: "Channel", id: 0x3, type: "uint16", conformance: "WI" }),
        Field({ name: "WiFiBand", id: 0x4, type: "WiFiBandEnum", conformance: "[WI]" }),
        Field({ name: "Rssi", id: 0x5, type: "int8", conformance: "[WI]" })
    ),

    Datatype(
        { name: "ThreadInterfaceScanResultStruct", type: "struct" },
        Field({ name: "PanId", id: 0x0, type: "uint16", conformance: "TH", constraint: "max 65534" }),
        Field({ name: "ExtendedPanId", id: 0x1, type: "uint64", conformance: "TH" }),
        Field({ name: "NetworkName", id: 0x2, type: "string", conformance: "TH", constraint: "1 to 16" }),
        Field({ name: "Channel", id: 0x3, type: "uint16", conformance: "TH" }),
        Field({ name: "Version", id: 0x4, type: "uint8", conformance: "TH" }),
        Field({ name: "ExtendedAddress", id: 0x5, type: "hwadr", conformance: "TH" }),
        Field({ name: "Rssi", id: 0x6, type: "int8", conformance: "TH" }),
        Field({ name: "Lqi", id: 0x7, type: "uint8", conformance: "TH" })
    )
);

MatterDefinition.children.push(NetworkCommissioning);
