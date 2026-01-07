/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindowCoveringServer } from "#behaviors/window-covering";
import { WindowCovering } from "#clusters/window-covering";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

class TestWindowCoveringServer extends WindowCoveringServer.with(
    "Lift",
    "Tilt",
    "PositionAwareLift",
    "PositionAwareTilt",
).set({
    type: WindowCovering.WindowCoveringType.TiltBlindLift,
}) {
    override initialize() {
        this.state.currentPositionLiftPercent100ths = 5000; // Half open
        this.state.currentPositionTiltPercent100ths = 5000; // Half tilted

        return super.initialize();
    }

    override async handleMovement() {
        // Skip default logic which is just an instant "jump" to target position and thus makes operationalStatus
        // changes uninteresting
    }
}

async function createTiltBlindLift() {
    return MockEndpoint.createWith(TestWindowCoveringServer);
}

describe("WindowCoveringServer", () => {
    it("emits operationalStatus change events when target position changes", async () => {
        const device = await createTiltBlindLift();

        const events = device.captureEvents(WindowCoveringServer, {
            names: ["operationalStatus$Changing", "operationalStatus$Changed"],
        });

        await device.act(async agent => await agent.windowCovering.downOrClose());

        await device.act(async agent => await agent.windowCovering.upOrOpen());

        await device.act(async agent => await agent.windowCovering.stopMotion());

        expect(events).deep.equals([
            {
                name: "operationalStatus$Changing",
                oldValue: { lift: 0, tilt: 0, global: 0 },
                newValue: { global: 2, lift: 2, tilt: 2 },
            },
            {
                name: "operationalStatus$Changing",
                oldValue: { lift: 2, tilt: 2, global: 0 },
                newValue: { global: 2, lift: 2, tilt: 2 },
            },
            {
                name: "operationalStatus$Changed",
                oldValue: { lift: 0, tilt: 0, global: 0 },
                newValue: { lift: 2, tilt: 2, global: 2 },
            },
            {
                name: "operationalStatus$Changing",
                oldValue: { lift: 2, tilt: 2, global: 2 },
                newValue: { global: 1, lift: 1, tilt: 1 },
            },
            {
                name: "operationalStatus$Changing",
                oldValue: { lift: 1, tilt: 1, global: 2 },
                newValue: { global: 1, lift: 1, tilt: 1 },
            },
            {
                name: "operationalStatus$Changed",
                oldValue: { lift: 2, tilt: 2, global: 2 },
                newValue: { lift: 1, tilt: 1, global: 1 },
            },
            {
                name: "operationalStatus$Changing",
                oldValue: { lift: 1, tilt: 1, global: 1 },
                newValue: { lift: 0, tilt: 0, global: 0 },
            },
            {
                name: "operationalStatus$Changing",
                oldValue: { lift: 0, tilt: 0, global: 1 },
                newValue: { global: 0, lift: 0, tilt: 0 },
            },
            {
                name: "operationalStatus$Changed",
                oldValue: { lift: 1, tilt: 1, global: 1 },
                newValue: { global: 0, lift: 0, tilt: 0 },
            },
        ]);
    });
});
