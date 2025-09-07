/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdministratorCommissioningServer } from "#behaviors/administrator-commissioning";
import { BasicInformationServer } from "#behaviors/basic-information";
import { AdministratorCommissioning } from "#clusters/administrator-commissioning";
import { GeneralCommissioning } from "#clusters/general-commissioning";
import { Bytes, Diagnostic, Logger, MatterFlowError, MaybePromise, Seconds } from "#general";
import type { ServerNode } from "#node/ServerNode.js";
import {
    assertRemoteActor,
    DeviceCommissioner,
    FabricManager,
    GroupSession,
    NodeSession,
    SecureSession,
    SessionManager,
} from "#protocol";
import { GeneralCommissioningBehavior } from "./GeneralCommissioningBehavior.js";
import { ServerNodeFailsafeContext } from "./ServerNodeFailsafeContext.js";

const SuccessResponse = { errorCode: GeneralCommissioning.CommissioningError.Ok, debugText: "" };
const logger = Logger.get("GeneralCommissioningClusterHandler");

/**
 * This is the default server implementation of GeneralCommissioningBehavior.
 */
export class GeneralCommissioningServer extends GeneralCommissioningBehavior {
    declare state: GeneralCommissioningServer.State;

    static override lockOnInvoke = false;

    override initialize(): MaybePromise {
        const bci = this.state.basicCommissioningInfo;

        if (bci.failSafeExpiryLengthSeconds === undefined) {
            // One minute
            bci.failSafeExpiryLengthSeconds = 60;
        }

        if (bci.maxCumulativeFailsafeSeconds === undefined) {
            // 5 minutes, recommended by spec
            bci.maxCumulativeFailsafeSeconds = 900;
        }

        this.state.breadcrumb = 0;

        const sessionManager = this.env.get(SessionManager);
        this.reactTo(sessionManager.sessions.added, this.#handleAddedPaseSessions);
    }

    /** As required by Commissioning Flows any new PASE session needs to arm the failsafe for 60s. */
    async #handleAddedPaseSessions(session: NodeSession) {
        if (
            !session.isPase || // Only PASE sessions
            session.fabric !== undefined // That does not have an assigned fabric (can never happen in real usecases)
        ) {
            return;
        }
        logger.debug(`New PASE session added: ${session.id}. Arming Failsafe for 60s.`);
        await this.#armFailSafe({ breadcrumb: this.state.breadcrumb, expiryLengthSeconds: 60 }, session);
    }

    async #armFailSafe(
        { breadcrumb, expiryLengthSeconds }: GeneralCommissioning.ArmFailSafeRequest,
        session: SecureSession,
    ) {
        NodeSession.assert(session, "armFailSafe can only be called on a secure session");
        const commissioner = this.env.get(DeviceCommissioner);

        try {
            // If the fail-safe timer is not currently armed, the commissioning window is open, and the command was
            // received over a CASE session, the command SHALL leave the current fail-safe state unchanged and
            // immediately respond with an ArmFailSafeResponse containing an ErrorCode value of BusyWithOtherAdmin. This
            // is done to allow commissioners, which use PASE connections, the opportunity to use the failsafe during
            // the relatively short commissioning window.
            if (
                !commissioner.isFailsafeArmed &&
                this.agent.get(AdministratorCommissioningServer).state.windowStatus !==
                    AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen &&
                !session.isPase
            ) {
                // TODO - should this set status to Status.BusyWithOtherAdmin?
                throw new MatterFlowError("Failed to arm failsafe using CASE while commissioning window is opened.");
            }

            if (commissioner.isFailsafeArmed) {
                await commissioner.failsafeContext.extend(session.fabric, Seconds(expiryLengthSeconds));
            } else {
                // If ExpiryLengthSeconds is 0 and the fail-safe timer was not armed, then this command invocation SHALL
                // lead to a success response with no side effect against the fail-safe context.
                if (expiryLengthSeconds === 0) return SuccessResponse;

                const failsafe = new ServerNodeFailsafeContext(this.endpoint as ServerNode, {
                    fabrics: this.env.get(FabricManager),
                    sessions: this.env.get(SessionManager),
                    expiryLength: Seconds(expiryLengthSeconds),
                    maxCumulativeFailsafe: Seconds(this.state.basicCommissioningInfo.maxCumulativeFailsafeSeconds),
                    associatedFabric: session.fabric,
                });

                // Note - this used to be async and wait for construction internally.  However that leads to race
                // conditions because commissioner.isFailsafeArmed would return false if the promise had not yet
                // resolved. Probably only a real-world issue for tests but we instead wait for construction after
                // installing into the commissioner
                commissioner.beginTimed(failsafe);

                await failsafe.construction;
            }

            if (commissioner.isFailsafeArmed) {
                // If failsafe is armed after the command, set breadcrumb (not when expired)
                this.state.breadcrumb = breadcrumb;
            }
        } catch (error) {
            MatterFlowError.accept(error);

            logger.debug(`Error while arming failSafe timer`, error);
            return {
                errorCode: GeneralCommissioning.CommissioningError.BusyWithOtherAdmin,
                debugText: error.message,
            };
        }

        return SuccessResponse;
    }

    override armFailSafe(request: GeneralCommissioning.ArmFailSafeRequest) {
        assertRemoteActor(this.context);
        return this.#armFailSafe(request, this.context.session);
    }

    override async setRegulatoryConfig({
        breadcrumb,
        newRegulatoryConfig,
        countryCode,
    }: GeneralCommissioning.SetRegulatoryConfigRequest) {
        const locationCapabilityValue = this.state.locationCapability;

        // Check and handle country code
        const basicInformation = this.agent.get(BasicInformationServer);
        const currentLocationCountryCode = basicInformation.state.location;

        if (currentLocationCountryCode !== countryCode) {
            if (this.state.allowCountryCodeChange === false && countryCode !== "XX") {
                return {
                    errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                    debugText: `Country code change not allowed: ${countryCode}`,
                };
            }
            if (
                this.state.countryCodeWhitelist !== undefined &&
                !this.state.countryCodeWhitelist.includes(countryCode)
            ) {
                return {
                    errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                    debugText: `Country code change not allowed: ${countryCode}`,
                };
            }
            if (countryCode !== "XX") {
                basicInformation.state.location = countryCode;
            }
        }

        // Check and handle regulatory config for LocationCapability
        let validValues;
        switch (locationCapabilityValue) {
            case GeneralCommissioning.RegulatoryLocationType.Outdoor:
                validValues = [GeneralCommissioning.RegulatoryLocationType.Outdoor];
                break;
            case GeneralCommissioning.RegulatoryLocationType.Indoor:
                validValues = [GeneralCommissioning.RegulatoryLocationType.Indoor];
                break;
            case GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor:
                validValues = [
                    GeneralCommissioning.RegulatoryLocationType.Indoor,
                    GeneralCommissioning.RegulatoryLocationType.Outdoor,
                    GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
                ];
                break;
            default:
                return {
                    errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                    debugText: `Invalid regulatory location: ${
                        newRegulatoryConfig === GeneralCommissioning.RegulatoryLocationType.Indoor
                            ? "Indoor"
                            : "Outdoor"
                    }`,
                };
        }
        if (!validValues.includes(newRegulatoryConfig)) {
            return {
                errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                debugText: `Invalid regulatory location: ${
                    newRegulatoryConfig === GeneralCommissioning.RegulatoryLocationType.Indoor ? "Indoor" : "Outdoor"
                }`,
            };
        }

        this.state.regulatoryConfig = newRegulatoryConfig;

        this.state.breadcrumb = breadcrumb;

        return SuccessResponse;
    }

    override async commissioningComplete() {
        assertRemoteActor(this.context);
        const { session } = this.context;
        if ((NodeSession.is(session) && session.isPase) || GroupSession.is(session)) {
            return {
                errorCode: GeneralCommissioning.CommissioningError.InvalidAuthentication,
                debugText: "Command must be executed over CASE session.",
            };
        }

        const fabric = session.associatedFabric;

        const commissioner = this.env.get(DeviceCommissioner);

        if (!commissioner.isFailsafeArmed) {
            return { errorCode: GeneralCommissioning.CommissioningError.NoFailSafe, debugText: "FailSafe not armed." };
        }
        const failsafeContext = commissioner.failsafeContext;

        SecureSession.assert(session, "commissioningComplete can only be called on a secure session");

        const timedFabric = failsafeContext.associatedFabric?.fabricIndex;
        if (fabric.fabricIndex !== timedFabric) {
            return {
                errorCode: GeneralCommissioning.CommissioningError.InvalidAuthentication,
                debugText: `Associated fabric ${fabric.fabricIndex} does not match the one from the failsafe context ${timedFabric}.`,
            };
        }

        // On successful execution of the CommissioningComplete command the following actions SHALL be undertaken on the
        // Server:
        // 1. The Fail-Safe timer associated with the current Fail-Safe context SHALL be disarmed.
        // 2. The commissioning window at the Server SHALL be closed.
        // 3. Any temporary administrative privileges automatically granted to any open PASE session SHALL be revoked
        //    (see Section 6.6.2.8, “Bootstrapping of the Access Control Cluster”).
        // 4. The Secure Session Context of any PASE session still established at the Server SHALL be cleared.
        await failsafeContext.completeCommission();

        // 5. The Breadcrumb attribute SHALL be reset to zero.
        this.state.breadcrumb = BigInt(0);

        logger.info(
            "Commissioned",
            Diagnostic.dict({
                fabric: `${Bytes.toHex(fabric.operationalId)} (#${fabric.fabricIndex})`,
                node: fabric.nodeId.toString(16).padStart(16, "0"),
            }),
        );

        return SuccessResponse;
    }
}

export namespace GeneralCommissioningServer {
    // We place the following configuration options in State rather than Internal so they can be conveniently configured
    // using GeneralCommissioningServer.set()
    export class State extends GeneralCommissioningBehavior.State {
        /**
         * Set to false to prevent the controller from changing the country code during commissioning.
         */
        allowCountryCodeChange = true; // Default true if not set

        /**
         * Set to an array of two-letter country codes to limit the countries the controller may assign.
         */
        countryCodeWhitelist?: string[] = undefined;
    }
}
