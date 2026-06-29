/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DtlsBackend } from "./DtlsBackend.js";
import { NobleDtlsBackend } from "./NobleDtlsBackend.js";

/** Backend identifier — `noble` is the default; `wasm-mbedtls` is reserved as a fallback. */
export type DtlsBackendKind = "noble" | "wasm-mbedtls";

export interface CreateDtlsBackendOpts {
    /** Backend selector. Defaults to `"noble"`. */
    kind?: DtlsBackendKind;
}

/**
 * Construct a {@link DtlsBackend}. Per Phase 0c.6, only the `noble` backend
 * ships in Phase 3; `wasm-mbedtls` is reserved as a fallback and is not built
 * unless real-BR interop forces a switch.
 */
export function createDtlsBackend(opts?: CreateDtlsBackendOpts): DtlsBackend {
    const kind = opts?.kind ?? "noble";
    if (kind === "noble") {
        return new NobleDtlsBackend();
    }
    if (kind === "wasm-mbedtls") {
        throw new Error("createDtlsBackend: wasm-mbedtls backend not built — see Phase 0c.6 decision memo");
    }
    throw new Error(`createDtlsBackend: unknown DTLS backend kind: ${kind as string}`);
}
