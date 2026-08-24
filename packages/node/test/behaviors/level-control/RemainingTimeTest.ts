/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DimmableLightDevice } from "#devices/dimmable-light";
import { MockServerNode } from "../../node/mock-server-node.js";

async function transitioningLight() {
    MockTime.reset();

    const node = await MockServerNode.createOnline(undefined, { device: undefined });
    const endpoint = await node.add(DimmableLightDevice, {
        onOff: { onOff: true },
        levelControl: { managedTransitionTimeHandling: true, currentLevel: 1 },
    });

    await node.online({ command: true }, async agent => {
        const endpointAgent = endpoint.agentFor(agent.context);
        await agent.context.transaction.addResources(endpointAgent.levelControl);
        await endpointAgent.levelControl.moveToLevel({
            level: 254,
            transitionTime: 150,
            optionsMask: {},
            optionsOverride: {},
        });
    });

    return { node, endpoint };
}

async function advance(steps: number) {
    for (let i = 0; i < steps; i++) {
        await MockTime.advance(99);
    }
}

describe("LevelControl RemainingTime", () => {
    before(MockTime.enable);

    it("reports the time left in a transition the application did not configure", async () => {
        const { node, endpoint } = await transitioningLight();

        await advance(10);

        expect(endpoint.state.levelControl.currentLevel).greaterThan(1);
        expect(endpoint.state.levelControl.remainingTime).greaterThan(0);

        await node.close(10);
    });

    it("reads zero once the transition completes", async () => {
        const { node, endpoint } = await transitioningLight();

        await advance(200);

        expect(endpoint.state.levelControl.currentLevel).equals(254);
        expect(endpoint.state.levelControl.remainingTime).equals(0);

        await node.close(10);
    });
});

describe("LevelControl RemainingTime with an application-supplied value", () => {
    before(MockTime.enable);

    it("reports the time left in a transition", async () => {
        MockTime.reset();

        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const endpoint = await node.add(DimmableLightDevice, {
            onOff: { onOff: true },
            levelControl: { managedTransitionTimeHandling: true, currentLevel: 1, remainingTime: 0 },
        });

        await node.online({ command: true }, async agent => {
            const endpointAgent = endpoint.agentFor(agent.context);
            await agent.context.transaction.addResources(endpointAgent.levelControl);
            await endpointAgent.levelControl.moveToLevel({
                level: 254,
                transitionTime: 150,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        await advance(10);

        expect(endpoint.state.levelControl.remainingTime).greaterThan(0);

        await node.close(10);
    });
});
