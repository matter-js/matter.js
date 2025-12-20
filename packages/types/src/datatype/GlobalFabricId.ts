/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Crypto } from "#general";
import { Branded, Bytes, DataWriter, hex } from "#general";
import type { FabricId } from "./FabricId.js";

const COMPRESSED_FABRIC_ID_INFO = Bytes.fromString("CompressedFabric");

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

    export async function compute(crypto: Crypto, id: FabricId, caKey: Bytes) {
        const saltWriter = new DataWriter();
        saltWriter.writeUInt64(id);
        return GlobalFabricId(
            await crypto.createHkdfKey(
                Bytes.of(caKey).slice(1),
                saltWriter.toByteArray(),
                COMPRESSED_FABRIC_ID_INFO,
                8,
            ),
        );
    }
}
