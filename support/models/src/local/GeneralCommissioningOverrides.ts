/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "GeneralCommissioning",

    children: [
        // The 1.6.0 spec erroneously marks IsCommissioningWithoutPower as provisional ("P, O").  Drop the provisional
        // flag.  Scoped to 1.6.0 only on the assumption upstream corrects the conformance in 1.6.1.  asOf is "1.6" not
        // "1.6.0" because the generated revision has its trailing ".0" trimmed and must match by string comparison.
        {
            tag: "attribute",
            id: 0xc,
            name: "IsCommissioningWithoutPower",
            conformance: "O",
            asOf: "1.6",
            until: "1.6.1",
        },
    ],
});
