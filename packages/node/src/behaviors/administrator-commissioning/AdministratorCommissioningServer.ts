/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { CRYPTO_PBKDF_ITERATIONS_MAX, CRYPTO_PBKDF_ITERATIONS_MIN, Duration, Logger, Seconds } from "@matter/general";
import {
    assertRemoteActor,
    DeviceCommissioner,
    Fabric,
    FailsafeContext,
    PaseServer,
    SessionManager,
} from "@matter/protocol";
import {
    MINIMUM_COMMISSIONING_TIMEOUT,
    PAKE_PASSCODE_VERIFIER_LENGTH,
    STANDARD_COMMISSIONING_TIMEOUT,
    Status,
    StatusResponseError,
} from "@matter/types";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
import { AdministratorCommissioningBehavior } from "./AdministratorCommissioningBehavior.js";

/**
 * Extend the AdministratorCommissioning model to relax constraints on OpenCommissioningWindow fields.  This prevents
 * the interaction layer from rejecting with ConstraintError so the behavior can validate and return PakeParameterError.
 */
const openCommissioningWindow = AdministratorCommissioning.schema.commands.require("OpenCommissioningWindow");

const AdministratorCommissioningSchema = AdministratorCommissioning.schema.extend(
    undefined,
    openCommissioningWindow.extend(
        undefined,
        openCommissioningWindow.fields.extend("PakePasscodeVerifier", { constraint: "none" }),
        openCommissioningWindow.fields.extend("Iterations", { constraint: "none" }),
        openCommissioningWindow.fields.extend("Salt", { constraint: "none" }),
    ),
);

const AdministratorCommissioningBase = AdministratorCommissioningBehavior.for(
    AdministratorCommissioning,
    AdministratorCommissioningSchema,
);

const logger = Logger.get("AdministratorCommissioningServer");

/**
 * This is the default server implementation of AdministratorCommissioningBehavior.
 *
 * This implementation includes all features of AdministratorCommissioning.Cluster. You should use
 * AdministratorCommissioningServer.with to specialize the class for the features your implementation supports.
 */
export class AdministratorCommissioningServer extends AdministratorCommissioningBase {
    declare internal: AdministratorCommissioningServer.Internal;
    declare readonly state: AdministratorCommissioningServer.State;

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
        if (iterations < CRYPTO_PBKDF_ITERATIONS_MIN || iterations > CRYPTO_PBKDF_ITERATIONS_MAX) {
            throw new AdministratorCommissioning.PakeParameterError("PAKE iterations invalid");
        }
        if (salt.byteLength < 16 || salt.byteLength > 32) {
            throw new AdministratorCommissioning.PakeParameterError("PAKE salt has invalid length.");
        }

        const commissioner = this.env.get(DeviceCommissioner);
        const timeout = Seconds(commissioningTimeout);
        this.#assertCommissioningWindowRequirements(timeout, commissioner);
        const adminFabric = this.#adminFabric();

        await commissioner.allowEnhancedCommissioning(
            discriminator,
            PaseServer.fromVerificationValue(this.env.get(SessionManager), pakePasscodeVerifier, {
                iterations,
                salt,
            }),
            this.#windowOptions(timeout),
        );

        this.#windowOpened(
            timeout,
            AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen,
            adminFabric,
        );
    }

    /** This method opens a Basic Commissioning Window. The default passcode is used. */
    async openBasicCommissioningWindow({
        commissioningTimeout,
    }: AdministratorCommissioning.OpenBasicCommissioningWindowRequest) {
        const commissioner = this.env.get(DeviceCommissioner);
        const timeout = Seconds(commissioningTimeout);
        this.#assertCommissioningWindowRequirements(timeout, commissioner);
        const adminFabric = this.#adminFabric();

        await commissioner.allowBasicCommissioning(this.#windowOptions(timeout));

        this.#windowOpened(timeout, AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen, adminFabric);
    }

    /**
     * This method is used to revoke a commissioning window.
     *
     * Spec 1.5.1 requires Step 1 cleanup to run regardless of window state before checking the window.
     */
    override async revokeCommissioning() {
        logger.debug("Revoking commissioning window");

        // Step 1: Regardless of window state — terminate PASE sessions and expire PASE-held fail-safe
        const paseSession = this.env.get(SessionManager).getPaseSession();
        if (paseSession) {
            await paseSession.initiateClose();
        }

        if (this.env.has(FailsafeContext)) {
            const failsafeContext = this.env.get(FailsafeContext);
            if (failsafeContext) {
                await failsafeContext.close((this.context as RemoteActorContext).exchange);
            }
        }

        // Step 2: If no window was open, return error.  A window the node opened itself counts as open.
        if (
            this.env.get(DeviceCommissioner).windowStatus ===
            AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen
        ) {
            throw new AdministratorCommissioning.WindowNotOpenError(
                "No commissioning window is opened that could be revoked.",
            );
        }

        // Step 3: Close the commissioning window
        await this.#closeCommissioningWindow();
    }

    #adminFabric() {
        assertRemoteActor(this.context);
        return this.context.session.associatedFabric;
    }

    #windowOptions(timeout: Duration): DeviceCommissioner.WindowOptions {
        return {
            timeout,
            byAdministrator: true,
            onClose: (this.internal.onWindowClosed ??= this.callback(this.#windowClosed)),
        };
    }

    /**
     * Reflects a window this cluster opened in its attributes.
     */
    #windowOpened(
        timeout: Duration,
        windowStatus: AdministratorCommissioning.CommissioningWindowStatus,
        adminFabric: Fabric,
    ) {
        logger.debug(
            `Commissioning window opened for ${Duration.format(timeout)} by fabric ${adminFabric.fabricIndex}`,
        );

        this.state.windowStatus = windowStatus;
        this.state.adminFabricIndex = adminFabric.fabricIndex;
        this.state.adminVendorId = adminFabric.rootVendorId;

        const onAdminFabricDeleting = (this.internal.onAdminFabricDeleting ??= this.callback(
            this.#fabricRemovedCallback,
        ));
        this.internal.stopMonitoringFabricForRemoval = () => {
            adminFabric.deleting.off(onAdminFabricDeleting);
        };
        adminFabric.deleting.on(onAdminFabricDeleting);
    }

    /**
     * This method validates if a commissioning window can be opened and throws various exceptions in case of failures.
     */
    #assertCommissioningWindowRequirements(commissioningTimeout: Duration, commissioner: DeviceCommissioner) {
        if (commissioner.isAdministratorWindowOpen) {
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
     * Resets the attributes once a window this cluster opened closes, whatever closed it.
     */
    #windowClosed() {
        logger.debug("Commissioning window closed");
        this.internal.stopMonitoringFabricForRemoval?.();
        this.internal.stopMonitoringFabricForRemoval = undefined;

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
     * Invoked when fabric is removed.
     */
    #fabricRemovedCallback() {
        this.state.adminFabricIndex = null;
        this.internal.stopMonitoringFabricForRemoval?.();
        this.internal.stopMonitoringFabricForRemoval = undefined;
    }
}

export namespace AdministratorCommissioningServer {
    export class Internal {
        stopMonitoringFabricForRemoval?: () => void;
        onWindowClosed?: () => void;
        onAdminFabricDeleting?: () => void;

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

    export class State extends AdministratorCommissioningBase.State {
        // Spec doesn't declare a default here so set manually
        override windowStatus = AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen;
    }
}
