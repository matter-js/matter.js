/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindowCoveringServer } from "#behaviors/window-covering";
import { MatterAggregateError } from "@matter/general";
import { EnumValueConformanceError } from "@matter/protocol";
import { WindowCovering } from "@matter/types/clusters/window-covering";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

class TestWindowCoveringServer extends WindowCoveringServer.with(
    "Lift",
    "Tilt",
    "PositionAwareLift",
    "PositionAwareTilt",
).set({
    type: WindowCovering.WindowCoveringType.TiltBlindLift,
    endProductType: WindowCovering.EndProductType.InteriorVenetianBlind,
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
        await using device = await createTiltBlindLift();

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

async function creationError(type: Parameters<typeof MockEndpoint.createWith>[0]) {
    const error = await MockEndpoint.createWith(type).then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error).instanceof(MatterAggregateError);
    return error instanceof MatterAggregateError ? error.errors[0]?.cause : undefined;
}

describe("WindowCoveringServer type", () => {
    const shutter = {
        type: WindowCovering.WindowCoveringType.Shutter,
        endProductType: WindowCovering.EndProductType.SwingingShutter,
    };

    it("accepts a shutter that lifts", async () => {
        await using _endpoint = await MockEndpoint.createWith(WindowCoveringServer.with("Lift").set(shutter));
    });

    it("accepts a shutter that tilts", async () => {
        await using _endpoint = await MockEndpoint.createWith(WindowCoveringServer.with("Tilt").set(shutter));
    });

    it("rejects a shutter that lifts and tilts", async () => {
        const cause = await creationError(
            WindowCoveringServer.with("Lift", "Tilt").set({
                ...shutter,
                endProductType: WindowCovering.EndProductType.InteriorVenetianBlind,
            }),
        );
        expect(cause).instanceof(EnumValueConformanceError);
    });

    it("rejects an end product that only lifts on a covering that lifts and tilts", async () => {
        const cause = await creationError(
            WindowCoveringServer.with("Lift", "Tilt").set({
                type: WindowCovering.WindowCoveringType.TiltBlindLift,
                endProductType: WindowCovering.EndProductType.RollerShade,
            }),
        );
        expect(cause).instanceof(EnumValueConformanceError);
    });
});
