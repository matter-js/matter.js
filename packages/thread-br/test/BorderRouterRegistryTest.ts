/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, type DnsRecord, DnsRecordClass, DnsRecordType, Environment, Seconds } from "@matter/main";
import { BorderRouterRegistry } from "../src/discovery/index.js";

describe("BorderRouterRegistry", () => {
    let env: Environment;
    let registry: BorderRouterRegistry;

    beforeEach(() => {
        env = new Environment("test");
        registry = new BorderRouterRegistry(env);
    });

    afterEach(async () => {
        await registry.stop();
    });

    it("starts with an empty registry", () => {
        expect(registry.list()).to.deep.equal([]);
    });

    it("stop() before start() is a no-op", async () => {
        await registry.stop();
        expect(registry.list()).to.deep.equal([]);
    });

    it("start() is callable without errors", async () => {
        await registry.start();
        expect(registry.list()).to.deep.equal([]);
    });

    it("start() is idempotent", async () => {
        await registry.start();
        await registry.start();
        expect(registry.list()).to.deep.equal([]);
    });

    it("stop() after start() is a no-op when registry is empty", async () => {
        await registry.start();
        await registry.stop();
        expect(registry.list()).to.deep.equal([]);
    });

    it("stop() is idempotent", async () => {
        await registry.start();
        await registry.stop();
        await registry.stop();
        expect(registry.list()).to.deep.equal([]);
    });

    it("get() returns undefined when xa is unknown", () => {
        expect(registry.get("AABBCCDDEEFF0011")).to.equal(undefined);
    });

    it("get() normalizes lowercase xa to uppercase", () => {
        expect(registry.get("aabbccddeeff0011")).to.equal(undefined);
    });

    describe("on mDNS discovery", () => {
        let stub: StubDnssdNames;
        let innerRegistry: BorderRouterRegistry;

        beforeEach(() => {
            stub = new StubDnssdNames();
            innerRegistry = new BorderRouterRegistry(new Environment("test"), stub);
        });

        afterEach(async () => {
            await innerRegistry.stop();
        });

        it("creates a meshcop entry with parsed fields and sorted addresses", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10", "fd00::1", "2001:db8::5", "fe80::abcd"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: {
                    xa: "aabbccddeeff0011",
                    xp: "1122334455667788",
                    nn: "MyNetwork",
                    vn: "ACME",
                    mn: "BR-100",
                    tv: "1.3.0",
                    dd: "deadbeef",
                    sb: "00000010",
                    at: "0000000000000001",
                    pt: "12345678",
                    dn: "domain.example",
                },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);

            const list = innerRegistry.list();
            expect(list.length).to.equal(1);
            const e = list[0];
            expect(e.extAddressHex).to.equal("AABBCCDDEEFF0011");
            expect(e.extendedPanIdHex).to.equal("1122334455667788");
            expect(e.networkName).to.equal("MyNetwork");
            expect(e.vendorName).to.equal("ACME");
            expect(e.modelName).to.equal("BR-100");
            expect(e.threadVersion).to.equal("1.3.0");
            expect(e.borderAgentIdHex).to.equal("DEADBEEF");
            expect(e.stateBitmapHex).to.equal("00000010");
            expect(e.activeTimestampHex).to.equal("0000000000000001");
            expect(e.partitionIdHex).to.equal("12345678");
            expect(e.domainName).to.equal("domain.example");
            expect(e.hostname).to.equal("Kuche.local.");
            expect(e.meshcopPort).to.equal(49154);
            expect(e.trelPort).to.equal(undefined);
            expect(e.sources).to.deep.equal(["meshcop"]);
            expect(e.addresses).to.deep.equal(["192.168.1.10", "2001:db8::5", "fd00::1", "fe80::abcd"]);
        });

        it("creates a trel-only entry without naming fields", async () => {
            await innerRegistry.start();
            stub.makeTarget("br.local.", ["10.0.0.5"]);
            const inst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011" },
                srvTarget: "br.local.",
                srvPort: 12345,
            });
            stub.discover(inst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.trelPort).to.equal(12345);
            expect(e!.meshcopPort).to.equal(undefined);
            expect(e!.networkName).to.equal(undefined);
            expect(e!.sources).to.deep.equal(["trel"]);
            expect(e!.addresses).to.deep.equal(["10.0.0.5"]);
        });

        it("merges meshcop and trel for the same xa", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            stub.makeTarget("br.local.", ["10.0.0.5"]);
            const meshcopInst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", xp: "1111111111111111", nn: "MyNet", vn: "ACME" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(meshcopInst);
            const trelInst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011", xp: "1111111111111111" },
                srvTarget: "br.local.",
                srvPort: 12345,
            });
            stub.discover(trelInst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.networkName).to.equal("MyNet");
            expect(e!.vendorName).to.equal("ACME");
            expect(e!.meshcopPort).to.equal(49154);
            expect(e!.trelPort).to.equal(12345);
            expect(e!.hostname).to.equal("Kuche.local.");
            expect(e!.sources).to.deep.equal(["meshcop", "trel"]);
        });

        it("meshcop wins when xp conflicts with trel", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            stub.makeTarget("br.local.", ["10.0.0.5"]);
            const meshcopInst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", xp: "AAAAAAAAAAAAAAAA", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(meshcopInst);
            const trelInst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011", xp: "BBBBBBBBBBBBBBBB" },
                srvTarget: "br.local.",
                srvPort: 12345,
            });
            stub.discover(trelInst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e!.extendedPanIdHex).to.equal("AAAAAAAAAAAAAAAA");
        });

        it("retains entry across single-source loss and full-source loss with last-known fields preserved", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            stub.makeTarget("br.local.", ["10.0.0.5"]);
            const meshcopInst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(meshcopInst);
            const trelInst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011" },
                srvTarget: "br.local.",
                srvPort: 12345,
            });
            stub.discover(trelInst);

            expect(innerRegistry.get("AABBCCDDEEFF0011")!.sources).to.deep.equal(["meshcop", "trel"]);

            trelInst.setDiscovered(false);
            trelInst.emit({ name: trelInst });

            const afterTrelLoss = innerRegistry.get("AABBCCDDEEFF0011");
            expect(afterTrelLoss).to.not.equal(undefined);
            expect(afterTrelLoss!.sources).to.deep.equal(["meshcop"]);
            expect(afterTrelLoss!.trelPort).to.equal(12345);
            expect(afterTrelLoss!.networkName).to.equal("MyNet");
            expect(stub.targetByKey("br.local.")!.observerCount()).to.equal(0);

            meshcopInst.setDiscovered(false);
            meshcopInst.emit({ name: meshcopInst });

            const stale = innerRegistry.get("AABBCCDDEEFF0011");
            expect(stale).to.not.equal(undefined);
            expect(stale!.sources).to.deep.equal([]);
            expect(stale!.networkName).to.equal("MyNet");
            expect(stale!.meshcopPort).to.equal(49154);
            expect(stale!.trelPort).to.equal(12345);
            expect(stub.targetByKey("kuche.local.")!.observerCount()).to.equal(0);
        });

        it("populates addresses retroactively when target's A/AAAA arrive later", async () => {
            await innerRegistry.start();
            const target = stub.makeTarget("Kuche.local.", []);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);
            expect(innerRegistry.get("AABBCCDDEEFF0011")!.addresses).to.deep.equal([]);

            target.setAddresses(["192.168.1.10", "fd00::1"]);
            target.emit({ name: target });

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e!.addresses).to.deep.equal(["192.168.1.10", "fd00::1"]);
        });

        it("replaces addresses when the target changes its A records", async () => {
            await innerRegistry.start();
            const target = stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);
            expect(innerRegistry.get("AABBCCDDEEFF0011")!.addresses).to.deep.equal(["192.168.1.10"]);

            target.setAddresses(["192.168.2.20", "fe80::cafe"]);
            target.emit({ name: target });

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e!.addresses).to.deep.equal(["192.168.2.20", "fe80::cafe"]);
        });

        it("skips records missing an xa TXT key", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { nn: "OrphanNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);
            expect(innerRegistry.list()).to.deep.equal([]);
        });

        it("evicts oldest entry when registry exceeds 256", async () => {
            // Drive lastSeen via a controlled Date.now so eviction order is deterministic.
            // (`innerRegistry.get(xa).lastSeen = ...` would only mutate a snapshot copy.)
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();
                const oldestXa = makeXa(0);
                for (let i = 0; i < 256; i++) {
                    const xa = makeXa(i);
                    const host = `host${i}.local.`;
                    stub.makeTarget(host, [`10.0.${(i >> 8) & 0xff}.${i & 0xff}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `Net${i}` },
                        srvTarget: host,
                        srvPort: 49154 + i,
                    });
                    stub.discover(inst);
                    now++;
                }

                const xa257 = makeXa(257);
                stub.makeTarget(`host257.local.`, [`10.1.0.0`]);
                const inst257 = stub.makeInstance(`${xa257.toLowerCase()}._meshcop._udp.local`, {
                    txt: { xa: xa257.toLowerCase(), nn: "Net257" },
                    srvTarget: `host257.local.`,
                    srvPort: 50000,
                });
                stub.discover(inst257);

                expect(innerRegistry.list().length).to.equal(256);
                expect(innerRegistry.get(oldestXa)).to.equal(undefined);
                expect(innerRegistry.get(xa257)).to.not.equal(undefined);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("issues a one-shot solicit for both service-type qnames on start", async () => {
            await innerRegistry.start();
            const qnames = stub.solicitedQnames();
            expect(qnames).to.include("_meshcop._udp.local");
            expect(qnames).to.include("_trel._udp.local");
        });

        it("re-discovers after eviction without leaking instance observers", async () => {
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();
                for (let i = 0; i < 256; i++) {
                    const xa = makeXa(i);
                    const host = `host${i}.local.`;
                    stub.makeTarget(host, [`10.0.${(i >> 8) & 0xff}.${i & 0xff}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `Net${i}` },
                        srvTarget: host,
                        srvPort: 49154 + i,
                    });
                    stub.discover(inst);
                    now++;
                }
                const evictedXa = makeXa(0);
                const evictedQname = `${evictedXa.toLowerCase()}._meshcop._udp.local`;
                const evictedInstance = stub.targetByKey(evictedQname)!;
                const evictedHost = stub.targetByKey("host0.local.")!;
                expect(innerRegistry.get(evictedXa)).to.not.equal(undefined);
                expect(evictedInstance.observerCount()).to.equal(1);
                expect(evictedHost.observerCount()).to.equal(1);

                const xa257 = makeXa(257);
                stub.makeTarget("host257.local.", ["10.1.0.0"]);
                const inst257 = stub.makeInstance(`${xa257.toLowerCase()}._meshcop._udp.local`, {
                    txt: { xa: xa257.toLowerCase(), nn: "Net257" },
                    srvTarget: "host257.local.",
                    srvPort: 50000,
                });
                stub.discover(inst257);

                expect(innerRegistry.get(evictedXa)).to.equal(undefined);
                expect(evictedInstance.observerCount()).to.equal(0);
                expect(evictedHost.observerCount()).to.equal(0);

                const reHost = stub.makeTarget("host0-re.local.", ["10.9.9.9"]);
                const reInstance = stub.makeInstance(evictedQname, {
                    txt: { xa: evictedXa.toLowerCase(), nn: "NetRe" },
                    srvTarget: "host0-re.local.",
                    srvPort: 60000,
                });
                stub.discover(reInstance);

                const e = innerRegistry.get(evictedXa);
                expect(e).to.not.equal(undefined);
                expect(e!.networkName).to.equal("NetRe");
                expect(e!.hostname).to.equal("host0-re.local.");
                expect(reInstance.observerCount()).to.equal(1);
                expect(reHost.observerCount()).to.equal(1);
                expect(innerRegistry.list().length).to.equal(256);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("releases trel's old target observer when meshcop overwrites the hostname", async () => {
            await innerRegistry.start();
            const targetA = stub.makeTarget("brA.local.", ["10.0.0.1"]);
            const trelInst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011" },
                srvTarget: "brA.local.",
                srvPort: 12345,
            });
            stub.discover(trelInst);
            expect(targetA.observerCount()).to.equal(1);

            const targetB = stub.makeTarget("brB.local.", ["10.0.0.2"]);
            const meshcopInst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "brB.local.",
                srvPort: 49154,
            });
            stub.discover(meshcopInst);

            expect(targetA.observerCount()).to.equal(0);
            expect(targetB.observerCount()).to.equal(1);
            const e = innerRegistry.get("AABBCCDDEEFF0011")!;
            expect(e.hostname).to.equal("brB.local.");
            expect(e.addresses).to.deep.equal(["10.0.0.2"]);
        });

        it("keeps meshcop's target intact when trel arrives later with a different hostname", async () => {
            await innerRegistry.start();
            const targetA = stub.makeTarget("brA.local.", ["10.0.0.1"]);
            const meshcopInst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "brA.local.",
                srvPort: 49154,
            });
            stub.discover(meshcopInst);

            const targetC = stub.makeTarget("brC.local.", ["10.0.0.3"]);
            const trelInst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011" },
                srvTarget: "brC.local.",
                srvPort: 12345,
            });
            stub.discover(trelInst);

            expect(targetA.observerCount()).to.equal(1);
            expect(targetC.observerCount()).to.equal(1);
            const e = innerRegistry.get("AABBCCDDEEFF0011")!;
            expect(e.hostname).to.equal("brA.local.");
            expect(e.addresses).to.deep.equal(["10.0.0.1"]);
        });

        it("does not attach observers when a discovered event fires after stop", async () => {
            await innerRegistry.start();
            const observers = stub.discovered.snapshot();
            expect(observers.length).to.equal(1);
            const inflight = observers[0];

            await innerRegistry.stop();
            expect(stub.discoveredObserverCount()).to.equal(0);

            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            inflight(inst);

            expect(inst.observerCount()).to.equal(0);
            expect(innerRegistry.list()).to.deep.equal([]);
        });

        it("resets the eviction-warned flag across stop/start cycles", async () => {
            const originalDateNow = Date.now;
            try {
                await innerRegistry.start();
                for (let i = 0; i < 257; i++) {
                    const xa = makeXa(i);
                    const host = `host${i}.local.`;
                    stub.makeTarget(host, [`10.0.${(i >> 8) & 0xff}.${i & 0xff}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `Net${i}` },
                        srvTarget: host,
                        srvPort: 49154 + i,
                    });
                    Date.now = () => 1000 + i;
                    stub.discover(inst);
                }
                expect(innerRegistry.list().length).to.equal(256);

                await innerRegistry.stop();
                await innerRegistry.start();

                for (let i = 0; i < 257; i++) {
                    const xa = makeXa(1000 + i);
                    const host = `cycle2-host${i}.local.`;
                    stub.makeTarget(host, [`11.0.${(i >> 8) & 0xff}.${i & 0xff}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `Cycle2Net${i}` },
                        srvTarget: host,
                        srvPort: 51000 + i,
                    });
                    Date.now = () => 5000 + i;
                    stub.discover(inst);
                }
                expect(innerRegistry.list().length).to.equal(256);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("clears registry, removes filter, and detaches observers on stop", async () => {
            await innerRegistry.start();
            const target = stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);
            expect(innerRegistry.list().length).to.equal(1);
            expect(target.observerCount()).to.equal(1);
            expect(inst.observerCount()).to.equal(1);
            expect(stub.filterCount()).to.equal(1);
            expect(stub.discoveredObserverCount()).to.equal(1);

            await innerRegistry.stop();

            expect(innerRegistry.list()).to.deep.equal([]);
            expect(target.observerCount()).to.equal(0);
            expect(inst.observerCount()).to.equal(0);
            expect(stub.filterCount()).to.equal(0);
            expect(stub.discoveredObserverCount()).to.equal(0);
        });

        it("prunes a stale entry once 24h elapses since lastSeen", async () => {
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();
                stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
                const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                    txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                    srvTarget: "Kuche.local.",
                    srvPort: 49154,
                });
                stub.discover(inst);

                inst.setDiscovered(false);
                inst.emit({ name: inst });
                expect(innerRegistry.get("AABBCCDDEEFF0011")!.sources).to.deep.equal([]);

                now += 24 * 60 * 60 * 1000 - 1;
                expect(innerRegistry.get("AABBCCDDEEFF0011")).to.not.equal(undefined);

                now += 2;
                expect(innerRegistry.get("AABBCCDDEEFF0011")).to.equal(undefined);
                expect(innerRegistry.list()).to.deep.equal([]);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("resets the retention clock when a stale entry is re-discovered", async () => {
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();
                stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
                const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                    txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                    srvTarget: "Kuche.local.",
                    srvPort: 49154,
                });
                stub.discover(inst);

                inst.setDiscovered(false);
                inst.emit({ name: inst });
                const staleAt = now;

                now += 12 * 60 * 60 * 1000;
                inst.setDiscovered(true);
                stub.discover(inst);

                const live = innerRegistry.get("AABBCCDDEEFF0011");
                expect(live).to.not.equal(undefined);
                expect(live!.sources).to.deep.equal(["meshcop"]);
                expect(live!.lastSeen).to.equal(now);

                now = staleAt + 24 * 60 * 60 * 1000 + 1;
                expect(innerRegistry.get("AABBCCDDEEFF0011")).to.not.equal(undefined);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("eviction prefers stale entries before live ones when the cap is hit", async () => {
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();

                const staleXa = makeXa(0);
                stub.makeTarget("staleHost.local.", ["10.0.0.1"]);
                const staleInst = stub.makeInstance(`${staleXa.toLowerCase()}._meshcop._udp.local`, {
                    txt: { xa: staleXa.toLowerCase(), nn: "Stale" },
                    srvTarget: "staleHost.local.",
                    srvPort: 49000,
                });
                stub.discover(staleInst);
                staleInst.setDiscovered(false);
                staleInst.emit({ name: staleInst });
                expect(innerRegistry.get(staleXa)!.sources).to.deep.equal([]);
                now++;

                for (let i = 1; i < 256; i++) {
                    const xa = makeXa(i);
                    const host = `host${i}.local.`;
                    stub.makeTarget(host, [`10.1.${(i >> 8) & 0xff}.${i & 0xff}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `Net${i}` },
                        srvTarget: host,
                        srvPort: 49154 + i,
                    });
                    stub.discover(inst);
                    now++;
                }
                expect(innerRegistry.list().length).to.equal(256);

                const newXa = makeXa(500);
                stub.makeTarget("newHost.local.", ["10.2.0.0"]);
                const newInst = stub.makeInstance(`${newXa.toLowerCase()}._meshcop._udp.local`, {
                    txt: { xa: newXa.toLowerCase(), nn: "New" },
                    srvTarget: "newHost.local.",
                    srvPort: 50000,
                });
                stub.discover(newInst);

                expect(innerRegistry.list().length).to.equal(256);
                expect(innerRegistry.get(staleXa)).to.equal(undefined);
                expect(innerRegistry.get(newXa)).to.not.equal(undefined);
                for (let i = 1; i < 256; i++) {
                    expect(innerRegistry.get(makeXa(i))).to.not.equal(undefined);
                }
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("freezes lastSeen when an entry transitions to stale", async () => {
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();
                stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
                const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                    txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                    srvTarget: "Kuche.local.",
                    srvPort: 49154,
                });
                stub.discover(inst);
                const discoveredAt = now;

                now += 60 * 1000;

                inst.setDiscovered(false);
                inst.emit({ name: inst });

                const stale = innerRegistry.get("AABBCCDDEEFF0011");
                expect(stale).to.not.equal(undefined);
                expect(stale!.sources).to.deep.equal([]);
                expect(stale!.lastSeen).to.equal(discoveredAt);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("eviction picks stale entry even when newer than several live entries", async () => {
            const originalDateNow = Date.now;
            let now = 1000;
            Date.now = () => now;
            try {
                await innerRegistry.start();

                for (let i = 1; i <= 2; i++) {
                    const xa = makeXa(i);
                    const host = `liveOld${i}.local.`;
                    stub.makeTarget(host, [`10.0.0.${i}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `OldLive${i}` },
                        srvTarget: host,
                        srvPort: 49000 + i,
                    });
                    stub.discover(inst);
                    now++;
                }
                const oldLive1 = makeXa(1);
                const oldLive2 = makeXa(2);

                now = 5000;
                const staleXa = makeXa(100);
                stub.makeTarget("staleHost.local.", ["10.5.0.0"]);
                const staleInst = stub.makeInstance(`${staleXa.toLowerCase()}._meshcop._udp.local`, {
                    txt: { xa: staleXa.toLowerCase(), nn: "Stale" },
                    srvTarget: "staleHost.local.",
                    srvPort: 49500,
                });
                stub.discover(staleInst);
                staleInst.setDiscovered(false);
                staleInst.emit({ name: staleInst });
                expect(innerRegistry.get(staleXa)!.sources).to.deep.equal([]);
                expect(innerRegistry.get(staleXa)!.lastSeen).to.equal(5000);
                now = 10000;

                for (let i = 200; i < 200 + 253; i++) {
                    const xa = makeXa(i);
                    const host = `host${i}.local.`;
                    stub.makeTarget(host, [`10.1.${(i >> 8) & 0xff}.${i & 0xff}`]);
                    const inst = stub.makeInstance(`${xa.toLowerCase()}._meshcop._udp.local`, {
                        txt: { xa: xa.toLowerCase(), nn: `Net${i}` },
                        srvTarget: host,
                        srvPort: 49154 + i,
                    });
                    stub.discover(inst);
                    now++;
                }
                expect(innerRegistry.list().length).to.equal(256);

                const newXa = makeXa(900);
                stub.makeTarget("newHost.local.", ["10.2.0.0"]);
                const newInst = stub.makeInstance(`${newXa.toLowerCase()}._meshcop._udp.local`, {
                    txt: { xa: newXa.toLowerCase(), nn: "New" },
                    srvTarget: "newHost.local.",
                    srvPort: 50000,
                });
                stub.discover(newInst);

                expect(innerRegistry.list().length).to.equal(256);
                expect(innerRegistry.get(staleXa)).to.equal(undefined);
                expect(innerRegistry.get(oldLive1)).to.not.equal(undefined);
                expect(innerRegistry.get(oldLive2)).to.not.equal(undefined);
                expect(innerRegistry.get(newXa)).to.not.equal(undefined);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it("re-discovers a stale entry from the other source", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const meshcopInst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(meshcopInst);
            meshcopInst.setDiscovered(false);
            meshcopInst.emit({ name: meshcopInst });
            expect(innerRegistry.get("AABBCCDDEEFF0011")!.sources).to.deep.equal([]);

            stub.makeTarget("br.local.", ["10.0.0.5"]);
            const trelInst = stub.makeInstance("aabbccddeeff0011._trel._udp.local", {
                txt: { xa: "aabbccddeeff0011" },
                srvTarget: "br.local.",
                srvPort: 12345,
            });
            stub.discover(trelInst);

            const live = innerRegistry.get("AABBCCDDEEFF0011");
            expect(live).to.not.equal(undefined);
            expect(live!.sources).to.deep.equal(["trel"]);
            expect(live!.trelPort).to.equal(12345);
            expect(live!.networkName).to.equal("MyNet");
            expect(live!.meshcopPort).to.equal(49154);
        });

        it("stop() clears stale entries from the registry", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", nn: "MyNet" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);
            inst.setDiscovered(false);
            inst.emit({ name: inst });
            expect(innerRegistry.get("AABBCCDDEEFF0011")!.sources).to.deep.equal([]);

            await innerRegistry.stop();

            expect(innerRegistry.list()).to.deep.equal([]);
            expect(innerRegistry.get("AABBCCDDEEFF0011")).to.equal(undefined);
        });

        it("parses sv (software version) from meshcop TXT", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", sv: "1.2.3-build" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.swVersion).to.equal("1.2.3-build");
        });

        it("parses rv (record version) from meshcop TXT", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", rv: "1" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.recordVersion).to.equal("1");
        });

        it("prefers ai over dd for borderAgentIdHex when both present", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", ai: "112233", dd: "445566" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.borderAgentIdHex).to.equal("112233".toUpperCase());
        });

        it("falls back to dd when ai is absent", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", dd: "aabb" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.borderAgentIdHex).to.equal("AABB");
        });

        it("falls back to ai when dd is absent", async () => {
            await innerRegistry.start();
            stub.makeTarget("Kuche.local.", ["192.168.1.10"]);
            const inst = stub.makeInstance("Kuche._meshcop._udp.local", {
                txt: { xa: "aabbccddeeff0011", ai: "ccdd" },
                srvTarget: "Kuche.local.",
                srvPort: 49154,
            });
            stub.discover(inst);

            const e = innerRegistry.get("AABBCCDDEEFF0011");
            expect(e).to.not.equal(undefined);
            expect(e!.borderAgentIdHex).to.equal("CCDD");
        });
    });
});

function makeXa(i: number): string {
    return i.toString(16).toUpperCase().padStart(16, "0");
}

class StubObservable<Args extends unknown[]> {
    readonly #observers = new Set<(...args: Args) => void>();

    on(observer: (...args: Args) => void): void {
        this.#observers.add(observer);
    }

    off(observer: (...args: Args) => void): void {
        this.#observers.delete(observer);
    }

    emit(...args: Args): void {
        for (const observer of [...this.#observers]) {
            observer(...args);
        }
    }

    count(): number {
        return this.#observers.size;
    }

    snapshot(): ((...args: Args) => void)[] {
        return [...this.#observers];
    }
}

class StubDnssdParameters {
    readonly #strings = new Map<string, string>();
    readonly #raw = new Map<string, Uint8Array>();

    set(key: string, value: string | Uint8Array): void {
        if (typeof value === "string") {
            this.#strings.set(key, value);
        } else {
            this.#raw.set(key, value);
        }
    }

    get(key: string): string | undefined {
        return this.#strings.get(key);
    }

    raw(key: string): Uint8Array | undefined {
        return this.#raw.get(key);
    }

    has(key: string): boolean {
        return this.#strings.has(key) || this.#raw.has(key);
    }

    get size(): number {
        return this.#strings.size + this.#raw.size;
    }

    keys(): MapIterator<string> {
        return this.#strings.keys();
    }

    values(): MapIterator<string> {
        return this.#strings.values();
    }

    entries(): MapIterator<[string, string]> {
        return this.#strings.entries();
    }

    [Symbol.iterator](): MapIterator<[string, string]> {
        return this.entries();
    }

    forEach(cb: (v: string, k: string, m: ReadonlyMap<string, string>) => void): void {
        for (const [k, v] of this) cb(v, k, this);
    }
}

const BINARY_TXT_KEYS = new Set(["xa", "xp", "at", "pt", "dd", "sb", "ai"]);

class StubDnssdName {
    readonly parameters = new StubDnssdParameters();
    #records: DnsRecord[] = [];
    #observable = new StubObservable<[changes: { name: StubDnssdName }]>();
    #isDiscovered = true;

    constructor(readonly qname: string) {}

    get records(): IterableIterator<DnsRecord> {
        return this.#records[Symbol.iterator]();
    }

    setRecords(records: DnsRecord[]): void {
        this.#records = records;
    }

    get isDiscovered(): boolean {
        return this.#isDiscovered;
    }

    setDiscovered(value: boolean): void {
        this.#isDiscovered = value;
    }

    on(observer: (changes: { name: StubDnssdName }) => void): void {
        this.#observable.on(observer);
    }

    off(observer: (changes: { name: StubDnssdName }) => void): void {
        this.#observable.off(observer);
    }

    emit(changes: { name: StubDnssdName }): void {
        this.#observable.emit(changes);
    }

    observerCount(): number {
        return this.#observable.count();
    }

    setAddresses(addresses: string[]): void {
        const records: DnsRecord[] = addresses.map(addr => ({
            recordType: addr.includes(":") ? DnsRecordType.AAAA : DnsRecordType.A,
            recordClass: DnsRecordClass.IN,
            name: this.qname,
            ttl: Seconds(120),
            value: addr,
        }));
        this.#records = records;
    }
}

interface InstanceDescriptor {
    txt: Record<string, string>;
    srvTarget?: string;
    srvPort?: number;
}

class StubDnssdNames {
    readonly filters = new StubFilters();
    readonly discovered = new StubObservable<[StubDnssdName]>();
    readonly solicitor: StubSolicitor = new StubSolicitor();
    readonly #names = new Map<string, StubDnssdName>();

    get(qname: string): StubDnssdName {
        const key = qname.toLowerCase();
        let name = this.#names.get(key);
        if (name === undefined) {
            name = new StubDnssdName(qname);
            this.#names.set(key, name);
        }
        return name;
    }

    maybeGet(qname: string): StubDnssdName | undefined {
        return this.#names.get(qname.toLowerCase());
    }

    makeInstance(qname: string, descriptor: InstanceDescriptor): StubDnssdName {
        const name = this.get(qname);
        for (const [k, v] of Object.entries(descriptor.txt)) {
            name.parameters.set(k, BINARY_TXT_KEYS.has(k) ? Bytes.of(Bytes.fromHex(v)) : v);
        }
        const records: DnsRecord[] = [];
        if (descriptor.srvTarget !== undefined && descriptor.srvPort !== undefined) {
            records.push({
                recordType: DnsRecordType.SRV,
                recordClass: DnsRecordClass.IN,
                name: qname,
                ttl: Seconds(120),
                value: { priority: 0, weight: 0, port: descriptor.srvPort, target: descriptor.srvTarget },
            });
        }
        name.setRecords(records);
        return name;
    }

    makeTarget(qname: string, addresses: string[]): StubDnssdName {
        const name = this.get(qname);
        name.setAddresses(addresses);
        return name;
    }

    discover(name: StubDnssdName): void {
        this.discovered.emit(name);
    }

    targetByKey(key: string): StubDnssdName | undefined {
        return this.#names.get(key);
    }

    filterCount(): number {
        return this.filters.count();
    }

    discoveredObserverCount(): number {
        return this.discovered.count();
    }

    solicitedQnames(): string[] {
        return this.solicitor.solicited.map(s => s.name.qname);
    }
}

class StubFilters {
    readonly #filters = new Set<(record: DnsRecord) => boolean>();

    add(filter: (record: DnsRecord) => boolean, _names: Iterable<string> | "all"): void {
        this.#filters.add(filter);
    }

    delete(filter: (record: DnsRecord) => boolean): boolean {
        return this.#filters.delete(filter);
    }

    count(): number {
        return this.#filters.size;
    }
}

class StubSolicitor {
    readonly solicited: { name: StubDnssdName; recordTypes: DnsRecordType[] }[] = [];

    solicit(solicitation: { name: StubDnssdName; recordTypes: DnsRecordType[] }): void {
        this.solicited.push(solicitation);
    }
}
