/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricManager } from "#fabric/FabricManager.js";
import { MdnsService } from "#mdns/MdnsService.js";
import { NetworkProfiles } from "#peer/NetworkProfile.js";
import { Peer } from "#peer/Peer.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { PeerConnection } from "#peer/PeerConnection.js";
import { PeerTimingParameters } from "#peer/PeerTimingParameters.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { CaseClient } from "#session/case/CaseClient.js";
import { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    Abort,
    createPromise,
    Duration,
    Entropy,
    Environment,
    InternalError,
    MemoryStorageDriver,
    Millis,
    Network,
    NetworkSimulator,
    Seconds,
    ServerAddressIp,
    StandardCrypto,
    StorageContext,
    Time,
    Timestamp,
    TransportSet,
} from "@matter/general";
import { GeneralStatusCode, NodeId, SecureChannelStatusCode } from "@matter/types";
import { createTestFabric } from "../interaction/interaction-utils.js";

class OpeningChannel extends ProtocolMocks.NetworkChannel {
    closed = false;

    override async close() {
        this.closed = true;
    }
}

interface PairCall {
    ip: string;
    abort: AbortSignal;
    at: Timestamp;
}

interface OpenCall {
    address: ServerAddressIp;
    abort: AbortSignal;
    channel: OpeningChannel;
    at: Timestamp;
}

function busy(delay: Duration) {
    const error = new ChannelStatusResponseError("Peer is busy", GeneralStatusCode.Busy, SecureChannelStatusCode.Busy);
    error.busyDelay = delay;
    return error;
}

function hang(call: PairCall): Promise<never> {
    return Abort.attempt(call.abort, new Promise<never>(() => {}));
}

async function advance(duration: number) {
    await MockTime.advance(duration);
    await MockTime.macrotask;
}

describe("PeerConnection BUSY floor", () => {
    beforeEach(() => MockTime.reset());

    async function fixture(
        pair: (call: PairCall) => Promise<never>,
        opening?: (call: OpenCall) => Promise<void>,
        delayAfterNetworkError = Millis(0),
    ) {
        const environment = new Environment("peer busy");
        const crypto = new StandardCrypto();
        environment.set(Entropy, crypto);
        environment.set(Network, new NetworkSimulator().addHost(1));
        const mdns = await environment.load(MdnsService);
        const storage = new MemoryStorageDriver();
        storage.initialize();
        const fabrics = new FabricManager(crypto);
        await fabrics.construction.ready;
        const fabric = createTestFabric();
        fabrics.addFabric(fabric);
        const sessions = new SessionManager({ fabrics, storage: new StorageContext(storage, ["sessions"]) });
        await sessions.construction.ready;
        const exchanges = new ExchangeManager({
            lifetime: environment,
            entropy: crypto,
            sessions,
            transports: new TransportSet(),
        });
        const opens = new Array<OpenCall>();
        const pairs = new Array<PairCall>();
        const context: Peer.Context = {
            join: environment.join.bind(environment),
            sessions,
            exchanges,
            names: mdns.names,
            networks: new NetworkProfiles(),
            timing: PeerTimingParameters({
                delayBeforeNextAddress: Seconds(1),
                delayAfterNetworkError,
            }),
            closed() {},
            async openSocket(address, abort) {
                const channel = new OpeningChannel({});
                channel.networkAddress = { type: "udp", ip: address.ip, port: address.port };
                const call = { address, abort, channel, at: Time.nowUs };
                opens.push(call);
                await opening?.(call);
                return channel;
            },
        };
        const peer = new Peer(
            { address: PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId(2) }) },
            context,
        );
        peer.service.addresses.add({ ip: "fd00::1", port: 5540 });
        peer.service.addresses.add({ ip: "fd00::2", port: 5540 });
        const originalPair = CaseClient.prototype.pair;
        CaseClient.prototype.pair = async (exchange, _fabric, _nodeId, options) => {
            const channel = exchange.channel.transportChannel;
            if (!(channel instanceof OpeningChannel) || options?.abort === undefined) {
                throw new InternalError("Unexpected CASE test channel or missing abort");
            }
            const call = { ip: channel.networkAddress.ip, abort: options.abort, at: Time.nowUs };
            pairs.push(call);
            return await pair(call);
        };
        let process: { abort: Abort; done: Promise<NodeSession | undefined> } | undefined;

        async function start() {
            const abort = new Abort();
            process = { abort, done: PeerConnection(peer, context, { abort, network: "unlimited" }) };
            await MockTime.macrotask;
        }

        async function stop() {
            if (process === undefined) {
                return;
            }
            process.abort();
            await process.done;
            process.abort.close();
            process = undefined;
        }

        return {
            opens,
            pairs,
            peer,
            start,
            stop,
            async close() {
                try {
                    await stop();
                    await peer.close();
                    await exchanges.close();
                    await sessions.close();
                    await environment.runtime.close();
                    environment[Symbol.dispose]();
                } finally {
                    CaseClient.prototype.pair = originalPair;
                }
            },
        };
    }

    it("delays queued and newly discovered addresses and retains retry jitter", async () => {
        const random = Math.random;
        Math.random = () => 0.5;
        let first = true;
        const f = await fixture(
            async call => {
                if (first) {
                    first = false;
                    throw busy(Seconds(10));
                }
                return await hang(call);
            },
            undefined,
            Seconds(4),
        );
        try {
            await f.start();
            await advance(Seconds(5));
            f.peer.service.addresses.add({ ip: "fd00::3", port: 5540 });
            await f.peer.service.changed.emit();
            await advance(Seconds(4));
            expect(f.opens).length(1);

            await advance(Seconds(1));
            expect(f.opens).length(2);
            expect(f.opens[1].address.ip).equal("fd00::2");
            await advance(Seconds(1));
            expect(f.opens).length(3);
            expect(f.opens[2].address.ip).equal("fd00::3");
            await advance(Seconds(1));
            expect(f.opens).length(4);
            expect(f.opens[3].address.ip).equal("fd00::1");
        } finally {
            Math.random = random;
            await f.close();
        }
    });

    it("rechecks the minimum wait after a pending socket opens, before CASE", async () => {
        const busyReady = createPromise<void>();
        const socketReady = createPromise<void>();
        const f = await fixture(
            async call => {
                if (call.ip === "fd00::1") {
                    await Abort.attempt(call.abort, busyReady.promise);
                    throw busy(Seconds(10));
                }
                return await hang(call);
            },
            async call => {
                if (call.address.ip === "fd00::2") {
                    await socketReady.promise;
                }
            },
        );
        try {
            await f.start();
            await advance(Seconds(1) + 1);
            expect(f.opens).length(2);
            busyReady.resolver();
            await advance(Millis(1));
            expect(f.opens[1].abort.aborted).false;
            socketReady.resolver();
            await advance(Millis(1));
            expect(f.opens[1].channel.closed).true;
            expect(f.pairs).length(1);
        } finally {
            socketReady.resolver();
            await f.close();
        }
    });

    it("does not cancel CASE already in progress on another address", async () => {
        const busyReady = createPromise<void>();
        const f = await fixture(async call => {
            if (call.ip === "fd00::1") {
                await Abort.attempt(call.abort, busyReady.promise);
                throw busy(Seconds(10));
            }
            return await hang(call);
        });
        try {
            await f.start();
            await advance(Seconds(1) + 1);
            expect(f.pairs).length(2);
            busyReady.resolver();
            await advance(Millis(1));
            expect(f.pairs[1].abort.aborted).false;
            expect(f.opens[1].channel.closed).false;
        } finally {
            await f.close();
        }
    });

    for (const [firstDelay, secondDelay] of [
        [Seconds(10), Seconds(20)],
        [Seconds(20), Seconds(10)],
    ]) {
        it(`keeps the later deadline for BUSY waits ${firstDelay} and ${secondDelay}`, async () => {
            const firstReady = createPromise<void>();
            const secondReady = createPromise<void>();
            let firstBusyAt = Timestamp(0);
            let secondBusyAt = Timestamp(0);
            const f = await fixture(async call => {
                await Abort.attempt(call.abort, call.ip === "fd00::1" ? firstReady.promise : secondReady.promise);
                if (call.ip === "fd00::1") {
                    firstBusyAt = Time.nowUs;
                } else {
                    secondBusyAt = Time.nowUs;
                }
                throw busy(call.ip === "fd00::1" ? firstDelay : secondDelay);
            });
            try {
                await f.start();
                await advance(Seconds(2));
                firstReady.resolver();
                await MockTime.macrotask;
                await advance(Seconds(2));
                secondReady.resolver();
                await MockTime.macrotask;
                await advance(Millis(1));
                const deadline = Math.max(firstBusyAt + firstDelay, secondBusyAt + secondDelay);
                await advance(Millis(deadline - Time.nowUs - 1));
                expect(f.opens).length(2);
                await advance(Millis(1));
                expect(f.opens.length).greaterThan(2);
            } finally {
                await f.close();
            }
        });
    }

    it("keeps the wait across cancellation and a new connection process for the same peer", async () => {
        let first = true;
        const f = await fixture(async call => {
            if (first) {
                first = false;
                throw busy(Seconds(10));
            }
            return await hang(call);
        });
        try {
            await f.start();
            await advance(Millis(1));
            await f.stop();
            await f.start();
            await advance(Seconds(9));
            expect(f.opens).length(1);
            await advance(Seconds(1));
            expect(f.opens.length).greaterThan(1);
        } finally {
            await f.close();
        }
    });

    for (const step of [60_000, -60_000]) {
        it(`measures the wait in elapsed time when the wall clock steps by ${step} ms`, async () => {
            let first = true;
            const f = await fixture(async call => {
                if (first) {
                    first = false;
                    throw busy(Seconds(10));
                }
                return await hang(call);
            });
            try {
                await f.start();
                await advance(Millis(1));
                await f.stop();
                MockTime.stepWallClock(step);
                await f.start();
                await advance(Seconds(9));
                expect(f.opens).length(1);
                await advance(Seconds(1));
                expect(f.opens.length).greaterThan(1);
            } finally {
                await f.close();
            }
        });
    }
});
