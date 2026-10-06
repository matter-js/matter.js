/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningMode } from "#advertisement/CommissioningMode.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { FailsafeContext } from "#common/FailsafeContext.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SecureChannelProtocol } from "#securechannel/SecureChannelProtocol.js";
import { PaseServer } from "#session/pase/PaseServer.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    CRYPTO_PBKDF_ITERATIONS_MIN,
    Duration,
    Environment,
    Environmental,
    Lifecycle,
    Logger,
    MatterFlowError,
    MaybePromise,
    Mutex,
    ObserverGroup,
    Time,
    Timer,
} from "@matter/general";
import {
    CommissioningOptions,
    MAXIMUM_COMMISSIONING_TIMEOUT,
    STANDARD_COMMISSIONING_TIMEOUT,
    Status,
    StatusResponseError,
} from "@matter/types";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
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
    #window?: CommissioningWindow;
    #pendingAdministratorOpens = 0;
    #isClosed = false;
    #observers = new ObserverGroup(this);

    /** Serializes every change of {@link #window}. */
    #windowMutex = new Mutex(this);

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

    /**
     * Open an Enhanced Commissioning Window.
     *
     * With {@link DeviceCommissioner.WindowOptions.byAdministrator} it replaces a window the node opened itself.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.19.8.1
     */
    async allowEnhancedCommissioning(
        discriminator: number,
        paseServer: PaseServer,
        options: DeviceCommissioner.WindowOptions = {},
    ) {
        await this.#open(
            AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen,
            options,
            () => paseServer,
            discriminator,
        );
    }

    /**
     * Open a Basic Commissioning Window with the node's own passcode.
     *
     * With {@link DeviceCommissioner.WindowOptions.byAdministrator} it replaces a window the node opened itself.
     * Without, it restarts a basic window the node opened itself.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.19.8.2
     */
    async allowBasicCommissioning(options: DeviceCommissioner.WindowOptions = {}) {
        await this.#open(AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen, options, () =>
            PaseServer.fromPin(this.#context.sessions, this.#context.commissioningConfig.values.passcode, {
                iterations: CRYPTO_PBKDF_ITERATIONS_MIN,
                salt: this.#context.fabrics.crypto.randomBytes(32),
            }),
        );
    }

    /**
     * The status of the commissioning window, whoever opened it.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.19.7.1
     */
    get windowStatus() {
        return this.#window?.status ?? AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen;
    }

    /**
     * Whether an Administrator's window is open or waiting to open, as opposed to a window the node opened itself.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.19.8.1
     */
    get isAdministratorWindowOpen() {
        return this.#pendingAdministratorOpens > 0 || !!this.#window?.byAdministrator;
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
            Status.FailsafeRequired,
        );
    }

    async #open(
        status: CommissioningWindow["status"],
        options: DeviceCommissioner.WindowOptions,
        paseServer: () => MaybePromise<PaseServer>,
        discriminator?: number,
    ) {
        const { byAdministrator = false } = options;
        this.#assertNotClosed(status);
        if (byAdministrator) {
            this.#pendingAdministratorOpens++;
        }

        let replaced: CommissioningWindow | undefined;
        try {
            await this.#windowMutex.produce(async () => {
                this.#assertNotClosed(status);

                const current = this.#window;
                if (current !== undefined) {
                    if (current.byAdministrator || (!byAdministrator && current.status !== status)) {
                        const { CommissioningWindowStatus } = AdministratorCommissioning;
                        throw new MatterFlowError(
                            `Cannot open ${CommissioningWindowStatus[status]} while ${CommissioningWindowStatus[current.status]} opened by ${current.byAdministrator ? "an administrator" : "the node"} is in place`,
                        );
                    }
                    if (byAdministrator) {
                        logger.info("Administrator replaces the commissioning window the node opened itself");
                        replaced = await this.#closeWindow(current);
                    } else {
                        await this.#context.secureChannelProtocol.removePaseCommissioner();
                    }
                }

                const server = await paseServer();
                this.#assertNotClosed(status);

                this.#context.secureChannelProtocol.setPaseCommissioner(server);
                this.#openWindow(status, options, discriminator);
            });
        } finally {
            if (byAdministrator) {
                this.#pendingAdministratorOpens--;
            }
            await replaced?.onClose?.();
        }
    }

    #assertNotClosed(status: CommissioningWindow["status"]) {
        if (this.#isClosed) {
            throw new MatterFlowError(
                `Cannot open ${AdministratorCommissioning.CommissioningWindowStatus[status]} because the commissioner closed`,
            );
        }
    }

    #openWindow(
        status: CommissioningWindow["status"],
        { timeout, byAdministrator = false, onClose }: DeviceCommissioner.WindowOptions,
        discriminator?: number,
    ) {
        // A window the node restarts is replaced without closing it
        this.#window?.timer.stop();

        const commissioningConfig = this.#context.commissioningConfig.values;
        this.#context.advertiser.enterCommissioningMode(
            ServiceDescription.Commissionable({
                ...commissioningConfig.productDescription,
                mode:
                    status === AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen
                        ? CommissioningMode.Enhanced
                        : CommissioningMode.Basic,
                discriminator: discriminator ?? commissioningConfig.discriminator,
            }),
        );

        const window: CommissioningWindow = {
            status,
            byAdministrator,
            onClose,
            timer: Time.getTimer("Commissioning timeout", timeout ?? this.#ownWindowTimeout, () =>
                this.#close(() => window).catch(error => logger.error("Error closing the commissioning window", error)),
            ),
        };
        this.#window = window;
        window.timer.start();
    }

    /**
     * Closes the window {@link select} returns once the window mutex is free, then invokes its close callback.
     *
     * The callback runs outside the mutex so it may open or close a window itself.
     */
    async #close(select: () => CommissioningWindow | undefined) {
        const closed = await this.#windowMutex.produce(() => this.#closeWindow(select()));
        await closed?.onClose?.();
    }

    /**
     * Closes {@link window} if it is still the open window.  Must run in the window mutex.
     *
     * @returns the closed window, whose close callback the caller invokes once outside the mutex
     */
    async #closeWindow(window: CommissioningWindow | undefined) {
        if (window === undefined || this.#window !== window) {
            return;
        }

        this.#window = undefined;
        window.timer.stop();

        try {
            await this.#context.secureChannelProtocol.removePaseCommissioner();
        } finally {
            await this.#context.advertiser.exitCommissioningMode();
        }

        logger.debug("No longer commissioning");
        return window;
    }

    /**
     * How long a window the node opens itself stays open.
     *
     * An uncommissioned node may announce for up to 48 hours with Extended Announcement, a commissioned node for the
     * standard 15 minutes.
     *
     * @see {@link MatterSpecification.v161.Core} § 5.4.2.3
     */
    get #ownWindowTimeout() {
        if (this.#context.fabrics.length) {
            return STANDARD_COMMISSIONING_TIMEOUT;
        }
        return this.#context.commissioningConfig.values.advertisementWindow ?? MAXIMUM_COMMISSIONING_TIMEOUT;
    }

    /**
     * Close the open commissioning window, whoever opened it.
     */
    async endCommissioning() {
        if (this.#isClosed) {
            return;
        }
        await this.#close(() => this.#window);
    }

    async close() {
        if (this.#isClosed) {
            return;
        }
        this.#isClosed = true;
        this.#observers.close();
        try {
            await this.#close(() => this.#window);
        } finally {
            await this.#windowMutex.close();
            if (this.#failsafeContext) {
                await this.#failsafeContext.close();
                this.#failsafeContext = undefined;
            }
        }
    }
}

interface CommissioningWindow {
    status:
        | AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen
        | AdministratorCommissioning.CommissioningWindowStatus.BasicWindowOpen;
    byAdministrator: boolean;
    onClose?: () => MaybePromise;
    timer: Timer;
}

export namespace DeviceCommissioner {
    /**
     * Options for opening a commissioning window.
     */
    export interface WindowOptions {
        /**
         * How long the window stays open.  Defaults to the duration of a window the node opens itself.
         */
        timeout?: Duration;

        /**
         * Set when an Administrator opens the window by command.  Such a window replaces a window the node opened
         * itself, and while it is open or waiting to open the Administrator Commissioning cluster answers further opens
         * with Busy.
         */
        byAdministrator?: boolean;

        /**
         * Invoked once the window closes, whatever closes it.  It may open or close a window itself.  A window the node
         * restarts takes the options of the restart instead.
         */
        onClose?: () => MaybePromise;
    }
}
