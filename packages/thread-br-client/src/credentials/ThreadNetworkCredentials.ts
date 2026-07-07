/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "@matter/general";

/**
 * Credentials needed to authenticate against a Thread network's commissioner.
 *
 * Holds only what the diagnostic flow actually needs — the network key is
 * intentionally absent because nothing in this codebase ever sends or uses it,
 * keeping the blast radius of an in-memory leak as small as possible.
 */
export interface ThreadNetworkCredentials {
    /** 8-byte extended PAN ID — primary registry key. */
    extPanId: Bytes;
    /** Thread network name (UTF-8, ≤16 bytes). */
    networkName: string;
    /** 16-byte EC-JPAKE password (PSKc). Sensitive — redact when logging. */
    pskc: Bytes;
    /** 8-byte mesh-local prefix, used to derive node mesh-local addresses for
     *  UDP-proxy unicast diagnostics. Absent if the dataset omits it. */
    meshLocalPrefix?: Bytes;
    /** Active timestamp from the dataset, used for change detection. */
    activeTimestamp?: bigint;
}
