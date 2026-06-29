/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DtlsBackend, DtlsConnectOpts, DtlsSocket } from "../src/dtls/socket/index.js";

describe("DtlsSocket / DtlsBackend / DtlsConnectOpts — interface shape", () => {
    it("permits a structurally compatible DtlsSocket implementation", () => {
        const stub: DtlsSocket = {
            send: async () => {},
            recv: async () => new Uint8Array(0),
            close: async () => {},
        };
        expect(typeof stub.send).to.equal("function");
        expect(typeof stub.recv).to.equal("function");
        expect(typeof stub.close).to.equal("function");
    });

    it("permits a structurally compatible DtlsBackend implementation", () => {
        const stubSocket: DtlsSocket = {
            send: async () => {},
            recv: async () => new Uint8Array(0),
            close: async () => {},
        };
        const backend: DtlsBackend = {
            connect: async () => stubSocket,
        };
        expect(typeof backend.connect).to.equal("function");
    });

    it("accepts the documented DtlsConnectOpts shape", () => {
        const opts: DtlsConnectOpts = {
            address: "fe80::1",
            port: 49191,
            password: new Uint8Array(16),
        };
        expect(opts.address).to.equal("fe80::1");
        expect(opts.port).to.equal(49191);
        expect(opts.password.length).to.equal(16);
    });
});
