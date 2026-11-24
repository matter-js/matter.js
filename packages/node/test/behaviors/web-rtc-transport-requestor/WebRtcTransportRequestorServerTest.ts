/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { AccessControlServer } from "#behaviors/access-control";
import { WebRtcTransportRequestorServer } from "#behaviors/web-rtc-transport-requestor";
import { CameraControllerDevice } from "#devices/camera-controller";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { InteractionServer } from "#node/server/InteractionServer.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    Crypto,
    Diagnostic,
    Entropy,
    Environment,
    ImplementationError,
    LogDestination,
    Logger,
    LogLevel,
    MatterError,
    Millis,
    MockCrypto,
    MockStorageService,
    Network,
    NetworkSimulator,
    Seconds,
    Time,
} from "@matter/general";
import { Specification } from "@matter/model";
import { interaction, MockServerNode } from "@matter/node/testing";
import { FabricAuthority, PeerAddress, ProtocolMocks, SessionManager } from "@matter/protocol";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    FabricIndex,
    NodeId,
    Status,
    StatusResponseError,
    StreamUsage,
    TlvArray,
    TlvField,
    TlvInvokeResponseData,
    TlvNullable,
    TlvObject,
    TlvStream,
    TlvString,
    TlvUInt16,
    TlvUInt8,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { WebRtcTransportDefinitions } from "@matter/types/clusters/web-rtc-transport-definitions";
import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";

type WebRtcSession = WebRtcTransportDefinitions.WebRtcSession;

class RollbackError extends MatterError {}

async function createTestNode() {
    MockTime.init();

    const env = new Environment("test");
    const crypto = MockCrypto();
    env.set(Entropy, crypto);
    env.set(Crypto, crypto);
    new MockStorageService(env);
    const simulator = new NetworkSimulator();
    env.set(Network, simulator.addHost(0x80));

    const node = new ServerNode(ServerNode.RootEndpoint, { environment: env });
    await node.add({
        id: "camera-controller",
        type: CameraControllerDevice.with(WebRtcTransportRequestorServer),
    });
    await node.start();
    if (!node.lifecycle.isOnline) {
        await node.lifecycle.online;
    }
    return node;
}

async function withPeerContext<R>(
    node: ServerNode,
    fabricIndex: FabricIndex,
    peerNodeId: NodeId,
    actor: (context: RemoteActorContext) => Promise<R>,
): Promise<R> {
    const fabric = new ProtocolMocks.Fabric({ fabricIndex });
    const session = new ProtocolMocks.NodeSession({ fabric, peerNodeId });
    const exchange = new ProtocolMocks.Exchange({
        context: { session },
    });
    return RemoteActorContext({ node, exchange, command: true }).act(context => actor(context));
}

function makeSession(overrides: Partial<WebRtcSession> = {}): WebRtcSession {
    return {
        id: 1,
        peerNodeId: NodeId(42n),
        peerEndpointId: EndpointNumber(1),
        streamUsage: StreamUsage.LiveView,
        metadataEnabled: false,
        videoStreams: [10],
        audioStreams: [20],
        fabricIndex: FabricIndex(1),
        ...overrides,
    };
}

async function isSettled(promise: Promise<unknown>) {
    let settled = false;
    promise.then(
        () => (settled = true),
        () => (settled = true),
    );
    await MockTime.macrotasks;
    return settled;
}

/** Whether `promise` settles within `within`, by default well inside the hold time of a signal. */
async function settlesPromptly(promise: Promise<unknown>, within = Seconds(3)) {
    const step = Millis(100);
    for (let waited = Millis(0); waited < within && !(await isSettled(promise)); waited = Millis(waited + step)) {
        await MockTime.advance(step);
    }
    return isSettled(promise);
}

describe("WebRtcTransportRequestorServer", () => {
    describe("upsertSession / removeSession", () => {
        let node: ServerNode;
        let cameraEndpoint: ReturnType<(typeof node)["parts"]["get"]>;

        beforeEach(async () => {
            node = await createTestNode();
            cameraEndpoint = node.parts.get("camera-controller");
        });

        afterEach(async () => {
            await MockTime.resolve(node.close(), { macrotasks: true });
        });

        it("inserts a new session by id", async () => {
            const session = makeSession({ id: 1 });
            await cameraEndpoint!.act(async agent => {
                await agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(1);
            expect(sessions[0].id).to.equal(1);
        });

        it("replaces an existing session with the same id, fabric and peer node", async () => {
            const session1 = makeSession({ id: 1, streamUsage: StreamUsage.LiveView });
            const session2 = makeSession({ id: 1, streamUsage: StreamUsage.Recording });
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(session1);
                await server.upsertSession(session2);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(1);
            expect(sessions[0].streamUsage).to.equal(StreamUsage.Recording);
        });

        async function capturedDebugLines(work: () => Promise<void>) {
            const messages = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "WebRtcTransportRequestorServer" && message.level === LogLevel.DEBUG) {
                        messages.push(String(message.values[0]));
                    }
                },
            });
            try {
                await work();
            } finally {
                delete Logger.destinations.capture;
            }
            return messages;
        }

        function sessionLine(change: "upserted" | "removed", id: number) {
            return (
                `session ${change} webRtcSessionId=${id} fabricIndex=1 peerNodeId=42 peerEndpointId=1 ` +
                `requestorEndpointId=${cameraEndpoint!.number}`
            );
        }

        it("logs the session it registered and the one it removed once each change commits", async () => {
            const messages = await capturedDebugLines(async () => {
                for (const id of [3, 4]) {
                    await cameraEndpoint!.act(async agent => {
                        await agent.get(WebRtcTransportRequestorServer).upsertSession(makeSession({ id }));
                    });
                }
                await cameraEndpoint!.act(async agent => {
                    const server = agent.get(WebRtcTransportRequestorServer);
                    await server.removeSession({ id: 3, fabricIndex: FabricIndex(1), peerNodeId: NodeId(42n) });
                    await server.removeSession({ id: 3, fabricIndex: FabricIndex(1), peerNodeId: NodeId(42n) });
                });
            });

            expect(messages).deep.equals([
                sessionLine("upserted", 3),
                sessionLine("upserted", 4),
                sessionLine("removed", 3),
            ]);
        });

        it("logs a registered session again where its replacement changed it", async () => {
            const messages = await capturedDebugLines(async () => {
                for (const streamUsage of [StreamUsage.LiveView, StreamUsage.Recording, StreamUsage.Recording]) {
                    await cameraEndpoint!.act(async agent => {
                        await agent
                            .get(WebRtcTransportRequestorServer)
                            .upsertSession(makeSession({ id: 3, streamUsage }));
                    });
                }
            });

            expect(messages).deep.equals([sessionLine("upserted", 3), sessionLine("upserted", 3)]);
        });

        it("logs no registration that rolled back", async () => {
            const messages = await capturedDebugLines(async () => {
                await expect(
                    cameraEndpoint!.act(async agent => {
                        await agent.get(WebRtcTransportRequestorServer).upsertSession(makeSession({ id: 3 }));
                        throw new RollbackError("rolled back");
                    }),
                ).rejectedWith("rolled back");
            });

            expect(messages).deep.equals([]);
            expect(cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions).deep.equals([]);
        });

        it("logs no removal that rolled back", async () => {
            await cameraEndpoint!.act(async agent => {
                await agent.get(WebRtcTransportRequestorServer).upsertSession(makeSession({ id: 3 }));
            });

            const messages = await capturedDebugLines(async () => {
                await expect(
                    cameraEndpoint!.act(async agent => {
                        await agent
                            .get(WebRtcTransportRequestorServer)
                            .removeSession({ id: 3, fabricIndex: FabricIndex(1), peerNodeId: NodeId(42n) });
                        throw new RollbackError("rolled back");
                    }),
                ).rejectedWith("rolled back");
            });

            expect(messages).deep.equals([]);
            expect(cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions).lengthOf(1);
        });

        it("keeps sessions with the same id from different peer nodes", async () => {
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(makeSession({ id: 1, peerNodeId: NodeId(10n) }));
                await server.upsertSession(makeSession({ id: 1, peerNodeId: NodeId(99n) }));
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions.map(({ peerNodeId }) => peerNodeId)).deep.equals([NodeId(10n), NodeId(99n)]);
        });

        it("keeps sessions with the same id and peer node on different fabrics", async () => {
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(makeSession({ id: 1, fabricIndex: FabricIndex(1) }));
                await server.upsertSession(makeSession({ id: 1, fabricIndex: FabricIndex(2) }));
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions.map(({ fabricIndex }) => fabricIndex)).deep.equals([FabricIndex(1), FabricIndex(2)]);
        });

        it("mirrors videoStreams[0] into deprecated videoStreamId scalar", async () => {
            const session = makeSession({ id: 1, videoStreams: [10] });
            await cameraEndpoint!.act(async agent => {
                await agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
            const stored = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions[0];
            expect(stored.videoStreamId).to.equal(10);
        });

        it("mirrors audioStreams[0] into deprecated audioStreamId scalar", async () => {
            const session = makeSession({ id: 1, audioStreams: [20] });
            await cameraEndpoint!.act(async agent => {
                await agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
            const stored = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions[0];
            expect(stored.audioStreamId).to.equal(20);
        });

        it("removes a session by its key", async () => {
            const session = makeSession({ id: 1 });
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(session);
                await server.removeSession({ id: 1, fabricIndex: session.fabricIndex, peerNodeId: session.peerNodeId });
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(0);
        });

        it("removeSession is a no-op when the id is absent", async () => {
            const session = makeSession({ id: 1 });
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(session);
                await server.removeSession({ ...session, id: 999 });
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(1);
        });

        it("removeSession keeps the session with the same id from another peer node", async () => {
            const sessionA = makeSession({ id: 1, peerNodeId: NodeId(10n) });
            const sessionB = makeSession({ id: 1, peerNodeId: NodeId(99n) });
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(sessionA);
                await server.upsertSession(sessionB);
                await server.removeSession(sessionB);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions.map(({ peerNodeId }) => peerNodeId)).deep.equals([NodeId(10n)]);
        });

        it("removeSession keeps the session with the same id and peer node on another fabric", async () => {
            const sessionA = makeSession({ id: 1, fabricIndex: FabricIndex(1) });
            const sessionB = makeSession({ id: 1, fabricIndex: FabricIndex(2) });
            await cameraEndpoint!.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await server.upsertSession(sessionA);
                await server.upsertSession(sessionB);
                await server.removeSession(sessionB);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions.map(({ fabricIndex }) => fabricIndex)).deep.equals([FabricIndex(1)]);
        });
    });

    describe("command identity checks and events", () => {
        let node: ServerNode;
        let cameraEndpoint: ReturnType<(typeof node)["parts"]["get"]>;

        const FABRIC = FabricIndex(1);
        const PEER_NODE = NodeId(42n);
        const SESSION_ID = 7;

        beforeEach(async () => {
            node = await createTestNode();
            cameraEndpoint = node.parts.get("camera-controller");

            const session = makeSession({ id: SESSION_ID, peerNodeId: PEER_NODE, fabricIndex: FABRIC });
            await cameraEndpoint!.act(async agent => {
                await agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
        });

        afterEach(async () => {
            await MockTime.resolve(node.close(), { macrotasks: true });
        });

        type CommandCase = {
            name: string;
            invoke: (server: WebRtcTransportRequestorServer, id: number) => Promise<void>;
        };

        const commandCases: CommandCase[] = [
            {
                name: "offer",
                invoke: (server, id) => server.offer({ webRtcSessionId: id, sdp: "x" }),
            },
            {
                name: "answer",
                invoke: (server, id) => server.answer({ webRtcSessionId: id, sdp: "y" }),
            },
            {
                name: "iceCandidates",
                invoke: (server, id) =>
                    server.iceCandidates({
                        webRtcSessionId: id,
                        iceCandidates: [{ candidate: "c", sdpMid: "0", sdpmLineIndex: 0 }],
                    }),
            },
            {
                name: "end",
                invoke: (server, id) =>
                    server.end({
                        webRtcSessionId: id,
                        reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                    }),
            },
        ];

        commandCases.forEach(({ name, invoke }) => {
            it(`${name} returns NOT_FOUND when session id is unknown`, async () => {
                await expect(
                    withPeerContext(node, FABRIC, PEER_NODE, async context => {
                        await invoke(cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer), 999);
                    }),
                ).to.be.rejectedWith(/NotFound|not found/i);
            });

            it(`${name} returns NOT_FOUND when fabric mismatches`, async () => {
                await expect(
                    withPeerContext(node, FabricIndex(2), PEER_NODE, async context => {
                        await invoke(cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer), SESSION_ID);
                    }),
                ).to.be.rejectedWith(/NotFound|not found/i);
            });

            it(`${name} returns NOT_FOUND when peer node id mismatches`, async () => {
                await expect(
                    withPeerContext(node, FABRIC, NodeId(99n), async context => {
                        await invoke(cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer), SESSION_ID);
                    }),
                ).to.be.rejectedWith(/NotFound|not found/i);
            });
        });

        it("refused names the signal, the unknown session id and the peer", async () => {
            const refusals = new Array<{ signal: string; sessionId: number; peer: string }>();
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).refused.on((signal, sessionId, peer) => {
                refusals.push({ signal, sessionId, peer: `${peer.fabricIndex}/${peer.nodeId}` });
            });

            await expect(
                withPeerContext(node, FABRIC, PEER_NODE, async context => {
                    await cameraEndpoint!
                        .agentFor(context)
                        .get(WebRtcTransportRequestorServer)
                        .offer({ webRtcSessionId: 999, sdp: "offer" });
                }),
            ).to.be.rejectedWith(/NotFound|not found/i);

            expect(refusals).to.deep.equal([{ signal: "offer", sessionId: 999, peer: `${FABRIC}/${PEER_NODE}` }]);
        });

        it("logs the signal it refused with the peer and its own endpoint", async () => {
            using logs = captureRefusalLogs();
            await expect(
                withPeerContext(node, FABRIC, PEER_NODE, async context => {
                    await cameraEndpoint!
                        .agentFor(context)
                        .get(WebRtcTransportRequestorServer)
                        .answer({ webRtcSessionId: 999, sdp: "answer" });
                }),
            ).to.be.rejectedWith(/NotFound|not found/i);

            expect(logs.messages).deep.equals([
                `session refused signal=answer webRtcSessionId=999 fabricIndex=1 peerNodeId=42 ` +
                    `requestorEndpointId=${cameraEndpoint!.number} wait=not-held`,
            ]);
        });

        it("refused does not fire for a session the peer holds", async () => {
            let refusals = 0;
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).refused.on(() => {
                refusals++;
            });

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!
                    .agentFor(context)
                    .get(WebRtcTransportRequestorServer)
                    .offer({ webRtcSessionId: SESSION_ID, sdp: "offer" });
            });

            expect(refusals).to.equal(0);
        });

        it("iceCandidates records no refusal for an empty list, which never reaches a session", async () => {
            let refusals = 0;
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).refused.on(() => {
                refusals++;
            });

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!
                    .agentFor(context)
                    .get(WebRtcTransportRequestorServer)
                    .iceCandidates({ webRtcSessionId: SESSION_ID, iceCandidates: [] });
            }).catch(() => {});

            expect(refusals).to.equal(0);
        });

        it("iceCandidates returns CONSTRAINT_ERROR for an empty list", async () => {
            let thrownError: unknown;
            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!
                    .agentFor(context)
                    .get(WebRtcTransportRequestorServer)
                    .iceCandidates({ webRtcSessionId: SESSION_ID, iceCandidates: [] });
            }).catch(e => {
                thrownError = e;
            });
            if (!(thrownError instanceof StatusResponseError)) {
                throw new Error(`Expected StatusResponseError, got: ${String(thrownError)}`);
            }
            expect(thrownError.code).to.equal(Status.ConstraintError);
        });

        it("end removes the session and a subsequent answer returns NOT_FOUND", async () => {
            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer).end({
                    webRtcSessionId: SESSION_ID,
                    reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                });
            });

            await expect(
                withPeerContext(node, FABRIC, PEER_NODE, async context => {
                    await cameraEndpoint!
                        .agentFor(context)
                        .get(WebRtcTransportRequestorServer)
                        .answer({ webRtcSessionId: SESSION_ID, sdp: "answer" });
                }),
            ).to.be.rejectedWith(/NotFound|not found/i);
        });

        it("end keeps the sessions of other fabrics", async () => {
            const other = makeSession({ id: SESSION_ID + 1, peerNodeId: PEER_NODE, fabricIndex: FabricIndex(2) });
            await cameraEndpoint!.act(async agent => {
                await agent.get(WebRtcTransportRequestorServer).upsertSession(other);
            });

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer).end({
                    webRtcSessionId: SESSION_ID,
                    reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                });
            });

            expect(
                cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions.map(({ id }) => id),
            ).deep.equals([SESSION_ID + 1]);
        });

        describe("with a session of the same id from another peer node", () => {
            const OTHER_PEER_NODE = NodeId(43n);

            beforeEach(async () => {
                const other = makeSession({
                    id: SESSION_ID,
                    peerNodeId: OTHER_PEER_NODE,
                    fabricIndex: FABRIC,
                    streamUsage: StreamUsage.Recording,
                });
                await cameraEndpoint!.act(async agent => {
                    await agent.get(WebRtcTransportRequestorServer).upsertSession(other);
                });
            });

            it("delivers each peer's signaling with its own session", async () => {
                const answered = new Array<{ peerNodeId: NodeId; sdp: string }>();
                cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).answer.on(({ peerNodeId }, sdp) => {
                    answered.push({ peerNodeId, sdp });
                });

                const answer = (peerNodeId: NodeId, sdp: string) =>
                    withPeerContext(node, FABRIC, peerNodeId, async context => {
                        await cameraEndpoint!
                            .agentFor(context)
                            .get(WebRtcTransportRequestorServer)
                            .answer({ webRtcSessionId: SESSION_ID, sdp });
                    });
                await answer(PEER_NODE, "a");
                await answer(OTHER_PEER_NODE, "b");

                expect(answered).deep.equals([
                    { peerNodeId: PEER_NODE, sdp: "a" },
                    { peerNodeId: OTHER_PEER_NODE, sdp: "b" },
                ]);
            });

            it("end from one peer keeps the other peer's session", async () => {
                await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                    await cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer).end({
                        webRtcSessionId: SESSION_ID,
                        reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                    });
                });

                expect(
                    cameraEndpoint!
                        .stateOf(WebRtcTransportRequestorServer)
                        .currentSessions.map(({ id, peerNodeId }) => ({ id, peerNodeId })),
                ).deep.equals([{ id: SESSION_ID, peerNodeId: OTHER_PEER_NODE }]);

                await withPeerContext(node, FABRIC, OTHER_PEER_NODE, async context => {
                    await cameraEndpoint!
                        .agentFor(context)
                        .get(WebRtcTransportRequestorServer)
                        .answer({ webRtcSessionId: SESSION_ID, sdp: "b" });
                });
            });
        });

        describe("with a session of the same id and peer node on another fabric", () => {
            const OTHER_FABRIC = FabricIndex(2);

            beforeEach(async () => {
                const other = makeSession({ id: SESSION_ID, peerNodeId: PEER_NODE, fabricIndex: OTHER_FABRIC });
                await cameraEndpoint!.act(async agent => {
                    await agent.get(WebRtcTransportRequestorServer).upsertSession(other);
                });
            });

            it("end on one fabric keeps the session on the other fabric", async () => {
                await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                    await cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer).end({
                        webRtcSessionId: SESSION_ID,
                        reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                    });
                });

                expect(
                    cameraEndpoint!
                        .stateOf(WebRtcTransportRequestorServer)
                        .currentSessions.map(({ id, fabricIndex }) => ({ id, fabricIndex })),
                ).deep.equals([{ id: SESSION_ID, fabricIndex: OTHER_FABRIC }]);

                await withPeerContext(node, OTHER_FABRIC, PEER_NODE, async context => {
                    await cameraEndpoint!
                        .agentFor(context)
                        .get(WebRtcTransportRequestorServer)
                        .answer({ webRtcSessionId: SESSION_ID, sdp: "b" });
                });
            });
        });

        it("offer emits the offer observable exactly once", async () => {
            let count = 0;
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).offer.on(() => {
                count++;
            });

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!
                    .agentFor(context)
                    .get(WebRtcTransportRequestorServer)
                    .offer({ webRtcSessionId: SESSION_ID, sdp: "offer" });
            });

            expect(count).to.equal(1);
        });

        it("answer emits the answer observable exactly once", async () => {
            let count = 0;
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).answer.on(() => {
                count++;
            });

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!
                    .agentFor(context)
                    .get(WebRtcTransportRequestorServer)
                    .answer({ webRtcSessionId: SESSION_ID, sdp: "answer" });
            });

            expect(count).to.equal(1);
        });

        it("iceCandidates emits the iceCandidates observable exactly once", async () => {
            let count = 0;
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).iceCandidates.on(() => {
                count++;
            });

            const candidate: WebRtcTransportDefinitions.IceCandidate = {
                candidate: "candidate:1 1 udp 2113937151 192.168.1.1 54321 typ host",
                sdpMid: "0",
                sdpmLineIndex: 0,
            };

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!
                    .agentFor(context)
                    .get(WebRtcTransportRequestorServer)
                    .iceCandidates({ webRtcSessionId: SESSION_ID, iceCandidates: [candidate] });
            });

            expect(count).to.equal(1);
        });

        it("end emits the end observable exactly once", async () => {
            let count = 0;
            cameraEndpoint!.eventsOf(WebRtcTransportRequestorServer).end.on(() => {
                count++;
            });

            await withPeerContext(node, FABRIC, PEER_NODE, async context => {
                await cameraEndpoint!.agentFor(context).get(WebRtcTransportRequestorServer).end({
                    webRtcSessionId: SESSION_ID,
                    reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                });
            });

            expect(count).to.equal(1);
        });
    });

    describe("holdUnknownSignals", () => {
        let node: ServerNode;
        let cameraEndpoint: Endpoint;
        let holds: Disposable[];

        const FABRIC = FabricIndex(1);
        const PEER_NODE = NodeId(42n);
        const PEER = PeerAddress({ fabricIndex: FABRIC, nodeId: PEER_NODE });
        const SESSION_ID = 7;

        beforeEach(async () => {
            node = await createTestNode();
            cameraEndpoint = node.parts.require("camera-controller");
            holds = [];
        });

        afterEach(async () => {
            for (const hold of holds) {
                hold[Symbol.dispose]();
            }
            await MockTime.resolve(node.close(), { macrotasks: true });
        });

        /** Takes a hold for `peer`; the test's teardown disposes it if the test does not. */
        function hold(peer = PEER) {
            const taken = WebRtcTransportRequestorServer.holdUnknownSignals(cameraEndpoint, peer);
            holds.push(taken);
            return taken;
        }

        async function register(id: number) {
            await cameraEndpoint.act(agent =>
                agent
                    .get(WebRtcTransportRequestorServer)
                    .upsertSession(makeSession({ id, fabricIndex: PEER.fabricIndex, peerNodeId: PEER.nodeId })),
            );
        }

        /**
         * Invokes a signal as the peer. The result is "delivered", or the error the handler threw, so a test sees a
         * refusal as a value and a signal that settles while the test does not await it cannot reject unhandled.
         */
        function signal(
            invoke: (server: WebRtcTransportRequestorServer, id: number) => Promise<void>,
            id: number,
            fabricIndex = FABRIC,
            peerNodeId = PEER_NODE,
        ): Promise<unknown> {
            return withPeerContext(node, fabricIndex, peerNodeId, async context => {
                await invoke(cameraEndpoint.agentFor(context).get(WebRtcTransportRequestorServer), id);
            }).then(
                () => "delivered",
                (error: unknown) => error,
            );
        }

        function offer(id: number, fabricIndex = FABRIC, peerNodeId = PEER_NODE) {
            return signal(
                (server, id) => server.offer({ webRtcSessionId: id, sdp: "offer" }),
                id,
                fabricIndex,
                peerNodeId,
            );
        }

        function expectNotFound(outcome: unknown) {
            expect(outcome).instanceOf(StatusResponseError);
            if (outcome instanceof StatusResponseError) {
                expect(outcome.code).equals(Status.NotFound);
            }
        }

        function recordRefusals() {
            const refusals = new Array<{ signal: string; sessionId: number }>();
            cameraEndpoint.eventsOf(WebRtcTransportRequestorServer).refused.on((signal, sessionId) => {
                refusals.push({ signal, sessionId });
            });
            return refusals;
        }

        /** Checks an internal of the requestor: whether a held signal still observes the recheck. */
        function isRecheckObserved() {
            return cameraEndpoint.behaviors.internalsOf(WebRtcTransportRequestorServer).recheck.isObserved;
        }

        /** Timers running with the hold time of a signal as their interval. */
        function holdTimers() {
            return [...Time.timers].filter(timer => timer.isRunning && timer.interval === Seconds(5)).length;
        }

        const signalCases: Array<{
            name: WebRtcTransportRequestorServer.SignalKind;
            invoke: (server: WebRtcTransportRequestorServer, id: number) => Promise<void>;
        }> = [
            { name: "offer", invoke: (server, id) => server.offer({ webRtcSessionId: id, sdp: "offer" }) },
            { name: "answer", invoke: (server, id) => server.answer({ webRtcSessionId: id, sdp: "answer" }) },
            {
                name: "iceCandidates",
                invoke: (server, id) =>
                    server.iceCandidates({
                        webRtcSessionId: id,
                        iceCandidates: [{ candidate: "c", sdpMid: "0", sdpmLineIndex: 0 }],
                    }),
            },
            {
                name: "end",
                invoke: (server, id) =>
                    server.end({ webRtcSessionId: id, reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup }),
            },
        ];

        signalCases.forEach(({ name, invoke }) => {
            it(`delivers ${name} that arrives before the session is registered`, async () => {
                const delivered = new Array<number>();
                cameraEndpoint.eventsOf(WebRtcTransportRequestorServer)[name].on(session => {
                    delivered.push(session.id);
                });
                const refusals = recordRefusals();
                hold();

                const held = signal(invoke, SESSION_ID);
                expect(await isSettled(held)).equals(false);

                await register(SESSION_ID);
                expect(await settlesPromptly(held)).equals(true);
                expect(await held).equals("delivered");
                expect(delivered).deep.equals([SESSION_ID]);
                expect(refusals).deep.equals([]);
            });
        });

        it("releases a held signal once its session is registered, while the hold remains", async () => {
            hold();
            const timersBefore = holdTimers();

            const held = offer(SESSION_ID);
            expect(await isSettled(held)).equals(false);
            expect(holdTimers()).equals(timersBefore + 1);

            await register(SESSION_ID);
            expect(await settlesPromptly(held)).equals(true);
            expect(await held).equals("delivered");
            expect(isRecheckObserved()).equals(false);
            expect(holdTimers()).equals(timersBefore);
        });

        it("emits a held signal only after the session registration committed", async () => {
            let trackedAtEvent: number[] | undefined;
            cameraEndpoint.eventsOf(WebRtcTransportRequestorServer).offer.on(() => {
                trackedAtEvent = cameraEndpoint.stateOf(WebRtcTransportRequestorServer).currentSessions.map(s => s.id);
            });
            hold();

            const held = offer(SESSION_ID);
            await register(SESSION_ID);

            expect(await settlesPromptly(held)).equals(true);
            expect(await held).equals("delivered");
            expect(trackedAtEvent).deep.equals([SESSION_ID]);
        });

        it("keeps holding a signal until the registration transaction completes", async () => {
            let commit!: () => void;
            const committing = new Promise<void>(resolve => (commit = resolve));
            cameraEndpoint.eventsOf(WebRtcTransportRequestorServer).currentSessions$Changing.on(() => committing);
            hold();

            const held = offer(SESSION_ID);
            const registered = register(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            commit();
            await registered;
            expect(await settlesPromptly(held)).equals(true);
            expect(await held).equals("delivered");
        });

        it("refuses a held signal once the hold is disposed and its session is still unknown", async () => {
            using logs = captureRefusalLogs();
            const refusals = recordRefusals();
            const taken = hold();

            const held = offer(99);
            await register(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            taken[Symbol.dispose]();
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
            expect(refusals).deep.equals([{ signal: "offer", sessionId: 99 }]);
            expect(logs.messages.map(message => message.split(" ").at(-1))).deep.equals(["wait=hold-ended"]);
        });

        it("refuses a held signal at once when the hold is disposed without a registration", async () => {
            const taken = hold();

            const held = offer(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            taken[Symbol.dispose]();
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
            expect(cameraEndpoint.stateOf(WebRtcTransportRequestorServer).currentSessions).deep.equals([]);
        });

        it("keeps holding while another hold for the same peer remains, even if one is disposed twice", async () => {
            const first = hold();
            const second = hold();

            const held = offer(SESSION_ID);
            first[Symbol.dispose]();
            first[Symbol.dispose]();
            expect(await settlesPromptly(held, Seconds(1))).equals(false);

            second[Symbol.dispose]();
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
        });

        it("refuses a held signal after the hold time from its arrival", async () => {
            using logs = captureRefusalLogs();
            const refusals = recordRefusals();
            hold();

            await MockTime.advance(Seconds(4));
            const held = offer(SESSION_ID);
            await MockTime.advance(Seconds(4));
            expect(await isSettled(held)).equals(false);
            expect(refusals).deep.equals([]);

            await MockTime.advance(Seconds(1));
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
            expect(refusals).deep.equals([{ signal: "offer", sessionId: SESSION_ID }]);
            expect(logs.messages.map(message => message.split(" ").at(-1))).deep.equals(["wait=timed-out"]);
            expect(isRecheckObserved()).equals(false);
        });

        it("counts the hold time from the signal's arrival, not restarted by a registration of another session", async () => {
            hold();

            const held = offer(SESSION_ID);
            await MockTime.advance(Seconds(3));
            await register(SESSION_ID + 1);
            expect(await isSettled(held)).equals(false);

            for (let second = 3; second < 6 && !(await isSettled(held)); second++) {
                await MockTime.advance(Seconds(1));
            }
            expect(await isSettled(held)).equals(true);
            expectNotFound(await held);
        });

        it("does not hold a signal from another peer node or fabric", async () => {
            hold();

            for (const [fabricIndex, peerNodeId] of [
                [FABRIC, NodeId(99n)],
                [FabricIndex(2), PEER_NODE],
            ] as const) {
                const other = offer(SESSION_ID, fabricIndex, peerNodeId);
                expect(await settlesPromptly(other)).equals(true);
                expectNotFound(await other);
            }
        });

        it("refuses a held signal when the node goes offline", async () => {
            hold();

            const held = offer(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            const stopped = node.stop();
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
            await MockTime.resolve(stopped, { macrotasks: true });
        });

        it("does not hold signals with a hold taken before the node went offline", async () => {
            hold();
            await MockTime.resolve(node.stop(), { macrotasks: true });
            await MockTime.resolve(node.start(), { macrotasks: true });

            const other = offer(SESSION_ID);
            expect(await settlesPromptly(other)).equals(true);
            expectNotFound(await other);
        });

        it("holds signals again after the node comes back online", async () => {
            await MockTime.resolve(node.stop(), { macrotasks: true });
            await MockTime.resolve(node.start(), { macrotasks: true });
            hold();

            const held = offer(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            await register(SESSION_ID);
            expect(await settlesPromptly(held)).equals(true);
            expect(await held).equals("delivered");
        });

        it("refuses a held signal when the requestor's endpoint closes", async () => {
            hold();

            const held = offer(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            await MockTime.resolve(cameraEndpoint.close(), { macrotasks: true });
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
        });

        it("refuses a held signal when the requestor's endpoint resets", async () => {
            hold();

            const held = offer(SESSION_ID);
            expect(await isSettled(held)).equals(false);

            await MockTime.resolve(cameraEndpoint.reset(), { macrotasks: true });
            expect(await settlesPromptly(held)).equals(true);
            expectNotFound(await held);
        });

        it("throws ImplementationError for an endpoint without the requestor", () => {
            expect(() => WebRtcTransportRequestorServer.holdUnknownSignals(node, PEER)).throws(ImplementationError);
        });
    });

    describe("signals invoked through the interaction server", () => {
        const TlvOfferRequest = TlvObject({
            webRtcSessionId: TlvField(0, TlvUInt16),
            sdp: TlvField(1, TlvString),
        });
        const TlvEndRequest = TlvObject({
            webRtcSessionId: TlvField(0, TlvUInt16),
            reason: TlvField(1, TlvUInt8),
        });
        const TlvIceCandidatesRequest = TlvObject({
            webRtcSessionId: TlvField(0, TlvUInt16),
            iceCandidates: TlvField(
                1,
                TlvArray(
                    TlvObject({
                        candidate: TlvField(0, TlvString),
                        sdpMid: TlvField(1, TlvNullable(TlvString)),
                        sdpmLineIndex: TlvField(2, TlvNullable(TlvUInt16)),
                    }),
                ),
            ),
        });

        let node: MockServerNode;
        let endpoint: Endpoint;
        let fabric: Awaited<ReturnType<MockServerNode["addFabric"]>>;
        let holds: Disposable[];

        beforeEach(async () => {
            node = await MockServerNode.createOnline(undefined, { device: undefined });
            endpoint = await node.add(CameraControllerDevice.with(WebRtcTransportRequestorServer));
            fabric = await node.addFabric();
            holds = [];
        });

        afterEach(async () => {
            for (const hold of holds) {
                hold[Symbol.dispose]();
            }
            await node.close();
        });

        /**
         * Invokes a requestor command as the mock peer, over a channel that carries Large Message commands. The result is
         * the status the requestor answered, or the error the invoke failed with, so an invoke that fails while the test
         * does not await it cannot reject unhandled.
         */
        function invokeFromPeer(commandId: number, commandFields: TlvStream): Promise<unknown> {
            return invokeStatus(commandId, commandFields).then(
                status => status,
                (error: unknown) => error,
            );
        }

        async function invokeStatus(commandId: number, commandFields: TlvStream) {
            const tcp = new ProtocolMocks.NetworkChannel({});
            tcp.supportsLargeMessages = true;
            const session = await ProtocolMocks.NodeSession.create({
                manager: node.env.get(SessionManager),
                fabric,
                channel: tcp,
            });
            const exchange = new ProtocolMocks.Exchange({ context: { session }, maxPayloadSize: 1000 });
            const { messenger, getResponse } = interaction.createInvokeMessenger();
            await node.env.get(InteractionServer).handleInvokeRequest(
                exchange,
                {
                    invokeRequests: [
                        {
                            commandPath: {
                                endpointId: endpoint.number,
                                clusterId: ClusterId(WebRtcTransportRequestor.id),
                                commandId: CommandId(commandId),
                            },
                            commandFields,
                        },
                    ],
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    suppressResponse: false,
                    timedRequest: false,
                },
                messenger,
                interaction.BarelyMockedMessage,
            );
            const [response] = getResponse()?.invokeResponses ?? [];
            return response === undefined
                ? undefined
                : TlvInvokeResponseData.decodeTlv(response).status?.status?.status;
        }

        /** Takes a hold for the mock peer; the test's teardown disposes it if the test does not. */
        function holdForPeer() {
            // The mock peer session has node id 0
            const taken = WebRtcTransportRequestorServer.holdUnknownSignals(
                endpoint,
                PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId(0) }),
            );
            holds.push(taken);
            return taken;
        }

        async function registerForPeer(id: number) {
            await endpoint.act(agent =>
                agent.get(WebRtcTransportRequestorServer).upsertSession(makeSession({ id, peerNodeId: NodeId(0) })),
            );
        }

        function offerFromPeer() {
            return invokeFromPeer(
                WebRtcTransportRequestor.commands.offer.id,
                TlvOfferRequest.encodeTlv({ webRtcSessionId: 7, sdp: "offer" }),
            );
        }

        function iceCandidatesFromPeer(webRtcSessionId: number) {
            return invokeFromPeer(
                WebRtcTransportRequestor.commands.iceCandidates.id,
                TlvIceCandidatesRequest.encodeTlv({
                    webRtcSessionId,
                    iceCandidates: [{ candidate: "c", sdpMid: "0", sdpmLineIndex: 0 }],
                }),
            );
        }

        /** Sends `send` under a hold for the mock peer, registers session 7, then disposes the hold. */
        async function registerWhile(send: () => Promise<unknown>) {
            using _hold = holdForPeer();
            const invoked = send();
            await MockTime.macrotasks;
            expect(await isSettled(invoked)).equals(false);
            await MockTime.resolve(registerForPeer(7));
            return MockTime.resolve(invoked);
        }

        it("delivers an offer the provider invokes before its response is processed", async () => {
            const offers = new Array<number>();
            endpoint.eventsOf(WebRtcTransportRequestorServer).offer.on(session => {
                offers.push(session.id);
            });

            expect(await registerWhile(offerFromPeer)).equals(Status.Success);
            expect(offers).deep.equals([7]);
        });

        /** Holds the requestor in another transaction that runs `write` until the returned function is called. */
        function holdRequestor(write?: (server: WebRtcTransportRequestorServer) => Promise<void>) {
            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            const holding = endpoint.act(async agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                await agent.context.transaction.lock(server);
                await server.upsertSession(makeSession({ id: 8, peerNodeId: NodeId(0) }));
                await write?.(server);
                await released;
            });
            return async () => {
                release();
                await holding;
            };
        }

        function endFromPeer() {
            return invokeFromPeer(
                WebRtcTransportRequestor.commands.end.id,
                TlvEndRequest.encodeTlv({
                    webRtcSessionId: 7,
                    reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                }),
            );
        }

        it("waits for another transaction that holds the requestor before an end removes the session", async () => {
            await endpoint.act(async agent => {
                await agent
                    .get(WebRtcTransportRequestorServer)
                    .upsertSession(makeSession({ id: 7, peerNodeId: NodeId(0) }));
            });
            const release = holdRequestor();

            const ended = endFromPeer();
            expect(await settlesPromptly(ended)).equals(false);
            await release();

            expect(await ended).equals(Status.Success);
            expect(endpoint.stateOf(WebRtcTransportRequestorServer).currentSessions.map(s => s.id)).deep.equals([8]);
        });

        it("ends a session once when the peer sends two ends for it at the same time", async () => {
            await endpoint.act(async agent => {
                await agent
                    .get(WebRtcTransportRequestorServer)
                    .upsertSession(makeSession({ id: 7, peerNodeId: NodeId(0) }));
            });
            const ends = new Array<number>();
            endpoint.eventsOf(WebRtcTransportRequestorServer).end.on(session => {
                ends.push(session.id);
            });
            const refusals = new Array<number>();
            endpoint.eventsOf(WebRtcTransportRequestorServer).refused.on((_signal, id) => {
                refusals.push(id);
            });
            const release = holdRequestor();

            const first = endFromPeer();
            const second = endFromPeer();
            await MockTime.macrotasks;
            await release();

            expect([await first, await second]).have.members([Status.Success, Status.NotFound]);
            expect(ends).deep.equals([7]);
            expect(refusals).deep.equals([7]);
        });

        it("refuses an end for a session the application removed while the end waited for the requestor", async () => {
            await endpoint.act(async agent => {
                await agent
                    .get(WebRtcTransportRequestorServer)
                    .upsertSession(makeSession({ id: 7, peerNodeId: NodeId(0) }));
            });
            const ends = new Array<number>();
            endpoint.eventsOf(WebRtcTransportRequestorServer).end.on(session => {
                ends.push(session.id);
            });
            const release = holdRequestor(server =>
                server.removeSession({ id: 7, fabricIndex: fabric.fabricIndex, peerNodeId: NodeId(0) }),
            );

            const ended = endFromPeer();
            await MockTime.macrotasks;
            await release();

            expect(await ended).equals(Status.NotFound);
            expect(ends).deep.equals([]);
            expect(endpoint.stateOf(WebRtcTransportRequestorServer).currentSessions.map(s => s.id)).deep.equals([8]);
        });

        it("removes the session for an end the provider invokes before its response is processed", async () => {
            const ends = new Array<number>();
            endpoint.eventsOf(WebRtcTransportRequestorServer).end.on(session => {
                ends.push(session.id);
            });

            const status = await registerWhile(() =>
                invokeFromPeer(
                    WebRtcTransportRequestor.commands.end.id,
                    TlvEndRequest.encodeTlv({
                        webRtcSessionId: 7,
                        reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                    }),
                ),
            );

            expect(status).equals(Status.Success);
            expect(ends).deep.equals([7]);
            expect(endpoint.stateOf(WebRtcTransportRequestorServer).currentSessions).deep.equals([]);
        });

        /** Records the signals the requestor delivers, as `"<signal> <session id>"`. */
        function recordDelivered() {
            const events = endpoint.eventsOf(WebRtcTransportRequestorServer);
            const delivered = new Array<string>();
            events.offer.on(session => {
                delivered.push(`offer ${session.id}`);
            });
            events.iceCandidates.on(session => {
                delivered.push(`iceCandidates ${session.id}`);
            });
            return delivered;
        }

        /**
         * Starts an End for session `id` whose commit waits until the returned function is called, so the End holds the
         * requestor's lock until then.
         */
        async function endHoldingTheLock(id: number) {
            let committing!: () => void;
            const endCommitting = new Promise<void>(resolve => (committing = resolve));
            let commit!: () => void;
            const committed = new Promise<void>(resolve => (commit = resolve));
            endpoint.eventsOf(WebRtcTransportRequestorServer).currentSessions$Changing.once(() => {
                committing();
                return committed;
            });
            const ended = invokeFromPeer(
                WebRtcTransportRequestor.commands.end.id,
                TlvEndRequest.encodeTlv({
                    webRtcSessionId: id,
                    reason: WebRtcTransportDefinitions.WebRtcEndReason.UserHangup,
                }),
            );
            await MockTime.resolve(endCommitting);
            return async () => {
                commit();
                return MockTime.resolve(ended);
            };
        }

        // Documents current behaviour, not a guarantee: the transaction lock usually serves its waiters in the order
        // they asked
        it("delivers the signals of one session in the order they arrived while they wait for the lock", async () => {
            await registerForPeer(5);
            await registerForPeer(7);
            const delivered = recordDelivered();
            const release = await endHoldingTheLock(5);

            const offered = offerFromPeer();
            expect(await settlesPromptly(offered, Seconds(1))).equals(false);
            const candidates = iceCandidatesFromPeer(7);
            expect(await settlesPromptly(candidates, Seconds(1))).equals(false);

            expect(await release()).equals(Status.Success);
            expect(await MockTime.resolve(offered)).equals(Status.Success);
            expect(await MockTime.resolve(candidates)).equals(Status.Success);
            expect(delivered).deep.equals(["offer 7", "iceCandidates 7"]);
        });

        it("registers a session once a signal handler that holds the requestor commits", async () => {
            await registerForPeer(5);
            const release = await endHoldingTheLock(5);

            const registered = registerForPeer(7);
            expect(await settlesPromptly(registered, Seconds(1))).equals(false);

            expect(await release()).equals(Status.Success);
            await MockTime.resolve(registered);
            expect(endpoint.stateOf(WebRtcTransportRequestorServer).currentSessions.map(s => s.id)).deep.equals([7]);
        });

        it("removes a session once a signal handler that holds the requestor commits", async () => {
            await registerForPeer(5);
            await registerForPeer(7);
            const release = await endHoldingTheLock(5);

            const removed = (async () => {
                await endpoint.act(agent =>
                    agent
                        .get(WebRtcTransportRequestorServer)
                        .removeSession({ id: 7, fabricIndex: fabric.fabricIndex, peerNodeId: NodeId(0) }),
                );
            })();
            expect(await settlesPromptly(removed, Seconds(1))).equals(false);

            expect(await release()).equals(Status.Success);
            await MockTime.resolve(removed);
            expect(endpoint.stateOf(WebRtcTransportRequestorServer).currentSessions).deep.equals([]);
        });

        // Documents current behaviour, not a guarantee: the transaction lock is reentrant for its holder
        it("registers a session inside a transaction that already locked the requestor", async () => {
            const registered = (async () => {
                await endpoint.act(async agent => {
                    const requestor = agent.get(WebRtcTransportRequestorServer);
                    await agent.context.transaction.lock(requestor);
                    await requestor.upsertSession(makeSession({ id: 7, peerNodeId: NodeId(0) }));
                });
            })();

            expect(await settlesPromptly(registered)).equals(true);
            expect(endpoint.stateOf(WebRtcTransportRequestorServer).currentSessions.map(s => s.id)).deep.equals([7]);
        });

        it("does not hold a signal for another session behind a held one", async () => {
            const delivered = recordDelivered();
            await registerForPeer(5);
            holdForPeer();
            const offered = offerFromPeer();

            const candidates = iceCandidatesFromPeer(5);
            expect(await settlesPromptly(candidates)).equals(true);
            expect(await candidates).equals(Status.Success);
            expect(delivered).deep.equals(["iceCandidates 5"]);

            await registerForPeer(7);
            expect(await MockTime.resolve(offered)).equals(Status.Success);
        });

        it("refuses an offer for a session whose end commits while the offer arrives", async () => {
            await endpoint.act(async agent => {
                await agent
                    .get(WebRtcTransportRequestorServer)
                    .upsertSession(makeSession({ id: 7, peerNodeId: NodeId(0) }));
            });
            const events = endpoint.eventsOf(WebRtcTransportRequestorServer);
            const offers = new Array<number>();
            events.offer.on(session => {
                offers.push(session.id);
            });
            let committing!: () => void;
            const endCommitting = new Promise<void>(resolve => (committing = resolve));
            let commit!: () => void;
            const committed = new Promise<void>(resolve => (commit = resolve));
            events.currentSessions$Changing.on(() => {
                committing();
                return committed;
            });

            const ended = endFromPeer();
            await MockTime.resolve(endCommitting);
            const offered = offerFromPeer();
            expect(await settlesPromptly(offered)).equals(false);
            commit();

            expect(await MockTime.resolve(ended)).equals(Status.Success);
            expect(await MockTime.resolve(offered)).equals(Status.NotFound);
            expect(offers).deep.equals([]);
        });
    });

    describe("ACL install", () => {
        let node: ServerNode;

        beforeEach(async () => {
            node = await createTestNode();
        });

        afterEach(async () => {
            await MockTime.resolve(node.close(), { macrotasks: true });
        });

        async function addFabricToNode(n: ServerNode) {
            const fabricAuthority = n.env.get(FabricAuthority);
            await fabricAuthority.construction.ready;
            await MockTime.resolve(fabricAuthority.createFabric({ adminFabricLabel: "test-fabric" }), {
                macrotasks: true,
            });
            await MockTime.macrotasks;
        }

        it("ACL install adds one entry on first online", async () => {
            await addFabricToNode(node);

            const cameraEndpoint = node.parts.get("camera-controller");
            const acl = node.stateOf(AccessControlServer).acl;
            const entry = acl.find(
                e =>
                    e.privilege === AccessControl.AccessControlEntryPrivilege.Operate &&
                    e.authMode === AccessControl.AccessControlEntryAuthMode.Case &&
                    e.targets?.length === 1 &&
                    e.targets[0].cluster === WebRtcTransportRequestor.id &&
                    e.targets[0].endpoint === cameraEndpoint!.number,
            );
            expect(entry).to.not.be.undefined;
        });

        // Documents current behaviour, not a guarantee: initialize() installs the entry when the node is already online
        it("ACL install adds an entry for a requestor endpoint added to a node that is online with a fabric", async () => {
            await addFabricToNode(node);

            const late = await node.add({
                id: "late-camera-controller",
                type: CameraControllerDevice.with(WebRtcTransportRequestorServer),
            });
            await MockTime.macrotasks;

            const entry = node
                .stateOf(AccessControlServer)
                .acl.find(
                    e =>
                        e.targets?.length === 1 &&
                        e.targets[0].cluster === WebRtcTransportRequestor.id &&
                        e.targets[0].endpoint === late.number,
                );
            expect(entry).not.undefined;
        });

        it("does not duplicate the entry across repeated online events", async () => {
            await addFabricToNode(node);

            const cameraEndpoint = node.parts.get("camera-controller");
            // Re-running initialize() re-invokes #nodeOnline with the fabric present, exercising the ACL-dedup path.
            await cameraEndpoint!.act(agent => agent.get(WebRtcTransportRequestorServer).initialize());

            const acl = node.stateOf(AccessControlServer).acl;
            const entries = acl.filter(
                e =>
                    e.privilege === AccessControl.AccessControlEntryPrivilege.Operate &&
                    e.authMode === AccessControl.AccessControlEntryAuthMode.Case &&
                    e.targets?.length === 1 &&
                    e.targets[0].cluster === WebRtcTransportRequestor.id &&
                    e.targets[0].endpoint === cameraEndpoint!.number,
            );
            expect(entries).to.have.lengthOf(1);
        });
    });
});

/**
 * Collects the requestor's "session refused" debug lines until disposed.
 */
function captureRefusalLogs() {
    const messages = new Array<string>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            const text = String(message.values[0]);
            if (
                message.facility === "WebRtcTransportRequestorServer" &&
                message.level === LogLevel.DEBUG &&
                text.startsWith("session refused")
            ) {
                messages.push(text);
            }
        },
    });
    return {
        messages,
        [Symbol.dispose]() {
            delete Logger.destinations.capture;
        },
    };
}
