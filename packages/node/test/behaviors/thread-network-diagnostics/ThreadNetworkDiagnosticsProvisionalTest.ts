/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThreadNetworkDiagnosticsServer } from "#behaviors/thread-network-diagnostics";
import { MockServerNode } from "@matter/node/testing";
import { AttributeId } from "@matter/types";

// ExtAddress (0x3f) and Rloc16 (0x40) are provisional ("P, M") in Matter 1.6 so they are absent until an application
// implements them
const EXT_ADDRESS_ID = AttributeId(0x3f);
const RLOC16_ID = AttributeId(0x40);

describe("provisional ThreadNetworkDiagnostics attributes", () => {
    async function attributeIdsOf(type: typeof ThreadNetworkDiagnosticsServer, state?: Record<string, unknown>) {
        await using node = await MockServerNode.create(MockServerNode.RootEndpoint.with(type), {
            threadNetworkDiagnostics: state,
        });
        return new Set(node.globalsOf(type).attributeList);
    }

    it("are absent by default", async () => {
        const ids = await attributeIdsOf(ThreadNetworkDiagnosticsServer);

        expect(ids.has(EXT_ADDRESS_ID)).false;
        expect(ids.has(RLOC16_ID)).false;
    });

    it("are present once the application supplies a value", async () => {
        const ids = await attributeIdsOf(ThreadNetworkDiagnosticsServer, { extAddress: null, rloc16: null });

        expect(ids.has(EXT_ADDRESS_ID)).true;
        expect(ids.has(RLOC16_ID)).true;
    });
});
