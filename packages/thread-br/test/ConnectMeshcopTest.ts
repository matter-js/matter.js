/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThreadNetworkCredentials } from "../src/credentials/ThreadNetworkCredentials.js";
import { connectMeshcop } from "../src/diagnostic/connectMeshcop.js";
import type { BorderRouterEntry } from "../src/discovery/BorderRouterEntry.js";
import type { DtlsBackend } from "../src/dtls/socket/DtlsBackend.js";
import type { DtlsConnectOpts } from "../src/dtls/socket/DtlsConnectOpts.js";
import type { DtlsSocket } from "../src/dtls/socket/DtlsSocket.js";

class MockSocket implements DtlsSocket {
    closed = false;
    readonly #closing: Promise<never>;
    #signalClose: ((err: Error) => void) | undefined;

    constructor() {
        this.#closing = new Promise<never>((_resolve, reject) => {
            this.#signalClose = reject;
        });
    }

    async send(_bytes: Uint8Array): Promise<void> {}

    async recv(): Promise<Uint8Array> {
        // Block until close() so the CoapClient recv loop unwinds cleanly during teardown.
        return this.#closing;
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.#signalClose?.(new Error("MockSocket closed"));
    }
}

function makeBackend(onConnect: (opts: DtlsConnectOpts) => Promise<DtlsSocket> | DtlsSocket): DtlsBackend {
    return {
        connect: async opts => onConnect(opts),
    };
}

function makeBr(overrides: Partial<BorderRouterEntry>): BorderRouterEntry {
    return {
        extAddressHex: "AAAAAAAAAAAAAAAA",
        addresses: [],
        sources: ["meshcop"],
        lastSeen: 0,
        ...overrides,
    };
}

const creds: ThreadNetworkCredentials = {
    extPanId: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
    networkName: "test",
    pskc: new Uint8Array(16),
};

describe("connectMeshcop", () => {
    it("connects to ULA address and BR-supplied port and returns a working handle", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const sockets = new Array<MockSocket>();
        const backend = makeBackend(opts => {
            captured.push(opts);
            const s = new MockSocket();
            sockets.push(s);
            return s;
        });

        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, makeBackend: () => backend });

        expect(captured.length).to.equal(1);
        expect(captured[0].address).to.equal("fd00::1");
        expect(captured[0].port).to.equal(49191);
        expect(captured[0].type).to.equal("udp6");
        expect(captured[0].password).to.equal(creds.pskc);
        expect(handle.source.kind).to.equal("meshcop");

        await handle.close();
        expect(sockets[0].closed).to.equal(true);
    });

    it("uses opts.address to override BR address selection", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const backend = makeBackend(opts => {
            captured.push(opts);
            return new MockSocket();
        });

        const br = makeBr({ addresses: ["fd00::1", "192.168.1.10"], meshcopPort: 49191 });
        const handle = await connectMeshcop({
            creds,
            br,
            address: "fd00::dead:beef",
            makeBackend: () => backend,
        });
        await handle.close();

        expect(captured[0].address).to.equal("fd00::dead:beef");
    });

    it("uses opts.port to override BR meshcopPort", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const backend = makeBackend(opts => {
            captured.push(opts);
            return new MockSocket();
        });

        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, port: 12345, makeBackend: () => backend });
        await handle.close();

        expect(captured[0].port).to.equal(12345);
    });

    it("infers udp4 type for IPv4 addresses", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const backend = makeBackend(opts => {
            captured.push(opts);
            return new MockSocket();
        });

        const br = makeBr({ addresses: ["192.168.1.10"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, makeBackend: () => backend });
        await handle.close();

        expect(captured[0].type).to.equal("udp4");
    });

    it("prefers ULA over IPv4 in the address list", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const backend = makeBackend(opts => {
            captured.push(opts);
            return new MockSocket();
        });

        const br = makeBr({
            addresses: ["192.168.1.10", "fd00::1", "2001:db8::1"],
            meshcopPort: 49191,
        });
        const handle = await connectMeshcop({ creds, br, makeBackend: () => backend });
        await handle.close();

        expect(captured[0].address).to.equal("fd00::1");
    });

    it("prefers any IPv6 over IPv4 when no ULA is present", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const backend = makeBackend(opts => {
            captured.push(opts);
            return new MockSocket();
        });

        const br = makeBr({ addresses: ["192.168.1.10", "2001:db8::1"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, makeBackend: () => backend });
        await handle.close();

        expect(captured[0].address).to.equal("2001:db8::1");
    });

    it("throws when neither opts.port nor br.meshcopPort is set", async () => {
        const backend = makeBackend(() => new MockSocket());
        const br = makeBr({ addresses: ["fd00::1"] });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, makeBackend: () => backend });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.match(/no meshcopPort/);
    });

    it("throws when br has no addresses and no override", async () => {
        const backend = makeBackend(() => new MockSocket());
        const br = makeBr({ addresses: [], meshcopPort: 49191 });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, makeBackend: () => backend });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.match(/no addresses/);
    });

    it("throws a clear message when only link-local addresses are present", async () => {
        const backend = makeBackend(() => new MockSocket());
        const br = makeBr({ addresses: ["fe80::1", "fe80::2"], meshcopPort: 49191 });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, makeBackend: () => backend });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.match(/link-local/);
    });

    it("propagates backend.connect rejections", async () => {
        const backend = makeBackend(() => Promise.reject(new Error("handshake failed")));
        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, makeBackend: () => backend });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.equal("handshake failed");
    });

    it("handle.close() closes the underlying socket", async () => {
        const sockets = new Array<MockSocket>();
        const backend = makeBackend(() => {
            const s = new MockSocket();
            sockets.push(s);
            return s;
        });
        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });

        const handle = await connectMeshcop({ creds, br, makeBackend: () => backend });
        expect(sockets[0].closed).to.equal(false);
        await handle.close();
        expect(sockets[0].closed).to.equal(true);
    });
});
