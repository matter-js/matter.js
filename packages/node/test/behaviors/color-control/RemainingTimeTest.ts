/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorControlServer } from "#behaviors/color-control";
import { ExtendedColorLightDevice } from "#devices/extended-color-light";
import { MockServerNode } from "@matter/node/testing";
import { ColorControl } from "@matter/types/clusters/color-control";

async function advance(steps: number) {
    for (let i = 0; i < steps; i++) {
        await MockTime.advance(99);
    }
}

describe("ColorControl RemainingTime", () => {
    before(MockTime.enable);

    // RemainingTime is optional in ColorControl, so an endpoint that neither supplies a value nor enables the
    // attribute does not support it at all; enabling it is what the application does to opt in
    it("reports the time left in a transition for an endpoint that enables the attribute", async () => {
        MockTime.reset();

        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const endpoint = await node.add(
            ExtendedColorLightDevice.with(
                ColorControlServer.with("HueSaturation", "Xy", "ColorTemperature").enable({
                    attributes: { remainingTime: true },
                }),
            ),
            {
                onOff: { onOff: true },
                levelControl: { currentLevel: 254 },
                colorControl: {
                    managedTransitionTimeHandling: true,
                    colorTempPhysicalMinMireds: 153,
                    colorTempPhysicalMaxMireds: 370,
                    colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                    enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
                    options: { executeIfOff: true },
                    numberOfPrimaries: 0,
                    coupleColorTempToLevelMinMireds: 153,
                    startUpColorTemperatureMireds: null,
                },
            },
        );

        await node.online({ command: true }, async agent => {
            const endpointAgent = endpoint.agentFor(agent.context);
            await agent.context.transaction.addResources(endpointAgent.colorControl);
            await endpointAgent.colorControl.moveToHue({
                hue: 200,
                direction: ColorControl.Direction.Up,
                transitionTime: 150,
                optionsMask: {},
                optionsOverride: {},
            });
        });

        await advance(10);

        expect(endpoint.state.colorControl.remainingTime).greaterThan(0);

        await advance(200);

        expect(endpoint.state.colorControl.remainingTime).equals(0);

        await node.close(10);
    });
});
