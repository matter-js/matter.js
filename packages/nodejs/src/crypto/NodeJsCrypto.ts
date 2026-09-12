/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { nodeCryptoDefect, NodeJsStyleCrypto } from "@matter/general";
import * as crypto from "node:crypto";

let defect: string | undefined;
let probed = false;

/**
 * Node.js-based crypto implementation.
 */
export class NodeJsCrypto extends NodeJsStyleCrypto {
    /**
     * What Node.js's crypto module lacks in the current runtime, per {@link nodeCryptoDefect}, or undefined where it
     * offers the primitives that function probes.
     */
    static get defect() {
        if (!probed) {
            defect = nodeCryptoDefect(crypto);
            probed = true;
        }
        return defect;
    }

    constructor() {
        super(crypto);
    }
}
