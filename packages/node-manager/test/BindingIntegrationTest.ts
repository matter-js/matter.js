/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { DesiredStateBehavior } from "@matter/node";
import { BindingServer } from "@matter/node/behaviors/binding";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { ClusterId, EndpointNumber, NodeId } from "@matter/types";

const LOCAL_EP = 1;
const grant = {
    localEndpoint: LOCAL_EP,
    target: { node: NodeId(0x99n), endpoint: EndpointNumber(1), cluster: ClusterId(6) },
};

describe("Binding reconcile integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("applies a binding intent to a peer endpoint and re-applies after behind-the-back removal", async () => {
        await using site = new MockSite();

        const { controller, device } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(BindingServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("binding", "k1", grant, "converge"));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        const deviceEp = device.endpoints.for(LOCAL_EP);
        expect(deviceEp.stateOf(BindingServer).binding.some(t => t.node === NodeId(0x99n))).equals(true);
        expect(peer.stateOf(DesiredStateBehavior).items["binding:k1"]?.status.state).equals("committed");

        await MockTime.resolve(
            deviceEp.act("drop-our-binding", agent => {
                const bs = agent.get(BindingServer);
                bs.state.binding = bs.state.binding.filter(t => t.node !== NodeId(0x99n));
            }),
        );
        expect(deviceEp.stateOf(BindingServer).binding.some(t => t.node === NodeId(0x99n))).equals(false);

        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );

        expect(deviceEp.stateOf(BindingServer).binding.some(t => t.node === NodeId(0x99n))).equals(true);
    });
});
