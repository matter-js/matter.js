/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";
import { NodeSession } from "@matter/protocol";
import {
    AttributeId,
    AttributePath,
    ClusterId,
    CommandId,
    EndpointNumber,
    Status,
    TlvInvokeResponseData,
    TlvString,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { OnOff } from "@matter/types/clusters/on-off";
import { MockServerNode } from "./mock-server-node.js";
import { interaction } from "./node-helpers.js";

const nodeLabelPath: AttributePath = {
    endpointId: EndpointNumber(0),
    clusterId: ClusterId(BasicInformation.id),
    attributeId: AttributeId(BasicInformation.attributes.nodeLabel.id),
};

// Characterization tests: InteractionModelRevision is optional on every received action, and the server already treats
// a missing value as unknown and proceeds
describe("Actions without InteractionModelRevision", () => {
    before(() => {
        MockTime.init();
    });

    it("are served for a read", async () => {
        const node = await MockServerNode.createOnline();
        await node.set({ basicInformation: { nodeLabel: "label" } });
        const { exchange, interactionServer } = await interaction.connect(node, await node.addFabric());

        const { payload } = await interactionServer.handleReadRequest(
            exchange,
            { attributeRequests: [nodeLabelPath], isFabricFiltered: false },
            interaction.BarelyMockedMessage,
        );
        const report = await payload?.next();

        expect(report?.value).has.property("attributeData");
        await MockTime.resolve(node.close());
    });

    it("are served for a write", async () => {
        const node = await MockServerNode.createOnline();
        const { exchange, interactionServer } = await interaction.connect(node, await node.addFabric());

        await interactionServer.handleWriteRequest(
            exchange,
            {
                suppressResponse: true,
                timedRequest: false,
                writeRequests: [{ path: nodeLabelPath, data: TlvString.encodeTlv("written") }],
            },
            interaction.createInvokeMessenger().messenger,
            interaction.BarelyMockedMessage,
        );

        expect(node.state.basicInformation.nodeLabel).equals("written");
        await MockTime.resolve(node.close());
    });

    it("are served for an invoke", async () => {
        const node = await MockServerNode.createOnline();
        const { exchange, interactionServer } = await interaction.connect(node, await node.addFabric());
        const { messenger, getResponse } = interaction.createInvokeMessenger();

        await interactionServer.handleInvokeRequest(
            exchange,
            {
                suppressResponse: false,
                timedRequest: false,
                invokeRequests: [
                    {
                        commandPath: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(OnOff.id),
                            commandId: CommandId(OnOff.commands.on.id),
                        },
                    },
                ],
            },
            messenger,
            interaction.BarelyMockedMessage,
        );

        const [response] = getResponse()?.invokeResponses ?? [];
        expect(response).not.undefined;
        expect(TlvInvokeResponseData.decodeTlv(response).status?.status?.status).equals(Status.Success);
        expect(node.parts.get(1)?.stateOf(OnOffServer).onOff).equals(true);
        await MockTime.resolve(node.close());
    });

    it("are served for a subscribe", async () => {
        const node = await MockServerNode.createOnline();
        const { exchange, interactionServer } = await interaction.connect(node, await node.addFabric());

        await interactionServer.handleSubscribeRequest(
            exchange,
            {
                keepSubscriptions: true,
                minIntervalFloorSeconds: 0,
                maxIntervalCeilingSeconds: 60,
                attributeRequests: [nodeLabelPath],
                isFabricFiltered: false,
            },
            interaction.createInvokeMessenger().messenger,
            interaction.BarelyMockedMessage,
        );

        const { session } = exchange;
        NodeSession.assert(session);
        expect([...session.subscriptions]).has.length(1);
        await MockTime.resolve(node.close());
    });

    it("are served for a timed request", async () => {
        const node = await MockServerNode.createOnline();
        const { exchange, interactionServer } = await interaction.connect(node, await node.addFabric());

        interactionServer.handleTimedRequest(exchange, { timeout: 10_000 });

        expect(exchange.hasActiveTimedInteraction()).equals(true);
        await MockTime.resolve(node.close());
    });
});
