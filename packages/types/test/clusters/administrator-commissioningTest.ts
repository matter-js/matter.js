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

    it("base attributes don't include basic commissioning commands", () => {
        // The Base namespace interface only has openCommissioningWindow
        type BaseCommands = AdministratorCommissioning.Base.Commands;
        type HasOpen = BaseCommands extends { openCommissioningWindow: any } ? true : false;
        true satisfies HasOpen;

        // Runtime: Base const doesn't have openBasicCommissioningWindow
        expect(AdministratorCommissioning.Base.commands.openCommissioningWindow).exist;
        expect((AdministratorCommissioning.Base.commands as Record<string, unknown>).openBasicCommissioningWindow).undefined;
    });

    it("BasicComponent has openBasicCommissioningWindow", () => {
        type BasicCommands = AdministratorCommissioning.BasicComponent.Commands;
        type HasBasic = BasicCommands extends { openBasicCommissioningWindow: any } ? true : false;
        true satisfies HasBasic;

        // Runtime
        expect(AdministratorCommissioning.BasicComponent.commands.openBasicCommissioningWindow).exist;
    });

    it("Components tuple maps basic flag to correct component", () => {
        type Components = AdministratorCommissioning.Components;
        type BasicEntry = Components[1];

        // Type-level check that the component has the right flags
        ({}) as BasicEntry satisfies { flags: { basic: true } };
    });

    it("runtime commands include all commands", () => {
        expect(AdministratorCommissioning.commands.openCommissioningWindow).exist;
        expect(AdministratorCommissioning.commands.openBasicCommissioningWindow).exist;
    });
});
