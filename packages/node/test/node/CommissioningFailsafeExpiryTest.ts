/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralCommissioningServer } from "#behaviors/general-commissioning";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Crypto, InternalError, MockCrypto, Seconds, Time } from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import {
    CommissioningError,
    ControllerCommissioningFlow,
    DeviceCommissioner,
    OperativeConnectionFailedError,
    PeerUnresponsiveError,
    SessionManager,
} from "@matter/protocol";
import { Status, StatusResponseError } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";

/** Number of ArmFailSafe commands with ExpiryLengthSeconds 0 that reached the device. */
let expiryRequests = 0;

class RecordingGeneralCommissioningServer extends GeneralCommissioningServer {
    override armFailSafe(request: GeneralCommissioning.ArmFailSafeRequest) {
        if (request.expiryLengthSeconds === 0) {
            expiryRequests++;
        }
        return super.armFailSafe(request);
    }
}

/**
 * Which step fails and how.  `closeSession` closes the session the step runs on before it throws: the PASE session
 * before step "Reconnect", the controller's operational sessions after it.
 */
interface Failure {
    error: Error;
    step?: "GetInitialData" | "AccessControl" | "GeneralCommissioning.Complete";
    closeSession?: boolean;
}

describe("Commissioning failsafe expiry", () => {
    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        expiryRequests = 0;
    });

    async function commissionWithFailingStep({ error, step = "AccessControl", closeSession = false }: Failure) {
        await using site = new MockSite();
        const controller = await site.addController();
        const device = await site.addNode(MockServerNode.RootEndpoint.with(RecordingGeneralCommissioningServer), {
            device: OnOffLightDevice,
        });
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;

        let armedAfterFailure: boolean | undefined;
        let failedAt = 0;
        let failedAfter: number | undefined;

        class FailingStepFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                const index = this.commissioningSteps.findIndex(({ name }) => name === step);
                this.commissioningSteps.splice(index, this.commissioningSteps.length - index, {
                    ...this.commissioningSteps[index],
                    name: "Failing step",
                    stepLogic: async () => {
                        if (closeSession) {
                            if (step === "GeneralCommissioning.Complete") {
                                for (const session of controller.env.get(SessionManager).sessions) {
                                    await session.initiateClose();
                                }
                            } else {
                                await this.interaction.session?.initiateClose();
                            }
                        }
                        failedAt = Time.nowMs;
                        throw error;
                    },
                });

                try {
                    await super.executeCommissioning();
                } finally {
                    failedAfter = Time.nowMs - failedAt;
                    armedAfterFailure = device.env.get(DeviceCommissioner).isFailsafeArmed;
                }
            }
        }

        controllerCrypto.entropic = deviceCrypto.entropic = true;
        try {
            const { passcode, discriminator } = device.state.commissioning;
            const rejection = await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        commissioningFlowImpl: FailingStepFlow,
                        timeout: Seconds(90),
                    })
                    .then(
                        () => undefined,
                        (e: unknown) => e,
                    ),
                { macrotasks: true },
            );
            expect(rejection).instanceOf(error instanceof StatusResponseError ? CommissioningError : error.constructor);
        } finally {
            controllerCrypto.entropic = deviceCrypto.entropic = false;
        }

        return { failedAfter, armedAfterFailure };
    }

    // Characterization: a commissioning error already ended the failsafe
    it("ends the failsafe when a step fails with a commissioning error", async () => {
        const { armedAfterFailure } = await commissionWithFailingStep({
            error: new CommissioningError("Simulated commissioning failure (test)"),
        });
        expect(expiryRequests).equals(1);
        expect(armedAfterFailure).false;
    });

    // Characterization: a status response already ended the failsafe and is reported as a commissioning error
    it("ends the failsafe when a step fails with a status response", async () => {
        const { armedAfterFailure } = await commissionWithFailingStep({
            error: new StatusResponseError("Simulated device rejection (test)", Status.Failure),
        });
        expect(expiryRequests).equals(1);
        expect(armedAfterFailure).false;
    });

    it("ends the failsafe when a step fails with any other error", async () => {
        const { armedAfterFailure } = await commissionWithFailingStep({
            error: new InternalError("Simulated certificate issuer failure (test)"),
        });
        expect(expiryRequests).equals(1);
        expect(armedAfterFailure).false;
    });

    // Characterization: a commissioning error already ended the failsafe; pins that a reconnect failure with an
    // unresponsive cause still counts as one
    it("ends the failsafe when a step throws an operational reconnect failure", async () => {
        const { armedAfterFailure } = await commissionWithFailingStep({
            error: new OperativeConnectionFailedError("Simulated finalization failure (test)", {
                cause: new PeerUnresponsiveError(Seconds(30)),
            }),
        });
        expect(expiryRequests).equals(1);
        expect(armedAfterFailure).false;
    });

    // Characterization: a step failing with a transport error never sent an expiry
    it("leaves the failsafe to expire when the device stopped responding", async () => {
        const { failedAfter } = await commissionWithFailingStep({ error: new PeerUnresponsiveError(Seconds(30)) });
        expect(expiryRequests).equals(0);
        expect(failedAfter).equals(0);
    });

    // Characterization: the commissioning session cannot reconnect, so the attempt fails at once
    it("fails without delay when the step closed the commissioning session", async () => {
        const { failedAfter } = await commissionWithFailingStep({
            error: new InternalError("Simulated failure after the session closed (test)"),
            closeSession: true,
        });
        expect(expiryRequests).equals(0);
        expect(failedAfter).equals(0);
    });

    it("ends the failsafe over the operational session after reconnect", async () => {
        const { armedAfterFailure } = await commissionWithFailingStep({
            error: new InternalError("Simulated failure after reconnect (test)"),
            step: "GeneralCommissioning.Complete",
        });
        expect(expiryRequests).equals(1);
        expect(armedAfterFailure).false;
    });

    // Characterization: no expiry was sent before the commissioner armed the failsafe
    it("sends no expiry before the commissioner armed the failsafe", async () => {
        await commissionWithFailingStep({
            error: new InternalError("Simulated failure before the failsafe was armed (test)"),
            step: "GetInitialData",
        });
        expect(expiryRequests).equals(0);
    });

    it("does not reconnect to end the failsafe after the operational session closed", async () => {
        const { failedAfter } = await commissionWithFailingStep({
            error: new InternalError("Simulated failure after the operational session closed (test)"),
            step: "GeneralCommissioning.Complete",
            closeSession: true,
        });
        expect(expiryRequests).equals(0);
        expect(failedAfter).equals(0);
    });
});
