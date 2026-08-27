/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorControlServer } from "#behaviors/color-control";
import { ExtendedColorLightDevice } from "#devices/extended-color-light";
import { Agent } from "#endpoint/Agent.js";
import { Duration, MaybePromise, Millis, Time, Timespan, Timestamp } from "@matter/general";
import { ColorControl } from "@matter/types/clusters/color-control";
import { MockServerNode } from "../../node/mock-server-node.js";

const ColorLightDevice = ExtendedColorLightDevice.with(
    ColorControlServer.with("HueSaturation", "EnhancedHue", "ColorLoop", "Xy", "ColorTemperature"),
);

describe("ColorControlServer", () => {
    it("transitions cyclic hue downwards with correct events", async () => {
        const { node, endpoint, events, complete } = await setup();

        await endpoint.set({
            colorControl: {
                currentHue: 128,
            },
        });

        await node.online({ command: true }, async agent => {
            const endpointAgent = endpoint.agentFor(agent.context);

            await agent.context.transaction.addResources(endpointAgent.colorControl);

            await endpointAgent.colorControl.moveToHue({
                hue: 129,
                direction: ColorControl.Direction.Down,
                transitionTime: 60,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        await MockTime.resolve(complete, { stepMs: 10 });

        await node.close();

        // 253 in 6s aka 42/s
        expect(events).deep.equals([
            // Startup
            { kind: "hue", value: 128, ms: 0 },

            // Initiate transition
            { kind: "time", value: 60, ms: 0 },

            // Transitioning
            { kind: "hue", value: 86, ms: 1000 },
            { kind: "hue", value: 44, ms: 1000 },
            { kind: "hue", value: 1, ms: 1000 },
            { kind: "hue", value: 213, ms: 1000 },
            { kind: "hue", value: 171, ms: 1000 },

            // Transition complete
            { kind: "hue", value: 129, ms: 920 },
            { kind: "time", value: 0, ms: 0 },
        ]);
    });
});

async function setup(state?: { managedTransitionTimeHandling: boolean }) {
    MockTime.reset();

    const { node, endpoint } = await initializeDimmableHueLight(state);

    const events = Array<{
        kind: "hue" | "time";
        value: number | null;
        ms: Duration;
    }>();

    const reports = Array<number>();

    let last = Time.nowMs;

    endpoint.events.colorControl.remainingTime$Changed!.online.on(value => {
        events.push({ kind: "time", value, ms: Timespan(last, Time.nowMs).duration });
        reports.push(value);
        last = Time.nowMs;
    });

    endpoint.events.colorControl.currentHue$Changed.online.on(value => {
        events.push({ kind: "hue", value, ms: Timespan(last, Time.nowMs).duration });
        last = Time.nowMs;
    });

    const complete = new Promise<void>(resolve =>
        endpoint.events.colorControl.remainingTime$Changed!.online.on(value => {
            if (value === 0) {
                resolve();
            }
        }),
    );

    const invoke = async (actor: (agent: Agent.Instance<typeof ColorLightDevice>) => MaybePromise) => {
        await node.online({ command: true }, async agent => {
            await actor(endpoint.agentFor(agent.context));
        });
    };

    return { node, endpoint, events, reports, complete, invoke };
}

async function initializeDimmableHueLight(state?: { managedTransitionTimeHandling: boolean }) {
    const node = await MockServerNode.createOnline(undefined, {
        device: undefined,
    });

    const endpoint = await node.add(ColorLightDevice, {
        onOff: { onOff: true },
        levelControl: {
            currentLevel: 254,
        },
        colorControl: {
            managedTransitionTimeHandling: state?.managedTransitionTimeHandling ?? true,
            colorTempPhysicalMinMireds: 153,
            colorTempPhysicalMaxMireds: 370,
            colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
            enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
            remainingTime: 0,
            options: { executeIfOff: true },
            numberOfPrimaries: 0,
            coupleColorTempToLevelMinMireds: 153,
            startUpColorTemperatureMireds: null,
        },
    });

    return { node, endpoint };
}

describe("ColorControl stop", () => {
    before(MockTime.enable);

    it("reports zero remaining time on StopMoveStep", async () => {
        const { node, endpoint, reports, invoke } = await transitioningColorTemperature();

        await invoke(agent =>
            agent.colorControl.stopMoveStep({
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([100, 0]);
        expect(endpoint.state.colorControl.remainingTime).equals(0);

        await node.close();
    });

    it("reports zero once where StopMoveStep ends several transitions", async () => {
        const { node, reports, invoke } = await setup();

        await invoke(agent =>
            agent.colorControl.moveToHue({
                hue: 200,
                direction: ColorControl.Direction.Up,
                transitionTime: 200,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        await invoke(agent =>
            agent.colorControl.moveToSaturation({
                saturation: 254,
                transitionTime: 100,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([200]);

        await invoke(agent =>
            agent.colorControl.stopMoveStep({
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([200, 0]);

        await node.close();
    });

    it("reports zero remaining time on MoveColor with zero rates", async () => {
        const { node, endpoint, reports, invoke } = await setup();

        await invoke(agent =>
            agent.colorControl.moveToColor({
                colorX: 32768,
                colorY: 19660,
                transitionTime: 100,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        await invoke(agent =>
            agent.colorControl.moveColor({
                rateX: 0,
                rateY: 0,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([100, 0]);
        expect(endpoint.state.colorControl.remainingTime).equals(0);

        await node.close();
    });

    it("clears the end time the application states on StopMoveStep", async () => {
        const { node, endpoint, reports, invoke } = await setup({ managedTransitionTimeHandling: false });

        await endpoint.set({
            colorControl: { transitionEndTime: Timestamp(Time.nowMs + 10_000) },
        });

        expect(endpoint.state.colorControl.remainingTime).equals(100);

        await invoke(agent =>
            agent.colorControl.stopMoveStep({
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([0]);
        expect(endpoint.state.colorControl.transitionEndTime).equals(undefined);
        expect(endpoint.state.colorControl.remainingTime).equals(0);

        await node.close();
    });

    it("leaves the remaining time alone on StopMoveStep while a color loop runs", async () => {
        const { node, endpoint, reports, invoke } = await setup();

        await invoke(agent =>
            agent.colorControl.colorLoopSet({
                updateFlags: { updateAction: true },
                action: ColorControl.ColorLoopAction.ActivateFromEnhancedCurrentHue,
                direction: ColorControl.ColorLoopDirection.Increment,
                time: 25,
                startHue: 0,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        await invoke(agent =>
            agent.colorControl.moveToSaturation({
                saturation: 254,
                transitionTime: 100,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([100]);

        await invoke(agent =>
            agent.colorControl.stopMoveStep({
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(reports).deep.equals([100]);
        expect(endpoint.state.colorControl.colorLoopActive).equals(ColorControl.ColorLoopActive.Active);

        const hueBefore = endpoint.state.colorControl.enhancedCurrentHue;
        await MockTime.advance(Millis(1000));
        await MockTime.yield();

        expect(endpoint.state.colorControl.enhancedCurrentHue).not.equals(hueBefore);

        await node.close();
    });

    // Characterization test: a color mode switch ends the transitions it replaces silently, so the remaining time the
    // client sees is the one the new transition states
    it("reports only the new remaining time where a command switches color mode", async () => {
        const { node, endpoint, reports, invoke } = await setup();

        await invoke(agent =>
            agent.colorControl.moveToHue({
                hue: 200,
                direction: ColorControl.Direction.Up,
                transitionTime: 200,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        await invoke(agent =>
            agent.colorControl.moveToColorTemperature({
                colorTemperatureMireds: 370,
                transitionTime: 100,
                optionsMask: {},
                optionsOverride: {},
            }),
        );

        expect(endpoint.state.colorControl.colorMode).equals(ColorControl.ColorMode.ColorTemperatureMireds);
        expect(reports).deep.equals([200, 100]);

        await node.close();
    });
});

async function transitioningColorTemperature() {
    const result = await setup();

    await result.invoke(agent =>
        agent.colorControl.moveToColorTemperature({
            colorTemperatureMireds: 370,
            transitionTime: 100,
            optionsMask: {},
            optionsOverride: {},
        }),
    );

    expect(result.endpoint.state.colorControl.remainingTime).greaterThan(0);

    return result;
}
