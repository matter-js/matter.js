/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { FabricManager } from "#protocol";
import { FabricIndex } from "#types";
import { MockServerNode } from "../node/mock-server-node.js";
import { CommissioningHelper, interaction } from "../node/node-helpers.js";
import { BridgedLightDevice, createBridge } from "./bridge-helpers.js";

const commissioning = CommissioningHelper();

// TODO - this should be 1000+ but requires additional optimization first
const NODE_COUNT = 10;

async function createLargeBridge() {
    const parts = Array<Endpoint.Configuration>();

    for (let i = 0; i < NODE_COUNT; i++) {
        parts.push({
            type: BridgedLightDevice,
            id: `light-${i}`,
        });
    }

    const result = createBridge({
        type: AggregatorEndpoint,
        parts,
    });

    for (let i = 0; i < NODE_COUNT * 10; i++) {
        await MockTime.yield();
    }

    return result;
}

describe("a large bridge", () => {
    it("instantiates and destroys", async () => {
        const bridge = await createLargeBridge();
        await bridge.owner?.close();
    });

    it("reads in a reasonable amount of time", async () => {
        const node = (await createLargeBridge()).owner as MockServerNode;
        await commissioning.commission(node);

        await interaction.read(node, node.env.get(FabricManager).maybeForIndex(FabricIndex(1))!, false, {});

        await node.close();
    });
});
