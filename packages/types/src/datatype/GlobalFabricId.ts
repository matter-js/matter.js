/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, Bytes, hex } from "#general";
import type { FabricId } from "./FabricId.js";

/**
 * An ID that identifies a fabric globally.
 *
 * This ID is computed by hashing the {@link FabricId} with the fabric CA's public key.  The spec calls it a "compressed
 * fabric ID" to differentiate from the full "uncompressed" CA key + fabric ID.
 *
 * @see {@link MatterSpecification.v14.Core} § 4.3.2.2
 */
export type GlobalFabricId = Branded<bigint, "CompressedFabricId">;

export function GlobalFabricId(value: Parameters<typeof BigInt>[0] | Bytes): GlobalFabricId {
    if (Bytes.isBytes(value)) {
        return Bytes.asBigInt(value) as GlobalFabricId;
    }

    return BigInt(value) as GlobalFabricId;
}

export namespace GlobalFabricId {
    export function strOf(id: GlobalFabricId) {
        return hex.fixed(id, 16);
    }
}
