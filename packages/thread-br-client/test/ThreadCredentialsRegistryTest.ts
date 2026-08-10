/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { OperationalDataset } from "@matter/protocol";
import { ThreadCredentialsRegistry } from "../src/credentials/ThreadCredentialsRegistry.js";
import type { ThreadNetworkCredentials } from "../src/credentials/ThreadNetworkCredentials.js";
import { data as synthetic1Hex } from "./fixtures/datasets/synthetic-1.hex.js";

function loadDataset(hex: string): OperationalDataset {
    return OperationalDataset.decode(Bytes.of(Bytes.fromHex(hex.trim())));
}

function makeCreds(overrides: Partial<ThreadNetworkCredentials> = {}): ThreadNetworkCredentials {
    return {
        extPanId: new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]),
        networkName: "OpenThread",
        pskc: Uint8Array.from(Array.from({ length: 16 }, (_, i) => i)),
        activeTimestamp: 0x10000n,
        ...overrides,
    };
}

describe("ThreadCredentialsRegistry", () => {
    let registry: ThreadCredentialsRegistry;

    beforeEach(() => {
        registry = new ThreadCredentialsRegistry();
    });

    it("starts empty", () => {
        expect(registry.list()).to.deep.equal([]);
    });

    describe("register(dataset)", () => {
        it("extracts extPanId, networkName, pskc, activeTimestamp from a real dataset", () => {
            const ds = loadDataset(synthetic1Hex);
            registry.register(ds);
            const list = registry.list();
            expect(list).to.have.lengthOf(1);
            expect(list[0].extPanId).to.deep.equal(new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]));
            expect(list[0].networkName).to.equal("OpenThread");
            expect(list[0].pskc).to.deep.equal(Uint8Array.from(Array.from({ length: 16 }, (_, i) => i)));
            expect(list[0].activeTimestamp).to.equal(0x10000n);
        });

        it("never exposes the network key", () => {
            const ds = loadDataset(synthetic1Hex);
            registry.register(ds);
            const stored = registry.list()[0];
            expect("networkKey" in stored).to.equal(false);
        });

        it("fires events.registered with the new credentials", () => {
            const ds = loadDataset(synthetic1Hex);
            const emitted: ThreadNetworkCredentials[] = [];
            registry.events.registered.on(c => {
                emitted.push(c);
            });
            registry.register(ds);
            expect(emitted).to.have.lengthOf(1);
            expect(emitted[0].networkName).to.equal("OpenThread");
        });

        it("emits a fresh copy — mutating the listener's view does not change stored credentials", () => {
            const lookup = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
            let received: ThreadNetworkCredentials | undefined;
            registry.events.registered.on(c => {
                received = c;
            });
            registry.registerCredentials(makeCreds());
            expect(received).to.not.equal(undefined);
            Bytes.of(received!.extPanId)[0] = 0xff;
            Bytes.of(received!.pskc)[0] = 0xff;
            const stored = registry.getCredentials(lookup);
            expect(stored).to.not.equal(undefined);
            expect(Bytes.of(stored!.extPanId)[0]).to.equal(0x11);
            expect(Bytes.of(stored!.pskc)[0]).to.equal(0x00);
        });

        it("replaces an existing entry with the same extPanId", () => {
            const ds = loadDataset(synthetic1Hex);
            registry.register(ds);
            registry.registerCredentials(makeCreds({ networkName: "Replaced", pskc: new Uint8Array(16).fill(0xff) }));
            const list = registry.list();
            expect(list).to.have.lengthOf(1);
            expect(list[0].networkName).to.equal("Replaced");
        });

        it("emits events.registered (only) on replacement, not unregistered", () => {
            const ds = loadDataset(synthetic1Hex);
            registry.register(ds);
            const registered: ThreadNetworkCredentials[] = [];
            const unregistered: Bytes[] = [];
            registry.events.registered.on(c => {
                registered.push(c);
            });
            registry.events.unregistered.on(x => {
                unregistered.push(x);
            });
            registry.registerCredentials(makeCreds({ networkName: "Replaced" }));
            expect(registered).to.have.lengthOf(1);
            expect(registered[0].networkName).to.equal("Replaced");
            expect(unregistered).to.have.lengthOf(0);
        });

        it("replaces unconditionally even when the activeTimestamp is older", () => {
            registry.registerCredentials(makeCreds({ activeTimestamp: 0x20000n }));
            registry.registerCredentials(makeCreds({ networkName: "Older", activeTimestamp: 0x10000n }));
            expect(registry.list()[0].networkName).to.equal("Older");
            expect(registry.list()[0].activeTimestamp).to.equal(0x10000n);
        });

        it("throws when extPanId is missing", () => {
            const ds = loadDataset(synthetic1Hex);
            ds.extPanId = undefined;
            expect(() => registry.register(ds)).to.throw(/extPanId/);
        });

        it("throws when networkName is missing", () => {
            const ds = loadDataset(synthetic1Hex);
            ds.networkName = undefined;
            expect(() => registry.register(ds)).to.throw(/networkName/);
        });

        it("throws when pskc is missing", () => {
            const ds = loadDataset(synthetic1Hex);
            ds.pskc = undefined;
            expect(() => registry.register(ds)).to.throw(/pskc/);
        });
    });

    describe("registerCredentials", () => {
        it("accepts in-memory credentials and stores them", () => {
            const creds = makeCreds();
            registry.registerCredentials(creds);
            const list = registry.list();
            expect(list).to.have.lengthOf(1);
            expect(list[0].networkName).to.equal("OpenThread");
        });

        it("does not retain caller-mutable views of extPanId or pskc", () => {
            const extPanId = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
            const pskc = new Uint8Array(16).fill(0xab);
            registry.registerCredentials({
                extPanId,
                networkName: "MyNet",
                pskc,
                activeTimestamp: 1n,
            });
            extPanId[0] = 0xff;
            pskc[0] = 0xff;
            const stored = registry.getCredentials(new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]));
            expect(stored).to.not.equal(undefined);
            expect(Bytes.of(stored!.extPanId)[0]).to.equal(0x11);
            expect(Bytes.of(stored!.pskc)[0]).to.equal(0xab);
        });
    });

    describe("getCredentials", () => {
        it("matches by Uint8Array equality, not reference", () => {
            registry.registerCredentials(makeCreds());
            const lookup = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
            const found = registry.getCredentials(lookup);
            expect(found).to.not.equal(undefined);
            expect(found!.networkName).to.equal("OpenThread");
        });

        it("returns undefined for an unknown extPanId", () => {
            registry.registerCredentials(makeCreds());
            expect(registry.getCredentials(new Uint8Array(8))).to.equal(undefined);
        });
    });

    describe("unregister", () => {
        it("removes the matching entry", () => {
            registry.registerCredentials(makeCreds());
            registry.unregister(new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]));
            expect(registry.list()).to.deep.equal([]);
        });

        it("fires events.unregistered with a copy of the extPanId", () => {
            registry.registerCredentials(makeCreds());
            const emitted: Bytes[] = [];
            registry.events.unregistered.on(x => {
                emitted.push(x);
            });
            const lookup = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
            registry.unregister(lookup);
            expect(emitted).to.have.lengthOf(1);
            expect(emitted[0]).to.deep.equal(lookup);
            expect(emitted[0]).to.not.equal(lookup);
        });

        it("is a no-op when the extPanId is unknown", () => {
            const emitted: Bytes[] = [];
            registry.events.unregistered.on(x => {
                emitted.push(x);
            });
            registry.unregister(new Uint8Array(8));
            expect(emitted).to.have.lengthOf(0);
        });
    });

    describe("list", () => {
        it("returns a defensive copy — mutating the returned array does not change the registry", () => {
            registry.registerCredentials(makeCreds());
            const snapshot = registry.list() as ThreadNetworkCredentials[];
            snapshot.length = 0;
            expect(registry.list()).to.have.lengthOf(1);
        });

        it("returns copies of the byte-array fields — mutating them does not reach the stored entry", () => {
            registry.registerCredentials(makeCreds());
            const entry = registry.list()[0];
            Bytes.of(entry.extPanId)[0] ^= 0xff;
            Bytes.of(entry.pskc)[0] ^= 0xff;
            expect(registry.list()[0].extPanId).to.deep.equal(makeCreds().extPanId);
            expect(registry.list()[0].pskc).to.deep.equal(makeCreds().pskc);
        });
    });
});
