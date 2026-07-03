/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Bytes, Environment } from "@matter/general";
import type { DtlsChannel, DtlsConnectOpts } from "../src/dtls/channel/index.js";

describe("DtlsChannel / DtlsConnectOpts — interface shape", () => {
    it("permits a structurally compatible DtlsChannel implementation", () => {
        const stub: DtlsChannel = {
            send: async () => {},
            close: async () => {},
            onClose: () => ({ close: async () => {} }),
            [Symbol.asyncIterator](): AsyncIterator<Bytes> {
                return { next: () => Promise.resolve({ value: undefined, done: true }) };
            },
        };
        expect(typeof stub.send).to.equal("function");
        expect(typeof stub.close).to.equal("function");
        expect(typeof stub.onClose).to.equal("function");
        expect(typeof stub[Symbol.asyncIterator]).to.equal("function");
    });

    it("accepts the documented DtlsConnectOpts shape", () => {
        const opts: DtlsConnectOpts = {
            address: "fe80::1",
            port: 49191,
            password: new Uint8Array(16),
            environment: Environment.default,
        };
        expect(opts.address).to.equal("fe80::1");
        expect(opts.port).to.equal(49191);
        expect(opts.password.length).to.equal(16);
        expect(opts.environment).to.equal(Environment.default);
    });
});
