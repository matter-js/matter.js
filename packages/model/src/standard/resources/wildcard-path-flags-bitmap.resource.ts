/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "WildcardPathFlagsBitmap", xref: "core§8.9.2.5",
    details: "The WildcardPathFlagsBitmap indicates flags that apply to the path, affecting wildcard expansion. " +
        "The following flags are defined:",

    children: [
        {
            tag: "field", name: "WildcardSkipRootNode",
            description: "Skip the Root Node endpoint (endpoint 0) during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipGlobalAttributes",
            description: "Skip several large global attributes during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipAttributeList",
            description: "Skip the AttributeList global attribute during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipCommandLists",
            description: "Skip the AcceptedCommandList and GeneratedCommandList global attributes during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipCustomElements",
            description: "Skip any manufacturer-specific clusters or attributes during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipFixedAttributes",
            description: "Skip any Fixed (F) quality attributes during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipChangesOmittedAttributes",
            description: "Skip any Changes Omitted (C) quality attributes during wildcard expansion."
        },
        {
            tag: "field", name: "WildcardSkipDiagnosticsClusters",
            description: "Skip all clusters with the Diagnostics (K) quality during wildcard expansion."
        }
    ]
});
