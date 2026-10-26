/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNetworkRuntime } from "#behavior/system/network/ServerNetworkRuntime.js";
import { ServerNode } from "#node/ServerNode.js";
import { NetworkError } from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { NumberedOccurrence, OccurrenceManager } from "@matter/protocol";
import { BasicInformation } from "@matter/types/clusters/basic-information";

async function basicInformationEvents(node: ServerNode, event: "startUp" | "shutDown") {
    const occurrences = new Array<NumberedOccurrence>();
    for await (const occurrence of node.env.get(OccurrenceManager).get()) {
        if (
            occurrence.endpointId === 0 &&
            occurrence.clusterId === BasicInformation.id &&
            occurrence.eventId === BasicInformation.events[event].id
        ) {
            occurrences.push(occurrence);
        }
    }
    return occurrences;
}

describe("EventsBehavior", () => {
    before(() => {
        MockTime.init();
    });

    it("starts with no events of the former run after stop() and start()", async () => {
        await using site = new MockSite();
        const device = await site.addDevice();
        const [firstStartUp] = await basicInformationEvents(device, "startUp");

        await MockTime.resolve(device.stop());
        await MockTime.resolve(device.start());

        expect(await basicInformationEvents(device, "shutDown")).length(0);
        const startUps = await basicInformationEvents(device, "startUp");
        expect(startUps).length(1);
        expect(startUps[0].number > firstStartUp.number).true;
    });

    it("keeps the events of the former run after stop() and start() if nonvolatile", async () => {
        await using site = new MockSite();
        const device = await site.addDevice({ events: { nonvolatile: true } });

        await MockTime.resolve(device.stop());
        await MockTime.resolve(device.start());

        expect(await basicInformationEvents(device, "shutDown")).length(1);
        expect(await basicInformationEvents(device, "startUp")).length(2);
    });

    it("records no ShutDown event when a start fails before the node is online", async () => {
        class TransportFailingRuntime extends ServerNetworkRuntime {
            protected override async addTransports() {
                throw new NetworkError("Port unavailable");
            }
        }
        class NodeFailingStart extends MockServerNode {
            protected override createRuntime() {
                return new TransportFailingRuntime(this);
            }
        }
        const node = new NodeFailingStart({});
        await MockTime.resolve(node.construction);

        await expect(MockTime.resolve(node.start())).rejectedWith(NetworkError);

        expect(await basicInformationEvents(node, "shutDown")).length(0);
        await MockTime.resolve(node.close());
    });
});
