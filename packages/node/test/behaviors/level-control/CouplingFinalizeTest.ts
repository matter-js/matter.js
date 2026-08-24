/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DimmableLightDevice } from "#devices/dimmable-light";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("LevelControlServer on/off coupling", () => {
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
});

async function coupledLight() {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });

    const endpoint = await node.add(DimmableLightDevice, {
        onOff: { onOff: false },
        levelControl: { currentLevel: 1, onLevel: 100 },
    });

    return { node, endpoint };
}
