/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Bytes, Environment, type Transport } from "@matter/general";
import type { ThreadNetworkCredentials } from "../src/credentials/ThreadNetworkCredentials.js";
import { connectMeshcop } from "../src/diagnostic/connectMeshcop.js";
import type { BorderRouterEntry } from "../src/discovery/BorderRouterEntry.js";
import type { DtlsChannel } from "../src/dtls/channel/DtlsChannel.js";
import type { DtlsConnectOpts } from "../src/dtls/channel/DtlsConnectOpts.js";

const environment = new Environment("test", Environment.default);

class MockChannel implements DtlsChannel {
    closed = false;
    #done: (() => void) | undefined;
    readonly #closeListeners = new Set<() => void>();

    async send(_bytes: Bytes): Promise<void> {}

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            // Block until close() so the CoapClient recv loop unwinds cleanly during teardown.
            next: (): Promise<IteratorResult<Bytes>> => {
                if (this.closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#done = () => resolve({ value: undefined, done: true });
                });
            },
        };
    }

    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.#done?.();
        this.#done = undefined;
        for (const listener of this.#closeListeners) {
            listener();
        }
    }
}

function makeConnect(
    onConnect: (opts: DtlsConnectOpts) => Promise<DtlsChannel> | DtlsChannel,
): (opts: DtlsConnectOpts) => Promise<DtlsChannel> {
    return async opts => onConnect(opts);
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
        const sockets = new Array<MockChannel>();
        const connect = makeConnect(opts => {
            captured.push(opts);
            const s = new MockChannel();
            sockets.push(s);
            return s;
        });

        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, environment, makeConnect: connect });

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
        const connect = makeConnect(opts => {
            captured.push(opts);
            return new MockChannel();
        });

        const br = makeBr({ addresses: ["fd00::1", "192.168.1.10"], meshcopPort: 49191 });
        const handle = await connectMeshcop({
            creds,
            br,
            address: "fd00::dead:beef",
            environment,
            makeConnect: connect,
        });
        await handle.close();

        expect(captured[0].address).to.equal("fd00::dead:beef");
    });

    it("uses opts.port to override BR meshcopPort", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const connect = makeConnect(opts => {
            captured.push(opts);
            return new MockChannel();
        });

        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, port: 12345, environment, makeConnect: connect });
        await handle.close();

        expect(captured[0].port).to.equal(12345);
    });

    it("infers udp4 type for IPv4 addresses", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const connect = makeConnect(opts => {
            captured.push(opts);
            return new MockChannel();
        });

        const br = makeBr({ addresses: ["192.168.1.10"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, environment, makeConnect: connect });
        await handle.close();

        expect(captured[0].type).to.equal("udp4");
    });

    it("prefers ULA over IPv4 in the address list", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const connect = makeConnect(opts => {
            captured.push(opts);
            return new MockChannel();
        });

        const br = makeBr({
            addresses: ["192.168.1.10", "fd00::1", "2001:db8::1"],
            meshcopPort: 49191,
        });
        const handle = await connectMeshcop({ creds, br, environment, makeConnect: connect });
        await handle.close();

        expect(captured[0].address).to.equal("fd00::1");
    });

    it("prefers any IPv6 over IPv4 when no ULA is present", async () => {
        const captured = new Array<DtlsConnectOpts>();
        const connect = makeConnect(opts => {
            captured.push(opts);
            return new MockChannel();
        });

        const br = makeBr({ addresses: ["192.168.1.10", "2001:db8::1"], meshcopPort: 49191 });
        const handle = await connectMeshcop({ creds, br, environment, makeConnect: connect });
        await handle.close();

        expect(captured[0].address).to.equal("2001:db8::1");
    });

    it("throws when neither opts.port nor br.meshcopPort is set", async () => {
        const connect = makeConnect(() => new MockChannel());
        const br = makeBr({ addresses: ["fd00::1"] });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, environment, makeConnect: connect });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.match(/no meshcopPort/);
    });

    it("throws when br has no addresses and no override", async () => {
        const connect = makeConnect(() => new MockChannel());
        const br = makeBr({ addresses: [], meshcopPort: 49191 });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, environment, makeConnect: connect });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.match(/no addresses/);
    });

    it("throws a clear message when only link-local addresses are present", async () => {
        const connect = makeConnect(() => new MockChannel());
        const br = makeBr({ addresses: ["fe80::1", "fe80::2"], meshcopPort: 49191 });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, environment, makeConnect: connect });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.match(/link-local/);
    });

    it("propagates connect rejections", async () => {
        const connect = makeConnect(() => Promise.reject(new Error("handshake failed")));
        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });

        let err: Error | undefined;
        try {
            await connectMeshcop({ creds, br, environment, makeConnect: connect });
        } catch (e) {
            err = e instanceof Error ? e : new Error(String(e));
        }
        expect(err?.message).to.equal("handshake failed");
    });

    it("handle.close() closes the underlying socket", async () => {
        const sockets = new Array<MockChannel>();
        const connect = makeConnect(() => {
            const s = new MockChannel();
            sockets.push(s);
            return s;
        });
        const br = makeBr({ addresses: ["fd00::1"], meshcopPort: 49191 });

        const handle = await connectMeshcop({ creds, br, environment, makeConnect: connect });
        expect(sockets[0].closed).to.equal(false);
        await handle.close();
        expect(sockets[0].closed).to.equal(true);
    });
});
