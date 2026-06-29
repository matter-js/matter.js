/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { AccessControlServer } from "#behaviors/access-control";
import { WebRtcTransportRequestorServer } from "#behaviors/web-rtc-transport-requestor";
import { CameraControllerDevice } from "#devices/camera-controller";
import { ServerNode } from "#node/ServerNode.js";
import {
    Crypto,
    Entropy,
    Environment,
    MockCrypto,
    MockStorageService,
    Network,
    NetworkSimulator,
} from "@matter/general";
import { FabricAuthority, ProtocolMocks } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId, Status, StatusResponseError, StreamUsage } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { WebRtcTransportDefinitions } from "@matter/types/clusters/web-rtc-transport-definitions";
import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";

type WebRtcSession = WebRtcTransportDefinitions.WebRtcSession;

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
            await cameraEndpoint!.act(agent => {
                agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(1);
            expect(sessions[0].id).to.equal(1);
        });

        it("replaces an existing session with the same id", async () => {
            const session1 = makeSession({ id: 1, peerNodeId: NodeId(10n) });
            const session2 = makeSession({ id: 1, peerNodeId: NodeId(99n) });
            await cameraEndpoint!.act(agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                server.upsertSession(session1);
                server.upsertSession(session2);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(1);
            expect(sessions[0].peerNodeId).to.equal(NodeId(99n));
        });

        it("mirrors videoStreams[0] into deprecated videoStreamId scalar", async () => {
            const session = makeSession({ id: 1, videoStreams: [10] });
            await cameraEndpoint!.act(agent => {
                agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
            const stored = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions[0];
            expect(stored.videoStreamId).to.equal(10);
        });

        it("mirrors audioStreams[0] into deprecated audioStreamId scalar", async () => {
            const session = makeSession({ id: 1, audioStreams: [20] });
            await cameraEndpoint!.act(agent => {
                agent.get(WebRtcTransportRequestorServer).upsertSession(session);
            });
            const stored = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions[0];
            expect(stored.audioStreamId).to.equal(20);
        });

        it("removes a session by id", async () => {
            const session = makeSession({ id: 1 });
            await cameraEndpoint!.act(agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                server.upsertSession(session);
                server.removeSession(1);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(0);
        });

        it("removeSession is a no-op when the id is absent", async () => {
            const session = makeSession({ id: 1 });
            await cameraEndpoint!.act(agent => {
                const server = agent.get(WebRtcTransportRequestorServer);
                server.upsertSession(session);
                server.removeSession(999);
            });
            const sessions = cameraEndpoint!.stateOf(WebRtcTransportRequestorServer).currentSessions;
            expect(sessions).to.have.lengthOf(1);
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
            await cameraEndpoint!.act(agent => {
                agent.get(WebRtcTransportRequestorServer).upsertSession(session);
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

        it("iceCandidates returns INVALID_COMMAND for an empty list", async () => {
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
            expect(thrownError.code).to.equal(Status.InvalidCommand);
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

        it("does not duplicate the entry across repeated online events", async () => {
            await addFabricToNode(node);

            const cameraEndpoint = node.parts.get("camera-controller");
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
