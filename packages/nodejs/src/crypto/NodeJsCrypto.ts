/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { nodeCryptoDefect, NodeJsStyleCrypto } from "@matter/general";
import * as crypto from "node:crypto";

/**
 * Node.js-based crypto implementation.
 */
export class NodeJsCrypto extends NodeJsStyleCrypto {
    /**
     * What Node.js's crypto module lacks in the current runtime, per {@link nodeCryptoDefect}, or undefined where it
     * offers the primitives that function probes.
     *
     * Probed on each read, because a process may change its cryptographic provider after the first.
     */
    static get defect() {
        return nodeCryptoDefect(crypto);
    }

    /**
     * Whether this process restricts its cryptographic provider, as FIPS mode does.
     *
     * An operator chooses that deliberately, so matter.js does not substitute its own implementation for one the
     * restriction rejects.
     */
    static get providerIsRestricted() {
        return Boolean(crypto.getFips?.());
    }

    constructor() {
        super(crypto);
    }
}
