/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorControlServer } from "#behaviors/color-control";
import { ColorControl } from "#clusters/color-control";
import { ExtendedColorLightDevice } from "#devices/extended-color-light";
import { Duration, Time, Timespan } from "#general";
import { MockServerNode } from "../../node/mock-server-node.js";

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

async function setup() {
    MockTime.reset();

    const { node, endpoint } = await initializeDimmableHueLight();

    const events = Array<{
        kind: "hue" | "time";
        value: number | null;
        ms: Duration;
    }>();

    let last = Time.nowMs;

    endpoint.events.colorControl.remainingTime$Changed!.online.on(value => {
        events.push({ kind: "time", value, ms: Timespan(last, Time.nowMs).duration });
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

    return { node, endpoint, events, complete };
}

async function initializeDimmableHueLight() {
    const node = await MockServerNode.createOnline(undefined, {
        device: undefined,
    });

    const endpoint = await node.add(
        ExtendedColorLightDevice.with(ColorControlServer.with("HueSaturation", "Xy", "ColorTemperature")),
        {
            onOff: { onOff: true },
            levelControl: {
                currentLevel: 254,
            },
            colorControl: {
                managedTransitionTimeHandling: true,
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
        },
    );

    return { node, endpoint };
}
