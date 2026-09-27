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
        // The spec erroneously marks IsCommissioningWithoutPower as provisional ("P, O") since 1.6.0 and still does in
        // 1.6.1.  Drop the provisional flag until upstream corrects the conformance.
        {
            tag: "attribute",
            id: 0xc,
            name: "IsCommissioningWithoutPower",
            conformance: "O",
            asOf: "1.6",
            until: "1.7.0",
        },
    ],
});
