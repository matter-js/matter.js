/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessLevel } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import { AttributeWriteResponse, hasRemoteActor, Subject, Write, WriteResult } from "@matter/protocol";
import { AttributeId, EndpointNumber, GroupId, Status, TlvString, WriteRequest } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";

describe("AttributeWriteRequest", () => {
    it("writes concrete attribute", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformation,
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
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("writes endpoint wildcard attribute", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformation,
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
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("writes concrete attribute with ACL error", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttr(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformation,
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
                status: Status.UnsupportedAccess,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    // Spec 8.7.3.2: a View-privilege subject may learn element existence, so a model-known but absent
    // attribute whose actual write privilege exceeds View resolves to UNSUPPORTED_ATTRIBUTE (existence),
    // not UNSUPPORTED_ACCESS (the View pass grants before the existence check fires).
    it("writes model-known absent high-privilege attribute as unsupported attribute for view-only subject", async () => {
        await using node = await MockServerNode.createOnline();
        // BasicInformation.localConfigDisabled (id 0x10): optional (absent here), write privilege Manage
        const response = await writeAttrAs(
            node,
            AccessLevel.View,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformation,
                attributes: "localConfigDisabled",
                value: true,
            }),
        );

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 0x10,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: Status.UnsupportedAttribute,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    it("writes endpoint wildcard attribute with ACL issue", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttr(
            node,
            Write.Attribute({
                cluster: BasicInformation,
                attributes: "nodeLabel",
                value: "Test Label 2",
            }),
        );

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 0 });
    });

    it("writes non-writable concrete attribute with error", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformation,
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
                status: Status.UnsupportedWrite,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes non-writable wildcard attribute with no error returned", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformation,
                attributes: "vendorName",
                value: "Matter.js Test Vendor",
            }),
        );

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 0 });
    });

    it("writes version mismatch concrete attribute with error", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformation,
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
                status: Status.DataVersionMismatch,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    // Spec 1.6 §8.9.2.8.1: a DataVersion on a wildcard path is illegal, so our encoder refuses to emit it (see
    // WriteTest). Inbound decoding stays lenient per the §8.9 disposition, so a raw request still ignores it.
    it("writes version mismatch wildcard attribute where mismatch got ignored", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrRawAsAdmin(node, {
            writeRequests: [
                {
                    path: {
                        clusterId: BasicInformation.id,
                        attributeId: AttributeId(5),
                    },
                    data: TlvString.encodeTlv("Test Label"),
                    dataVersion: 99,
                },
            ],
        });

        expect(response.data).deep.equals([
            {
                kind: "attr-status",
                path: {
                    attributeId: 5,
                    clusterId: 40,
                    endpointId: 0,
                },
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("writes concrete attribute with constraint error", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                endpoint: node,
                cluster: BasicInformation,
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
                status: Status.ConstraintError,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes wildcard attribute with constraint error", async () => {
        await using node = await MockServerNode.createOnline();
        const response = await writeAttrAsAdmin(
            node,
            Write.Attribute({
                cluster: BasicInformation,
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
                status: Status.ConstraintError,
                clusterStatus: undefined,
            },
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("writes with invalid wildcard combination", async () => {
        await using node = await MockServerNode.createOnline();
        await expect(
            writeAttrRaw(node, {
                writeRequests: [
                    {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: BasicInformation.id,
                        },
                        data: TlvString.encodeTlv("Test Label"),
                    },
                ],
            }),
        ).rejectedWith("Wildcard path write must specify a clusterId and attributeId");
    });

    for (const group of [true, false]) {
        it(`${group ? "group" : "wildcard"} write skips an attribute that another write interaction holds`, async () => {
            await using node = await MockServerNode.createOnline();
            const fabric = await node.addFabric();
            const exchange = await node.createExchange({ fabric });
            const nodeLabel = { clusterId: BasicInformation.id, attributeId: AttributeId(5) };

            const wildcardWrite = (label: string, locked: boolean) =>
                node.online({ command: true, exchange }, async ({ context }) => {
                    if (!hasRemoteActor(context)) {
                        expect.fail("write context has no remote actor");
                    }
                    const session = group
                        ? {
                              ...context,
                              subject: Subject.Group({
                                  id: GroupId(1),
                                  hasValidMapping: true,
                                  endpoints: [EndpointNumber(0)],
                              }),
                          }
                        : context;
                    const checked = new Array<WriteResult.ConcreteAttributePath>();
                    const response = new AttributeWriteResponse(node.protocol, session, {
                        isHeldByOtherWrite: (path, lockSession) => {
                            expect(lockSession).equals(session);
                            checked.push(path);
                            return locked;
                        },
                    });
                    const statuses = await response.process({
                        suppressResponse: false,
                        timedRequest: false,
                        writeRequests: [{ path: nodeLabel, data: TlvString.encodeTlv(label) }],
                    });
                    expect(checked).deep.equals([{ ...nodeLabel, endpointId: EndpointNumber(0) }]);
                    return statuses;
                });

            const before = node.state.basicInformation.nodeLabel;
            expect(await wildcardWrite("skipped", true)).deep.equals([]);
            expect(node.state.basicInformation.nodeLabel).equals(before);

            await wildcardWrite("written", false);
            expect(node.state.basicInformation.nodeLabel).equals("written");
        });
    }

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

async function writeAttrAs(node: MockServerNode, accessLevel: AccessLevel, ...args: Parameters<typeof Write>) {
    const request = { suppressResponse: false, ...Write(...args) } as Write;

    return node.online({ command: true, accessLevel }, async ({ context }) => {
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
