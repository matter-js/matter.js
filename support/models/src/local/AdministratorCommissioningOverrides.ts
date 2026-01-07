/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CRYPTO_GROUP_SIZE_BYTES, CRYPTO_PUBLIC_KEY_SIZE_BYTES } from "@matter/general";
import { LocalMatter } from "../local.js";

const PAKE_PASSCODE_VERIFIER_LENGTH = CRYPTO_GROUP_SIZE_BYTES + CRYPTO_PUBLIC_KEY_SIZE_BYTES;

LocalMatter.children.push({
    tag: "cluster",
    name: "AdministratorCommissioning",

    children: [
        // Constrain length of OpenCommissioningWindow.PakePasscodeVerifier using formula defined in specification
        {
            tag: "command",
            id: 0,
            name: "OpenCommissioningWindow",

            children: [
                { tag: "field", id: 1, name: "PakePasscodeVerifier", constraint: PAKE_PASSCODE_VERIFIER_LENGTH },
            ],
        },
    ],
});
