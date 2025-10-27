/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationCluster } from "#clusters/basic-information";
import { AttributeWriteResponse, Write } from "#protocol";
import { EndpointNumber, StatusCode, TlvString, WriteRequest } from "#types";
import { MockServerNode } from "./mock-server-node.js";

describe("AttributeWriteRequest", () => {
    it("writes concrete attribute", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "Test Label",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.Success,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("writes endpoint wildcard attribute", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "Test Label 2",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.Success,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("writes concrete attribute with ACL error", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttr(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "Test Label",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.UnsupportedAccess,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    it("writes endpoint wildcard attribute with ACL issue", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttr(
            node,
            Write.Attribute({
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "Test Label 2",
            }),
        );

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 0 });
    });

    it("writes non-writable concrete attribute with error", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "vendorName",
                value: "Matter.js Test Vendor",
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 1,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.UnsupportedWrite,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes non-writable wildcard attribute with no error returned", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformationCluster,
                attributes: "vendorName",
                value: "Matter.js Test Vendor",
            }),
        );

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 0 });
    });

    it("writes version mismatch concrete attribute with error", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "Test Label",
                version: 99,
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.DataVersionMismatch,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes version mismatch wildcard attribute where mismatch got ignored", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "Test Label",
                version: 99,
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.Success,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("writes concrete attribute with constraint error", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "12345678901234567890123456789012345", // 32 chars max
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.ConstraintError,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes wildcard attribute with constraint error", async () => {
        const node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformationCluster,
                attributes: "nodeLabel",
                value: "12345678901234567890123456789012345", // 32 chars max
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: StatusCode.ConstraintError,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes with invalid wildcard combination", async () => {
        const node = await MockServerNode.createOnline();
        await expect(
            writeAttrRaw(node, {
                writeRequests: [
                    {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: BasicInformationCluster.id,
                        },
                        data: TlvString.encodeTlv("Test Label"),
                    },
                ],
            }),
        ).rejectedWith("Wildcard path write must specify a clusterId and attributeId");
    });

    // TODO - more tests and Migrate some from InteractionProtocolTest
});

function writeAttr(node: MockServerNode, ...args: Parameters<typeof Write>) {
    const request = Write(...args);

    return writeAttrRaw(node, request);
}

async function writeAttrRaw(node: MockServerNode, data: Partial<WriteRequest>) {
    const request = {
        suppressResponse: false,
        ...data,
    } as Write;

    return node.online({ command: true }, async ({ context }) => {
        const response = new AttributeWriteResponse(node.protocol, context);
        return { data: await response.process(request), counts: response.counts };
    });
}

async function writeAttrAsAdmin(node: MockServerNode, ...args: Parameters<typeof Write>) {
    const request = Write(...args);

    return writeAttrRawAsAdmin(node, request);
}

async function writeAttrRawAsAdmin(node: MockServerNode, data: Partial<WriteRequest>) {
    const request = {
        suppressResponse: false,
        ...data,
    } as Write;

    const fabric = await node.addFabric();
    const exchange = await node.createExchange({ fabric });
    return node.online({ command: true, exchange }, async ({ context }) => {
        const response = new AttributeWriteResponse(node.protocol, context);
        return { data: await response.process(request), counts: response.counts };
    });
}
