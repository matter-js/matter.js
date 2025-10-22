/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningMode } from "#advertisement/CommissioningMode.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { AdministratorCommissioning } from "#clusters/administrator-commissioning";
import { FailsafeContext } from "#common/FailsafeContext.js";
import { FabricManager } from "#fabric/FabricManager.js";
import {
    Environment,
    Environmental,
    InternalError,
    Lifecycle,
    Logger,
    MatterFlowError,
    MaybePromise,
    ObserverGroup,
    Time,
    Timer,
} from "#general";
import { SecureChannelProtocol } from "#securechannel/SecureChannelProtocol.js";
import { PaseServer } from "#session/pase/PaseServer.js";
import { SessionManager } from "#session/SessionManager.js";
import { CommissioningOptions, STANDARD_COMMISSIONING_TIMEOUT, StatusCode, StatusResponseError } from "#types";
import type { ControllerCommissioner } from "../peer/ControllerCommissioner.js";
import { DeviceAdvertiser } from "./DeviceAdvertiser.js";

const logger = Logger.get("DeviceCommissioner");

/**
 * The component allows commissioning configuration to change after the {@link DeviceCommissioner} is initialized.
 */
export abstract class CommissioningConfigProvider {
    abstract values: CommissioningOptions.Configuration;
}

/**
 * Interfaces the {@link DeviceCommissioner} with other components.
 */
export interface DeviceCommissionerContext {
    fabrics: FabricManager;
    sessions: SessionManager;
    advertiser: DeviceAdvertiser;
    secureChannelProtocol: SecureChannelProtocol;
    commissioningConfig: CommissioningConfigProvider;
}

/**
 * Implements commissioning for devices.
 *
 * Note this implements commissioning for a *local* device; use {@link ControllerCommissioner} to commission a *remote*
 * device.
 */
export class DeviceCommissioner {
    #context: DeviceCommissionerContext;
    #failsafeContext?: FailsafeContext;
    #windowStatus = AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen;
    #activeDiscriminator?: number;
    #activeCommissioningEndCallback?: () => MaybePromise;
    #observers = new ObserverGroup(this);
    #commissioningTimeout?: Timer;

    constructor(context: DeviceCommissionerContext) {
        this.#context = context;

        // Cancel commissioning when there are too many PASE errors
        this.#observers.on(this.#context.secureChannelProtocol.tooManyPaseErrors, async () => {
            logger.info("Maximum number of PASE pairing errors reached, canceling commissioning");
            await this.endCommissioning();
        });
    }

    static [Environmental.create](env: Environment) {
        const instance = new DeviceCommissioner({
            fabrics: env.get(FabricManager),
            sessions: env.get(SessionManager),
            advertiser: env.get(DeviceAdvertiser),
            secureChannelProtocol: env.get(SecureChannelProtocol),
            commissioningConfig: env.get(CommissioningConfigProvider),
        });
        env.set(DeviceCommissioner, instance);
        return instance;
    }

    get failsafeContext() {
        this.assertFailsafeArmed();
        return this.#failsafeContext!;
    }

    async allowEnhancedCommissioning(
        discriminator: number,
        paseServer: PaseServer,
        commissioningEndCallback: () => MaybePromise,
    ) {
        if (this.#windowStatus === AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen) {
            throw new MatterFlowError(
                "Basic commissioning window is already open! Cannot set enhanced commissioning mode.",
            );
        }

        this.#context.secureChannelProtocol.setPaseCommissioner(paseServer);
        this.#becomeCommissionable(
            AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen,
            commissioningEndCallback,
            discriminator,
        );
    }

    async allowBasicCommissioning(commissioningEndCallback?: () => MaybePromise) {
        if (this.#windowStatus === AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen) {
            throw new MatterFlowError(
                "Enhanced commissioning window is already open! Cannot set basic commissioning mode.",
            );
        }

        this.#context.secureChannelProtocol.setPaseCommissioner(
            await PaseServer.fromPin(this.#context.sessions, this.#context.commissioningConfig.values.passcode, {
                iterations: 1000,
                salt: this.#context.fabrics.crypto.randomBytes(32),
            }),
        );

        this.#becomeCommissionable(
            AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen,
            commissioningEndCallback,
        );
    }

    beginTimed(failsafeContext: FailsafeContext) {
        this.#failsafeContext = failsafeContext;

        failsafeContext.commissioned.on(async () => await this.endCommissioning());

        failsafeContext.construction.change.on(status => {
            if (status === Lifecycle.Status.Destroyed) {
                this.#failsafeContext = undefined;
            }
        });
    }

    get isFailsafeArmed() {
        return this.#failsafeContext !== undefined;
    }

    assertFailsafeArmed(message?: string) {
        if (this.isFailsafeArmed) return;
        throw new StatusResponseError(
            message ?? "Failsafe timer needs to be armed to execute this action.",
            StatusCode.FailsafeRequired,
        );
    }

    #enterCommissioningMode(
        windowStatus: AdministratorCommissioning.CommissioningWindowStatus,
        discriminator?: number,
    ) {
        this.#cancelTimeout();

        this.#windowStatus = windowStatus;
        const commissioningConfig = this.#context.commissioningConfig.values;
        const advertisementWindowS = commissioningConfig.advertisementWindow ?? STANDARD_COMMISSIONING_TIMEOUT;

        const mode =
            windowStatus === AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen
                ? CommissioningMode.Enhanced
                : CommissioningMode.Basic;

        this.#context.advertiser.enterCommissioningMode(
            ServiceDescription.Commissionable({
                ...commissioningConfig.productDescription,
                mode,
                discriminator: discriminator ?? commissioningConfig.discriminator,
            }),
        );

        this.#commissioningTimeout = Time.getTimer(
            "Commissioning timeout",
            advertisementWindowS,
            this.endCommissioning.bind(this),
        );
    }

    #becomeCommissionable(
        windowStatus:
            | AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen
            | AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen,
        activeCommissioningEndCallback?: () => MaybePromise,
        discriminator?: number,
    ) {
        if (this.#windowStatus !== AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen) {
            if (this.#windowStatus !== windowStatus) {
                throw new InternalError(
                    `Commissioning mode ${windowStatus} request but already in mode ${this.#windowStatus}`,
                );
            }

            if (
                this.#activeCommissioningEndCallback &&
                this.#activeCommissioningEndCallback !== activeCommissioningEndCallback
            ) {
                throw new InternalError(`Already in commissioning mode with a different callback`);
            }
        }

        if (
            this.#windowStatus === windowStatus &&
            (discriminator === undefined || discriminator === this.#activeDiscriminator)
        ) {
            this.#enterCommissioningMode(this.#windowStatus, this.#activeDiscriminator);
            return;
        }

        if (this.#windowStatus !== AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen) {
            throw new InternalError(`Commissioning window already open with different mode (${this.#windowStatus})!`);
        }

        if (this.#activeCommissioningEndCallback !== undefined) {
            throw new InternalError("Commissioning window already open with different callback!");
        }

        this.#activeCommissioningEndCallback = activeCommissioningEndCallback;
        this.#activeDiscriminator = discriminator;

        // MDNS is sent in parallel
        this.#enterCommissioningMode(windowStatus, discriminator);
    }

    async endCommissioning() {
        if (this.#windowStatus === AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen) {
            return;
        }

        this.#cancelTimeout();

        await this.#context.secureChannelProtocol.removePaseCommissioner();

        this.#windowStatus = AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen;

        if (this.#activeCommissioningEndCallback !== undefined) {
            const activeCommissioningEndCallback = this.#activeCommissioningEndCallback;
            this.#activeCommissioningEndCallback = undefined;
            await activeCommissioningEndCallback();
        }

        await this.#context.advertiser.exitCommissioningMode();

        logger.debug("No longer commissioning");
    }

    async close() {
        this.#cancelTimeout();
        this.#observers.close();
        await this.endCommissioning();
        if (this.#failsafeContext) {
            await this.#failsafeContext.close();
            this.#failsafeContext = undefined;
        }
    }

    #cancelTimeout() {
        if (!this.#commissioningTimeout) {
            return;
        }

        this.#commissioningTimeout.stop();
        this.#commissioningTimeout = undefined;
    }
}
