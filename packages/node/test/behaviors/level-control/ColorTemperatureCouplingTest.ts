/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorTemperatureLightDevice } from "#devices/color-temperature-light";
import { MockServerNode } from "@matter/node/testing";
import { ColorControl } from "@matter/types/clusters/color-control";
import { LevelControl } from "@matter/types/clusters/level-control";

async function coupledLight(options: LevelControl.Options, managedTransitionTimeHandling = false) {
    MockTime.reset();

    const node = await MockServerNode.createOnline(undefined, { device: undefined });

    const endpoint = await node.add(ColorTemperatureLightDevice, {
        onOff: { onOff: true },
        levelControl: { currentLevel: 254, options, managedTransitionTimeHandling },
        colorControl: {
            colorTempPhysicalMinMireds: 153,
            colorTempPhysicalMaxMireds: 370,
            colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
            enhancedColorMode: ColorControl.EnhancedColorMode.ColorTemperatureMireds,
            colorTemperatureMireds: 300,
            coupleColorTempToLevelMinMireds: 200,
            startUpColorTemperatureMireds: null,
            numberOfPrimaries: 0,
        },
    });

    return { node, endpoint };
}

const REQUEST = { level: 1, transitionTime: null, optionsMask: {}, optionsOverride: {} };

/** What the coupling produces at the minimum level, which is the physical maximum in mireds. */
const MIREDS_AT_MIN_LEVEL = 370;

/** What the color temperature reads before any coupling, which no coupled level produces. */
const MIREDS_UNCOUPLED = 300;

/** What the coupling produces at the maximum level: coupleColorTempToLevelMinMireds. */
const MIREDS_AT_MAX_LEVEL = 200;

describe("LevelControl color temperature coupling", () => {
    before(MockTime.enable);

    it("couples a WithOnOff level change when the Options attribute asks for it", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff(REQUEST);
        });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("scales the color temperature between the coupling minimum and the physical maximum", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff({ ...REQUEST, level: 128 });
        });

        // 370 - floor((370 - 200) * 128 / 254): the interpolation from coupleColorTempToLevelMinMireds, which a
        // regression that ignored that attribute would not produce
        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(285);

        await node.close();
    });

    it("couples a WithOnOff step when the Options attribute asks for it", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.stepWithOnOff({
                stepMode: LevelControl.StepMode.Down,
                stepSize: 126,
                transitionTime: null,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        expect(endpoint.state.levelControl.currentLevel).equals(128);
        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(285);

        await node.close();
    });

    it("couples a WithOnOff move when the Options attribute asks for it", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveWithOnOff({
                moveMode: LevelControl.MoveMode.Down,
                rate: 254,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        expect(endpoint.state.levelControl.currentLevel).equals(1);
        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("couples every step of a managed transition", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true }, true);

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveWithOnOff({
                moveMode: LevelControl.MoveMode.Down,
                rate: 100,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        await MockTime.resolve(MockTime.advance(1000), { macrotasks: true });

        const midTransition = endpoint.state.colorControl.colorTemperatureMireds!;
        expect(midTransition).greaterThan(MIREDS_AT_MAX_LEVEL);
        expect(midTransition).lessThan(MIREDS_AT_MIN_LEVEL);

        await MockTime.resolve(MockTime.advance(3000), { macrotasks: true });

        expect(endpoint.state.levelControl.currentLevel).equals(1);
        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("couples two level changes that share one transaction", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        // One coupling serves the whole transaction, and the level it acts on is the one the transaction settled on
        await node.online({ command: true }, async agent => {
            const levelControl = endpoint.agentFor(agent.context).levelControl;
            await levelControl.moveToLevelWithOnOff({ ...REQUEST, level: 128 });
            await levelControl.moveToLevelWithOnOff(REQUEST);
        });

        expect(endpoint.state.levelControl.currentLevel).equals(1);
        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("leaves the color temperature where a later command in the transaction overrides the coupling off", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            const levelControl = endpoint.agentFor(agent.context).levelControl;

            await levelControl.moveToLevelWithOnOff({ ...REQUEST, level: 128 });

            // The second command's override is what the transaction commits, so the coupling the first command asked
            // for must not follow the level this one arrives at
            await levelControl.moveToLevelWithOnOff({
                ...REQUEST,
                optionsMask: { coupleColorTempToLevel: true },
                optionsOverride: { coupleColorTempToLevel: false },
            });
        });

        expect(endpoint.state.levelControl.currentLevel).equals(1);
        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_UNCOUPLED);

        await node.close();
    });

    it("couples where a later command in the transaction overrides the coupling on", async () => {
        const { node, endpoint } = await coupledLight({});

        await node.online({ command: true }, async agent => {
            const levelControl = endpoint.agentFor(agent.context).levelControl;

            await levelControl.moveToLevelWithOnOff({ ...REQUEST, level: 128 });

            await levelControl.moveToLevelWithOnOff({
                ...REQUEST,
                optionsMask: { coupleColorTempToLevel: true },
                optionsOverride: { coupleColorTempToLevel: true },
            });
        });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("waits for a transaction that holds the color temperature", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        let locked!: () => void;
        const lockHeld = new Promise<void>(resolve => (locked = resolve));

        let release!: () => void;
        const releaseLock = new Promise<void>(resolve => (release = resolve));

        const holder = node.online({ command: true }, async agent => {
            const { transaction } = agent.context;
            await transaction.addResources(endpoint.agentFor(agent.context).colorControl);
            await transaction.begin();
            locked();
            await releaseLock;
        });

        await MockTime.resolve(lockHeld, { macrotasks: true });

        // The level change now needs a lock another transaction holds, which a synchronous acquisition cannot have
        const coupled = node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff(REQUEST);
        });

        await MockTime.yield();
        release();

        await holder;
        await MockTime.resolve(coupled, { macrotasks: true });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    // Characterization: the commands without On/Off couple on the same terms, which is the parity the WithOnOff
    // variants must hold to
    it("couples a level change when the Options attribute asks for it", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevel(REQUEST);
        });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("leaves the color temperature alone where the Options attribute does not ask", async () => {
        const { node, endpoint } = await coupledLight({});

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff(REQUEST);
        });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_UNCOUPLED);

        await node.close();
    });

    it("honors an override that sets the coupling for one command", async () => {
        const { node, endpoint } = await coupledLight({});

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff({
                ...REQUEST,
                optionsMask: { coupleColorTempToLevel: true },
                optionsOverride: { coupleColorTempToLevel: true },
            });
        });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_AT_MIN_LEVEL);

        await node.close();
    });

    it("honors an override that clears the coupling for one command", async () => {
        const { node, endpoint } = await coupledLight({ coupleColorTempToLevel: true });

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.moveToLevelWithOnOff({
                ...REQUEST,
                optionsMask: { coupleColorTempToLevel: true },
                optionsOverride: { coupleColorTempToLevel: false },
            });
        });

        expect(endpoint.state.colorControl.colorTemperatureMireds).equals(MIREDS_UNCOUPLED);

        await node.close();
    });
});
