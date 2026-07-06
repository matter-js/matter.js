/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationServer } from "#behaviors/basic-information";
import { MockSite, subscribedPeer } from "@matter/node/testing";

describe("ClientNode ConfigurationVersion", () => {
    before(() => MockTime.init());

    it("emits configurationVersionChanged on the peer when the node bumps ConfigurationVersion", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const changed = new Promise<void>(resolve => peer.lifecycle.configurationVersionChanged.once(() => resolve()));

        await device.act(agent => agent.get(BasicInformationServer).increaseConfigurationVersion());

        await MockTime.resolve(changed);
    });
});
