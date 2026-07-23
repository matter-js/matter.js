/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BridgedDeviceBasicInformationClient } from "#behaviors/bridged-device-basic-information";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

describe("Peers#instrumentBridgedConfigurationVersion", () => {
    before(() => {
        MockTime.init();
    });

    it("registers the ConfigurationVersion handler once even when clusterInstalled re-emits for the same endpoint", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;
        ep1.behaviors.require(BridgedDeviceBasicInformationClient);

        const structureEvents = controller.env.get(ClientStructureEvents);

        // Structure rebuilds (endpoint-install, cluster-add, peer structure rebuild) re-emit clusterInstalled for
        // an already-installed cluster on the same endpoint — cf. #instrumentBridgedConfigurationVersion.
        structureEvents.emitCluster(ep1, BridgedDeviceBasicInformationClient);
        structureEvents.emitCluster(ep1, BridgedDeviceBasicInformationClient);

        let configurationVersionChangedCalls = 0;
        ep1.lifecycle.configurationVersionChanged.on(() => {
            configurationVersionChangedCalls++;
        });

        await MockTime.resolve(
            ep1.act(agent =>
                ep1
                    .eventsOf(BridgedDeviceBasicInformationClient)
                    .configurationVersion$Changed?.emit(2, 1, agent.context),
            ),
        );

        expect(configurationVersionChangedCalls).equals(1);
    });
});
