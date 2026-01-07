/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LevelControlServer } from "#behaviors/level-control";
import { LevelControl } from "#clusters/level-control";
import { DimmableLightDevice } from "#devices/dimmable-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Time } from "#general";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("LevelControlServer", () => {
    before(MockTime.enable);

    // TODO - this test is not deterministic.  We need to wait between steps before incrementing time.  Otherwise it
    // takes several VM cycles for promises to resolve and things like the spinner can cause slight variance.  Disabling
    // for now until we can rewrite as there's plenty of coverage in CHIP tests.

    // TODO - not sure why only this test is non-deterministic.  Greater number of steps seems to play a role, possibly
    // introducing additional noise from new gen GC

    // it.only("emits CurrentLevel and RemainingTime updates quietly", async () => {
    //     const { node, endpoint, events, complete } = await setup();

    //     await changeLevel(endpoint);

    //     await complete;

    //     await node.close();

    //     expect(events).deep.equals([
    //         { kind: "time", ms: 0, value: 150 },
    //         { kind: "level", ms: 300, value: 4 },
    //         { kind: "level", ms: 1000, value: 13 },
    //         { kind: "level", ms: 1000, value: 30 },
    //         { kind: "level", ms: 1000, value: 47 },
    //         { kind: "level", ms: 1000, value: 63 },
    //         { kind: "level", ms: 1000, value: 80 },
    //         { kind: "level", ms: 1000, value: 97 },
    //         { kind: "level", ms: 1000, value: 114 },
    //         { kind: "level", ms: 1000, value: 131 },
    //         { kind: "level", ms: 1000, value: 149 },
    //         { kind: "level", ms: 1000, value: 170 },
    //         { kind: "level", ms: 1000, value: 187 },
    //         { kind: "level", ms: 1000, value: 203 },
    //         { kind: "level", ms: 1000, value: 220 },
    //         { kind: "level", ms: 1000, value: 237 },
    //         { kind: "level", ms: 800, value: 254 },
    //         { kind: "time", ms: 0, value: 0 },
    //     ]);
    // });

    it("transitions to off with correct events", async () => {
        const { node, endpoint, events, complete } = await setup();

        await endpoint.set({
            levelControl: {
                currentLevel: 128,
            },

            onOff: {
                onOff: true,
            },
        });

        await node.online({ command: true }, async agent => {
            const endpointAgent = endpoint.agentFor(agent.context);

            await agent.context.transaction.addResources(endpointAgent.levelControl);

            await endpointAgent.levelControl.moveToLevelWithOnOff({
                level: 1,
                transitionTime: 40,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        await MockTime.resolve(complete, { stepMs: 10 });

        expect(endpoint.state.levelControl.currentLevel).equals(1);

        await node.close();

        expect(events).deep.equals([
            // Startup
            { kind: "level", value: 128, ms: 0 },

            // Initiate transition
            { kind: "time", value: 40, ms: 0 },

            // Transitioning
            { kind: "level", value: 96, ms: 1000 },
            { kind: "level", value: 65, ms: 1000 },
            { kind: "level", value: 33, ms: 1000 },

            // Transition complete
            { kind: "level", value: 1, ms: 920 },
            { kind: "time", value: 0, ms: 0 },
        ]);
    });

    it("emits RemainingTime with command changes", async () => {
        const { node, endpoint } = await initializeDimmableLight();

        const remainingTimeReports = Array<number>();

        const complete = new Promise<void>(resolve =>
            endpoint.events.levelControl.remainingTime$Changed.online.on(value => {
                remainingTimeReports.push(value);
                if (value === 0) {
                    resolve();
                }
            }),
        );

        // Partial steps so transition doesn't complete
        await changeLevel(endpoint, 50);

        await MockTime.yield();

        // Start new transition; should report because initiated by command
        await changeLevel(endpoint);

        await complete;

        expect(remainingTimeReports).deep.equals([150, 0]);

        await node.close();
    });

    it("stops transition timers when destroyed", async () => {
        (globalThis as any).KILLME = true;

        // No timers should be present initially
        expectTimers(0);

        // Ensure test is repeatable regardless of previous tests
        MockTime.reset();

        const { node, endpoint } = await initializeDimmableLight();

        await MockTime.yield();

        // Partial steps so transition doesn't complete.  The step value here will affect the state of the tests; since
        // state is deterministic we know that 50 (5 seconds) results in having a deferred emit queued
        await changeLevel(endpoint, 50);

        // Confirm timers are active
        expectTimers(1);

        // Close with small step interval because otherwise timer may resolve while awaiting close
        await node.close(10);

        // Ensure timers are cleaned up
        expectTimers(0);

        // To be on the safe side, advance time beyond when the timer would trigger.  If nothing blows up, timers were
        // correctly shut down
        await MockTime.advance(100_000);
    });

    it("works with anonymous class and downlevel features", async () => {
        const endpoint = new Endpoint(
            DimmableLightDevice.with(createLevelControlServer().with(LevelControl.Feature.Lighting)),
        );

        function createLevelControlServer() {
            return class extends LevelControlServer {};
        }

        const node = await MockServerNode.createOnline(undefined, { device: endpoint });

        await node.close();
    });
});

function expectTimers(count: number) {
    expect(MockTime.timerCountFor("transition-node0.part0-LevelControlBaseServer"), "transition timer").equals(count);
    expect(MockTime.timerCountFor("delayed emit"), "deferred emit timer").equals(count);
}

async function setup() {
    MockTime.reset();

    const { node, endpoint } = await initializeDimmableLight();

    const events = Array<{
        kind: "level" | "time";
        value: number | null;
        ms: number;
    }>();

    let last = Time.nowMs;

    endpoint.events.levelControl.remainingTime$Changed.online.on(value => {
        const now = Time.nowMs;
        events.push({ kind: "time", value, ms: now - last });
        last = now;
    });

    endpoint.events.levelControl.currentLevel$Changed.online.on(value => {
        const now = Time.nowMs;
        events.push({ kind: "level", value, ms: now - last });
        last = now;
    });

    const complete = new Promise<void>(resolve =>
        endpoint.events.levelControl.remainingTime$Changed.online.on(value => {
            if (value === 0) {
                resolve();
            }
        }),
    );

    return { node, endpoint, events, complete };
}

async function initializeDimmableLight() {
    const node = await MockServerNode.createOnline(undefined, {
        device: undefined,
    });

    const endpoint = await node.add(DimmableLightDevice, {
        onOff: { onOff: true },
        levelControl: {
            managedTransitionTimeHandling: true,
            currentLevel: 1,
        },
    });

    return { node, endpoint };
}

async function changeLevel(endpoint: Endpoint<DimmableLightDevice>, steps = 200) {
    const node = endpoint.owner as MockServerNode;
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

    for (let i = 0; i < steps; i++) {
        await MockTime.advance(99);
    }
}
