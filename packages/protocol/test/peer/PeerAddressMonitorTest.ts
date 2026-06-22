/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerAddressMonitor } from "#peer/PeerAddressMonitor.js";
import {
    Abort,
    ChannelType,
    Hours,
    Observable,
    Seconds,
    ServerAddressSet,
    type Duration,
    type ServerAddressIp,
    type ServerAddressUdp,
} from "@matter/general";

interface ProbeCall {
    network?: string;
    addressOverride?: ServerAddressUdp;
    suppressPeerLoss?: boolean;
    maxRetransmissions?: number;
}

function udp(ip: string, port = 5540): ServerAddressUdp {
    return { type: "udp", ip, port };
}

/**
 * Build a minimal fake peer exposing only the surface `verifyReachability` reads, plus a scripted
 * probe whose per-address result is controlled by `reachable`.
 */
function makeFixture(opts: {
    currentIp: string;
    discovered: ServerAddressIp[];
    reachable: Set<string>; // ip strings that answer the probe
    stabilizationDelay?: Duration;
    cooldown?: { minimum: Duration; maximum: Duration };
    gate?: Promise<boolean>; // when set, the current-address probe resolves with this (to hold a run in flight)
    icdAwait?: boolean; // when set, the peer's fabric reports a LIT ICD whose `requiresAwait` is this value
}) {
    const probeCalls = new Array<ProbeCall>();
    let closedPeer = false;
    let peerLoss = false;
    const channel = {
        type: ChannelType.UDP,
        networkAddress: udp(opts.currentIp),
        networkAddressChanged: Observable<[ServerAddressIp]>(),
    };
    const sessionChannel = {
        get transportChannel() {
            return channel;
        },
        get networkAddress() {
            return channel.networkAddress;
        },
        set networkAddress(addr: ServerAddressUdp) {
            channel.networkAddress = addr;
        },
    };
    const session = {
        via: "test",
        activeTimestamp: 0,
        get channel() {
            return sessionChannel as any;
        },
        handlePeerLoss: async () => {
            peerLoss = true;
        },
    };
    const interaction = {
        probe: async (o: ProbeCall) => {
            probeCalls.push(o);
            if (opts.gate !== undefined && o.addressOverride === undefined) {
                return opts.gate;
            }
            const ip = o.addressOverride?.ip ?? channel.networkAddress.ip;
            return opts.reachable.has(ip);
        },
        subscriptions: {
            closeForPeer: () => {
                closedPeer = true;
            },
        },
    };
    const icd = opts.icdAwait === undefined ? undefined : { wakefulnessFor: () => ({ requiresAwait: opts.icdAwait }) };
    const peer = {
        address: { fabricIndex: 1, nodeId: 1n },
        hasSession: true,
        newestSession: () => session,
        interaction,
        service: { addresses: ServerAddressSet<ServerAddressIp>(opts.discovered) },
        network: { id: "test", probeAddress: { id: "test:probe" } },
        fabric: { icd },
    };
    const abort = new Abort();
    let trackWorkCount = 0;
    const monitor = new PeerAddressMonitor(
        peer as any,
        opts.stabilizationDelay ?? Seconds(1),
        opts.cooldown ?? { minimum: Seconds(1), maximum: Seconds(60) },
        abort.signal,
        () => {
            trackWorkCount++;
        },
    );
    return {
        monitor,
        probeCalls,
        channel,
        get trackWorkCount() {
            return trackWorkCount;
        },
        stop() {
            monitor.stop();
            abort.close();
        },
        get closedPeer() {
            return closedPeer;
        },
        get peerLoss() {
            return peerLoss;
        },
    };
}

describe("PeerAddressMonitor.verifyReachability", () => {
    it("session-suspect: current answers → true, no alternate probe, MRP capped, suppressPeerLoss", async () => {
        const f = makeFixture({ currentIp: "fd00::1", discovered: [udp("fd00::1")], reachable: new Set(["fd00::1"]) });

        const result = await f.monitor.verifyReachability({ reason: "session-suspect" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(1);
        expect(f.probeCalls[0].addressOverride).equal(undefined);
        expect(f.probeCalls[0].suppressPeerLoss).equal(true);
        expect(f.probeCalls[0].maxRetransmissions).equal(2);
        expect(f.peerLoss).equal(false);
    });

    it("session-suspect alone: current fails → no alternate walk, session closed, false", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::1"), udp("fd00::2")],
            reachable: new Set(["fd00::2"]), // an alternate would answer, but session-suspect must not try it
        });

        const result = await f.monitor.verifyReachability({ reason: "session-suspect" });
        f.stop();

        expect(result).equal(false);
        expect(f.probeCalls.length).equal(1); // current only
        expect(f.peerLoss).equal(true);
    });

    it("address-change: current dropped from mDNS, current fails, alternate answers → migrate + closeForPeer + true", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::2")], // current not in discovered set → mDNS gate passes
            reachable: new Set(["fd00::2"]),
        });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.channel.networkAddress.ip).equal("fd00::2"); // migrated in place
        expect(f.closedPeer).equal(true); // subscriptions force-closed
    });

    it("address-change: current still in discovered set → no-op true, no probe", async () => {
        const f = makeFixture({ currentIp: "fd00::1", discovered: [udp("fd00::1")], reachable: new Set() });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(0);
    });

    it("address-change: current matches a channel-agnostic discovered address → skip, no probe", async () => {
        // mDNS stores typeless ServerAddressIp; the session address is UDP. Match must be by ip/port.
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [{ ip: "fd00::1", port: 5540 } as ServerAddressIp],
            reachable: new Set(["fd00::1"]),
        });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(0);
    });

    it("address-change: current dropped, nothing answers → session closed, false", async () => {
        const f = makeFixture({ currentIp: "fd00::1", discovered: [udp("fd00::2")], reachable: new Set() });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(false);
        expect(f.peerLoss).equal(true);
    });

    it("coalesces concurrent triggers into one run", async () => {
        const f = makeFixture({ currentIp: "fd00::1", discovered: [udp("fd00::1")], reachable: new Set(["fd00::1"]) });

        const [a, b] = await Promise.all([
            f.monitor.verifyReachability({ reason: "session-suspect" }),
            f.monitor.verifyReachability({ reason: "session-suspect" }),
        ]);
        f.stop();

        expect(a).equal(true);
        expect(b).equal(true);
        expect(f.probeCalls.length).equal(1); // single shared run
    });

    it("session-suspect stays current-only even when an address-change joins the run", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::2")],
            reachable: new Set(["fd00::2"]), // current fails; an alternate would answer if walked
        });

        // The session-suspect call starts the run; the address-change call joins it. The join must not
        // turn the current-only liveness check into a full alternate walk.
        const [suspect, change] = await Promise.all([
            f.monitor.verifyReachability({ reason: "session-suspect" }),
            f.monitor.verifyReachability({ reason: "address-change" }),
        ]);
        f.stop();

        expect(suspect).equal(false);
        expect(change).equal(false);
        expect(f.probeCalls.length).equal(1); // current only — no alternate probes
        expect(f.channel.networkAddress.ip).equal("fd00::1"); // not migrated
        expect(f.peerLoss).equal(true); // current failed → session closed
    });

    it("close() stops the timer and awaits the in-flight run", async () => {
        let release: (v: boolean) => void = () => {};
        const gate = new Promise<boolean>(r => {
            release = r;
        });
        const f = makeFixture({ currentIp: "fd00::1", discovered: [udp("fd00::1")], reachable: new Set(), gate });

        const run = f.monitor.verifyReachability({ reason: "session-suspect" }); // starts, hangs on the gated probe
        let closed = false;
        const closing = f.monitor.close().then(() => {
            closed = true;
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(closed).equal(false); // close() is still awaiting the in-flight run

        release(true);
        await closing;

        expect(closed).equal(true);
        expect(await run).equal(true);
    });

    it("a caller's own aborted signal yields false without preventing the peer-owned run", async () => {
        const f = makeFixture({ currentIp: "fd00::1", discovered: [udp("fd00::1")], reachable: new Set(["fd00::1"]) });
        const caller = new Abort();
        caller.abort();

        const result = await f.monitor.verifyReachability({ reason: "session-suspect", abort: caller.signal });
        f.stop();

        expect(result).equal(false); // the caller bailed on its own abort
        expect(f.probeCalls.length).equal(1); // the run still issued its probe (owned by the peer abort, not the caller's)
    });

    it("sleeping LIT ICD whose address left mDNS: adopts a discovered address on trust, no probe", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::2")],
            reachable: new Set(), // nothing answers — proves we never probe
            icdAwait: true,
        });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(0); // never probe a sleeping ICD
        expect(f.channel.networkAddress.ip).equal("fd00::2"); // adopted on trust
        expect(f.peerLoss).equal(false); // healthy session preserved
    });

    it("sleeping LIT ICD prefers a discovered address in the session's IP family", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("10.0.0.5"), udp("fd00::2")], // IPv4 first, but session is IPv6
            reachable: new Set(),
            icdAwait: true,
        });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.channel.networkAddress.ip).equal("fd00::2"); // same family as the session, not the first candidate
    });

    it("sleeping LIT ICD still in mDNS: keeps its address untouched, no probe", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::1")],
            reachable: new Set(),
            icdAwait: true,
        });

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(0);
        expect(f.channel.networkAddress.ip).equal("fd00::1");
        expect(f.peerLoss).equal(false);
    });

    it("session-suspect on a sleeping LIT ICD never probes or closes the session", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::1")],
            reachable: new Set(),
            icdAwait: true,
        });

        const result = await f.monitor.verifyReachability({ reason: "session-suspect" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(0);
        expect(f.peerLoss).equal(false);
    });
});

describe("PeerAddressMonitor backoff", () => {
    before(() => MockTime.enable());
    after(() => MockTime.disable());

    // Discovered set never contains the current address, so the mDNS gate always passes; a huge
    // stabilization delay keeps the re-armed timer from firing while we only advance the cooldown.
    const backoffOpts = {
        discovered: [udp("fd00::9")],
        stabilizationDelay: Hours(99),
        cooldown: { minimum: Seconds(2), maximum: Hours(24) },
    };

    it("an address change does not reset the growing cooldown", async () => {
        const f = makeFixture({ currentIp: "fd00::1", reachable: new Set(["fd00::1", "fd00::2"]), ...backoffOpts });

        await f.monitor.verifyReachability({ reason: "address-change" }); // first probe (cooldown → 2s)
        await MockTime.advance(2001);
        await f.monitor.verifyReachability({ reason: "address-change" }); // second probe (cooldown → 4s)
        expect(f.probeCalls.length).equal(2);

        f.channel.networkAddress = udp("fd00::2"); // the current address churns
        await MockTime.advance(3000); // 3s: past the old 2s floor, under the grown 4s

        const result = await f.monitor.verifyReachability({ reason: "address-change" });
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(2); // skipped — the churn did NOT reset trust to the floor
    });

    it("session-suspect resets the backoff so the next address-change probes immediately", async () => {
        const f = makeFixture({ currentIp: "fd00::1", reachable: new Set(["fd00::1"]), ...backoffOpts });

        await f.monitor.verifyReachability({ reason: "address-change" });
        await MockTime.advance(2001);
        await f.monitor.verifyReachability({ reason: "address-change" }); // cooldown grown to 4s
        await f.monitor.verifyReachability({ reason: "address-change" }); // immediate → within cooldown → skipped
        expect(f.probeCalls.length).equal(2);

        await f.monitor.verifyReachability({ reason: "session-suspect" }); // probes + resets trust
        expect(f.probeCalls.length).equal(3);

        const result = await f.monitor.verifyReachability({ reason: "address-change" }); // eager again
        f.stop();

        expect(result).equal(true);
        expect(f.probeCalls.length).equal(4);
    });

    it("a timer-fired address check is tracked exactly once", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::9")],
            reachable: new Set(["fd00::1"]),
            stabilizationDelay: Seconds(1),
            cooldown: { minimum: Seconds(2), maximum: Hours(24) },
        });

        f.monitor.schedule();
        await MockTime.advance(1001); // fire the stabilization timer → one address-change run
        f.stop();

        expect(f.probeCalls.length).equal(1);
        expect(f.trackWorkCount).equal(1); // not double-tracked by the timer wrapper
    });

    it("a session-suspect run does not arm the address-change debounce", async () => {
        const f = makeFixture({
            currentIp: "fd00::1",
            discovered: [udp("fd00::9")],
            reachable: new Set(["fd00::1"]),
            stabilizationDelay: Seconds(1),
            cooldown: { minimum: Seconds(2), maximum: Hours(24) },
        });

        await f.monitor.verifyReachability({ reason: "session-suspect" });
        expect(f.probeCalls.length).equal(1);

        await MockTime.advance(2000); // past the stabilization delay — nothing should have been scheduled
        f.stop();

        expect(f.probeCalls.length).equal(1);
    });
});
