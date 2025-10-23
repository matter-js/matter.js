/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationCluster } from "#clusters/basic-information";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Read } from "#protocol";
import { AttributeId, ClusterId, EndpointNumber, StatusCode } from "#types";
import { MockServerNode } from "./mock-server-node.js";
import { countAttrs, readAttr, readAttrRaw } from "./read-helpers.js";

const ROOT_ENDPOINT_FULL_CLUSTER_LIST = {
    29: 9,
    31: 10,
    40: 22,
    48: 10,
    51: 10,
    60: 8,
    62: 11,
    63: 9,
};
const ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT = Object.values(ROOT_ENDPOINT_FULL_CLUSTER_LIST).reduce(
    (acc, count) => acc + count,
    0,
);

describe("AttributeReadResponse", () => {
    it("reads concrete attribute", async () => {
        const node = await MockServerNode.createOnline();
        const response = await readAttr(
            node,
            Read.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "vendorName",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "attr-value",
                    path: {
                        attributeId: 1,
                        clusterId: 40,
                        endpointId: 0,
                    },
                    tlv: {},
                    value: "Matter.js Test Vendor",
                    version: 0x80808081,
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("reads endpoint wildcard attribute", async () => {
        const response = await readAttr(
            await MockServerNode.createOnline(),
            Read.Attribute({
                cluster: BasicInformationCluster,
                attributes: "vendorName",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "attr-value",
                    path: {
                        attributeId: 1,
                        clusterId: 40,
                        endpointId: 0,
                    },
                    tlv: {},
                    value: "Matter.js Test Vendor",
                    version: 0x80808081,
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("reads concrete attribute with version filter", async () => {
        const response = await readAttrRaw(await MockServerNode.createOnline(), {
            attributeRequests: [
                {
                    clusterId: ClusterId(40),
                    attributeId: AttributeId(1),
                },
            ],
            dataVersionFilters: [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(40) },
                    dataVersion: 0x80808081,
                },
            ],
        });

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 1 });
    });

    it("reads non-existent concrete endpoint", async () => {
        const response = await readAttr(
            await MockServerNode.createOnline(),
            Read.Attribute({
                endpoint: EndpointNumber(2),
                cluster: BasicInformationCluster,
                attributes: "vendorName",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "attr-status",
                    path: {
                        attributeId: 1,
                        clusterId: 40,
                        endpointId: 2,
                    },
                    status: StatusCode.UnsupportedEndpoint,
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    it("reads non-existent concrete attribute", async () => {
        const node = await MockServerNode.createOnline();
        const response = await readAttr(
            node,
            Read.Attribute({
                endpoint: node,
                cluster: BasicInformationCluster,
                attributes: "serialNumber",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "attr-status",
                    path: {
                        attributeId: 15,
                        clusterId: 40,
                        endpointId: 0,
                    },
                    status: StatusCode.UnsupportedAttribute,
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    it("reads wildcard endpoint & attributes", async () => {
        const response = await readAttr(
            await MockServerNode.createOnline(),
            Read.Attribute({
                cluster: BasicInformationCluster,
            }),
        );

        expect(countAttrs(response.data)).deep.equals({
            0: {
                40: 22,
            },
        });
        expect(response.counts).deep.equals({ status: 0, success: 22, existent: 22 });
    });

    it("reads full wildcard", async () => {
        const response = await readAttr(
            await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined }),
            Read.Attribute(),
        );
        expect(countAttrs(response.data)).deep.equals({
            0: ROOT_ENDPOINT_FULL_CLUSTER_LIST,
        });
    });

    it("reads full wildcard with adding and removing endpoint", async () => {
        const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });

        const endpoint = await node.add(OnOffLightDevice);

        const responseWithLight = await readAttr(node, Read.Attribute());
        expect(countAttrs(responseWithLight.data)).deep.equals({
            0: ROOT_ENDPOINT_FULL_CLUSTER_LIST,
            1: {
                3: 7,
                4: 6,
                6: 10,
                29: 9,
                98: 7,
            },
        });
        expect(responseWithLight.counts).deep.equals({
            status: 0,
            success: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT + 39, // 39 = sum of endpoint 1 counts above
            existent: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT + 39,
        });
        await endpoint.close();

        const responseAfterRemove = await readAttr(node, Read.Attribute());
        expect(countAttrs(responseAfterRemove.data)).deep.equals({
            0: ROOT_ENDPOINT_FULL_CLUSTER_LIST,
        });
        expect(responseAfterRemove.counts).deep.equals({
            status: 0,
            success: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT,
            existent: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT,
        });
    });

    it("reads attributeList global Attribute full wildcard", async () => {
        const response = await readAttr(
            await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined }),
            Read.Attribute({
                attributes: "attributeList",
            }),
        );
        expect(countAttrs(response.data)).deep.equals({
            0: {
                29: 1,
                31: 1,
                40: 1,
                48: 1,
                51: 1,
                60: 1,
                62: 1,
                63: 1,
            },
        });
        expect(response.counts).deep.equals({
            status: 0,
            success: Object.keys(ROOT_ENDPOINT_FULL_CLUSTER_LIST).length,
            existent: Object.keys(ROOT_ENDPOINT_FULL_CLUSTER_LIST).length,
        });
    });

    it("reads attributeList global Attribute full wildcard excluding attributerList via WildcardPath Filter", async () => {
        const response = await readAttrRaw(await MockServerNode.createOnline(), {
            attributeRequests: [
                {
                    attributeId: AttributeId(0xfffb),
                    wildcardPathFlags: {
                        skipAttributeList: true,
                    },
                },
            ],
        });

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({
            status: 0,
            success: 0,
            existent: 0,
        });
    });

    // TODO - more tests and Migrate some from InteractionProtocolTest
});
