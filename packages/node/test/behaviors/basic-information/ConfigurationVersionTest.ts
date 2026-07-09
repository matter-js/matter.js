/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationServer } from "#behaviors/basic-information";
import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { OnOffLightDevice } from "#devices/on-off-light";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { MockServerNode } from "@matter/node/testing";
import { BridgedLightDevice, createBridge } from "../../endpoints/bridge-helpers.js";

// A bridged device that enables the optional ConfigurationVersion attribute by seeding an initial value.
const VersionedBridgedLightDevice = OnOffLightDevice.with(
    BridgedDeviceBasicInformationServer.set({ configurationVersion: 1 }),
);

function configVersion(node: MockServerNode) {
    return node.stateOf(BasicInformationServer).configurationVersion;
}

describe("ConfigurationVersion", () => {
    it("runs the change callback and increments afterwards", async () => {
        const node = await MockServerNode.createOnline();
        const before = configVersion(node);

        let ran = false;
        await node.act(agent =>
            agent.get(BasicInformationServer).increaseConfigurationVersion(() => {
                ran = true;
            }),
        );

        expect(ran).equals(true);
        expect(configVersion(node)).equals(before + 1);
    });

    it("rejects a decrease of configurationVersion", async () => {
        const node = await MockServerNode.createOnline();
        await node.act(agent => agent.get(BasicInformationServer).increaseConfigurationVersion());

        let error: Error | undefined;
        try {
            await node.act(agent => {
                agent.get(BasicInformationServer).state.configurationVersion = 1;
            });
        } catch (e) {
            error = e as Error;
        }

        expect(error?.message).contains("must not decrease");
    });

    it("bumps the bridge once when grouping bridged-node changes via a shared context", async () => {
        const bridge = await createBridge({
            type: AggregatorEndpoint,
            parts: [
                { type: VersionedBridgedLightDevice, id: "lightA" },
                { type: VersionedBridgedLightDevice, id: "lightB" },
            ],
        });
        const node = bridge.owner as MockServerNode;
        const lightA = bridge.parts.require("lightA");
        const lightB = bridge.parts.require("lightB");

        const before = configVersion(node);

        await node.act(agent =>
            agent.get(BasicInformationServer).increaseConfigurationVersion(async context => {
                await lightA
                    .agentFor(context)
                    .get(BridgedDeviceBasicInformationServer)
                    .increaseConfigurationVersion(undefined, context);
                await lightB
                    .agentFor(context)
                    .get(BridgedDeviceBasicInformationServer)
                    .increaseConfigurationVersion(undefined, context);
            }),
        );

        // Two bridged-node changes in one shared transaction → the bridge increments exactly once
        expect(configVersion(node)).equals(before + 1);
        // ...and each bridged node's own version increments
        expect(lightA.stateOf(BridgedDeviceBasicInformationServer).configurationVersion).equals(2);
        expect(lightB.stateOf(BridgedDeviceBasicInformationServer).configurationVersion).equals(2);

        await node.close();
    });

    it("bumps the bridge for a standalone bridged-node change", async () => {
        const bridge = await createBridge({
            type: AggregatorEndpoint,
            parts: [{ type: VersionedBridgedLightDevice, id: "light" }],
        });
        const node = bridge.owner as MockServerNode;
        const light = bridge.parts.require("light");

        const before = configVersion(node);

        await node.act(agent =>
            light.agentFor(agent.context).get(BridgedDeviceBasicInformationServer).increaseConfigurationVersion(),
        );

        expect(configVersion(node)).equals(before + 1);

        await node.close();
    });

    it("throws when increasing a bridged node's ConfigurationVersion that is not enabled", async () => {
        const bridge = await createBridge({
            type: AggregatorEndpoint,
            parts: [{ type: BridgedLightDevice, id: "light" }],
        });
        const node = bridge.owner as MockServerNode;
        const light = bridge.parts.require("light");

        await expect(
            node.act(agent =>
                light.agentFor(agent.context).get(BridgedDeviceBasicInformationServer).increaseConfigurationVersion(),
            ),
        ).rejectedWith(/ConfigurationVersion is not enabled/);

        await node.close();
    });
});
