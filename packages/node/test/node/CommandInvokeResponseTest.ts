/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/index.js";
import { AccessLevel } from "@matter/model";
import { CommandInvokeResponse, Invoke, InvokeRequest, InvokeResult } from "@matter/protocol";
import { ClusterId, CommandId, EndpointNumber, Status } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { MockServerNode } from "./mock-server-node.js";

describe("CommandInvokeResponse", () => {
    it("invoke concrete command", async () => {
        const device = new Endpoint(OnOffLightDevice);
        const node = await MockServerNode.createOnline(undefined, { device });
        const response = await invokeCmd(
            node,
            Invoke.ConcreteCommandRequest({
                endpoint: device,
                cluster: OnOff,
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
                cluster: OnOff,
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
                    cluster: OnOff,
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
                cluster: OnOff,
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
                cluster: OnOff,
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

    // Spec 8.8.3.2: an Operate-privilege subject may learn element existence, so a model-known but absent
    // command whose actual invoke privilege exceeds Operate resolves to an existence status (here
    // UNSUPPORTED_CLUSTER), not UNSUPPORTED_ACCESS (the Operate pass grants before the existence check fires).
    it("invokes model-known absent high-privilege command as existence status for operate-only subject", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        // Groups.AddGroup (cluster 0x4, command 0x0): invoke privilege Manage, cluster absent on the root node
        const response = await invokeCmdRawAs(node, AccessLevel.Operate, {
            invokeRequests: [
                {
                    commandPath: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x4),
                        commandId: CommandId(0x0),
                    },
                    commandFields: undefined,
                },
            ],
        });

        expect(response.data).deep.equals([
            {
                kind: "cmd-status",
                path: { clusterId: 0x4, commandId: 0x0, endpointId: 0 },
                status: Status.UnsupportedCluster,
                clusterStatus: undefined,
                commandRef: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    // An existing command denied at the actual-privilege ACL pass (after the Operate gate and existence checks)
    // must count toward `existent` — the element exists, access was merely denied. Groups.AddGroup (cluster 0x4,
    // command 0x0) is present on the on/off light and requires Manage, so an Operate-only subject reaches and fails
    // the actual-privilege pass.
    it("counts an existing command denied at the actual-privilege ACL pass as existent", async () => {
        const device = new Endpoint(OnOffLightDevice);
        const node = await MockServerNode.createOnline(undefined, { device });
        const response = await invokeCmdRawAs(node, AccessLevel.Operate, {
            invokeRequests: [
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(0x4),
                        commandId: CommandId(0x0),
                    },
                    commandFields: undefined,
                },
            ],
        });

        expect(response.data).deep.equals([
            {
                kind: "cmd-status",
                path: { clusterId: 0x4, commandId: 0x0, endpointId: 1 },
                status: Status.UnsupportedAccess,
                clusterStatus: undefined,
                commandRef: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    // TODO - more tests and Migrate some from InteractionProtocolTest
});

function invokeCmd(node: MockServerNode, ...args: Parameters<typeof Invoke>) {
    const request = Invoke(...args);

    return invokeCmdRaw(node, request);
}

function invokeCmdRaw(node: MockServerNode, data: Partial<InvokeRequest>) {
    return invokeCmdRawAs(node, AccessLevel.Operate, data);
}

// No exchange is supplied so the mock builds a session whose privilege is actually capped at {@link accessLevel};
// supplying a fabric exchange would instead grant the subject full access regardless of accessLevel.
async function invokeCmdRawAs(node: MockServerNode, accessLevel: AccessLevel, data: Partial<InvokeRequest>) {
    const request = {
        suppressResponse: false,
        ...data,
    } as Invoke;

    return node.online({ command: true, accessLevel }, async ({ context }) => {
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
