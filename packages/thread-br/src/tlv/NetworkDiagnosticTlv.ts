/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicTlv, type BasicTlvEntry } from "./BasicTlvCodec.js";

/**
 * One Network Diagnostic TLV entry as walked from the response payload.
 *
 * The {@link type} numeric values are listed in {@link NetworkDiagTlvType}.
 * {@link value} holds the raw inner bytes; per-TLV typed decoders in
 * `./diag/` interpret it.
 */
export type NetworkDiagnosticEntry = BasicTlvEntry;

/**
 * Outer Network Diagnostic TLV codec.
 *
 * MGMT_DIAG_GET responses (and `.qry` payloads, on the request side) are a
 * concatenation of TLVs framed by the same basic + extended-length scheme as
 * MeshCoP. This namespace just specializes {@link BasicTlv} for the diagnostic
 * registry so callers get an idiomatic name.
 *
 * Unknown TLV types are preserved as raw {@link NetworkDiagnosticEntry}
 * records; per-TLV typed decoders are layered on top in `./diag/`.
 */
export namespace NetworkDiagnosticTlv {
    export function decode(blob: Uint8Array): NetworkDiagnosticEntry[] {
        return BasicTlv.walk(blob);
    }

    export function encode(entries: ReadonlyArray<NetworkDiagnosticEntry>): Uint8Array {
        return BasicTlv.encode(entries);
    }
}
