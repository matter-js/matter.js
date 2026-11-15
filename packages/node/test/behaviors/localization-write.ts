/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessLevel } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import { AttributeWriteResponse, Write } from "@matter/protocol";

/**
 * Processes a write the way a controller's write request is handled, so the result carries the status code the peer
 * would receive.
 */
export async function writeAsController(node: MockServerNode, write: Write) {
    const exchange = await node.createExchange();
    return node.online({ exchange, accessLevel: AccessLevel.Manage }, async ({ context }) => {
        const response = new AttributeWriteResponse(node.protocol, context);
        return response.process({ suppressResponse: false, ...write });
    });
}

/** The status of the only attribute a single-attribute write reports */
export function onlyStatus(result: Awaited<ReturnType<typeof writeAsController>>) {
    if (result === undefined) {
        expect.fail("Expected a write response");
    }
    expect(result).length(1);
    const [entry] = result;
    if (entry.kind !== "attr-status") {
        expect.fail(`Expected an attribute status, got ${entry.kind}`);
    }
    return entry.status;
}
