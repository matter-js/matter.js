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

export const EthernetNetworkDiagnostics = Cluster(
    { name: "EthernetNetworkDiagnostics", id: 0x37, classification: "node", quality: "K" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PKTCNT", constraint: "0", title: "PacketCounts" }),
        Field({ name: "ERRCNT", constraint: "1", title: "ErrorCounts" })
    ),
    Attribute(
        { name: "PhyRate", id: 0x0, type: "PHYRateEnum", access: "R V", conformance: "O", default: null, quality: "X" }
    ),
    Attribute({ name: "FullDuplex", id: 0x1, type: "bool", access: "R V", conformance: "O", default: null, quality: "X" }),
    Attribute({ name: "PacketRxCount", id: 0x2, type: "uint64", access: "R V", conformance: "PKTCNT", default: 0, quality: "C" }),
    Attribute({ name: "PacketTxCount", id: 0x3, type: "uint64", access: "R V", conformance: "PKTCNT", default: 0, quality: "C" }),
    Attribute(
        { name: "TxErrCount", id: 0x4, type: "uint64", access: "R V", conformance: "ERRCNT", default: 0, quality: "C" }
    ),
    Attribute({ name: "CollisionCount", id: 0x5, type: "uint64", access: "R V", conformance: "ERRCNT", default: 0, quality: "C" }),
    Attribute({ name: "OverrunCount", id: 0x6, type: "uint64", access: "R V", conformance: "ERRCNT", default: 0, quality: "C" }),
    Attribute({ name: "CarrierDetect", id: 0x7, type: "bool", access: "R V", conformance: "O", default: null, quality: "X C" }),
    Attribute(
        { name: "TimeSinceReset", id: 0x8, type: "uint64", access: "R V", conformance: "O", default: 0, quality: "C" }
    ),
    Command({
        name: "ResetCounts", id: 0x0, access: "M", conformance: "PKTCNT | ERRCNT", direction: "request",
        response: "status"
    }),

    Datatype(
        { name: "PHYRateEnum", type: "enum8" },
        Field({ name: "Rate10M", id: 0x0, conformance: "M" }),
        Field({ name: "Rate100M", id: 0x1, conformance: "M" }),
        Field({ name: "Rate1G", id: 0x2, conformance: "M" }),
        Field({ name: "Rate25G", id: 0x3, conformance: "M" }),
        Field({ name: "Rate5G", id: 0x4, conformance: "M" }),
        Field({ name: "Rate10G", id: 0x5, conformance: "M" }),
        Field({ name: "Rate40G", id: 0x6, conformance: "M" }),
        Field({ name: "Rate100G", id: 0x7, conformance: "M" }),
        Field({ name: "Rate200G", id: 0x8, conformance: "M" }),
        Field({ name: "Rate400G", id: 0x9, conformance: "M" })
    )
);

MatterDefinition.children.push(EthernetNetworkDiagnostics);
