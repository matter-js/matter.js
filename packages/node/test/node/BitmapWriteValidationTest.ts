/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindowCoveringServer } from "#behaviors/window-covering";
import { WindowCoveringDevice } from "#devices/window-covering";
import { MockServerNode } from "@matter/node/testing";
import { AttributeWriteResponse, Write } from "@matter/protocol";
import { AttributeId, ClusterId, EndpointNumber, Status, TlvUInt8, WriteRequest } from "@matter/types";
import { WindowCovering } from "@matter/types/clusters/window-covering";

const TestWindowCoveringDevice = WindowCoveringDevice.with(
    WindowCoveringServer.with("Lift", "Tilt", "PositionAwareLift", "PositionAwareTilt").set({
        type: WindowCovering.WindowCoveringType.TiltBlindLift,
    }),
);

// WindowCovering.Mode is a map8 with bits 0..3 defined; bit 4 and above are reserved.
const MODE_PATH = {
    endpointId: EndpointNumber(1),
    clusterId: ClusterId(0x102),
    attributeId: AttributeId(23),
};

describe("bitmap reserved-bit write validation", () => {
    it("rejects a reserved bit with ConstraintError", async () => {
        const response = await writeMode(0x10); // bit 4 is reserved

        expect(response.data?.[0]?.status).equals(Status.ConstraintError);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 1 });
    });

    it("accepts a defined bit", async () => {
        const response = await writeMode(0x01); // motorDirectionReversed

        expect(response.data?.[0]?.status).equals(Status.Success);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });
});

async function writeMode(value: number) {
    const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
    await node.add(TestWindowCoveringDevice);

    return writeAttrRawAsAdmin(node, {
        writeRequests: [{ path: MODE_PATH, data: TlvUInt8.encodeTlv(value) }],
    });
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
