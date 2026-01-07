/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindowCoveringCluster } from "#clusters/window-covering.js";

describe("Window Covering Cluster", () => {
    const WindowCovering_LF_PALF = WindowCoveringCluster.with("Lift", "PositionAwareLift");

    it("correctly initializes elements for LF & PA_LF", () => {
        const NONE = [false, false, false, false];
        const OPTIONAL = [true, false, false, false];
        const WRITABLE = [false, true, false, false];
        const FIXED = [false, false, true, false];

        expect(
            Object.fromEntries(
                Object.entries(WindowCovering_LF_PALF.attributes).map(
                    ([k, { optional, writable, fixed, fabricScoped }]) => [
                        k,
                        [optional, writable, fixed, fabricScoped],
                    ],
                ),
            ),
        ).deep.equal({
            // TODO - make strict after updating web tester
            acceptedCommandList: NONE,
            attributeList: NONE,
            clusterRevision: NONE,
            configStatus: NONE,
            currentPositionLiftPercent100ths: NONE,
            currentPositionLiftPercentage: OPTIONAL,
            endProductType: FIXED,
            featureMap: NONE,
            generatedCommandList: NONE,
            mode: WRITABLE,
            numberOfActuationsLift: OPTIONAL,
            operationalStatus: NONE,
            safetyStatus: OPTIONAL,
            targetPositionLiftPercent100ths: NONE,
            type: FIXED,
        });

        expect(
            Object.fromEntries(
                Object.entries(WindowCovering_LF_PALF.commands).map(([k, { optional }]) => [
                    k,
                    [optional, false, false, false],
                ]),
            ),
        ).deep.equal({
            downOrClose: NONE,
            goToLiftPercentage: NONE,
            stopMotion: NONE,
            upOrOpen: NONE,
        });
    });
});
