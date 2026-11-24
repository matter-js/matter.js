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

class TestChannel extends ProtocolMocks.NetworkChannel {
    closed = false;

    override async close() {
        this.closed = true;
    }
}

/** One call of {@link CaseClient.pair}, which is one new Sigma1. */
interface Sigma1 {
    /** 1 for the first Sigma1 of the connection, counting all addresses. */
    number: number;
    ip: string;
    abort: AbortSignal;
    at: Timestamp;
}

interface SocketOpen {
    address: ServerAddressIp;
    channel: TestChannel;
}

type Pair = (sigma1: Sigma1) => Promise<{ session: NodeSession; resumed: boolean }>;

function busy(delay: Duration) {
    const error = new ChannelStatusResponseError("Peer is busy", GeneralStatusCode.Busy, SecureChannelStatusCode.Busy);
    error.busyDelay = delay;
    return error;
}

function unanswered(sigma1: Sigma1): Promise<never> {
    return Abort.attempt(sigma1.abort, new Promise<never>(() => {}));
}

/**
 * Advance in steps of at most one second.  A timer that fires during one step starts async work that only runs after
 * the step, so a single large step would delay each further hop of that work to the end of the step.
 */
async function advance(duration: Duration) {
    let left = duration;
    while (left > 0) {
        const step = Math.min(left, Seconds(1));
        await MockTime.advance(step);
        await MockTime.macrotask;
        left -= step;
    }
}

describe("PeerConnection BUSY", () => {
    beforeEach(() => MockTime.reset());

    /**
     * Two addresses by default, started one second apart, with {@link CaseClient.pair} replaced so each test decides how the peer
     * answers each Sigma1.
     */
    async function fixture(
        pair: Pair,
        config: {
            opening?: (open: SocketOpen) => Promise<void>;
            handleError?: (error: Error) => Duration | void;
            delayAfterNetworkError?: Duration;
            addresses?: string[];
        } = {},
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
        const opens = new Array<SocketOpen>();
        const sigma1s = new Array<Sigma1>();
        const context: Peer.Context = {
            join: environment.join.bind(environment),
            sessions,
            exchanges,
            names: mdns.names,
            networks: new NetworkProfiles(),
            timing: PeerTimingParameters({
                delayBeforeNextAddress: Seconds(1),
                delayAfterNetworkError: config.delayAfterNetworkError ?? Millis(0),
            }),
            handleError: config.handleError,
            closed() {},
            async openSocket(address) {
                const channel = new TestChannel({});
                channel.networkAddress = { type: "udp", ip: address.ip, port: address.port };
                const open = { address, channel };
                opens.push(open);
                await config.opening?.(open);
                return channel;
            },
        };
        const peer = new Peer(
            { address: PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId(2) }) },
            context,
        );
        for (const ip of config.addresses ?? ["fd00::1", "fd00::2"]) {
            peer.service.addresses.add({ ip, port: 5540 });
        }

        const originalPair = CaseClient.prototype.pair;
        CaseClient.prototype.pair = async (exchange, _fabric, _nodeId, options) => {
            const channel = exchange.channel.transportChannel;
            if (!(channel instanceof TestChannel) || options?.abort === undefined) {
                throw new InternalError("Unexpected CASE test channel or missing abort");
            }
            const sigma1 = {
                number: sigma1s.length + 1,
                ip: channel.networkAddress.ip,
                abort: options.abort,
                at: Time.nowUs,
            };
            sigma1s.push(sigma1);
            return await pair(sigma1);
        };

        const abort = new Abort();
        const done = PeerConnection(peer, context, { abort, network: "unlimited" });
        await MockTime.macrotask;

        return {
            opens,
            sigma1s,
            done,
            sigma1sTo(ip: string) {
                return sigma1s.filter(sigma1 => sigma1.ip === ip);
            },
            async close() {
                try {
                    abort();
                    await done;
                    abort.close();
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

    it("holds the socket and Sigma1 of another address until the minimum wait has passed", async () => {
        const f = await fixture(async sigma1 => {
            if (sigma1.ip === "fd00::1" && sigma1.number === 1) {
                throw busy(Seconds(10));
            }
            return await unanswered(sigma1);
        });
        try {
            await advance(Seconds(9));
            expect(f.opens).length(1);
            expect(f.sigma1s).length(1);

            await advance(Seconds(1));
            expect(f.sigma1sTo("fd00::2")).length(1);
            expect(f.sigma1sTo("fd00::2")[0].at).equal(f.sigma1s[0].at + Seconds(10));
        } finally {
            await f.close();
        }
    });

    it("holds the Sigma1 of a socket that opened while the BUSY arrived", async () => {
        const answer = createPromise<void>();
        const opened = createPromise<void>();
        const f = await fixture(
            async sigma1 => {
                if (sigma1.number === 1) {
                    await Abort.attempt(sigma1.abort, answer.promise);
                    throw busy(Seconds(10));
                }
                return await unanswered(sigma1);
            },
            {
                opening: async open => {
                    if (open.address.ip === "fd00::2") {
                        await opened.promise;
                    }
                },
            },
        );
        try {
            await advance(Seconds(1));
            expect(f.opens).length(2);

            answer.resolver();
            await MockTime.macrotask;
            const busyAt = Time.nowUs;
            opened.resolver();
            await advance(Seconds(9));
            expect(f.sigma1sTo("fd00::2")).length(0);

            await advance(Millis(busyAt + Seconds(10) - Time.nowUs));
            expect(f.sigma1sTo("fd00::2")).length(1);
        } finally {
            answer.resolver();
            opened.resolver();
            await f.close();
        }
    });

    it("adds a random delay to the end of the wait of another address", async () => {
        const random = Math.random;
        Math.random = () => 0.5;
        try {
            const f = await fixture(
                async sigma1 => {
                    if (sigma1.number === 1) {
                        throw busy(Seconds(10));
                    }
                    return await unanswered(sigma1);
                },
                { delayAfterNetworkError: Seconds(4) },
            );
            try {
                await advance(Seconds(11));
                await advance(Millis(Seconds(1) - 1));
                expect(f.sigma1sTo("fd00::2")).length(0);

                await advance(Millis(1));
                expect(f.sigma1sTo("fd00::2")).length(1);
                expect(f.sigma1sTo("fd00::2")[0].at).equal(f.sigma1s[0].at + Seconds(12));
            } finally {
                await f.close();
            }
        } finally {
            Math.random = random;
        }
    });

    it("lets a Sigma1 already sent on another address continue (existing behavior)", async () => {
        const answer = createPromise<void>();
        const f = await fixture(async sigma1 => {
            if (sigma1.ip === "fd00::1") {
                await Abort.attempt(sigma1.abort, answer.promise);
                throw busy(Seconds(10));
            }
            return await unanswered(sigma1);
        });
        try {
            await advance(Seconds(1));
            expect(f.sigma1s.map(sigma1 => sigma1.ip)).deep.equal(["fd00::1", "fd00::2"]);

            answer.resolver();
            await advance(Seconds(1));
            expect(f.sigma1sTo("fd00::2")[0].abort.aborted).false;
        } finally {
            await f.close();
        }
    });

    for (const [first, second] of [
        [Seconds(10), Seconds(20)],
        [Seconds(20), Seconds(10)],
    ]) {
        it(`waits for the later end when BUSY requests ${Duration.format(first)} and then ${Duration.format(second)}`, async () => {
            const firstAnswer = createPromise<void>();
            const secondAnswer = createPromise<void>();
            const busyEnds = new Array<number>();
            const f = await fixture(async sigma1 => {
                if (sigma1.number === 1) {
                    await Abort.attempt(sigma1.abort, firstAnswer.promise);
                    busyEnds.push(Time.nowUs + first);
                    throw busy(first);
                }
                if (sigma1.number === 2) {
                    await Abort.attempt(sigma1.abort, secondAnswer.promise);
                    busyEnds.push(Time.nowUs + second);
                    throw busy(second);
                }
                return await unanswered(sigma1);
            });
            try {
                await advance(Seconds(2));
                firstAnswer.resolver();
                await MockTime.macrotask;
                await advance(Seconds(2));
                secondAnswer.resolver();
                await MockTime.macrotask;
                expect(busyEnds).length(2);

                await advance(Millis(Math.max(...busyEnds) - Time.nowUs - 1));
                expect(f.sigma1s).length(2);

                await advance(Millis(1));
                expect(f.sigma1s.length).greaterThan(2);
            } finally {
                await f.close();
            }
        });
    }

    it("extends the wait of a waiting attempt for each BUSY that arrives during it", async () => {
        const answers = [createPromise<void>(), createPromise<void>()];
        const busyEnds = new Array<number>();
        const f = await fixture(
            async sigma1 => {
                if (sigma1.number <= 2) {
                    await Abort.attempt(sigma1.abort, answers[sigma1.number - 1].promise);
                    busyEnds.push(Time.nowUs + Seconds(10));
                    throw busy(Seconds(10));
                }
                if (sigma1.number === 3) {
                    throw busy(Seconds(5));
                }
                return await unanswered(sigma1);
            },
            { handleError: () => Millis(100), addresses: ["fd00::1", "fd00::2", "fd00::3"] },
        );
        try {
            await advance(Seconds(3));
            expect(f.sigma1s).length(3);

            answers[0].resolver();
            await advance(Seconds(9));
            answers[1].resolver();
            await MockTime.macrotask;
            await advance(Millis(busyEnds[1] - Time.nowUs - 1));
            expect(f.sigma1s).length(3);

            await advance(Millis(1));
            expect(f.sigma1s.length).greaterThan(3);
        } finally {
            answers.forEach(answer => answer.resolver());
            await f.close();
        }
    });

    it("calls handleError for BUSY and keeps the minimum wait when it returns a shorter delay", async () => {
        const handled = new Array<Error>();
        const f = await fixture(
            async sigma1 => {
                if (sigma1.number === 1) {
                    throw busy(Seconds(10));
                }
                return await unanswered(sigma1);
            },
            {
                handleError: error => {
                    handled.push(error);
                    return Millis(100);
                },
            },
        );
        try {
            await advance(Seconds(9));
            expect(handled.map(error => ChannelStatusResponseError.of(error)?.busyDelay)).deep.equal([Seconds(10)]);
            expect(f.sigma1s).length(1);

            await advance(Seconds(1));
            expect(f.sigma1sTo("fd00::1").length).greaterThan(1);
        } finally {
            await f.close();
        }
    });

    it("ends waiting attempts when the attempt in progress establishes a session", async () => {
        const answer = createPromise<void>();
        const established = new ProtocolMocks.NodeSession();
        const f = await fixture(
            async sigma1 => {
                if (sigma1.ip === "fd00::1" && sigma1.number === 1) {
                    await Abort.attempt(sigma1.abort, answer.promise);
                    return { session: established, resumed: false };
                }
                if (sigma1.ip === "fd00::2") {
                    throw busy(Seconds(10));
                }
                return await unanswered(sigma1);
            },
            { handleError: () => Millis(100) },
        );
        try {
            await advance(Seconds(3));
            expect(f.sigma1sTo("fd00::2")).length(1);

            answer.resolver();
            expect(await f.done).equal(established);
            expect(f.opens).length(2);
            expect(f.sigma1sTo("fd00::2")).length(1);
        } finally {
            answer.resolver();
            await f.close();
        }
    });
});
