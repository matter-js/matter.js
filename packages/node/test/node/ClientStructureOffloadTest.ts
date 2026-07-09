/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { OnOffClient } from "#behaviors/on-off";
import { SwitchClient, SwitchServer } from "#behaviors/switch";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { Switch } from "@matter/types/clusters/switch";

describe("ClientStructureOffload", () => {
    before(() => {
        MockTime.init();
    });

    it("applies all values from a multi-cluster subscription priming", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice,
            },
        });

        const peer = await subscribedPeer(controller, "peer1");
        const ep1 = peer.parts.get("ep1")!;
        expect(ep1).not.undefined;

        // OnOff attribute landed on the discovered cluster
        const onOff = ep1.stateOf(OnOffClient);
        expect(onOff.onOff).equal(false);

        // Root endpoint BasicInformation also primed
        const basics = peer.stateOf(BasicInformationClient);
        expect(typeof basics.dataModelRevision).equal("number");
    });

    it("delivers events emitted during the same interaction as attribute data", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint.with(
                    SwitchServer.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease),
                ),
            },
        });

        const peer = await subscribedPeer(controller, "peer1");

        const received = new Promise<{ newPosition: number }>(resolve =>
            peer.eventsOf(SwitchClient).initialPress!.on(resolve),
        );

        await device.act(agent => {
            (agent as any).switch.events.initialPress.emit({ newPosition: 1 }, agent.context);
        });

        expect(await MockTime.resolve(received)).deep.equals({ newPosition: 1 });
        expect(peer.construction.status).not.equal("failed");
    });
});
