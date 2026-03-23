/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { SwitchClient, SwitchServer } from "#behaviors/switch";
import { PeerBehavior } from "#node/client/PeerBehavior.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ServerNode } from "#node/ServerNode.js";
import { FeatureBitmap } from "@matter/model";
import { AttributeId, ClusterId, CommandId } from "@matter/types";
import { Switch } from "@matter/types/clusters/switch";
import { MockSite } from "./mock-site.js";

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
