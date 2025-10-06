/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationCluster } from "#clusters/basic-information";
import { Specification } from "#model";
import { AttributeSubscriptionResponse, DirtyState, Read } from "#protocol";
import { AttributeId, ClusterId, EndpointNumber } from "#types";
import { MockServerNode } from "./mock-server-node.js";
import { countAttrs } from "./read-helpers.js";
import INTERACTION_MODEL_REVISION = Specification.INTERACTION_MODEL_REVISION;

describe("AttributeSubscriptionResponse", () => {
    it("reads concrete attribute when in filter", async () => {
        const response = await readAttrSub(
            await MockServerNode.createOnline(),
            { [EndpointNumber(0)]: { [ClusterId(40)]: new Set([AttributeId(1)]) } },
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

    it("reads no concrete attribute when not in filter", async () => {
        const response = await readAttrSub(
            await MockServerNode.createOnline(),
            { [EndpointNumber(0)]: { [ClusterId(40)]: new Set([AttributeId(2)]) } },
            Read.Attribute({
                cluster: BasicInformationCluster,
                attributes: "vendorName",
            }),
        );

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 0 });
    });

    it("reads wildcard endpoint & attributes with 5 in Filter", async () => {
        const response = await readAttrSub(
            await MockServerNode.createOnline(),
            {
                [EndpointNumber(0)]: {
                    [ClusterId(40)]: new Set([
                        AttributeId(1),
                        AttributeId(2),
                        AttributeId(3),
                        AttributeId(4),
                        AttributeId(5),
                    ]),
                },
            },
            Read.Attribute({
                cluster: BasicInformationCluster,
            }),
        );

        expect(countAttrs(response.data)).deep.equals({
            0: {
                40: 5,
            },
        });
        expect(response.counts).deep.equals({ status: 0, success: 5, existent: 5 });
    });
});

function readAttrSub(node: MockServerNode, filter: DirtyState.ForNode, ...args: Parameters<typeof Read>) {
    const request = Read(...args);

    if (!Read.containsAttribute(request)) {
        throw new Error("Expected an attribute request");
    }
    return readAttrSubRaw(node, filter, request);
}

async function readAttrSubRaw(node: MockServerNode, filter: DirtyState.ForNode, data: Partial<Read.Attributes>) {
    const request = {
        isFabricFiltered: false,
        interactionModelRevision: INTERACTION_MODEL_REVISION,
        ...data,
    } as Read.Attributes;
    if (!Read.containsAttribute(request)) {
        throw new Error("Expected an attribute request");
    }
    return node.online({}, ({ context }) => {
        const response = new AttributeSubscriptionResponse(node.protocol, context, filter);
        const data = [...response.process(request)];
        data.forEach(chunks => {
            if (Array.isArray(chunks)) {
                chunks.forEach(chunk => {
                    if ("tlv" in chunk) {
                        chunk.tlv = {};
                    }
                });
            }
        });
        return { data, counts: response.counts };
    });
}
