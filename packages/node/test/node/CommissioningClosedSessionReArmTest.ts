/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { ControllerCommissioningFlow } from "@matter/protocol";

describe("Commissioning failsafe re-arm", () => {
    before(() => {
        MockTime.init();
    });

    it("skips the re-arm after a step that closed the commissioning session", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;

        let flowError: unknown;
        let flowCompleted = false;

        class ClosingStepFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                const keep = ["GetInitialData", "GeneralCommissioning.ArmFailsafe"];
                const steps = this.commissioningSteps.filter(step => keep.includes(step.name));
                this.commissioningSteps.splice(0, this.commissioningSteps.length, ...steps, {
                    stepNumber: 16,
                    subStepNumber: 9,
                    name: "Leave the commissioning channel",
                    stepLogic: async () => {
                        // Leaves less than half of the 60 s failsafe, so the flow wants to re-arm after this step
                        await MockTime.advance(Seconds(40));
                        await this.interaction.session?.initiateClose();
                        return this.getCommissioningStepResult(7, 1)!;
                    },
                });

                try {
                    await super.executeCommissioning();
                    flowCompleted = true;
                } catch (error) {
                    flowError = error;
                }
                throw new Error("Stop after the flow under test");
            }
        }

        controllerCrypto.entropic = deviceCrypto.entropic = true;
        try {
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        commissioningFlowImpl: ClosingStepFlow,
                        timeout: Seconds(90),
                    })
                    .catch(() => {}),
                { macrotasks: true },
            );
        } finally {
            controllerCrypto.entropic = deviceCrypto.entropic = false;
        }

        expect(flowError).undefined;
        expect(flowCompleted).true;
    });
});
