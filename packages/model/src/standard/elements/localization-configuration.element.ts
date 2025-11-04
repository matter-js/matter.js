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
    FieldElement as Field
} from "../../elements/index.js";

export const LocalizationConfiguration = Cluster(
    { name: "LocalizationConfiguration", id: 0x2b, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "ActiveLocale", id: 0x0, type: "string", access: "RW VM", conformance: "M",
        constraint: "in SupportedLocales", quality: "N"
    }),

    Attribute(
        {
            name: "SupportedLocales", id: 0x1, type: "list", access: "R V", conformance: "M",
            constraint: "max 32[max 35]", quality: "F"
        },
        Field({ name: "entry", type: "string" })
    )
);

MatterDefinition.children.push(LocalizationConfiguration);
