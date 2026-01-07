/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BitFlag } from "../../schema/BitmapSchema.js";

/** @see {@link MatterSpecification.v13.Core} section XXX */

export const WildcardPathFlagsBitmap = {
    /** Skip the Root Node endpoint (endpoint 0) during wildcard expansion. */
    skipRootNode: BitFlag(0),

    /** Skip several large global attributes during wildcard expansion. */
    skipGlobalAttributes: BitFlag(1),

    /** Skip the AttributeList global attribute during wildcard expansion. */
    skipAttributeList: BitFlag(2),

    reserved1: BitFlag(3), // removed, so bit reserved

    /** Skip the AcceptedCommandList and GeneratedCommandList global attributes during wildcard expansion. */
    skipCommandLists: BitFlag(4),

    /** Skip any manufacturer-specific clusters or attributes during wildcard expansion. */
    skipCustomElements: BitFlag(5),

    /** Skip any Fixed (F) quality attributes during wildcard expansion. */
    skipFixedAttributes: BitFlag(6),

    /** Skip any Changes Omitted (C) quality attributes during wildcard expansion. */
    skipChangesOmittedAttributes: BitFlag(7),

    /** Skip all clusters with the Diagnostics (K) quality during wildcard expansion. */
    skipDiagnosticsClusters: BitFlag(8),
};
