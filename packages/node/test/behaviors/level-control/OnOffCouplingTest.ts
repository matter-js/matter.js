/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DimmableLightDevice } from "#devices/dimmable-light";
import { MockServerNode } from "@matter/node/testing";
import { LevelControl } from "@matter/types/clusters/level-control";

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

    // Characterization: on this path the on/off reaction clears the block itself, so the hook's effect is not
    // observable here.  It guards against clearing the block any earlier, which moves the level twice
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
    it("turns off after a move down reaches the minimum level", async () => {
        const { node, endpoint } = await coupledLight({ onOff: true, currentLevel: 254, onLevel: null });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveWithOnOff({
                moveMode: LevelControl.MoveMode.Down,
                rate: 254,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        expect(endpoint.state.levelControl.currentLevel).equals(1);
        expect(endpoint.state.onOff.onOff).equals(false);

        await node.close();
    });

    it("turns off after a step down overshoots the minimum level", async () => {
        const { node, endpoint } = await coupledLight({ onOff: true, currentLevel: 50, onLevel: null });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.stepWithOnOff({
                stepMode: LevelControl.StepMode.Down,
                stepSize: 100,
                transitionTime: null,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        expect(endpoint.state.levelControl.currentLevel).equals(1);
        expect(endpoint.state.onOff.onOff).equals(false);

        await node.close();
    });

    it("stays off for a move down while the device is off", async () => {
        const { node, endpoint } = await coupledLight({ onOff: false, currentLevel: 50, onLevel: null });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveWithOnOff({
                moveMode: LevelControl.MoveMode.Down,
                rate: 254,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        expect(endpoint.state.onOff.onOff).equals(false);

        await node.close();
    });

    it("turns on for a move up while the device is off", async () => {
        const { node, endpoint } = await coupledLight({ onOff: false, currentLevel: 50, onLevel: null });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveWithOnOff({
                moveMode: LevelControl.MoveMode.Up,
                rate: 254,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        expect(endpoint.state.levelControl.currentLevel).equals(254);
        expect(endpoint.state.onOff.onOff).equals(true);

        await node.close();
    });
});

async function coupledLight(state: { onOff?: boolean; currentLevel?: number; onLevel?: number | null } = {}) {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });

    const { onOff = false, currentLevel = 1, onLevel = 100 } = state;

    const endpoint = await node.add(DimmableLightDevice, {
        onOff: { onOff },
        levelControl: { currentLevel, onLevel },
    });

    return { node, endpoint };
}
