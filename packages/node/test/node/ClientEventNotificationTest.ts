/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { SwitchClient, SwitchServer } from "#behaviors/switch";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ClientEndpointInitializer } from "#node/client/ClientEndpointInitializer.js";
import { PeerBehavior } from "#node/client/PeerBehavior.js";
import type { ClientNode } from "#node/ClientNode.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ServerNode } from "#node/ServerNode.js";
import { Seconds } from "@matter/general";
import { FeatureBitmap } from "@matter/model";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { ClientRead, ClientSubscribe, Read, ReadResult, Subscribe } from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    EventId,
    EventNumber,
    Priority,
    TlvAny,
} from "@matter/types";
import { Switch } from "@matter/types/clusters/switch";

describe("Client Event Notification", () => {
    before(() => MockTime.init());

    describe("peer.eventsOf()", () => {
        it("delivers MS initialPress to client", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(
                        SwitchServer.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease),
                    ),
                },
            });
            const peer = controller.peers.get("peer1")!;

            const received = new Promise<{ newPosition: number }>(resolve =>
                peer.eventsOf(SwitchClient).initialPress!.on(resolve),
            );
            await device.act(agent => {
                (agent as any).switch.events.initialPress.emit({ newPosition: 1 }, agent.context);
            });

            expect(await MockTime.resolve(received)).deep.equals({ newPosition: 1 });
        });

        it("delivers MS, MSR and MSM events to client", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(
                        SwitchServer.with(
                            Switch.Feature.MomentarySwitch,
                            Switch.Feature.MomentarySwitchRelease,
                            Switch.Feature.MomentarySwitchMultiPress,
                        ),
                    ),
                },
            });
            const peer = controller.peers.get("peer1")!;

            const received: Array<{ type: string; payload: unknown }> = [];
            const allReceived = new Promise<void>(resolve => {
                let count = 0;
                const onEvent = (type: string) => (payload: unknown) => {
                    received.push({ type, payload });
                    if (++count >= 3) resolve();
                };
                const ev = peer.eventsOf(SwitchClient);
                ev.initialPress!.on(onEvent("initialPress"));
                ev.shortRelease!.on(onEvent("shortRelease"));
                ev.multiPressComplete!.on(onEvent("multiPressComplete"));
            });

            await device.act(agent => {
                const ev = (agent as any).switch.events;
                ev.initialPress.emit({ newPosition: 1 }, agent.context);
                ev.shortRelease.emit({ previousPosition: 1 }, agent.context);
                ev.multiPressComplete.emit({ previousPosition: 1, totalNumberOfPressesCounted: 2 }, agent.context);
            });

            await MockTime.resolve(allReceived);

            expect(received).deep.equals([
                { type: "initialPress", payload: { newPosition: 1 } },
                { type: "shortRelease", payload: { previousPosition: 1 } },
                { type: "multiPressComplete", payload: { previousPosition: 1, totalNumberOfPressesCounted: 2 } },
            ]);
        });
    });

    describe("ChangeNotificationService", () => {
        it("emits EventOccurrence for MS initialPress", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(
                        SwitchServer.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease),
                    ),
                },
            });

            const changes = controller.env.get(ChangeNotificationService);
            const eventReceived = new Promise<ChangeNotificationService.EventOccurrence>(resolve =>
                changes.change.on(change => {
                    if (change.kind === "event") resolve(change);
                }),
            );

            await device.act(agent => {
                (agent as any).switch.events.initialPress.emit({ newPosition: 1 }, agent.context);
            });

            const occurrence = await MockTime.resolve(eventReceived);
            expect(occurrence.event.name).equals("InitialPress");
            expect(ClusterBehavior.is(occurrence.behavior) && occurrence.behavior.cluster.name).equals("Switch");
            expect(occurrence.payload).deep.equals({ newPosition: 1 });
            expect(occurrence.timestampKind).equals("epoch");
        });

        it("emits EventOccurrence for MS, MSR and MSM events", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(
                        SwitchServer.with(
                            Switch.Feature.MomentarySwitch,
                            Switch.Feature.MomentarySwitchRelease,
                            Switch.Feature.MomentarySwitchMultiPress,
                        ),
                    ),
                },
            });

            const changes = controller.env.get(ChangeNotificationService);
            const received: Array<{ event: string; payload: unknown }> = [];
            const allReceived = new Promise<void>(resolve =>
                changes.change.on(change => {
                    if (
                        change.kind === "event" &&
                        ClusterBehavior.is(change.behavior) &&
                        change.behavior.cluster.name === "Switch"
                    ) {
                        received.push({ event: change.event.name, payload: change.payload });
                        if (received.length >= 3) resolve();
                    }
                }),
            );

            await device.act(agent => {
                const ev = (agent as any).switch.events;
                ev.initialPress.emit({ newPosition: 1 }, agent.context);
                ev.shortRelease.emit({ previousPosition: 1 }, agent.context);
                ev.multiPressComplete.emit({ previousPosition: 1, totalNumberOfPressesCounted: 2 }, agent.context);
            });

            await MockTime.resolve(allReceived);

            expect(received).deep.equals([
                { event: "InitialPress", payload: { newPosition: 1 } },
                { event: "ShortRelease", payload: { previousPosition: 1 } },
                { event: "MultiPressComplete", payload: { previousPosition: 1, totalNumberOfPressesCounted: 2 } },
            ]);
        });
    });

    describe("timestamp classification", () => {
        it("distinguishes the four wire timestamp variants", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(
                        SwitchServer.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease),
                    ),
                },
            });
            const peer = controller.peers.get("peer1")!;

            const initializer = peer.env.get(EndpointInitializer);
            expect(initializer).instanceof(ClientEndpointInitializer);
            const emit = (initializer as ClientEndpointInitializer).structure.eventEmitter!;

            const kinds = new Array<ChangeNotificationService.TimestampKind>();
            controller.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "event") {
                    kinds.push(change.timestampKind);
                }
            });

            function reported(number: number, variant: Partial<ReadResult.EventValue>): ReadResult.EventValue {
                return {
                    kind: "event-value",
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: Switch.id,
                        eventId: EventId(Switch.events.initialPress.id),
                    },
                    number: EventNumber(number),
                    timestamp: number * 1000,
                    priority: Priority.Info,
                    value: { newPosition: 1 },
                    tlv: TlvAny,
                    ...variant,
                };
            }

            await MockTime.resolve(emit(reported(1, { epochTimestamp: 1000 }), true));
            await MockTime.resolve(emit(reported(2, { systemTimestamp: 2000 }), true));
            await MockTime.resolve(emit(reported(3, { deltaEpochTimestamp: 3000 }), true));
            await MockTime.resolve(emit(reported(4, { deltaSystemTimestamp: 4000 }), true));

            expect(kinds).deep.equals(["epoch", "system", "epoch-delta", "system-delta"]);
        });
    });

    describe("maxEventNumber", () => {
        const switchEvents = { endpointId: EndpointNumber(0), clusterId: Switch.id };
        const MomentarySwitchServer = SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
        );

        async function switchPair(site: MockSite) {
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(MomentarySwitchServer) },
            });
            const peer = await subscribedPeer(controller, "peer1");

            const press = () =>
                device.act(agent => {
                    agent.get(MomentarySwitchServer).events.initialPress.emit({ newPosition: 1 }, agent.context);
                });

            return { peer, press };
        }

        async function unsubscribedSwitchPair(site: MockSite) {
            const pair = await switchPair(site);
            await MockTime.resolve(pair.peer.set({ network: { autoSubscribe: false } }));
            return pair;
        }

        async function readEventNumbers(peer: ClientNode, request: ClientRead) {
            const numbers = new Array<EventNumber>();
            await MockTime.resolve(
                (async () => {
                    for await (const chunk of peer.interaction.read(request)) {
                        for await (const report of chunk) {
                            if (report.kind === "event-value") {
                                numbers.push(report.number);
                            }
                        }
                    }
                })(),
            );
            return numbers;
        }

        function maxOf(numbers: EventNumber[]) {
            return numbers.reduce((max, number) => (number > max ? number : max), EventNumber(0));
        }

        it("advances on events the node-wide wildcard subscription delivers", async () => {
            await using site = new MockSite();
            const { peer, press } = await switchPair(site);

            const delivered = new Promise<bigint>(resolve =>
                peer.env.get(ChangeNotificationService).change.on(change => {
                    if (change.kind === "event" && change.event.id === Switch.events.initialPress.id) {
                        resolve(BigInt(change.number));
                    }
                }),
            );
            await press();
            const number = await MockTime.resolve(delivered);

            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(number);
        });

        it("advances on events a narrow default subscription delivers", async () => {
            await using site = new MockSite();
            const { peer, press } = await unsubscribedSwitchPair(site);

            await MockTime.resolve(
                peer.set({
                    network: {
                        defaultSubscription: { attributes: [{}], events: [switchEvents] },
                    },
                }),
            );
            await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));

            const delivered = new Promise<bigint>(resolve =>
                peer.env.get(ChangeNotificationService).change.on(change => {
                    if (change.kind === "event" && change.event.id === Switch.events.initialPress.id) {
                        resolve(BigInt(change.number));
                    }
                }),
            );
            await press();
            const number = await MockTime.resolve(delivered);

            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(number);
        });

        it("delivers an event buffered before the first read once with a narrow default subscription", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(MomentarySwitchServer) },
            });
            await controller.start();

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    autoSubscribe: false,
                    autoStateInitialize: false,
                }),
                { macrotasks: true },
            );
            const peer = controller.peers.get("peer1")!;

            await device.act(agent => {
                agent.get(MomentarySwitchServer).events.initialPress.emit({ newPosition: 1 }, agent.context);
            });

            let deliveries = 0;
            controller.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "event" && change.event.id === Switch.events.initialPress.id) {
                    deliveries++;
                }
            });

            await MockTime.resolve(
                peer.set({
                    network: {
                        defaultSubscription: { attributes: [{}], events: [switchEvents] },
                    },
                }),
            );
            peer.behaviors.internalsOf(NetworkClient).isNewlyCommissioned = true;
            await MockTime.resolve(peer.set({ network: { autoSubscribe: true, autoStateInitialize: true } }));
            await subscribedPeer(controller, "peer1");

            expect(deliveries).equals(1);
            expect(peer.stateOf(NetworkClient).maxEventNumber > 0n).true;
        });

        it("advances on a node-wide wildcard read", async () => {
            await using site = new MockSite();
            const { peer, press } = await unsubscribedSwitchPair(site);
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            await press();
            const numbers = await readEventNumbers(peer, Read({ events: [{}] }));

            expect(maxOf(numbers) > before).true;
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(maxOf(numbers));
        });

        it("does not advance on a narrow read, so the resubscription still delivers its events", async () => {
            await using site = new MockSite();
            const { peer, press } = await unsubscribedSwitchPair(site);
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            await press();
            const numbers = await readEventNumbers(peer, Read({ events: [switchEvents] }));
            expect(maxOf(numbers) > before).true;
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);

            const redelivered = new Promise<{ newPosition: number }>(resolve =>
                peer.eventsOf(SwitchClient).initialPress!.on(resolve),
            );
            await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));

            expect(await MockTime.resolve(redelivered)).deep.equals({ newPosition: 1 });
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(maxOf(numbers));
        });

        it("does not advance on a narrow read that also returns attribute data for the endpoint", async () => {
            await using site = new MockSite();
            const { peer, press } = await unsubscribedSwitchPair(site);
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            await press();
            const numbers = await readEventNumbers(peer, {
                ...Read({ attributes: [switchEvents], events: [switchEvents] }),
                includeKnownVersions: true,
            });

            expect(maxOf(numbers) > before).true;
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);
        });

        it("does not advance on a narrow subscription", async () => {
            await using site = new MockSite();
            const { peer, press } = await unsubscribedSwitchPair(site);
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            let reported: (number: EventNumber) => void;
            const received = new Promise<EventNumber>(resolve => (reported = resolve));
            const request: ClientSubscribe = {
                ...Subscribe({ events: [switchEvents], keepSubscriptions: true }),
                sustain: false,
                updated: async (data: ReadResult) => {
                    for await (const chunk of data) {
                        for await (const report of chunk) {
                            if (report.kind === "event-value") {
                                reported(report.number);
                            }
                        }
                    }
                },
            };
            const subscription = await MockTime.resolve(peer.interaction.subscribe(request));

            await press();
            const number = await MockTime.resolve(received);
            subscription.close();

            expect(number > before).true;
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);
        });
    });

    describe("PeerBehavior event composition", () => {
        it("includes all Switch events even when featureMap is 0", () => {
            const attrs = [0, 1, 2, 65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n));
            const shape: PeerBehavior.DiscoveredClusterShape = {
                kind: "discovered",
                id: ClusterId(0x003b),
                revision: 1,
                features: {} as FeatureBitmap,
                attributes: attrs,
                commands: [] as CommandId[],
            };

            const events = PeerBehavior(shape).cluster.events;
            expect(events?.switchLatched, "switchLatched (LS)").not.undefined;
            expect(events?.initialPress, "initialPress (MS)").not.undefined;
            expect(events?.longPress, "longPress (MSL)").not.undefined;
            expect(events?.shortRelease, "shortRelease (MSR)").not.undefined;
            expect(events?.longRelease, "longRelease (MSL)").not.undefined;
            expect(events?.multiPressOngoing, "multiPressOngoing (MSM)").not.undefined;
            expect(events?.multiPressComplete, "multiPressComplete (MSM)").not.undefined;
        });

        it("preserves detected supportedFeatures after all-feature composition", () => {
            // Attribute 4 (multiPressMaxPressCount) differentiates the cache fingerprint from the test above.
            const attrs = [0, 1, 2, 4, 65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n));
            const shape: PeerBehavior.DiscoveredClusterShape = {
                kind: "discovered",
                id: ClusterId(0x003b),
                revision: 1,
                features: { momentarySwitch: true, momentarySwitchRelease: true } as Record<string, boolean>,
                attributes: attrs,
                commands: [] as CommandId[],
            };

            const behaviorType = PeerBehavior(shape);
            expect(behaviorType.features).deep.equals({
                latchingSwitch: false,
                momentarySwitch: true,
                momentarySwitchRelease: true,
                momentarySwitchLongPress: false,
                momentarySwitchMultiPress: false,
                actionSwitch: false,
            });
            expect(behaviorType.cluster.events?.initialPress, "initialPress (MS)").not.undefined;
            expect(behaviorType.cluster.events?.multiPressComplete, "multiPressComplete (MSM)").not.undefined;
        });
    });
});
