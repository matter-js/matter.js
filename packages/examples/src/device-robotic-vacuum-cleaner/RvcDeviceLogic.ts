/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Behavior, Hours, Logger, Millis, Minutes, Node, Seconds, Time, Timer } from "@matter/main";
import { ServiceAreaServer } from "@matter/main/behaviors/service-area";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";
import { CustomRvcCleanModeServer } from "./behaviors/CustomRvcCleanModeServer.js";
import { CustomRvcOperationalStateServer } from "./behaviors/CustomRvcOperationalStateServer.js";
import { CustomRvcRunModeServer } from "./behaviors/CustomRvcRunModeServer.js";

const logger = Logger.get("RvcDeviceLogic");

/** Define the effective run modes for our robotic vacuum cleaner */
export enum RvcDeviceRunModes {
    /** Do nothing, wait for user action. */
    Idle = 0,

    /** Cleans every 3h for 3 cycles of 10 minutes with 3 minutes recharging in between. */
    AutoCleaning = 1,

    /** Cleans once for 10 minutes, recharge afterward, then switch to Idle. */
    QuickCleaning = 2,

    /** Does one mapping round of 10 minutes and recharges afterward, then switch to AutoCleaning mode. */
    Mapping = 3,
}

export enum RvcDeviceCleanMode {
    Vacuuming = 0,
    Mopping = 1,
}

export enum CleaningAreas {
    Kitchen = 0,
    LivingRoom = 1,
    Bedroom = 2,
    Bathroom = 3,
}

/**
 * Defines the desired operational states of the device.
 */
enum DesiredOperationalDeviceState {
    Idle = 0,
    Paused = 1,
    Working = 2,
}

enum DetailOperationalDeviceState {
    SeekingCharger = 0,
    Docked = 1,
    Charging = 2,
    Cleaning = 3,
    Mapping = 4,
}

// We simulate cleaning rounds of 10 minutes
const CLEANING_MAPPING_ROUND_TIME = Minutes(10);

/**
 * This class implements the Logic of our fictional robotic vacuum cleaner device and should demonstrate how the
 * different clusters work together and how their data depend on each other.
 * It is added as a custom Behavior to the device and can so easily access the other behaviors and clusters.
 */
export class RvcDeviceLogic extends Behavior {
    static override readonly id = "rvcDeviceLogic";
    static override readonly early = true;

    declare internal: RvcDeviceLogic.Internal;

    override async initialize() {
        // Delay setting up all the listeners to make sure we have a clean state
        this.reactTo((this.endpoint as Node).lifecycle.partsReady, this.#initializeNode);

        // Timers to simulate a device state machine
        this.internal.cleaningTimer = Time.getTimer("CleaningTimer", CLEANING_MAPPING_ROUND_TIME, () =>
            this.#handleCleaningDone(),
        );
        this.internal.mappingTimer = Time.getTimer("MappingTimer", CLEANING_MAPPING_ROUND_TIME, () =>
            this.#handleMappingDone(),
        );
        this.internal.rechargingTimer = Time.getTimer("RechargingTimer", Minutes(2), () => this.#handleRechargeDone());
        this.internal.autoWaitTimer = Time.getTimer("AutoWaitTimer", Hours(3), () => this.#handleAutoWaitDone());
        this.internal.seekingChargerTimer = Time.getTimer("SeekingChargerTimer", Seconds(30), () =>
            this.#handleDocking(),
        );
    }

    async #initializeNode() {
        // React to actions from the controller when changing the run mode or triggering a pause, resume or go home commands.
        // `this.agent.load()` ensures that the behavior is initialized and ready to use.
        const runMode = await this.agent.load(CustomRvcRunModeServer);
        this.reactTo(runMode.events.currentMode$Changed, this.#handleRvcModeChange, {
            offline: true,
        });

        // React to command calls from the controller when changing the operational state.
        const operationalState = await this.agent.load(CustomRvcOperationalStateServer);
        this.reactTo(operationalState.events.pauseTriggered, this.#handlePause);
        this.reactTo(operationalState.events.resumeTriggered, this.#handleResume);
        this.reactTo(operationalState.events.goHomeTriggered, this.#handleGoHome);

        // React to the service area changes from the controller.
        const serviceArea = await this.agent.load(ServiceAreaServer);
        this.reactTo(serviceArea.events.selectedAreas$Changed, this.#selectedAreasChange);
    }

    /**
     * When the run mode is changed, start the relevant timers based on the mode and clean mode
     */
    async #handleRvcModeChange(newMode: RvcDeviceRunModes, oldMode: RvcDeviceRunModes) {
        logger.info(`RVC mode changed from ${RvcDeviceRunModes[oldMode]} to ${RvcDeviceRunModes[newMode]}`);
        this.internal.runMode = newMode;
        switch (newMode) {
            case RvcDeviceRunModes.Idle:
                await this.#returnToIdleMode();
                break;
            case RvcDeviceRunModes.AutoCleaning:
            case RvcDeviceRunModes.QuickCleaning:
                await this.#startCleaningMode(newMode);
                break;
            case RvcDeviceRunModes.Mapping:
                await this.#startMappingMode();
        }
    }

    /**
     * Returns the device to idle mode by switching the desired operational state to idle.
     * This means that also after recharging nothing happens.
     * This stops all timers and sets the device to seeking charger mode if it is cleaning or mapping.
     */
    async #returnToIdleMode() {
        this.internal.autoWaitTimer.stop();
        this.internal.mappingTimer.stop();
        this.internal.cleaningTimer.stop();
        await this.endpoint.setStateOf(ServiceAreaServer, {
            currentArea: null,
        });
        this.internal.cleaningRoundsLeft = 0;
        this.internal.desiredOperationalState = DesiredOperationalDeviceState.Idle;
        if (
            this.internal.detailOperationalState === DetailOperationalDeviceState.Cleaning ||
            this.internal.detailOperationalState === DetailOperationalDeviceState.Mapping
        ) {
            logger.info(
                `Switching to Idle mode. Cancelling ${DetailOperationalDeviceState[this.internal.detailOperationalState]} and returning to dock now ...`,
            );
            this.internal.detailOperationalState = DetailOperationalDeviceState.SeekingCharger;
            await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
                operationalState: RvcOperationalState.OperationalState.SeekingCharger,
            });
            this.internal.seekingChargerTimer.start();
        } else {
            logger.info("Switch to Idle mode");
        }
    }

    /**
     * Starts the cleaning mode.
     * If the device is not docked, it will wait until it is docked to start cleaning.
     * If the cleaning ist started in AutoCleaning mode, it will do three rounds of cleaning, in QuickCleaning mode
     * just one round. If action was paused it will continue with the planned rounds.
     */
    async #startCleaningMode(mode: RvcDeviceRunModes) {
        this.internal.desiredOperationalState = DesiredOperationalDeviceState.Working;
        if (
            this.internal.detailOperationalState === DetailOperationalDeviceState.Docked ||
            this.internal.detailOperationalState === DetailOperationalDeviceState.Cleaning ||
            this.internal.detailOperationalState === DetailOperationalDeviceState.Mapping
        ) {
            this.internal.detailOperationalState = DetailOperationalDeviceState.Cleaning;
            await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
                operationalState: RvcOperationalState.OperationalState.Running,
            });
            if (this.internal.cleaningRoundsLeft === 0) {
                this.internal.cleaningRoundsLeft = mode === RvcDeviceRunModes.AutoCleaning ? 3 : 1;
            }
            this.internal.cleaningTimer.start();
            await this.#startServiceAreaChange();
            const cleanMode = this.endpoint.stateOf(CustomRvcCleanModeServer).currentMode;
            logger.info(
                `Starting ${RvcDeviceCleanMode[cleanMode]} ${RvcDeviceRunModes[mode]} (${this.internal.cleaningRoundsLeft} round(s)) ...`,
            );
        } else {
            logger.info(
                `Delayed start of cleaning with mode ${RvcDeviceRunModes[mode]} until docked (currently ${DetailOperationalDeviceState[this.internal.detailOperationalState]})`,
            );
        }
    }

    /**
     * Starts the mapping mode.
     * If the device is not docked, it will wait until it is docked to start mapping.
     */
    async #startMappingMode() {
        this.internal.desiredOperationalState = DesiredOperationalDeviceState.Working;
        if (this.internal.detailOperationalState === DetailOperationalDeviceState.Docked) {
            this.internal.detailOperationalState = DetailOperationalDeviceState.Mapping;
            await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
                operationalState: RvcOperationalState.OperationalState.Running,
            });
            this.internal.mappingTimer.start();
            await this.#startServiceAreaChange();
            logger.info(`Starting mapping ...`);
        } else {
            logger.info(
                `Delayed start of mapping until docked (currently ${DetailOperationalDeviceState[this.internal.detailOperationalState]})`,
            );
        }
    }

    /** Handles a Pause command and pauses the current action, but remembers the current mode. */
    async #handlePause() {
        if (this.internal.desiredOperationalState === DesiredOperationalDeviceState.Working) {
            const cleanMode = this.endpoint.stateOf(CustomRvcCleanModeServer).currentMode;
            logger.info(
                `Pausing current action ${RvcDeviceCleanMode[cleanMode]} ${RvcDeviceRunModes[this.internal.runMode]}...`,
            );
            this.internal.desiredOperationalState = DesiredOperationalDeviceState.Paused;
            await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
                operationalState: RvcOperationalState.OperationalState.Paused,
            });
            this.internal.mappingTimer.stop();
            this.internal.cleaningTimer.stop();
        }
    }

    /** Handles a Resume command and resumes the current action in the previous mode. */
    async #handleResume() {
        if (this.internal.desiredOperationalState === DesiredOperationalDeviceState.Paused) {
            const cleanMode = this.endpoint.stateOf(CustomRvcCleanModeServer).currentMode;
            logger.info(
                `Resuming current action ${RvcDeviceCleanMode[cleanMode]} ${RvcDeviceRunModes[this.internal.runMode]}...`,
            );
            this.internal.desiredOperationalState = DesiredOperationalDeviceState.Working;
            await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
                operationalState: RvcOperationalState.OperationalState.Running,
            });
            switch (this.internal.runMode) {
                case RvcDeviceRunModes.AutoCleaning:
                case RvcDeviceRunModes.QuickCleaning:
                    await this.#startCleaningMode(this.internal.runMode);
                    break;
                case RvcDeviceRunModes.Mapping:
                    await this.#startMappingMode();
                    break;
            }
        }
    }

    /** Handles a GoHome command and returns the device to the dock and cancels all activities. */
    async #handleGoHome() {
        if (this.internal.desiredOperationalState !== DesiredOperationalDeviceState.Idle) {
            this.internal.cleaningRoundsLeft = 0;
            this.internal.desiredOperationalState = DesiredOperationalDeviceState.Idle;
            if (
                this.internal.detailOperationalState === DetailOperationalDeviceState.Cleaning ||
                this.internal.detailOperationalState === DetailOperationalDeviceState.Mapping
            ) {
                this.internal.cleaningTimer.stop();
                this.internal.mappingTimer.stop();
                await this.endpoint.setStateOf(ServiceAreaServer, {
                    currentArea: null,
                });
                const cleanMode = this.endpoint.stateOf(CustomRvcCleanModeServer).currentMode;
                logger.info(
                    `Returning to dock from ${RvcDeviceCleanMode[cleanMode]} ${DetailOperationalDeviceState[this.internal.detailOperationalState]} ...`,
                );
                await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.SeekingCharger,
                });
                this.internal.seekingChargerTimer.start();
            }
        }
    }

    /** Handles the end of one cleaning round and sends the device back to the charging station. */
    async #handleCleaningDone() {
        this.internal.cleaningRoundsLeft--;
        logger.info(
            `Cleaning run done. ${this.internal.cleaningRoundsLeft} rounds left. Returning to dock for recharge...`,
        );
        await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
            operationalState: RvcOperationalState.OperationalState.SeekingCharger,
        });
        this.internal.seekingChargerTimer.start();
    }

    /** Handles the end of one mapping round and sends the device back to the charging station. */
    async #handleMappingDone() {
        logger.info(
            `Mapping run done. ${this.internal.cleaningRoundsLeft} rounds left. Returning to dock for recharge...`,
        );
        await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
            operationalState: RvcOperationalState.OperationalState.SeekingCharger,
        });
        this.internal.seekingChargerTimer.start();
    }

    /** handles the return of the device to the charger and starts the charging cycle. */
    async #handleDocking() {
        logger.info(
            `Docked successfully. Recharging now ... ${this.internal.cleaningRoundsLeft} cleaning rounds left.`,
        );
        this.internal.detailOperationalState = DetailOperationalDeviceState.Charging;
        await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
            operationalState: RvcOperationalState.OperationalState.Charging,
        });
        this.internal.rechargingTimer.start();
        if (this.internal.cleaningRoundsLeft === 0) {
            logger.info("Current actions done, switch to Idle Mode ...");
            this.internal.desiredOperationalState = DesiredOperationalDeviceState.Idle;
            await this.endpoint.setStateOf(CustomRvcRunModeServer, {
                currentMode: RvcDeviceRunModes.Idle,
            });
            this.endpoint
                .eventsOf(CustomRvcOperationalStateServer)
                .operationCompletion.emit(
                    { completionErrorCode: RvcOperationalState.ErrorState.NoError },
                    this.context,
                );
        }
    }

    /** Handles the end of the recharging cycle and starts the next cleaning round or goes to idle mode. */
    async #handleRechargeDone() {
        if (this.internal.desiredOperationalState === DesiredOperationalDeviceState.Working) {
            if (this.internal.cleaningRoundsLeft > 0) {
                const cleanMode = this.endpoint.stateOf(CustomRvcCleanModeServer).currentMode;
                logger.info(
                    `Recharging done. Executing next ${RvcDeviceCleanMode[cleanMode]} ${DetailOperationalDeviceState[this.internal.detailOperationalState]} round ...`,
                );
                await this.#startCleaningMode(this.internal.runMode);
                return;
            } else if (this.internal.runMode === RvcDeviceRunModes.AutoCleaning) {
                this.internal.autoWaitTimer.start();
                logger.info(`Recharging done. Waiting for next cleaning round in Auto mode ...`);
            } else {
                logger.info(`Recharging done. Switching to Idle mode ...`);
                this.internal.desiredOperationalState = DesiredOperationalDeviceState.Idle;
                await this.endpoint.setStateOf(CustomRvcRunModeServer, {
                    currentMode: RvcDeviceRunModes.Idle,
                });
            }
        } else {
            logger.info(`Recharging done. Switching to Idle mode ...`);
        }
        this.internal.detailOperationalState = DetailOperationalDeviceState.Docked;
        await this.endpoint.setStateOf(CustomRvcOperationalStateServer, {
            operationalState: RvcOperationalState.OperationalState.Docked,
        });
    }

    /** Handles passing the time of the Auto Clean waiting time and starts a new cleaning round. */
    async #handleAutoWaitDone() {
        logger.info(`Auto wait done. Starting next cleaning round ...`);
        await this.#startCleaningMode(this.internal.runMode);
    }

    /** Logs changed elected areas. */
    #selectedAreasChange(newAreas: number[]) {
        logger.info(
            "Selected areas changed to",
            newAreas.map(area => CleaningAreas[area]),
        );
    }

    /** Initialize the service area change timer to change the current area while cleaning or mapping. */
    async #startServiceAreaChange() {
        this.internal.serviceAreaChangeTimer?.stop();

        const selectedAreas = this.endpoint.stateOf(ServiceAreaServer).selectedAreas;
        const numberOfAreas = selectedAreas.length || this.endpoint.stateOf(ServiceAreaServer).supportedAreas.length;

        this.internal.serviceAreaChangeTimer = Time.getPeriodicTimer(
            "ServiceAreaChangeTimer",
            Millis(CLEANING_MAPPING_ROUND_TIME / numberOfAreas + Seconds(1)), // Two Areas by default
            () => this.#changeCurrentServiceArea(),
        ).start();
        await this.#changeCurrentServiceArea();
    }

    /**
     * During Cleaning otr Mapping we simulate that we also work through the selected areas, so we need to change the
     * current area.
     */
    async #changeCurrentServiceArea() {
        const serviceAreaState = this.endpoint.stateOf(ServiceAreaServer);
        const selectedAreas = serviceAreaState.selectedAreas.length
            ? serviceAreaState.selectedAreas
            : serviceAreaState.supportedAreas;
        const currentArea = serviceAreaState.currentArea ?? 0;
        const nextArea = (currentArea + 1) % selectedAreas.length;
        await this.endpoint.setStateOf(ServiceAreaServer, {
            currentArea: nextArea,
        });
        logger.info(`Changed service area to ${CleaningAreas[nextArea]}`);
    }

    /** When the Endpoint is closed stop all timer. */
    override async [Symbol.asyncDispose]() {
        this.internal.cleaningTimer.stop();
        this.internal.mappingTimer.stop();
        this.internal.rechargingTimer.stop();
        this.internal.autoWaitTimer.stop();
        this.internal.seekingChargerTimer.stop();
        this.internal.serviceAreaChangeTimer?.stop();

        await super[Symbol.asyncDispose]?.();
    }
}

/** Internal state of the RvcDeviceLogic behavior to store all the timers and such. */
export namespace RvcDeviceLogic {
    export class Internal {
        desiredOperationalState: DesiredOperationalDeviceState = DesiredOperationalDeviceState.Idle;
        detailOperationalState: DetailOperationalDeviceState = DetailOperationalDeviceState.Docked;
        runMode: RvcDeviceRunModes = RvcDeviceRunModes.Idle;
        cleaningTimer!: Timer;
        mappingTimer!: Timer;
        serviceAreaChangeTimer!: Timer;
        rechargingTimer!: Timer;
        autoWaitTimer!: Timer;
        seekingChargerTimer!: Timer;
        cleaningRoundsLeft: number = 0;
    }
}
