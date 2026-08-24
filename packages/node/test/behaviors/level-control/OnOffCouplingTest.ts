/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DimmableLightDevice } from "#devices/dimmable-light";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("LevelControl on/off coupling", () => {
    before(MockTime.enable);

    it("lifts the on/off coupling block when its transaction rolls back", async () => {
        const { node, endpoint } = await coupledLight();

        // Moving toward on with an onLevel configured blocks the on/off reaction that would otherwise move the level a
        // second time
        await expect(
            node.online({ command: true }, async agent => {
                await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff({
                    level: 50,
                    transitionTime: null,
                    optionsMask: {},
                    optionsOverride: {},
                });

                throw new Error("abandon the level change");
            }),
        ).rejected;

        expect(endpoint.state.onOff.onOff).equals(false);

        await endpoint.set({ onOff: { onOff: true } });

        expect(endpoint.state.levelControl.currentLevel).equals(100);

        await node.close();
    });

    it("holds the on/off coupling block through a committed level change", async () => {
        const { node, endpoint } = await coupledLight();

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff({
                level: 50,
                transitionTime: null,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        // The block exists so the on/off reaction does not move the level a second time, to onLevel
        expect(endpoint.state.onOff.onOff).equals(true);
        expect(endpoint.state.levelControl.currentLevel).equals(50);

        await node.close();
    });
});

async function coupledLight() {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });

    const endpoint = await node.add(DimmableLightDevice, {
        onOff: { onOff: false },
        levelControl: { currentLevel: 1, onLevel: 100 },
    });

    return { node, endpoint };
}
