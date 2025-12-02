/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { AdministratorCommissioning } from "#clusters/administrator-commissioning";
import { Duration, InternalError, Logger, Seconds, Time, Timer, Worker } from "#general";
import { AccessLevel } from "#model";
import {
    assertRemoteActor,
    DeviceCommissioner,
    FailsafeContext,
    hasRemoteActor,
    PaseServer,
    SessionManager,
} from "#protocol";
import {
    Command,
    MINIMUM_COMMISSIONING_TIMEOUT,
    PAKE_PASSCODE_VERIFIER_LENGTH,
    STANDARD_COMMISSIONING_TIMEOUT,
    Status,
    StatusResponseError,
    TlvByteString,
    TlvField,
    TlvNoResponse,
    TlvObject,
    TlvUInt16,
    TlvUInt32,
} from "#types";
import { AdministratorCommissioningBehavior } from "./AdministratorCommissioningBehavior.js";

/**
 * Monkey patching Tlv Structure of openCommissioningWindow command to prevent data validation of the fields to be
 * handled as ConstraintError because we need to return a special error.
 * We do this to leave the model in fact for other validations and only apply the change for our Schema-aware Tlv parsing.
 */
AdministratorCommissioning.Cluster.commands = {
    ...AdministratorCommissioning.Cluster.commands,
    openCommissioningWindow: Command(
        0x0,
        TlvObject({
            commissioningTimeout: TlvField(0, TlvUInt16),
            pakePasscodeVerifier: TlvField(1, TlvByteString),
            discriminator: TlvField(2, TlvUInt16.bound({ max: 4095 })),
            iterations: TlvField(3, TlvUInt32),
            salt: TlvField(4, TlvByteString),
        }),
        0x0,
        TlvNoResponse,
        {
            invokeAcl: AccessLevel.Administer,
            timed: true,
        },
    ),
};

const logger = Logger.get("AdministratorCommissioningServer");

/**
 * This is the default server implementation of AdministratorCommissioningBehavior.
 *
 * This implementation includes all features of AdministratorCommissioning.Cluster. You should use
 * AdministratorCommissioningServer.with to specialize the class for the features your implementation supports.
 */
export class AdministratorCommissioningServer extends AdministratorCommissioningBehavior {
    declare internal: AdministratorCommissioningServer.Internal;
    declare state: AdministratorCommissioningServer.State;

    static override lockOnInvoke = false;

    /**
     * This method opens an Enhanced Commissioning Window (a dynamic passcode is used which was provided by the caller).
     */
    override async openCommissioningWindow({
        pakePasscodeVerifier,
        discriminator,
        iterations,
        salt,
        commissioningTimeout,
    }: AdministratorCommissioning.OpenCommissioningWindowRequest) {
        // We monkey patched the Tlv definition above, so take care about correct error handling
        if (pakePasscodeVerifier.byteLength !== PAKE_PASSCODE_VERIFIER_LENGTH) {
            throw new AdministratorCommissioning.PakeParameterError("PAKE passcode verifier length is invalid");
        }
        if (iterations < 1000 || iterations > 100_000) {
            throw new AdministratorCommissioning.PakeParameterError("PAKE iterations invalid");
        }
        if (salt.byteLength < 16 || salt.byteLength > 32) {
            throw new AdministratorCommissioning.PakeParameterError("PAKE salt has invalid length.");
        }

        const commissioner = this.env.get(DeviceCommissioner);

        const timeout = Seconds(commissioningTimeout);

        this.#assertCommissioningWindowRequirements(timeout, commissioner);

        this.#initializeCommissioningWindow(
            timeout,
            AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen,
        );

        await this.env.get(DeviceCommissioner).allowEnhancedCommissioning(
            discriminator,
            PaseServer.fromVerificationValue(this.env.get(SessionManager), pakePasscodeVerifier, {
                iterations,
                salt,
            }),
            this.callback(this.#endCommissioning),
        );
    }

    /** This method opens a Basic Commissioning Window. The default passcode is used. */
    async openBasicCommissioningWindow({
        commissioningTimeout,
    }: AdministratorCommissioning.OpenBasicCommissioningWindowRequest) {
        const commissioner = this.env.get(DeviceCommissioner);

        const timeout = Seconds(commissioningTimeout);

        this.#assertCommissioningWindowRequirements(timeout, commissioner);

        this.#initializeCommissioningWindow(
            timeout,
            AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen,
        );

        await commissioner.allowBasicCommissioning(this.callback(this.#endCommissioning));
    }

    /** This method is used to revoke a commissioning window. */
    override async revokeCommissioning() {
        if (this.internal.commissioningWindowTimeout === undefined) {
            throw new AdministratorCommissioning.WindowNotOpenError(
                "No commissioning window is opened that could be revoked.",
            );
        }

        logger.debug("Revoking commissioning window");

        await this.#closeCommissioningWindow();

        if (this.env.has(FailsafeContext)) {
            const failsafeContext = this.env.get(FailsafeContext);
            if (failsafeContext) {
                await failsafeContext.close((this.context as RemoteActorContext).exchange);
            }
        }
    }

    /**
     * Called whenever a Commissioning/Announcement Window is opened by this cluster. This method starts the timer and
     * adjusts the needed attributes.
     */
    #initializeCommissioningWindow(
        commissioningTimeout: Duration,
        windowStatus: AdministratorCommissioning.CommissioningWindowStatus,
    ) {
        if (this.internal.commissioningWindowTimeout !== undefined) {
            // Should never happen, but let's make sure
            throw new InternalError("Commissioning window already initialized.");
        }
        const actor = hasRemoteActor(this.context) ? this.context.session.via : "local actor";
        logger.debug(`Commissioning window timer started for ${commissioningTimeout} seconds for ${actor}.`);
        this.internal.commissioningWindowTimeout = Time.getTimer(
            "Commissioning timeout",
            commissioningTimeout,
            this.callback(this.#commissioningTimeout),
        ).start();

        assertRemoteActor(this.context);

        const adminFabric = this.context.session.associatedFabric;

        this.state.windowStatus = windowStatus;
        this.state.adminFabricIndex = adminFabric.fabricIndex;
        this.state.adminVendorId = adminFabric.rootVendorId;

        const removeCallback = this.callback(this.#fabricRemovedCallback);

        this.internal.stopMonitoringFabricForRemoval = () => {
            adminFabric.deleting.off(removeCallback);
        };

        this.context.session.associatedFabric.deleting.on(removeCallback);
    }

    /**
     * This method validates if a commissioning window can be opened and throws various exceptions in case of failures.
     */
    #assertCommissioningWindowRequirements(commissioningTimeout: Duration, commissioner: DeviceCommissioner) {
        if (this.internal.commissioningWindowTimeout !== undefined) {
            throw new AdministratorCommissioning.BusyError("A commissioning window is already opened");
        }

        if (commissioningTimeout > this.internal.maximumCommissioningTimeout) {
            throw new StatusResponseError(
                `Commissioning timeout must not exceed ${this.internal.maximumCommissioningTimeout} seconds.`,
                Status.InvalidCommand,
            );
        }

        if (commissioningTimeout < this.internal.minimumCommissioningTimeout) {
            throw new StatusResponseError(
                `Commissioning timeout must not be lower then ${this.internal.minimumCommissioningTimeout} seconds.`,
                Status.InvalidCommand,
            );
        }

        if (commissioner.isFailsafeArmed) {
            throw new AdministratorCommissioning.BusyError("Failsafe timer armed, assume commissioning in progress.");
        }
    }

    /**
     * This method is used internally when the commissioning window timer expires or the commissioning was completed.
     */
    #endCommissioning() {
        logger.debug("Ending commissioning");
        if (this.internal.commissioningWindowTimeout !== undefined) {
            this.internal.commissioningWindowTimeout.stop();
            this.internal.commissioningWindowTimeout = undefined;
        }

        this.internal.stopMonitoringFabricForRemoval?.();
        this.state.adminFabricIndex = null;

        this.state.windowStatus = AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen;
        this.state.adminFabricIndex = null;
        this.state.adminVendorId = null;
    }

    /**
     * Closes the commissioning window per the matter specification.
     */
    async #closeCommissioningWindow() {
        using _closing = this.lifetime.join("closing commissioning window");
        await this.env.get(DeviceCommissioner).endCommissioning();
    }

    /**
     * Close commissioning window on timeout when there's nobody to await the resulting promise
     * */
    #commissioningTimeout() {
        this.env.runtime.add(
            Worker({
                name: "closing commissioning window",
                done: this.#closeCommissioningWindow(),
            }),
        );
    }

    /**
     * Invoked when fabric is removed.
     */
    #fabricRemovedCallback() {
        this.state.adminFabricIndex = null;
        this.internal.stopMonitoringFabricForRemoval?.();
    }

    /**
     * Clean up resources and stop the timer when the behavior is destroyed.
     */
    override [Symbol.asyncDispose]() {
        if (this.internal.commissioningWindowTimeout !== undefined) {
            this.internal.commissioningWindowTimeout.stop();
            this.internal.commissioningWindowTimeout = undefined;
        }
    }
}

export namespace AdministratorCommissioningServer {
    export class Internal {
        commissioningWindowTimeout?: Timer;
        stopMonitoringFabricForRemoval?: () => void;

        /**
         * Mandated by spec; should only be modified in testing.
         */
        minimumCommissioningTimeout = MINIMUM_COMMISSIONING_TIMEOUT;

        /**
         * Commissioning beyond the standard 15-minute window is "extended commissioning" and has limitations on
         * advertisement.  We default to the standard window.
         */
        maximumCommissioningTimeout = STANDARD_COMMISSIONING_TIMEOUT;
    }

    export class State extends AdministratorCommissioningBehavior.State {
        // Spec doesn't declare a default here so set manually
        override windowStatus = AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen;
    }
}
