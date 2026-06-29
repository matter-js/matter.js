/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type List TLV value codec (Network Diagnostic TLV type 18).
 *
 * The "value" of a Type List TLV is just the concatenation of the TLV-type
 * bytes the requester wants — one byte per requested type. The outer TLV(18,
 * ...) framing comes from the regular {@link NetworkDiagnosticTlv.encode}
 * caller, e.g.:
 *
 *   NetworkDiagnosticTlv.encode([{ type: NetworkDiagTlvType.TYPE_LIST, value: TypeListTlv.encode([0, 1, 5]) }])
 *
 * Source: OpenThread `network_diagnostic_tlvs.hpp` `TypeListTlv` (a plain
 * `TlvInfo<kTypeList>`) and `network_diagnostic.cpp` request payload handling.
 */
export namespace TypeListTlv {
    export function encode(types: ReadonlyArray<number>): Uint8Array {
        const out = new Uint8Array(types.length);
        for (let i = 0; i < types.length; i++) {
            const t = types[i];
            if (!Number.isInteger(t) || t < 0 || t > 0xff) {
                throw new Error(`TypeList entry out of range: ${t}`);
            }
            out[i] = t;
        }
        return out;
    }

    export function decode(value: Uint8Array): number[] {
        return Array.from(value);
    }
}
