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
    CommandElement as Command,
    FieldElement as Field
} from "../../elements/index.js";

export const WiFiNetworkManagement = Cluster(
    { name: "WiFiNetworkManagement", id: 0x451 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({ name: "Ssid", id: 0x0, type: "octstr", access: "R V", conformance: "M", constraint: "1 to 32", quality: "X N" }),
    Attribute({ name: "PassphraseSurrogate", id: 0x1, type: "uint64", access: "R M", conformance: "M", quality: "X N" }),
    Command({
        name: "NetworkPassphraseRequest", id: 0x0, access: "M", conformance: "M", direction: "request",
        response: "NetworkPassphraseResponse"
    }),
    Command(
        { name: "NetworkPassphraseResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Passphrase", id: 0x0, type: "octstr", conformance: "M", constraint: "max 64" })
    )
);

MatterDefinition.children.push(WiFiNetworkManagement);
