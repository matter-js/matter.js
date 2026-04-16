/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdministratorCommissioning } from "#clusters/administrator-commissioning.js";

describe("Administrator Commissioning Cluster", () => {
    it("defines basic properties correctly", () => {
        expect(AdministratorCommissioning.id).equal(0x3c);
        expect(AdministratorCommissioning.name).equal("AdministratorCommissioning");
        expect(AdministratorCommissioning.revision).equal(1);
    });

    it("base commands include openCommissioningWindow", () => {
        type HasOpen = AdministratorCommissioning.BaseCommands extends { openCommissioningWindow: unknown }
            ? true
            : false;
        true satisfies HasOpen;
    });

    it("BasicCommands has openBasicCommissioningWindow", () => {
        type HasBasic = AdministratorCommissioning.BasicCommands extends { openBasicCommissioningWindow: unknown }
            ? true
            : false;
        true satisfies HasBasic;
    });

    it("Components tuple maps basic flag to correct component", () => {
        type Components = AdministratorCommissioning.Components;
        type BasicEntry = Components[1];

        // Type-level check that the component has the right flags and commands
        ({}) as BasicEntry satisfies { flags: { basic: true }; commands: AdministratorCommissioning.BasicCommands };
    });

    it("runtime commands include all commands", () => {
        expect(AdministratorCommissioning.commands.openCommissioningWindow).exist;
        expect(AdministratorCommissioning.commands.openBasicCommissioningWindow).exist;
    });
});
