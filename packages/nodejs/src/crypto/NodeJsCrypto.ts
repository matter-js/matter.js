/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsStyleCrypto } from "#general";
import * as crypto from "node:crypto";

/**
 * Node.js-based crypto implementation.
 */
export class NodeJsCrypto extends NodeJsStyleCrypto {
    constructor() {
        super(crypto);
    }
}
