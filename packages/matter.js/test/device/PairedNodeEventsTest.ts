/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PairedNode } from "#device/PairedNode.js";
import { Seconds, Time } from "@matter/general";
import { DecodedEventReportValue } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { LegacyControllerSite } from "../util/LegacyControllerSite.js";

async function connectedNodeWithoutSubscription(site: LegacyControllerSite) {
    const { controller, nodeId } = await site.addCommissionedPair({ autoSubscribe: false });
    const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });
    node.connect();
    await MockTime.resolve(Time.sleep("connect", Seconds(5)), { macrotasks: true });
    return node;
}

function startUpsTriggered(node: PairedNode) {
    const triggered = new Array<DecodedEventReportValue<unknown>>();
    node.events.eventTriggered.on(data => {
        if (data.path.clusterId === BasicInformation.Cluster.id && data.path.eventId === 0) {
            triggered.push(data);
        }
    });
    return triggered;
}

describe("PairedNode events", () => {
    before(() => {
        MockTime.init();
    });

    it("triggers events a legacy read returns", async () => {
        await using site = new LegacyControllerSite();
        const node = await connectedNodeWithoutSubscription(site);
        const triggered = startUpsTriggered(node);

        const events = await MockTime.resolve(
            node.getInteractionClient().getEvent({
                endpointId: EndpointNumber(0),
                clusterId: BasicInformation.Cluster.id,
                event: BasicInformation.Cluster.events.startUp,
            }),
        );

        expect(events?.length).equals(1);
        expect(triggered.length).equals(1);
    });

    it("triggers the priming events of a legacy event subscription", async () => {
        await using site = new LegacyControllerSite();
        const node = await connectedNodeWithoutSubscription(site);
        const triggered = startUpsTriggered(node);

        await MockTime.resolve(
            node.getInteractionClient().subscribeEvent({
                endpointId: EndpointNumber(0),
                clusterId: BasicInformation.Cluster.id,
                event: BasicInformation.Cluster.events.startUp,
                minIntervalFloorSeconds: 0,
                maxIntervalCeilingSeconds: 60,
            }),
        );

        expect(triggered.length).equals(1);
    });
});
