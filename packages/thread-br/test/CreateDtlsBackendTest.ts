/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDtlsBackend } from "../src/dtls/socket/createDtlsBackend.js";
import { NobleDtlsBackend } from "../src/dtls/socket/NobleDtlsBackend.js";

describe("createDtlsBackend factory", () => {
    it("returns a NobleDtlsBackend by default", () => {
        const backend = createDtlsBackend();
        expect(backend).to.be.instanceOf(NobleDtlsBackend);
    });

    it("returns a NobleDtlsBackend when kind is explicitly 'noble'", () => {
        const backend = createDtlsBackend({ kind: "noble" });
        expect(backend).to.be.instanceOf(NobleDtlsBackend);
    });

    it("throws a 'not built' error for the wasm-mbedtls fallback (Phase 0c.6 memo)", () => {
        expect(() => createDtlsBackend({ kind: "wasm-mbedtls" })).to.throw(/wasm-mbedtls.*not built/);
    });

    it("throws on unknown backend kinds", () => {
        // Bypass the static union to exercise the runtime guard a malformed config could trip.
        const opts = { kind: "unknown-kind" } as unknown as Parameters<typeof createDtlsBackend>[0];
        expect(() => createDtlsBackend(opts)).to.throw(/unknown DTLS backend kind/);
    });
});
