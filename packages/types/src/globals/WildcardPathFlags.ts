/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BitFlag } from "../schema/BitmapSchema.js";

/**
 * The WildcardPathFlagsBitmap indicates flags that apply to the path, affecting wildcard expansion. The following flags
 * are defined:
 *
 * @see {@link MatterSpecification.v142.Core} § 8.9.2.5
 */
export const WildcardPathFlags = {
    /**
     * Skip the Root Node endpoint (endpoint 0) during wildcard expansion.
     */
    wildcardSkipRootNode: BitFlag(0),

    /**
     * Skip several large global attributes during wildcard expansion.
     */
    wildcardSkipGlobalAttributes: BitFlag(1),

    /**
     * Skip the AttributeList global attribute during wildcard expansion.
     */
    wildcardSkipAttributeList: BitFlag(2),

    doNotUse: BitFlag(3),

    /**
     * Skip the AcceptedCommandList and GeneratedCommandList global attributes during wildcard expansion.
     */
    wildcardSkipCommandLists: BitFlag(4),

    /**
     * Skip any manufacturer-specific clusters or attributes during wildcard expansion.
     */
    wildcardSkipCustomElements: BitFlag(5),

    /**
     * Skip any Fixed (F) quality attributes during wildcard expansion.
     */
    wildcardSkipFixedAttributes: BitFlag(6),

    /**
     * Skip any Changes Omitted (C) quality attributes during wildcard expansion.
     */
    wildcardSkipChangesOmittedAttributes: BitFlag(7),

    /**
     * Skip all clusters with the Diagnostics (K) quality during wildcard expansion.
     */
    wildcardSkipDiagnosticsClusters: BitFlag(8)
};
