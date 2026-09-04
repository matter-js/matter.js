/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DimmableLightDevice } from "#devices/dimmable-light";
import { Timestamp } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";

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

    it("reads zero and reports it when a stop ends the transition", async () => {
        const { node, endpoint } = await transitioningLight();

        const reports = new Array<number>();
        endpoint.events.levelControl.remainingTime$Changed.on(value => void reports.push(value));

        await advance(10);
        expect(endpoint.state.levelControl.remainingTime).greaterThan(0);

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.stop({ optionsMask: {}, optionsOverride: {} });
        });

        expect(endpoint.state.levelControl.remainingTime).equals(0);

        // The specification requires a report whenever the remaining time changes to zero, and only then
        expect(reports).deep.equals([0]);

        await node.close(10);
    });

    it("reports nothing for a stop with no transition underway", async () => {
        MockTime.reset();

        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const endpoint = await node.add(DimmableLightDevice, {
            onOff: { onOff: true },
            levelControl: { managedTransitionTimeHandling: true, currentLevel: 100 },
        });

        const reports = new Array<number>();
        endpoint.events.levelControl.remainingTime$Changed.on(value => void reports.push(value));

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.stop({ optionsMask: {}, optionsOverride: {} });
        });

        expect(reports).deep.equals([]);
        expect(endpoint.state.levelControl.remainingTime).equals(0);

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

describe("LevelControl RemainingTime with an application-supplied remaining time", () => {
    before(MockTime.enable);

    it("reads zero after a stop, although the application stated a remaining time", async () => {
        MockTime.reset();

        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const endpoint = await node.add(DimmableLightDevice, {
            onOff: { onOff: true },
            levelControl: { currentLevel: 1 },
        });

        await MockTime.resolve(endpoint.set({ levelControl: { remainingTime: 150 } }), { macrotasks: true });
        expect(endpoint.state.levelControl.remainingTime).equals(150);

        const reports = new Array<number>();
        endpoint.events.levelControl.remainingTime$Changed.on(value => void reports.push(value));

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.stop({ optionsMask: {}, optionsOverride: {} });
        });

        expect(endpoint.state.levelControl.remainingTime).equals(0);
        expect(reports).deep.equals([0]);

        await node.close(10);
    });
});

describe("LevelControl RemainingTime with an application-managed transition", () => {
    before(MockTime.enable);

    it("reads zero after a stop, although the application stated a later end time", async () => {
        MockTime.reset();

        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const endpoint = await node.add(DimmableLightDevice, {
            onOff: { onOff: true },
            levelControl: { currentLevel: 1, transitionEndTime: Timestamp(MockTime.nowMs + 15000) },
        });

        expect(endpoint.state.levelControl.remainingTime).greaterThan(0);

        const reports = new Array<number>();
        endpoint.events.levelControl.remainingTime$Changed.on(value => void reports.push(value));

        await node.online({ command: true }, async agent => {
            await endpoint.agentFor(agent.context).levelControl.stop({ optionsMask: {}, optionsOverride: {} });
        });

        expect(endpoint.state.levelControl.remainingTime).equals(0);
        expect(reports).deep.equals([0]);

        await node.close(10);
    });
});
