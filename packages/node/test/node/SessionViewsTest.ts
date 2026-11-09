/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionsBehavior } from "#behavior/system/sessions/SessionsBehavior.js";
import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { InteractionServer } from "#node/server/InteractionServer.js";
import { ServerSubscription } from "#node/server/ServerSubscription.js";
import { InternalError, Timestamp } from "@matter/general";
import { Specification } from "@matter/model";
import { interaction, MockServerNode } from "@matter/node/testing";
import {
    ExchangeManager,
    MdnsService,
    NetworkProfiles,
    NodeSession,
    PeerSet,
    ProtocolMocks,
    SessionClosedError,
    SessionManager,
} from "@matter/protocol";
import { AttributeId, ClusterId, CommandId, EndpointNumber, NodeId, SECURE_CHANNEL_PROTOCOL_ID } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

type Fabric = Awaited<ReturnType<MockServerNode["addFabric"]>>;

const PEER_NODE_ID = NodeId(0x4321n);

const onOffPath = {
    endpointId: EndpointNumber(1),
    clusterId: ClusterId(OnOff.id),
    attributeId: AttributeId(OnOff.attributes.onOff.id),
};

/**
 * A node with two CASE sessions of one peer that we respond to: {@link establishing}, whose handshake still runs, and
 * {@link established}.  The establishing session is created first and is the least recently used, so a consumer that
 * picks a single session of the wrong view picks it.  Each session carries a subscription.
 *
 * With `pase`, both sessions are PASE sessions without fabric and carry no subscription.
 */
async function views(options: { pase?: boolean } = {}) {
    const node = await MockServerNode.createOnline();
    const fabric = options.pase ? undefined : await node.addFabric();
    const sessions = node.env.get(SessionManager);

    const sessionEvents = new Array<{ event: "opened" | "closed"; name: string }>();
    node.eventsOf(SessionsBehavior).opened.on(({ name }) => {
        sessionEvents.push({ event: "opened", name });
    });
    node.eventsOf(SessionsBehavior).closed.on(({ name }) => {
        sessionEvents.push({ event: "closed", name });
    });

    let nextId = 0x7000;
    async function open(establishing?: true) {
        const id = nextId++;
        return await ProtocolMocks.NodeSession.create({
            manager: sessions,
            index: id,
            id,
            peerSessionId: id,
            fabric,
            peerNodeId: options.pase ? NodeId.UNSPECIFIED_NODE_ID : PEER_NODE_ID,
            isInitiator: false,
            establishing,
        });
    }

    const establishing = await open(true);
    const established = await open();
    establishing.timestamp = Timestamp(0);
    established.timestamp = Timestamp(1);

    const subscriptions = new Map<NodeSession, ServerSubscription>();
    if (fabric !== undefined) {
        for (const session of [establishing, established]) {
            await subscribeOn(node, session, true);
            const [subscription] = session.subscriptions;
            if (!(subscription instanceof ServerSubscription)) {
                throw new InternalError(`No subscription on ${session.via}`);
            }
            subscriptions.set(session, subscription);
        }
    }

    return {
        node,
        fabric,
        sessions,
        establishing,
        established,
        pair: [establishing, established],
        subscriptions,
        sessionEvents,
        open,
    };
}

type Views = Awaited<ReturnType<typeof views>>;

async function subscribeOn(node: MockServerNode, session: NodeSession, keepSubscriptions: boolean) {
    await using exchange = new ProtocolMocks.Exchange({ context: { session }, maxPayloadSize: 1000 });
    await node.env.get(InteractionServer).handleSubscribeRequest(
        exchange,
        {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: false,
            attributeRequests: [onOffPath],
            keepSubscriptions,
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 60,
        },
        interaction.BarelyMockedMessenger,
        interaction.BarelyMockedMessage,
    );
}

async function toggleWithDelayedReports(node: MockServerNode, fabric: Fabric) {
    await interaction.invoke(
        node,
        fabric,
        {
            commandPath: {
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(OnOff.id),
                commandId: CommandId(OnOff.commands.toggle.id),
            },
        },
        () => {},
        { delayReportData: { delayMinMs: 1000, delayJitterWindowMs: 0 } },
    );
}

/** Which of the two sessions of {@link views} a consumer sees. */
type Seen = "both" | "establishing" | "established";

interface Consumer {
    name: string;
    pase?: boolean;
    sees: Seen;

    /** What the consumer does with the sessions it sees, when "sees" does not describe it. */
    outcome?: string;

    /** Exercise the consumer and return the sessions of {@link Views.pair} it saw. */
    seen(views: Views): Promise<Iterable<NodeSession | undefined>>;
}

const consumers: Consumer[] = [
    {
        name: "SessionManager.sessionsFor()",
        sees: "both",
        seen: async ({ sessions, established }) => sessions.sessionsFor(established.peerAddress),
    },
    {
        name: "SessionManager.sessionsForFabricIndex()",
        sees: "both",
        seen: async ({ sessions, fabric }) => (fabric ? sessions.sessionsForFabricIndex(fabric.fabricIndex) : []),
    },
    {
        name: "SessionManager.getSession(), which routes received messages",
        sees: "both",
        seen: async ({ sessions, pair }) => pair.map(session => sessions.getSession(session.id)),
    },
    {
        name: "SessionManager.closeAllSessions()",
        sees: "both",
        seen: async ({ sessions, pair }) => {
            await MockTime.resolve(sessions.closeAllSessions());
            expect(pair.filter(session => sessions.registeredSessions.has(session))).deep.equals([]);
            return pair.filter(session => session.isClosed);
        },
    },
    {
        name: "SessionManager.findOldestInactiveSession()",
        sees: "establishing",
        outcome: "picks the oldest of both sessions, which is the establishing one",
        seen: async ({ sessions }) => [sessions.findOldestInactiveSession()],
    },
    {
        name: "SessionManager.handlePeerLoss()",
        sees: "both",
        seen: async ({ sessions, established, pair }) => {
            await MockTime.resolve(
                sessions.handlePeerLoss(established.peerAddress, { cause: new SessionClosedError("test") }),
            );
            expect(pair.filter(session => sessions.registeredSessions.has(session))).deep.equals([]);
            return pair.filter(session => session.isClosed);
        },
    },
    {
        name: "SessionManager.forFabric()",
        sees: "established",
        seen: async ({ sessions, fabric }) => (fabric ? sessions.forFabric(fabric) : []),
    },
    {
        name: "SessionManager.getPaseSession()",
        pase: true,
        sees: "established",
        seen: async ({ sessions }) => [sessions.getPaseSession()],
    },
    {
        name: "SessionManager.getActiveSessionInformation()",
        sees: "established",
        seen: async ({ sessions, pair }) => {
            const names = new Set(sessions.getActiveSessionInformation().map(({ name }) => name));
            return pair.filter(session => names.has(`${session.via}`));
        },
    },
    {
        name: "eviction of the least recently used session beyond the per-peer cap",
        sees: "established",
        seen: async ({ open, pair }) => {
            for (let i = 0; i < 5; i++) {
                await open();
            }
            await MockTime.yield3();
            return pair.filter(session => session.isClosing);
        },
    },
    {
        name: "PeerSet adopting the sessions that predate it",
        sees: "established",
        seen: async ({ node, sessions, established }) => {
            const { env } = node;
            const peers = new PeerSet({
                lifetime: env,
                sessions,
                names: env.get(MdnsService).names,
                networks: env.get(NetworkProfiles),
            });
            return peers.get(established.peerAddress)?.sessions ?? [];
        },
    },
    {
        name: "Peer.subscriptions",
        sees: "both",
        seen: async ({ node, sessions, established, pair, subscriptions }) => {
            const { env } = node;
            const peers = new PeerSet({
                lifetime: env,
                sessions,
                names: env.get(MdnsService).names,
                networks: env.get(NetworkProfiles),
            });
            const peerSubscriptions = new Set(peers.get(established.peerAddress)?.subscriptions);
            return pair.filter(session => {
                const subscription = subscriptions.get(session);
                return subscription !== undefined && peerSubscriptions.has(subscription);
            });
        },
    },
    {
        name: "SessionsBehavior events opened and closed",
        sees: "established",
        seen: async ({ pair, sessionEvents }) => {
            for (const session of pair) {
                await MockTime.resolve(session.initiateForceClose({ cause: new SessionClosedError("test") }));
            }
            const named = new Set(sessionEvents.map(({ name }) => name));
            return pair.filter(session => named.has(`${session.via}`));
        },
    },
    {
        name: "InteractionServer clearing the subscriptions of a Subscribe with keepSubscriptions false",
        sees: "both",
        seen: async ({ node, established, pair, subscriptions }) => {
            await subscribeOn(node, established, false);
            return pair.filter(session => subscriptions.get(session)?.isTerminated);
        },
    },
    {
        name: "InteractionServer deferring reports for an invoke with DelayReportData",
        sees: "both",
        seen: async ({ node, fabric, subscriptions }) => {
            const deferred = new Set<NodeSession>();
            for (const [session, subscription] of subscriptions) {
                const { deferReports } = subscription;
                subscription.deferReports = delay => {
                    deferred.add(session);
                    deferReports.call(subscription, delay);
                };
            }
            if (fabric) {
                await toggleWithDelayedReports(node, fabric);
            }
            return deferred;
        },
    },
    {
        name: "GeneralDiagnostics DeviceLoadStatus counting subscriptions",
        sees: "both",
        seen: async ({ node, pair, establishing, established }) => {
            // The establishing session holds 1 subscription and the established one 2, so the count tells which were seen
            await subscribeOn(node, established, true);
            const { currentSubscriptions } = node.stateOf(GeneralDiagnosticsServer).deviceLoadStatus;
            const counted = new Map<number, NodeSession[]>([
                [3, pair],
                [2, [established]],
                [1, [establishing]],
            ]);
            return counted.get(currentSubscriptions) ?? [];
        },
    },
    {
        name: "ExchangeManager sending CloseSession on a graceful close",
        sees: "both",
        seen: async ({ node, pair }) => {
            const exchanges = node.env.get(ExchangeManager);
            const { initiateExchangeForSession } = exchanges;
            const closeSessionSent = new Set<NodeSession>();
            exchanges.initiateExchangeForSession = (session, protocolId, options) => {
                if (protocolId === SECURE_CHANNEL_PROTOCOL_ID && session instanceof NodeSession) {
                    closeSessionSent.add(session);
                }
                return initiateExchangeForSession.call(exchanges, session, protocolId, options);
            };
            for (const session of pair) {
                await MockTime.resolve(session.initiateClose());
            }
            return closeSessionSent;
        },
    },
];

describe("SessionViews", () => {
    before(() => {
        MockTime.init();
    });

    MockForwardFeatures.enable("delay-report-data");

    for (const { name, pase, sees, outcome, seen } of consumers) {
        it(`${name} ${outcome ?? `sees ${sees === "both" ? "both sessions" : `the ${sees} session`}`}`, async () => {
            const fixture = await views({ pase });
            const { node, establishing, established } = fixture;
            try {
                const expected = {
                    both: [establishing, established],
                    establishing: [establishing],
                    established: [established],
                }[sees];
                const actual = new Set(await seen(fixture));
                expect(fixture.pair.filter(session => actual.has(session))).deep.equals(expected);
            } finally {
                await node.close();
            }
        });
    }
});
