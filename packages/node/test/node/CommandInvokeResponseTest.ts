/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffCluster } from "#clusters/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/index.js";
import { CommandInvokeResponse, Invoke, InvokeRequest, InvokeResult } from "#protocol";
import { MockServerNode } from "./mock-server-node.js";

describe("CommandInvokeResponse", () => {
    it("invoke concrete command", async () => {
        const device = new Endpoint(OnOffLightDevice);
        const node = await MockServerNode.createOnline(undefined, { device });
        const response = await invokeCmd(
            node,
            Invoke.ConcreteCommandRequest({
                endpoint: device,
                cluster: OnOffCluster,
                command: "on",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "cmd-status",
                path: { clusterId: 6, commandId: 1, endpointId: 1 },
                status: 0,
                clusterStatus: undefined,
                commandRef: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("invokes existing endpoint wildcard commands", async () => {
        const device = new Endpoint(OnOffLightDevice);
        const node = await MockServerNode.createOnline(undefined, { device });
        await node.add(new Endpoint(OnOffLightDevice));
        const response = await invokeCmd(
            node,
            Invoke.WildcardCommandRequest({
                cluster: OnOffCluster,
                command: "on",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "cmd-status",
                path: { clusterId: 6, commandId: 1, endpointId: 1 },
                status: 0,
                clusterStatus: undefined,
                commandRef: undefined,
            },
            {
                kind: "cmd-status",
                path: { clusterId: 6, commandId: 1, endpointId: 2 },
                status: 0,
                clusterStatus: undefined,
                commandRef: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 2, existent: 2 });
    });

    it("invokes existing endpoint wildcard commands with suppressed response", async () => {
        const device = new Endpoint(OnOffLightDevice);
        const node = await MockServerNode.createOnline(undefined, { device });
        await node.add(new Endpoint(OnOffLightDevice));
        const response = await invokeCmdRaw(node, {
            suppressResponse: true,
            invokeRequests: [
                Invoke.Command({
                    cluster: OnOffCluster,
                    command: "on",
                }),
            ],
        });

        expect(response.data).deep.equals(undefined);
        expect(response.counts).deep.equals({ status: 0, success: 2, existent: 2 });
    });

    it("invokes non-existing endpoint wildcard command", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const response = await invokeCmd(
            node,
            Invoke.WildcardCommandRequest({
                cluster: OnOffCluster,
                command: "on",
            }),
        );

        expect(response.data).deep.equals(undefined);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 0 });
    });

    it("invoke non existing concrete command", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const response = await invokeCmd(
            node,
            Invoke.ConcreteCommandRequest({
                endpoint: node,
                cluster: OnOffCluster,
                command: "on",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "cmd-status",
                path: { clusterId: 6, commandId: 1, endpointId: 0 },
                status: 195,
                clusterStatus: undefined,
                commandRef: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    // TODO - more tests and Migrate some from InteractionProtocolTest
});

function invokeCmd(node: MockServerNode, ...args: Parameters<typeof Invoke>) {
    const request = Invoke(...args);

    return invokeCmdRaw(node, request);
}

async function invokeCmdRaw(node: MockServerNode, data: Partial<InvokeRequest>) {
    const request = {
        suppressResponse: false,
        ...data,
    } as Invoke;

    const fabric = await node.addFabric();
    const exchange = await node.createExchange({ fabric });
    return node.online({ command: true, exchange }, async ({ context }) => {
        const response = new CommandInvokeResponse(node.protocol, context);
        let chunks: InvokeResult.Data[] | undefined;
        for await (const chunk of response.process(request)) {
            if (chunks === undefined) {
                chunks = new Array<InvokeResult.Data>();
            }
            chunks.push(...chunk);
        }
        return { data: chunks, counts: response.counts };
    });
}
