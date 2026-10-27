/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { OnOffClient } from "#behaviors/on-off";
import { SwitchClient, SwitchServer } from "#behaviors/switch";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ClientEndpointInitializer } from "#node/client/ClientEndpointInitializer.js";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import { PeerBehavior } from "#node/client/PeerBehavior.js";
import type { ClientNode } from "#node/ClientNode.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    Crypto,
    Diagnostic,
    isObject,
    Lifecycle,
    LogDestination,
    Logger,
    LogLevel,
    MatterError,
    MockCrypto,
    Seconds,
} from "@matter/general";
import { FeatureBitmap } from "@matter/model";
import { clientStructureOf, MockSite, settled, subscribedPeer } from "@matter/node/testing";
import {
    ClientRead,
    ClientSubscribe,
    InputChunk,
    Read,
    ReadResult,
    SessionManager,
    Subscribe,
    SustainedSubscription,
} from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    EventId,
    EventNumber,
    Priority,
    TlvAny,
    TlvOfModel,
} from "@matter/types";
import { Switch } from "@matter/types/clusters/switch";

class ReportAbortedError extends MatterError {}
class ObserverFailedError extends MatterError {}
class OtherObserverFailedError extends MatterError {}

function isMockCrypto(crypto: Crypto): crypto is MockCrypto {
    return "entropic" in crypto;
}

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
            expect(occurrence.resolvedTimestamp).equals(occurrence.timestamp);
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
            const resolved = new Array<number | undefined>();
            controller.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "event") {
                    kinds.push(change.timestampKind);
                    resolved.push(change.resolvedTimestamp);
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

            await MockTime.resolve(emit(reported(1, { epochTimestamp: 1000, resolvedTimestamp: 1000 })));
            await MockTime.resolve(emit(reported(2, { systemTimestamp: 2000, resolvedTimestamp: 2000 })));
            await MockTime.resolve(emit(reported(3, { deltaEpochTimestamp: 3000, resolvedTimestamp: 4000 })));
            await MockTime.resolve(emit(reported(4, { deltaSystemTimestamp: 4000 })));
            await MockTime.resolve(
                emit(reported(5, { epochTimestamp: 5000, systemTimestamp: 5, resolvedTimestamp: 5000 })),
            );

            expect(kinds).deep.equals(["epoch", "system", "epoch-delta", "system-delta", "epoch"]);
            expect(resolved).deep.equals([1000, 2000, 4000, undefined, 5000]);
        });

        it("delivers the timestamps the report decoder resolved", async () => {
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

            const occurrences = new Array<ChangeNotificationService.EventOccurrence>();
            controller.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "event") {
                    occurrences.push(change);
                }
            });

            const TlvInitialPress = TlvOfModel(Switch.events.initialPress);
            const path = {
                endpointId: EndpointNumber(0),
                clusterId: Switch.id,
                eventId: EventId(Switch.events.initialPress.id),
            };
            const report = {
                eventReports: [{ systemTimestamp: 1000 }, { deltaSystemTimestamp: 4 }, { deltaSystemTimestamp: 1 }].map(
                    (timestamp, i) => ({
                        eventData: {
                            path,
                            eventNumber: EventNumber(i + 1),
                            priority: Priority.Info,
                            ...timestamp,
                            data: TlvInitialPress.encodeTlv({ newPosition: 1 }),
                        },
                    }),
                ),
            };

            for await (const chunk of InputChunk(report)) {
                if (chunk.kind === "event-value") {
                    await MockTime.resolve(emit(chunk));
                }
            }

            expect(
                occurrences.map(({ timestampKind, timestamp, resolvedTimestamp }) => ({
                    timestampKind,
                    timestamp,
                    resolvedTimestamp,
                })),
            ).deep.equals([
                { timestampKind: "system", timestamp: 1000, resolvedTimestamp: 1000 },
                { timestampKind: "system-delta", timestamp: 4, resolvedTimestamp: 1004 },
                { timestampKind: "system-delta", timestamp: 1, resolvedTimestamp: 1005 },
            ]);
        });
    });

    describe("event numbers and observers", () => {
        const switchEvents = { endpointId: EndpointNumber(0), clusterId: Switch.id };
        const urgentSwitchEvents = { ...switchEvents, isUrgent: true };
        const MomentarySwitchServer = SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
        );

        async function switchPair(site: MockSite, options?: { autoSubscribe?: boolean }) {
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(MomentarySwitchServer) },
            });
            const peer = await subscribedPeer(controller, "peer1");
            if (options?.autoSubscribe === false) {
                await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            }

            const press = () =>
                device.act(agent => {
                    agent.get(MomentarySwitchServer).events.initialPress.emit({ newPosition: 1 }, agent.context);
                });

            return {
                controller,
                device,
                peer,
                press,
                observed: observedPresses(peer),
                settle: () => quiet(controller, device, peer),
            };
        }

        function isPress(
            change: ChangeNotificationService.Change,
        ): change is ChangeNotificationService.EventOccurrence {
            return (
                change.kind === "event" &&
                change.behavior.id === SwitchClient.id &&
                change.event.id === Switch.events.initialPress.id
            );
        }

        /** Event numbers of the presses that reach the node's event observers. */
        function observedPresses(peer: ClientNode) {
            const numbers = new Array<EventNumber>();
            peer.env.get(ChangeNotificationService).change.on(change => {
                if (isPress(change)) {
                    numbers.push(EventNumber(change.number));
                }
            });
            return numbers;
        }

        function sustained(subscription: unknown) {
            if (!(subscription instanceof SustainedSubscription)) {
                expect.fail("Expected a sustained subscription");
            }
            return subscription;
        }

        /** Ends the device's sessions, so the controller replaces its subscriptions while the device keeps its events. */
        async function closeSessions(device: ServerNode) {
            for (const session of [...device.env.get(SessionManager).sessions]) {
                await session.initiateClose();
            }
        }

        /** Advances mock time until {@link condition} holds. */
        async function until(condition: () => boolean) {
            await MockTime.resolve(
                (async () => {
                    while (!condition()) {
                        await MockTime.macrotask;
                    }
                })(),
                { macrotasks: true },
            );
        }

        /** Advances mock time by {@link count} macrotasks. */
        async function turns(count: number) {
            await MockTime.resolve(
                (async () => {
                    for (let turn = 0; turn < count; turn++) {
                        await MockTime.macrotask;
                    }
                })(),
                { macrotasks: true },
            );
        }

        /** Advances mock time until the nodes have no activity in flight. */
        async function quiet(...nodes: Parameters<typeof settled>) {
            await MockTime.resolve(settled(...nodes), { macrotasks: true });
        }

        /** Waits until the node stored {@link number} as its event number. */
        async function stored(peer: ClientNode, number: EventNumber) {
            await until(() => peer.stateOf(NetworkClient).maxEventNumber === number);
        }

        async function eventNumbersOf(result: ReadResult) {
            const numbers = new Array<EventNumber>();
            for await (const chunk of result) {
                for await (const report of chunk) {
                    if (report.kind === "event-value") {
                        numbers.push(report.number);
                    }
                }
            }
            return numbers;
        }

        function recordingSubscription(subscribe: Subscribe) {
            const numbers = new Array<EventNumber>();
            const request: ClientSubscribe = {
                ...subscribe,
                sustain: false,
                updated: async data => {
                    numbers.push(...(await eventNumbersOf(data)));
                },
            };
            return { numbers, request };
        }

        it("stores the number of a default subscription event only after observers received it", async () => {
            await using site = new MockSite();
            const { peer, press, settle } = await switchPair(site);
            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);

            const seen = new Array<{ number: bigint; stored: bigint; subscription?: bigint }>();
            peer.env.get(ChangeNotificationService).change.on(change => {
                if (isPress(change)) {
                    seen.push({
                        number: BigInt(change.number),
                        stored: peer.stateOf(NetworkClient).maxEventNumber,
                        subscription: subscription.maxEventNumber,
                    });
                }
            });

            await press();
            await until(() => seen.length > 0);
            await settle();

            expect(seen.length).equals(1);
            const [{ number, stored: storedWhileDelivering, subscription: trackedWhileDelivering }] = seen;
            expect(storedWhileDelivering < number).true;
            expect(trackedWhileDelivering === undefined || trackedWhileDelivering < number).true;
            await stored(peer, EventNumber(number));
            expect(subscription.maxEventNumber).equals(EventNumber(number));
        });

        it("delivers an event to every observer when one of them throws or rejects", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site);
            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);

            const received = new Array<string>();
            const { initialPress } = peer.eventsOf(SwitchClient);
            initialPress.on(() => {
                received.push("throwing");
                throw new ObserverFailedError("observer threw");
            });
            initialPress.on(async () => {
                received.push("rejecting");
                throw new ObserverFailedError("observer rejected");
            });
            initialPress.on(() => {
                received.push("last");
            });

            await press();
            await until(() => observed.length > 0);
            await settle();

            expect(received).deep.equals(["throwing", "rejecting", "last"]);
            await stored(peer, observed[0]);
            expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(subscription);
            expect(subscription.active.value).true;
        });

        it("warns once per kind of failure when a change observer fails for each event report", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site);
            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);

            let presses = 0;
            peer.env.get(ChangeNotificationService).change.on(change => {
                if (isPress(change)) {
                    presses++;
                    if (presses === 4) {
                        throw new OtherObserverFailedError("change observer threw differently");
                    }
                    throw new ObserverFailedError("change observer threw");
                }
            });

            const failures = new Array<{ level: LogLevel; text: string }>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    const text = message.values.join(" ");
                    if (text.includes("change observer threw")) {
                        failures.push({ level: message.level, text });
                    }
                },
            });
            try {
                for (let count = 1; count <= 4; count++) {
                    await press();
                    await until(() => observed.length >= count);
                    await settle();
                }
            } finally {
                delete Logger.destinations.capture;
            }

            expect(failures.map(({ level }) => level)).deep.equals([
                LogLevel.WARN,
                LogLevel.DEBUG,
                LogLevel.DEBUG,
                LogLevel.WARN,
            ]);
            expect(failures.every(({ text }) => text.includes("Change notification observer failed"))).true;
            expect(observed.length).equals(4);
            await stored(peer, observed[3]);
            expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(subscription);
            expect(subscription.active.value).true;
        });

        it("commissions a node while a change observer fails for each event", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(MomentarySwitchServer) },
            });

            let failed = 0;
            controller.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "event") {
                    failed++;
                    throw new ObserverFailedError("change observer threw");
                }
            });

            const cryptos = [controller.env.get(Crypto), device.env.get(Crypto)].filter(isMockCrypto);
            expect(cryptos.length).equals(2);
            for (const crypto of cryptos) {
                crypto.entropic = true;
            }
            await MockTime.resolve(controller.start());
            const { passcode, discriminator } = device.state.commissioning;
            const peer = await MockTime.resolve(
                controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }),
                { macrotasks: true },
            );
            for (const crypto of cryptos) {
                crypto.entropic = false;
            }

            expect(failed).greaterThan(0);
            expect(peer.lifecycle.isCommissioned).true;
        });

        it("ignores events and event numbers of a replaced default subscription", async () => {
            await using site = new MockSite();
            const { controller, device, peer, observed } = await switchPair(site, { autoSubscribe: false });

            const requests = new Array<ClientSubscribe>();
            const subscribe = ClientNodeInteraction.prototype.subscribe;
            ClientNodeInteraction.prototype.subscribe = function (request, context) {
                requests.push(request);
                return subscribe.call(this, request, context);
            };
            try {
                await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
                await quiet(controller, device, peer);
            } finally {
                ClientNodeInteraction.prototype.subscribe = subscribe;
            }
            const [replacedRequest] = requests;
            if (!replacedRequest?.sustain) {
                expect.fail("Expected a sustained default subscription request");
            }
            const replaced = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);

            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await quiet(controller, device, peer);
            expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).not.equals(replaced);
            const storedBefore = peer.stateOf(NetworkClient).maxEventNumber;
            const late = EventNumber(storedBefore + 1000n);

            async function* lateReport(): ReadResult {
                yield [
                    {
                        kind: "event-value",
                        path: { ...switchEvents, eventId: EventId(Switch.events.initialPress.id) },
                        number: late,
                        timestamp: 0,
                        priority: Priority.Info,
                        value: { newPosition: 1 },
                        tlv: TlvAny,
                    },
                ];
            }
            await MockTime.resolve(replaced.request.updated!(lateReport()));
            await MockTime.resolve(Promise.resolve(replacedRequest.maxEventNumberChanged?.(late)));
            await quiet(controller, device, peer);

            expect(observed).deep.equals([]);
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(storedBefore);

            // The next default subscription still requests the event the replaced one did not emit
            const successors = new Array<ClientSubscribe>();
            ClientNodeInteraction.prototype.subscribe = function (request, context) {
                successors.push(request);
                return subscribe.call(this, request, context);
            };
            try {
                await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: true } } }));
                await quiet(controller, device, peer);
            } finally {
                ClientNodeInteraction.prototype.subscribe = subscribe;
            }
            expect(successors.map(({ eventFilters }) => eventFilters)).deep.equals([[{ eventMin: storedBefore + 1n }]]);
        });

        it("finishes delivering an event only after its asynchronous observers settled", async () => {
            await using site = new MockSite();
            const { peer, press, observed } = await switchPair(site);
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            let observing = false;
            peer.eventsOf(SwitchClient).initialPress.on(async () => {
                observing = true;
                await released;
            });

            await press();
            await until(() => observing);
            await turns(50);
            expect(observed).deep.equals([]);
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);

            release();
            await until(() => observed.length > 0);
            await stored(peer, observed[0]);
        });

        it("does not emit an event again when the default subscription changes while its observers run", async () => {
            await using site = new MockSite();
            const { controller, device, peer, press, observed } = await switchPair(site);
            const replaced = peer.behaviors.internalsOf(NetworkClient).activeSubscription;

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            let held = false;
            peer.eventsOf(SwitchClient).initialPress.on(async () => {
                if (!held) {
                    held = true;
                    await released;
                }
            });

            await press();
            await until(() => held);
            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await until(() => {
                const successor = peer.behaviors.internalsOf(NetworkClient).activeSubscription;
                return successor !== undefined && successor !== replaced && sustained(successor).active.value;
            });
            await turns(50);

            release();
            await until(() => observed.length > 0);
            await press();
            await until(() => observed.length > 1);
            await quiet(controller, device, peer);

            expect(observed.length).equals(2);
            expect(observed[1] > observed[0]).true;
            await stored(peer, observed[1]);
        });

        it("emits a default subscription event to observers once", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site);

            await press();
            await until(() => observed.length > 0);
            await settle();

            expect(observed.length).equals(1);
            await stored(peer, observed[0]);
        });

        it("does not deliver the commissioning read's events again with the subscription", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            await controller.start();

            const startUps = new Array<bigint>();
            controller.env.get(ChangeNotificationService).change.on(change => {
                if (
                    change.kind === "event" &&
                    change.behavior.id === BasicInformationClient.id &&
                    change.event.name === "StartUp"
                ) {
                    startUps.push(BigInt(change.number));
                }
            });

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            });
            const peer = await subscribedPeer(controller, "peer1");
            await quiet(controller, device, peer);

            expect(startUps.length).equals(1);
            expect(peer.stateOf(NetworkClient).maxEventNumber >= startUps[0]).true;
        });

        it("stores the number of the events the commissioning read emitted when the read fails", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            await controller.start();

            const emitted = new Array<EventNumber>();
            const read = ClientNodeInteraction.prototype.read;
            ClientNodeInteraction.prototype.read = async function* (request, context): ReadResult {
                const { eventEmitted } = request;
                yield* read.call(
                    this,
                    {
                        ...request,
                        eventEmitted: number => {
                            emitted.push(number);
                            eventEmitted?.(number);
                        },
                    },
                    context,
                );
                throw new ReportAbortedError("read failed after its last report");
            };
            let failure: unknown;
            try {
                const { passcode, discriminator } = device.state.commissioning;
                await MockTime.resolve(
                    controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }).catch(error => {
                        failure = error;
                    }),
                    { macrotasks: true },
                );
            } finally {
                ClientNodeInteraction.prototype.read = read;
            }

            expect(failure).instanceOf(ReportAbortedError);
            expect(emitted.length).greaterThan(0);
            const peer = controller.peers.get("peer1")!;
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(emitted.reduce((a, b) => (b > a ? b : a)));
        });

        it("returns a narrow read's events to the caller only", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site, { autoSubscribe: false });
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            await press();
            const request: ClientRead = Read({ events: [switchEvents] });
            const numbers = await MockTime.resolve(eventNumbersOf(peer.interaction.read(request)));
            await settle();

            expect(numbers.length).equals(1);
            expect(numbers[0] > before).true;
            expect(observed).deep.equals([]);
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);
        });

        it("returns a narrow subscription's events to the caller only", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site, { autoSubscribe: false });
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            const { numbers, request } = recordingSubscription(
                Subscribe({ events: [urgentSwitchEvents], keepSubscriptions: true }),
            );
            const subscription = await MockTime.resolve(peer.interaction.subscribe(request));
            await press();
            await until(() => numbers.length > 0);
            await settle();
            subscription.close();

            expect(numbers.length).equals(1);
            expect(observed).deep.equals([]);
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);
        });

        it("resubscribes a sustained subscription above the last event it delivered", async () => {
            await using site = new MockSite();
            const { device, peer, press, settle } = await switchPair(site, { autoSubscribe: false });
            const before = peer.stateOf(NetworkClient).maxEventNumber;

            const numbers = new Array<EventNumber>();
            const request: ClientSubscribe = {
                ...Subscribe({ events: [urgentSwitchEvents], keepSubscriptions: true }),
                sustain: true,
                updated: async data => {
                    numbers.push(...(await eventNumbersOf(data)));
                },
            };
            const subscription = sustained(await MockTime.resolve(peer.interaction.subscribe(request)));
            await MockTime.resolve(subscription.active);

            await press();
            await until(() => numbers.length > 0);
            await settle();
            expect(numbers.length).equals(1);

            await MockTime.resolve(closeSessions(device));
            await MockTime.resolve(subscription.inactive);
            await MockTime.resolve(subscription.active);

            await press();
            await until(() => numbers.length > 1);
            await settle();
            subscription.close();

            expect(numbers.length).equals(2);
            expect(numbers[1] > numbers[0]).true;
            expect(subscription.maxEventNumber).equals(numbers[1]);
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(before);
        });

        it("resubscribes the default subscription above the number it stored", async () => {
            await using site = new MockSite();
            const { device, peer, press, observed, settle } = await switchPair(site);

            await press();
            await until(() => observed.length > 0);
            await settle();
            expect(observed.length).equals(1);
            await stored(peer, observed[0]);

            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);
            await MockTime.resolve(closeSessions(device));
            await MockTime.resolve(subscription.inactive);
            await MockTime.resolve(subscription.active);

            await press();
            await until(() => observed.length > 1);
            await settle();

            expect(observed.length).equals(2);
            expect(observed[1] > observed[0]).true;
            await stored(peer, observed[1]);
        });

        it("does not store the number of an event dropped because the node is being deleted", async () => {
            await using site = new MockSite();
            const { controller, device, peer, settle } = await switchPair(site);
            const { id } = peer;

            let deleting: Promise<void> | undefined;
            peer.env.get(ChangeNotificationService).change.on(change => {
                if (isPress(change) && deleting === undefined) {
                    deleting = peer.delete();
                }
            });

            const errors = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.level >= LogLevel.ERROR) {
                        errors.push(message.values.join(" "));
                    }
                },
            });
            try {
                await device.act(agent => {
                    const { initialPress } = agent.get(MomentarySwitchServer).events;
                    initialPress.emit({ newPosition: 1 }, agent.context);
                    initialPress.emit({ newPosition: 1 }, agent.context);
                });
                await until(() => deleting !== undefined);
                await MockTime.resolve(deleting!);
                await settle();
            } finally {
                delete Logger.destinations.capture;
            }

            expect(controller.peers.size).equals(0);
            expect(Object.keys(site.storageFor(controller.id)).filter(key => key.includes(id))).deep.equals([]);
            expect(errors).deep.equals([]);
        });

        it("does not store the number of an event dropped because the node crashed", async () => {
            await using site = new MockSite();
            const { controller, device, peer, settle } = await switchPair(site);

            let first: bigint | undefined;
            peer.env.get(ChangeNotificationService).change.on(change => {
                if (isPress(change) && first === undefined) {
                    first = BigInt(change.number);
                    peer.construction.setStatus(Lifecycle.Status.Crashed);
                }
            });

            await device.act(agent => {
                const { initialPress } = agent.get(MomentarySwitchServer).events;
                initialPress.emit({ newPosition: 1 }, agent.context);
                initialPress.emit({ newPosition: 1 }, agent.context);
            });
            await until(() => first !== undefined);
            await settle();

            const network = site.storageFor(controller.id)[`nodes.${peer.id}.endpoints.0.network`];
            const stored = isObject(network) ? network.maxEventNumber : undefined;
            expect(typeof stored === "bigint" && stored < first! + 1n).true;
            peer.construction.setStatus(Lifecycle.Status.Active);
        });

        it("never lowers the stored number", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site);
            await press();
            await until(() => observed.length > 0);
            await settle();
            await stored(peer, observed[0]);

            const internals = peer.behaviors.internalsOf(NetworkClient);
            for (const emitted of [EventNumber(1), undefined]) {
                internals.emittedEventNumber = emitted;
                await MockTime.resolve(Promise.resolve(internals.storeMaxEventNumber?.()));

                expect(peer.stateOf(NetworkClient).maxEventNumber).equals(observed[0]);
            }
        });

        it("stores the number when another transaction holds the network state", async () => {
            await using site = new MockSite();
            const { peer, press, observed, settle } = await switchPair(site);
            await press();
            await until(() => observed.length > 0);
            await settle();
            await stored(peer, observed[0]);
            const higher = EventNumber(observed[0] + 10n);

            const errors = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.level >= LogLevel.ERROR) {
                        errors.push(message.values.join(" "));
                    }
                },
            });
            try {
                let storing: unknown;
                const internals = peer.behaviors.internalsOf(NetworkClient);
                internals.emittedEventNumber = higher;
                await MockTime.resolve(
                    peer.act(async agent => {
                        agent.get(NetworkClient).state.autoStateInitialize = true;
                        storing = internals.storeMaxEventNumber?.();
                        await MockTime.yield3();
                    }),
                );
                await MockTime.resolve(Promise.resolve(storing));
            } finally {
                delete Logger.destinations.capture;
            }

            expect(errors).deep.equals([]);
            expect(peer.stateOf(NetworkClient).maxEventNumber).equals(higher);
        });

        it("resubscribes above the stored number after a restart", async () => {
            await using site = new MockSite();
            const { controller, device, peer, press, observed, settle } = await switchPair(site);
            await press();
            await until(() => observed.length > 0);
            await settle();
            await stored(peer, observed[0]);

            await MockTime.resolve(controller.close(), { macrotasks: true });
            const restarted = await site.addController({ id: controller.id, index: 1 });
            const replayed = new Array<EventNumber>();
            restarted.env.get(ChangeNotificationService).change.on(change => {
                if (isPress(change)) {
                    replayed.push(EventNumber(change.number));
                }
            });
            await MockTime.resolve(restarted.start(), { macrotasks: true });
            const restartedPeer = await subscribedPeer(restarted, "peer1");
            await quiet(restarted, device, restartedPeer);

            expect(replayed).deep.equals([]);
            expect(restartedPeer.stateOf(NetworkClient).maxEventNumber).equals(observed[0]);
        });

        describe("of concurrent interactions", () => {
            function onOffValue(): ReadResult.AttributeValue {
                return {
                    kind: "attr-value",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: OnOffClient.cluster.id,
                        attributeId: AttributeId(OnOffClient.cluster.attributes.onOff.id),
                    },
                    value: true,
                    version: 1,
                    tlv: TlvAny,
                };
            }

            function eventOn(endpointId: number, number: number): ReadResult.EventValue {
                return {
                    kind: "event-value",
                    path: { endpointId: EndpointNumber(endpointId), clusterId: Switch.id, eventId: EventId(1) },
                    number: EventNumber(number),
                    timestamp: number,
                    priority: Priority.Info,
                    value: { newPosition: 1 },
                    tlv: TlvAny,
                };
            }

            /** An interaction that reports attribute data and an event for endpoint 1, which delays the event. */
            function heldInteraction(failure?: Error) {
                let release!: () => void;
                const released = new Promise<void>(resolve => (release = resolve));
                async function* changes(): ReadResult {
                    yield [onOffValue(), eventOn(1, 100)];
                    await released;
                    if (failure) {
                        throw failure;
                    }
                }
                return { changes: changes(), release };
            }

            async function* quickInteraction(): ReadResult {
                yield [eventOn(0, 200)];
            }

            async function consume(result: ReadResult) {
                for await (const _chunk of result);
            }

            it("does not emit a held event once its interaction stopped emitting events", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                const structure = clientStructureOf(peer);

                const emitted = new Array<EventNumber>();
                const emitter = structure.eventEmitter;
                structure.eventEmitter = async occurrence => {
                    emitted.push(occurrence.number);
                };
                try {
                    let emitting = true;
                    async function* changes(): ReadResult {
                        yield [onOffValue(), eventOn(1, 100)];
                        emitting = false;
                    }
                    await MockTime.resolve(
                        consume(
                            structure.mutate(Read({ attributes: [{}], events: [{}] }), changes(), {
                                emitEvents: () => emitting,
                            }),
                        ),
                    );

                    expect(emitted).deep.equals([]);
                } finally {
                    structure.eventEmitter = emitter;
                }
            });

            it("emits every event of an interaction when observers fail for some of them", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                const structure = clientStructureOf(peer);

                const emitted = new Array<EventNumber>();
                const emitter = structure.eventEmitter;
                structure.eventEmitter = async occurrence => {
                    emitted.push(occurrence.number);
                    if (occurrence.number !== EventNumber(101)) {
                        throw new ObserverFailedError(`observer failed for event ${occurrence.number}`);
                    }
                };
                try {
                    async function* changes(): ReadResult {
                        yield [eventOn(0, 1), onOffValue(), eventOn(1, 100), eventOn(1, 101)];
                    }
                    await MockTime.resolve(
                        consume(
                            structure.mutate(Read({ attributes: [{}], events: [{}] }), changes(), {
                                emitEvents: true,
                            }),
                        ),
                    );

                    expect(emitted).deep.equals([EventNumber(1), EventNumber(100), EventNumber(101)]);
                } finally {
                    structure.eventEmitter = emitter;
                }
            });

            it("does not queue emit jobs for the events of an interaction that stopped emitting", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                const structure = clientStructureOf(peer);

                const emitted = new Array<EventNumber>();
                const emitter = structure.eventEmitter;
                structure.eventEmitter = async occurrence => {
                    emitted.push(occurrence.number);
                };
                try {
                    const eventCount = 150;
                    let checks = 0;
                    async function* changes(): ReadResult {
                        yield Array.from({ length: eventCount }, (_, index) => eventOn(0, index + 1));
                    }
                    await MockTime.resolve(
                        consume(
                            structure.mutate(Read({ attributes: [{}], events: [{}] }), changes(), {
                                emitEvents: () => ++checks === 1,
                            }),
                        ),
                    );

                    expect(emitted).deep.equals([]);
                    // Only the first event is queued and checked again by its job; the others are skipped up front
                    expect(checks).equals(eventCount + 1);
                } finally {
                    structure.eventEmitter = emitter;
                }
            });

            for (const outcome of ["ends", "fails"] as const) {
                it(`does not emit an interaction's delayed event at the end of another one when the first ${outcome}`, async () => {
                    await using site = new MockSite();
                    const { controller } = await site.addCommissionedPair();
                    const peer = await subscribedPeer(controller, "peer1");
                    const structure = clientStructureOf(peer);

                    const emitted = new Array<EventNumber>();
                    const emitter = structure.eventEmitter;
                    structure.eventEmitter = async occurrence => {
                        emitted.push(occurrence.number);
                    };
                    try {
                        const request = Read({ attributes: [{}], events: [{}] });
                        const held = heldInteraction(
                            outcome === "fails" ? new ReportAbortedError("aborted") : undefined,
                        );
                        const first = consume(structure.mutate(request, held.changes, { emitEvents: true })).then(
                            () => "ended",
                            () => "failed",
                        );
                        await MockTime.resolve(
                            consume(structure.mutate(request, quickInteraction(), { emitEvents: true })),
                        );

                        expect(emitted).deep.equals([EventNumber(200)]);

                        held.release();
                        expect(await MockTime.resolve(first)).equals(outcome === "ends" ? "ended" : "failed");
                        expect(emitted).deep.equals(
                            outcome === "ends" ? [EventNumber(200), EventNumber(100)] : [EventNumber(200)],
                        );
                    } finally {
                        structure.eventEmitter = emitter;
                    }
                });
            }
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
