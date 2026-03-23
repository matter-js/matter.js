/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindowCovering } from "#clusters/window-covering.js";

describe("Window Covering Cluster", () => {
    it("verifies attribute metadata via schema model", () => {
        const schema = WindowCovering.schema;

        const configStatus = schema.attributes.require("ConfigStatus");
        expect(configStatus.mandatory).true;
        expect(configStatus.writable).false;

        const mode = schema.attributes.require("Mode");
        expect(mode.writable).true;

        const endProductType = schema.attributes.require("EndProductType");
        expect(endProductType.fixed).true;

        const numberOfActuationsLift = schema.attributes.require("NumberOfActuationsLift");
        expect(numberOfActuationsLift.mandatory).false;
    });

    it("runtime commands has expected commands", () => {
        expect(WindowCovering.commands.upOrOpen).exist;
        expect(WindowCovering.commands.downOrClose).exist;
        expect(WindowCovering.commands.stopMotion).exist;
    });
});
