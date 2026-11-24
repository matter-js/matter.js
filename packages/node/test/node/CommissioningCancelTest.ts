/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralCommissioningServer } from "#behaviors/general-commissioning";
import { OperationalCredentialsServer } from "#behaviors/operational-credentials";
import { OnOffLightDevice } from "#devices/on-off-light";
import {
    Crypto,
    Diagnostic,
    ImplementationError,
    InternalError,
    LogDestination,
    Logger,
    LogLevel,
    Millis,
    MockCrypto,
    MockNetwork,
    Network,
    Seconds,
    Time,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import {
    CommissioningError,
    ControllerCommissioningFlow,
    DeviceCommissioner,
    MessageCodec,
    PeerSet,
} from "@matter/protocol";
import { SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType, Status, StatusResponseError } from "@matter/types";
import type { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import type { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

/**
 * Where the commissioning waits when the cancel comes.  The device withholds its answer to a held command, `sigma1`
 * drops the operational CASE handshake, `read` withholds every device answer from step GetInitialData on,
 * `customStep` is a step of a custom flow that sends nothing, `finalize` is an external finalization that takes
 * 305 seconds, into the last half minute of the failsafe the flow armed for it, and `reconnectArm` holds the
 * ArmFailSafe the flow sends before an external finalization.
 */
type HeldStep =
    | "armFailSafe"
    | "csrRequest"
    | "commissioningComplete"
    | "sigma1"
    | "read"
    | "customStep"
    | "finalize"
    | "reconnectArm";

/** The device withholds its answer to the first {@link step} until {@link release} resolves. */
interface Hold {
    step: HeldStep;
    reached: () => void;
    release: Promise<void>;
}

let hold: Hold | undefined;

/** Number of ArmFailSafe commands with ExpiryLengthSeconds 0 that reached the device. */
let expiryRequests = 0;

/** Whether the device answers CommissioningComplete with a failure after it committed. */
let failCommissioningComplete = false;

async function holdIfRequested(step: HeldStep) {
    if (hold?.step !== step) {
        return;
    }
    const { reached, release } = hold;
    hold = undefined;
    reached();
    await release;
}

class HoldingGeneralCommissioningServer extends GeneralCommissioningServer {
    override async armFailSafe(request: GeneralCommissioning.ArmFailSafeRequest) {
        if (request.expiryLengthSeconds === 0) {
            expiryRequests++;
        }
        const response = await super.armFailSafe(request);
        // The flow arms for the operational step much longer than the device's 60 second default
        await holdIfRequested(request.expiryLengthSeconds > 60 ? "reconnectArm" : "armFailSafe");
        return response;
    }

    override async commissioningComplete() {
        const response = await super.commissioningComplete();
        await holdIfRequested("commissioningComplete");
        if (failCommissioningComplete) {
            throw new StatusResponseError("Simulated CommissioningComplete failure (test)", Status.Failure);
        }
        return response;
    }
}

class HoldingOperationalCredentialsServer extends OperationalCredentialsServer {
    override async csrRequest(request: OperationalCredentials.CsrRequest) {
        await holdIfRequested("csrRequest");
        return super.csrRequest(request);
    }
}

type Cancel = "abort signal" | "cancel";

describe("Commissioning cancel", () => {
    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        hold = undefined;
        expiryRequests = 0;
        failCommissioningComplete = false;
    });

    async function commissionAndCancel(site: MockSite, step: HeldStep, how: Cancel = "abort signal") {
        const controller = await site.addController();
        const device = await site.addNode(
            MockServerNode.RootEndpoint.with(HoldingGeneralCommissioningServer, HoldingOperationalCredentialsServer),
            { device: OnOffLightDevice },
        );
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        const deviceNetwork = device.env.get(Network);
        if (!(deviceNetwork instanceof MockNetwork)) {
            throw new InternalError("The mock site runs on a mock network");
        }
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        let reached!: () => void;
        const reachedHold = new Promise<void>(resolve => (reached = resolve));
        let release!: () => void;
        hold = { step, reached, release: new Promise<void>(resolve => (release = resolve)) };

        let withholdDeviceAnswers = false;
        const stepsAfterCustomStep = new Array<string>();
        let finalizationStarted = false;

        class HoldingFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                const getInitialData = this.commissioningSteps.find(({ name }) => name === "GetInitialData");
                if (getInitialData === undefined) {
                    throw new InternalError("The default flow has no GetInitialData step");
                }
                const readInitialData = getInitialData.stepLogic;
                getInitialData.stepLogic = () => {
                    if (step === "read") {
                        withholdDeviceAnswers = true;
                        reached();
                    }
                    return readInitialData();
                };

                if (step === "customStep") {
                    const index = this.commissioningSteps.findIndex(({ name }) => name === "AccessControl") + 1;
                    for (const later of this.commissioningSteps.slice(index)) {
                        const logic = later.stepLogic;
                        later.stepLogic = () => {
                            stepsAfterCustomStep.push(later.name);
                            return logic();
                        };
                    }
                    this.commissioningSteps.splice(index, 0, {
                        stepNumber: 15,
                        subStepNumber: 99,
                        name: "Custom step",
                        stepLogic: async () => {
                            reached();
                            await hold?.release;
                            return { code: 0, breadcrumb: this.lastBreadcrumb };
                        },
                    });
                }

                await super.executeCommissioning();
            }
        }

        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (withholdDeviceAnswers && packet.kind === "udp" && packet.sourcePort === 5540) {
                return;
            }
            // Sigma1 never reaches the device, so the operational CASE connection after AddNOC cannot complete
            if (step === "sigma1" && packet.kind === "udp" && packet.destPort === 5540) {
                const decoded = MessageCodec.decodePacket(packet.payload);
                if (decoded.header.sessionId === 0) {
                    const { payloadHeader } = MessageCodec.decodePayload(decoded);
                    if (
                        payloadHeader.protocolId === SECURE_CHANNEL_PROTOCOL_ID &&
                        payloadHeader.messageType === SecureMessageType.Sigma1
                    ) {
                        reached();
                        return;
                    }
                }
            }
            route(packet);
        });

        await controller.start();

        const abort = new AbortController();
        const { passcode, discriminator } = device.state.commissioning;
        const commissioning = controller.peers.commission({
            passcode,
            discriminator,
            timeout: Seconds(90),
            abort: abort.signal,
            commissioningFlowImpl: HoldingFlow,
            finalizeCommissioning:
                step === "finalize" || step === "reconnectArm"
                    ? async () => {
                          finalizationStarted = true;
                          if (step === "finalize") {
                              reached();
                              // The flow arms the failsafe for 5 minutes 20 seconds before the operational step
                              await Time.sleep("external finalization", Seconds(305));
                          }
                      }
                    : undefined,
        });
        const outcome = commissioning.then(
            () => undefined,
            (error: unknown) => error,
        );

        await MockTime.resolve(reachedHold, { macrotasks: true });
        const canceledAt = Time.nowUs;

        const commissionerWarnings = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                if (message.facility === "ControllerCommissioner" && message.level >= LogLevel.WARN) {
                    commissionerWarnings.push(message.values.map(value => String(value)).join(" "));
                }
            },
        });

        const reason = new ImplementationError("Caller gave up");
        if (how === "abort signal") {
            abort.abort(reason);
        } else {
            commissioning.cancel(reason);
        }

        // A held CSRRequest stays unanswered, so only a cancel of the request itself settles the commissioning.  The
        // device answers the other held requests, so the controller can end the failsafe the device armed.
        if (step !== "csrRequest") {
            release();
        }
        let error: unknown;
        try {
            error = await MockTime.resolve(outcome, { macrotasks: true });
        } finally {
            delete Logger.destinations.capture;
        }
        const settledAfter = Millis(Time.nowUs - canceledAt);
        release();
        withholdDeviceAnswers = false;
        controllerCrypto.entropic = deviceCrypto.entropic = false;

        return {
            error,
            reason,
            settledAfter,
            commissionerWarnings,
            stepsAfterCustomStep,
            finalizationStarted,
            failsafeArmed: device.env.get(DeviceCommissioner).isFailsafeArmed,
            commissioned: device.state.commissioning.commissioned,
            peers: controller.peers.commissioned.length,
            peerSetSize: controller.env.get(PeerSet).size,
        };
    }

    for (const how of ["abort signal", "cancel"] as const) {
        it(`stops a commissioning step and ends the failsafe on ${how}`, async () => {
            await using site = new MockSite();
            const result = await commissionAndCancel(site, "csrRequest", how);

            expect(result.error).equals(result.reason);
            expect(expiryRequests).equals(1);
            expect(result.failsafeArmed).equals(false);
            expect(result.commissioned).equals(false);
            expect(result.peers).equals(0);
            expect(result.commissionerWarnings).deep.equals([]);
        });
    }

    it("stops a read the device does not answer", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "read");

        expect(result.error).equals(result.reason);
        // A read that is not canceled fails as unresponsive, after which no expiry is sent.  The device armed the
        // failsafe itself when PASE was established.
        expect(expiryRequests).equals(1);
        // The expiry gets no answer either, so the commissioning waits only the limit for a canceled expiry
        expect(result.settledAfter).lessThan(Seconds(3));
        expect(result.failsafeArmed).equals(false);
        expect(result.commissioned).equals(false);
    });

    it("runs no further step after a step that does not observe the cancel", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "customStep");

        expect(result.error).equals(result.reason);
        expect(result.stepsAfterCustomStep).deep.equals([]);
        expect(expiryRequests).equals(1);
        expect(result.failsafeArmed).equals(false);
        expect(result.commissioned).equals(false);
    });

    it("ends a failsafe the device armed before the cancel abandoned the ArmFailSafe response", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "armFailSafe");

        expect(result.error).equals(result.reason);
        expect(expiryRequests).equals(1);
        expect(result.failsafeArmed).equals(false);
        expect(result.commissioned).equals(false);
    });

    it("stops the operational CASE connection", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "sigma1");

        expect(result.error).equals(result.reason);
        // The default budget for the CASE connection is 255 s
        expect(result.settledAfter).lessThan(Seconds(30));
        expect(result.commissionerWarnings).deep.equals([]);
        expect(expiryRequests).equals(1);
        expect(result.failsafeArmed).equals(false);
        expect(result.peerSetSize).equals(0);
    });

    it("completes the commissioning when the cancel comes after CommissioningComplete was sent", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "commissioningComplete");

        expect(result.error).undefined;
        expect(expiryRequests).equals(0);
        expect(result.commissioned).equals(true);
        expect(result.peers).equals(1);
    });

    it("reports a CommissioningComplete failure instead of a cancel that came while it was pending", async () => {
        await using site = new MockSite();
        failCommissioningComplete = true;
        const result = await commissionAndCancel(site, "commissioningComplete");

        expect(result.error).instanceOf(CommissioningError);
    });

    it("completes the commissioning when the cancel comes while an external finalization runs", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "finalize");

        expect(result.error).undefined;
    });

    it("does not start an external finalization after a cancel during the failsafe re-arm before it", async () => {
        await using site = new MockSite();
        const result = await commissionAndCancel(site, "reconnectArm");

        expect(result.error).equals(result.reason);
        expect(result.finalizationStarted).equals(false);
        expect(expiryRequests).equals(1);
        expect(result.failsafeArmed).equals(false);
    });
});
