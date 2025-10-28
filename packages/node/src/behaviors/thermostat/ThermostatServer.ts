/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { OccupancySensingServer } from "#behaviors/occupancy-sensing";
import { TemperatureMeasurementServer } from "#behaviors/temperature-measurement";
import { OccupancySensing } from "#clusters/occupancy-sensing";
import { Thermostat } from "#clusters/thermostat";
import { Endpoint } from "#endpoint/Endpoint.js";
import {
    Bytes,
    cropValueRange,
    Crypto,
    deepCopy,
    ImplementationError,
    InternalError,
    Logger,
    Observable,
} from "#general";
import { FieldElement } from "#model";
import { hasLocalActor, Val } from "#protocol";
import { ClusterType, StatusResponse, TypeFromPartialBitSchema } from "#types";
import { AtomicWriteHandler } from "./AtomicWriteHandler.js";
import { ThermostatBehavior } from "./ThermostatBehavior.js";

const logger = Logger.get("ThermostatServer");

// Enable some features we need for implementation, they will be reset at the end again
const ThermostatBehaviorLogicBase = ThermostatBehavior.with(
    Thermostat.Feature.Heating,
    Thermostat.Feature.Cooling,
    Thermostat.Feature.Occupancy,
    Thermostat.Feature.AutoMode,
    Thermostat.Feature.Presets,
    Thermostat.Feature.Setback,
);

// Enhance Schema to define conformance for some of the additional state attributes
const schema = ThermostatBehaviorLogicBase.schema!.extend({
    children: [
        FieldElement({
            name: "PersistedPresets",
            type: "list",
            conformance: "[PRES]",
            quality: "N",
            children: [FieldElement({ name: "entry", type: "PresetStruct" })],
        }),
    ],
});

/**
 * This is the default server implementation of {@link ThermostatBehavior}.
 *
 * The Matter specification requires the Thermostat cluster to support features we do not enable by default. You should
 * use {@link ThermostatServer.with} to specialize the class for the features your implementation supports.
 * We implement all features beside the following:
 * * MatterScheduleConfiguration: This feature is provisional.
 * * ScheduleConfiguration: This feature is deprecated and not allowed to be enabled.
 * * The use of the "setpointHoldExpiryTimestamp" attribute is currently not supported.
 *
 * This implementation mainly provides all validation and base logic required by the Matter specification.
 * It implements some thermostat logic, partially beyond Matter specification definition, notably:
 * * Adjust the setpoints when a preset is activated
 * If this behavior is not desired, you can override the setActivePresetRequest method but should call
 * handleSetActivePresetRequest() to ensure compliance with the specification.
 *
 * The implementation also adds enhanced system mode logic that can be enabled by setting the state field
 * useAutomaticModeManagement to true. When enabled, the thermostat will:
 * * Adjust the thermostat running mode when in Auto system mode and the Setback feature is also supported
 * * Determine the system mode and/or running mode based on temperature changes
 *
 * For local temperature or occupancy values we check if there is a local cluster available on the same endpoint and use
 * them, alternatively raw measurements can be set in the states externalMeasuredIndoorTemperature and
 * externallyMeasuredOccupancy. The OutdoorTemperature can be set directly on the attribute if supported.
 * The RemoteSensing attribute need to be set correctly as needed by the developer to identify the measurement source.
 *
 * The following custom events are provided:
 * * calibratedTemperature$Changed: Emitted when the measured local temperature changes including any calibration applied. This event is mainly useful when the localTemperatureNotExposed feature is used.
 *
 * Important note: To access the current local temperature (including all calibrations applied) please use
 * this.internal.localTemperature because the localTemperature attribute in state might be null depending on the
 * configured features.
 *
 * TODO: Currently the general purpose "atomic write" Matter feature is only implemented in this specific cluster because
 *  only used here so far. Also see information in AtomicWriteHandler.ts.
 */
export class ThermostatBaseServer extends ThermostatBehaviorLogicBase {
    declare protected internal: ThermostatBaseServer.Internal;
    declare state: ThermostatBaseServer.State;
    declare events: ThermostatBaseServer.Events;
    static override readonly schema = schema;

    override async initialize() {
        if (this.features.scheduleConfiguration) {
            throw new ImplementationError("ScheduleConfiguration features is deprecated and not allowed to be enabled");
        }
        if (this.features.matterScheduleConfiguration) {
            logger.warn("MatterScheduleConfiguration feature is not yet implemented. Please do not activate it");
        }

        // Initialize persisted presets from defaults if not already set
        const options = this.endpoint.behaviors.optionsFor(ThermostatBaseServer) as
            | {
                  presets: Thermostat.Preset[] | undefined;
              }
            | undefined;
        if (this.features.presets && this.state.persistedPresets === undefined) {
            this.state.persistedPresets = options?.presets ?? [];
        }

        // Add this check because we currently do not have a max in Schema and might have old invalid max values
        if (this.state.minSetpointDeadBand > 127) {
            this.state.minSetpointDeadBand = 20;
        }
        if (this.state.minSetpointDeadBand < 0 || this.state.minSetpointDeadBand > 127) {
            throw new ImplementationError("minSetpointDeadBand is out of valid range 0..127");
        }

        // Initialize all the validation and logic handling
        this.#setupValidations();
        this.#setupTemperatureMeasurementIntegration();
        this.#setupOccupancyIntegration();
        this.#setupModeHandling();
        this.#setupThermostatLogic();
        this.#setupSetback();
        this.#setupPresets();

        // We store these values internally because we need to restore them after any write try
        this.internal.minSetpointDeadBand = this.state.minSetpointDeadBand;
        this.internal.controlSequenceOfOperation = this.state.controlSequenceOfOperation;
    }

    /**
     * The default implementation of the SetpointRaiseLower command. It handles all validation and setpoint adjustments
     * required by the Matter specification. This method only changes the Occupied setpoints.
     */
    override setpointRaiseLower({ mode, amount }: Thermostat.SetpointRaiseLowerRequest) {
        if (mode === Thermostat.SetpointRaiseLowerMode.Heat && !this.features.heating) {
            throw new StatusResponse.InvalidCommandError(
                "Heating feature is not supported but Heat mode was requested",
            );
        }
        if (mode === Thermostat.SetpointRaiseLowerMode.Cool && !this.features.cooling) {
            throw new StatusResponse.InvalidCommandError(
                "Cooling feature is not supported but Cool mode was requested",
            );
        }

        amount *= 10; // Convert to same base as the setpoints

        // We only care about Occupied setpoints as by SDK implementation
        if (mode === Thermostat.SetpointRaiseLowerMode.Both) {
            if (this.features.heating && this.features.cooling) {
                let desiredCoolingSetpoint = this.state.occupiedCoolingSetpoint + amount;
                const coolLimit = desiredCoolingSetpoint - this.#clampSetpointToLimits("Cool", desiredCoolingSetpoint);
                let desiredHeatingSetpoint = this.state.occupiedHeatingSetpoint + amount;
                const heatLimit = desiredHeatingSetpoint - this.#clampSetpointToLimits("Heat", desiredHeatingSetpoint);
                if (coolLimit !== 0 || heatLimit !== 0) {
                    if (Math.abs(coolLimit) <= Math.abs(heatLimit)) {
                        // We are limited by the Heating Limit
                        desiredHeatingSetpoint = desiredHeatingSetpoint - heatLimit;
                        desiredCoolingSetpoint = desiredCoolingSetpoint - heatLimit;
                    } else {
                        // We are limited by Cooling Limit
                        desiredHeatingSetpoint = desiredHeatingSetpoint - coolLimit;
                        desiredCoolingSetpoint = desiredCoolingSetpoint - coolLimit;
                    }
                }
                this.state.occupiedCoolingSetpoint = desiredCoolingSetpoint;
                this.state.occupiedHeatingSetpoint = desiredHeatingSetpoint;
            } else if (this.features.cooling) {
                this.state.occupiedCoolingSetpoint = this.#clampSetpointToLimits(
                    "Cool",
                    this.state.occupiedCoolingSetpoint + amount,
                );
            } else {
                this.state.occupiedHeatingSetpoint = this.#clampSetpointToLimits(
                    "Heat",
                    this.state.occupiedHeatingSetpoint + amount,
                );
            }
            return;
        }

        if (mode === Thermostat.SetpointRaiseLowerMode.Cool) {
            const desiredCoolingSetpoint = this.#clampSetpointToLimits(
                "Cool",
                this.state.occupiedCoolingSetpoint + amount,
            );
            if (this.features.autoMode) {
                let heatingSetpoint = this.state.occupiedHeatingSetpoint;
                if (desiredCoolingSetpoint - heatingSetpoint < this.setpointDeadBand) {
                    // We are limited by the Heating Setpoint
                    heatingSetpoint = desiredCoolingSetpoint - this.setpointDeadBand;
                    if (heatingSetpoint === this.#clampSetpointToLimits("Heat", heatingSetpoint)) {
                        // Desired cooling setpoint is enforceable
                        // Set the new cooling and heating setpoints
                        this.state.occupiedHeatingSetpoint = heatingSetpoint;
                    } else {
                        throw new StatusResponse.InvalidCommandError(
                            "Could Not adjust heating setpoint to maintain dead band!",
                        );
                    }
                }
            }
            this.state.occupiedCoolingSetpoint = desiredCoolingSetpoint;
            return;
        }

        if (mode === Thermostat.SetpointRaiseLowerMode.Heat) {
            const desiredHeatingSetpoint = this.#clampSetpointToLimits(
                "Heat",
                this.state.occupiedHeatingSetpoint + amount,
            );
            if (this.features.autoMode) {
                let coolingSetpoint = this.state.occupiedCoolingSetpoint;
                if (coolingSetpoint - desiredHeatingSetpoint < this.setpointDeadBand) {
                    // We are limited by the Cooling Setpoint
                    coolingSetpoint = desiredHeatingSetpoint + this.setpointDeadBand;
                    if (coolingSetpoint === this.#clampSetpointToLimits("Cool", coolingSetpoint)) {
                        // Desired cooling setpoint is enforceable
                        // Set the new cooling and heating setpoints
                        this.state.occupiedCoolingSetpoint = coolingSetpoint;
                    } else {
                        throw new StatusResponse.InvalidCommandError(
                            "Could Not adjust cooling setpoint to maintain dead band!",
                        );
                    }
                }
            }
            this.state.occupiedHeatingSetpoint = desiredHeatingSetpoint;
            return;
        }

        throw new StatusResponse.InvalidCommandError(`Unsupported SetpointRaiseLowerMode ${mode}`);
    }

    /**
     * Performs basic validation and sets the active preset handle when valid.
     * This fulfills the basic requirements of the SetActivePresetRequest matter command. Use this method if you need
     * to override setActivePresetRequest to ensure compliance.
     */
    protected handleSetActivePresetRequest({ presetHandle }: Thermostat.SetActivePresetRequest) {
        let preset: Thermostat.Preset | undefined = undefined;
        if (presetHandle !== null) {
            preset = this.state.persistedPresets?.find(
                p => p.presetHandle !== null && Bytes.areEqual(p.presetHandle, presetHandle),
            );
            if (preset === undefined) {
                throw new StatusResponse.InvalidCommandError("Requested PresetHandle not found");
            }
        }
        logger.info(`Setting active preset handle to`, presetHandle);
        this.state.activePresetHandle = presetHandle;

        return preset;
    }

    /**
     * This default implementation of the SetActivePresetRequest command handler sets the active preset and
     * (additionally to specification requirements!) adjusts the occupied setpoints to the preset values if defined.
     *
     * If you do not want this behavior, you can override this method but should call handleSetActivePresetRequest to
     * ensure compliance with the specification.
     */
    override setActivePresetRequest({ presetHandle }: Thermostat.SetActivePresetRequest) {
        const preset = this.handleSetActivePresetRequest({ presetHandle });

        if (preset !== undefined) {
            const { heatingSetpoint, coolingSetpoint } = preset;
            if (this.features.heating && heatingSetpoint !== null && heatingSetpoint !== undefined) {
                this.state.occupiedHeatingSetpoint = this.#clampSetpointToLimits("Heat", heatingSetpoint);
            }
            if (this.features.cooling && coolingSetpoint !== null && coolingSetpoint !== undefined) {
                this.state.occupiedCoolingSetpoint = this.#clampSetpointToLimits("Cool", coolingSetpoint);
            }
        }
    }

    /** Determines if the given context is from a command */
    #isCommandContext(context: ActionContext) {
        return "command" in context && context.command;
    }

    /**
     * Whether the thermostat is currently considered occupied
     * Uses the occupancy state if the feature is supported, otherwise always true
     */
    protected get occupied() {
        return this.features.occupancy ? (this.state.occupancy?.occupied ?? true) : true;
    }

    /** The current heating setpoint depending on occupancy */
    protected get heatingSetpoint() {
        if (this.occupied) {
            return this.state.occupiedHeatingSetpoint;
        }
        return this.state.unoccupiedHeatingSetpoint;
    }

    /** The current cooling setpoint depending on occupancy */
    protected get coolingSetpoint() {
        if (this.occupied) {
            return this.state.occupiedCoolingSetpoint;
        }
        return this.state.unoccupiedCoolingSetpoint;
    }

    /** Setup basic Thermostat state and logic */
    #setupThermostatLogic() {
        if (this.state.temperatureSetpointHold !== undefined) {
            // When we support temperature setpoint hold, ensure related states are initialized
            if (this.state.temperatureSetpointHoldDuration === undefined) {
                this.state.temperatureSetpointHoldDuration = null;
            }

            // TODO Add support for correct Time handling, leave disabled for now
            if (this.state.setpointHoldExpiryTimestamp === undefined) {
                //this.state.setpointHoldExpiryTimestamp = null;
            } else {
                logger.warn(
                    "Handling for setpointHoldExpiryTimestamp is not yet implemented. To use this attribute you need to install the needed logic yourself",
                );
            }
            //this.maybeReactTo(this.events.temperatureSetpointHold$Changed, this.#handleTemperatureSetpointHoldChange);
        }
    }

    // TODO Add when we adjusted the epoch-s handling to be correct
    /*#handleTemperatureSetpointHoldChange(newValue: Thermostat.TemperatureSetpointHold) {
        if (newValue === Thermostat.TemperatureSetpointHold.SetpointHoldOn) {
            if (
                this.state.temperatureSetpointHoldDuration !== null &&
                this.state.temperatureSetpointHoldDuration! > 0
            ) {
                // TODO: convert to use of Seconds and such and real UTC time
                //  Also requires adjustment in encoding/decoding of the attribute
                const nowUtc = Time.nowMs - 946_684_800_000; // Still not really UTC, but ok for now
                this.state.setpointHoldExpiryTimestamp = Math.floor(
                    nowUtc / 1000 + this.state.temperatureSetpointHoldDuration! * 60,
                );
            }
        } else {
            this.state.setpointHoldExpiryTimestamp = null;
        }
    }*/

    #setupSetback() {
        if (!this.features.setback) {
            return;
        }

        if (this.state.useAutomaticModeManagement && this.state.thermostatRunningMode !== undefined) {
            this.reactTo(this.events.calibratedTemperature$Changed, this.#handleTemperatureChangeForSetback);
            this.#handleTemperatureChangeForSetback(this.internal.localTemperature); // And initialize once
        }
        this.reactTo(this.events.occupiedSetback$Changing, this.#handleOccupiedSetbackChanging);
        if (this.features.occupancy) {
            this.reactTo(this.events.unoccupiedSetback$Changing, this.#handleUnoccupiedSetbackChanging);
        }
    }

    #handleOccupiedSetbackChanging(value: number | null) {
        this.state.occupiedSetback = this.#cropSetbackChange(value, "occupied");
    }

    #handleUnoccupiedSetbackChanging(value: number | null) {
        this.state.unoccupiedSetback = this.#cropSetbackChange(value, "unoccupied");
    }

    /**
     * Handle temperature changes to adjust the system mode when the Setback feature is supported.
     * This is a very basic implementation which only switches back to Cool and Heat modes based on need when in
     * non-Auto mode.
     * This logic is disabled by default and will be enabled by setting useAutomaticModeManagement to true.
     */
    #handleTemperatureChangeForSetback(newValue: number | null): void {
        if (this.state.systemMode === Thermostat.SystemMode.Auto) {
            // Setback only makes sense when in a fixed mode
            return;
        }
        const setBackValue = this.occupied ? this.state.occupiedSetback : this.state.unoccupiedSetback;
        if (newValue === null || setBackValue === null || setBackValue === 0) {
            return;
        }
        const coolingSetPoint = this.coolingSetpoint;
        const heatingSetPoint = this.heatingSetpoint;

        if (newValue > coolingSetPoint + setBackValue && this.coolingAllowed) {
            this.adjustRunningMode(Thermostat.ThermostatRunningMode.Cool);
        } else if (newValue < heatingSetPoint - setBackValue && this.heatingAllowed) {
            this.adjustRunningMode(Thermostat.ThermostatRunningMode.Heat);
        }
    }

    /** Whether heating is allowed in the current ControlSequenceOfOperation and features */
    protected get heatingAllowed() {
        return (
            this.features.heating &&
            ![
                Thermostat.ControlSequenceOfOperation.CoolingOnly,
                Thermostat.ControlSequenceOfOperation.CoolingAndHeatingWithReheat,
            ].includes(this.internal.controlSequenceOfOperation)
        );
    }

    /** Whether cooling is allowed in the current ControlSequenceOfOperation and features */
    protected get coolingAllowed() {
        return (
            this.features.cooling &&
            ![
                Thermostat.ControlSequenceOfOperation.HeatingOnly,
                Thermostat.ControlSequenceOfOperation.HeatingWithReheat,
            ].includes(this.internal.controlSequenceOfOperation)
        );
    }

    /**
     * Adjust the running mode of the thermostat based on the new system mode when the thermostatRunningMode is supported
     */
    protected adjustRunningMode(newState: Thermostat.ThermostatRunningMode) {
        if (this.state.thermostatRunningMode === undefined) {
            return;
        }
        switch (newState) {
            case Thermostat.ThermostatRunningMode.Heat:
                if (!this.heatingAllowed) {
                    throw new ImplementationError("Heating is not allowed in the current ControlSequenceOfOperation");
                }
                break;
            case Thermostat.ThermostatRunningMode.Cool:
                if (!this.coolingAllowed) {
                    throw new ImplementationError("Cooling is not allowed in the current ControlSequenceOfOperation");
                }
                break;
        }
        this.state.thermostatRunningMode = newState;
    }

    /** Crop the setback change to the allowed min/max range */
    #cropSetbackChange(newValue: number | null, state: "occupied" | "unoccupied") {
        if (newValue === null) {
            return null;
        }
        return cropValueRange(
            newValue,
            this.state[`${state}SetbackMin`] ?? -1270,
            this.state[`${state}SetbackMax`] ?? 1270,
        );
    }

    /**
     * Setup integration with TemperatureMeasurement cluster or external temperature state and intialize internal
     * localTemperature state.
     */
    #setupTemperatureMeasurementIntegration() {
        const preferRemoteTemperature = !!this.state.remoteSensing?.localTemperature;
        if (this.features.localTemperatureNotExposed) {
            if (preferRemoteTemperature) {
                throw new ImplementationError(
                    "RemoteSensing cannot be set to LocalTemperature when LocalTemperatureNotExposed feature is enabled",
                );
            }
            logger.debug("LocalTemperatureNotExposed feature is enabled, ignoring local temperature measurement");
            this.state.localTemperature = null;
        }

        let localTemperature = null;
        if (!preferRemoteTemperature && this.agent.has(TemperatureMeasurementServer)) {
            logger.debug(
                "Using existing TemperatureMeasurement cluster on same endpoint for local temperature measurement",
            );
            if (this.state.externalMeasuredIndoorTemperature !== undefined) {
                logger.warn(
                    "Both local TemperatureMeasurement cluster and externalMeasuredIndoorTemperature state are set, using local cluster",
                );
            }
            this.reactTo(
                this.agent.get(TemperatureMeasurementServer).events.measuredValue$Changed,
                this.#handleMeasuredTemperatureChange,
            );
            localTemperature = this.endpoint.stateOf(TemperatureMeasurementServer).measuredValue;
        } else {
            if (this.state.externalMeasuredIndoorTemperature === undefined) {
                logger.warn(
                    "No local TemperatureMeasurement cluster available and externalMeasuredIndoorTemperature state not set. Setting localTemperature to null",
                );
            } else {
                logger.info("Using measured temperature via externalMeasuredIndoorTemperature state");
                localTemperature = this.state.externalMeasuredIndoorTemperature ?? null;
            }
            this.reactTo(this.events.externalMeasuredIndoorTemperature$Changed, this.#handleMeasuredTemperatureChange);
        }
        this.#handleMeasuredTemperatureChange(localTemperature); // and initialize
    }

    /**
     * Handles changes to the measured temperature, applies calibration and update internal and official state.
     */
    #handleMeasuredTemperatureChange(temperature: number | null) {
        if (temperature !== null && this.state.localTemperatureCalibration !== undefined) {
            temperature += this.state.localTemperatureCalibration * 10;
        }

        // When localTemperatureNotExposed feature is enabled, we do not update the attribute because it needs to stay null
        if (!this.features.localTemperatureNotExposed) {
            this.state.localTemperature = temperature;
        }

        // When the temperature changes, we always update the internal localTemperature and emit event
        const oldTemperature = this.internal.localTemperature;
        if (temperature !== null && oldTemperature !== temperature) {
            this.internal.localTemperature = temperature;
            this.events.calibratedTemperature$Changed.emit(temperature, oldTemperature, this.context);
        }
    }

    /**
     * Setup integration with OccupancySensing cluster or external occupancy state and initialize internal occupancy
     * state.
     */
    #setupOccupancyIntegration() {
        if (!this.features.occupancy) {
            return;
        }
        let currentOccupancy: boolean;
        const preferRemoteOccupancy = !!this.state.remoteSensing?.occupancy;
        if (!preferRemoteOccupancy && this.agent.has(OccupancySensingServer)) {
            logger.debug("Using existing OccupancySensing cluster on same endpoint for local occupancy sensing");
            if (this.state.externallyMeasuredOccupancy !== undefined) {
                logger.warn(
                    "Both local OccupancySensing cluster and externallyMeasuredOccupancy state are set, using local cluster",
                );
            }
            this.reactTo(this.agent.get(OccupancySensingServer).events.occupancy$Changed, this.#handleOccupancyChange);
            currentOccupancy = !!this.endpoint.stateOf(OccupancySensingServer).occupancy.occupied;
        } else {
            if (this.state.externallyMeasuredOccupancy === undefined) {
                currentOccupancy = true;
                logger.warn(
                    "No local OccupancySensing cluster available and externallyMeasuredOccupancy state not set",
                );
            } else {
                logger.info("Using occupancy via externallyMeasuredOccupancy state");
                currentOccupancy = this.state.externallyMeasuredOccupancy;
            }
            this.reactTo(this.events.externallyMeasuredOccupancy$Changed, this.#handleExternalOccupancyChange);
        }
        this.#handleExternalOccupancyChange(currentOccupancy); // and initialize
    }

    #handleExternalOccupancyChange(newValue: boolean) {
        this.state.occupancy = { occupied: newValue };
    }

    #handleOccupancyChange(newValue: TypeFromPartialBitSchema<typeof OccupancySensing.Occupancy>) {
        this.state.occupancy = newValue;
    }

    /** Setup all validations for the Thermostat behavior */
    #setupValidations() {
        // Validate existing values to match the constraints at initialization
        this.#assertUserSetpointLimits("HeatSetpointLimit");
        this.#assertUserSetpointLimits("CoolSetpointLimit");
        this.#clampSetpointToLimits("Heat", this.state.occupiedHeatingSetpoint);
        this.#clampSetpointToLimits("Heat", this.state.unoccupiedHeatingSetpoint);
        this.#clampSetpointToLimits("Cool", this.state.occupiedCoolingSetpoint);
        this.#clampSetpointToLimits("Cool", this.state.unoccupiedCoolingSetpoint);

        // Setup reactions for validations on changes
        this.maybeReactTo(this.events.absMinHeatSetpointLimit$Changing, this.#assertAbsMinHeatSetpointLimitChanging);
        this.maybeReactTo(this.events.minHeatSetpointLimit$Changing, this.#assertMinHeatSetpointLimitChanging);
        this.maybeReactTo(this.events.maxHeatSetpointLimit$Changing, this.#assertMaxHeatSetpointLimitChanging);
        this.maybeReactTo(this.events.absMaxHeatSetpointLimit$Changing, this.#assertAbsMaxHeatSetpointLimitChanging);
        this.maybeReactTo(this.events.absMinCoolSetpointLimit$Changing, this.#assertAbsMinCoolSetpointLimitChanging);
        this.maybeReactTo(this.events.minCoolSetpointLimit$Changing, this.#assertMinCoolSetpointLimitChanging);
        this.maybeReactTo(this.events.maxCoolSetpointLimit$Changing, this.#assertMaxCoolSetpointLimitChanging);
        this.maybeReactTo(this.events.absMaxCoolSetpointLimit$Changing, this.#assertAbsMaxCoolSetpointLimitChanging);
        this.maybeReactTo(this.events.occupiedHeatingSetpoint$Changing, this.#assertOccupiedHeatingSetpointChanging);
        this.maybeReactTo(
            this.events.unoccupiedHeatingSetpoint$Changing,
            this.#assertUnoccupiedHeatingSetpointChanging,
        );
        this.maybeReactTo(this.events.occupiedCoolingSetpoint$Changing, this.#assertOccupiedCoolingSetpointChanging);
        this.maybeReactTo(
            this.events.unoccupiedCoolingSetpoint$Changing,
            this.#assertUnoccupiedCoolingSetpointChanging,
        );
        this.maybeReactTo(this.events.remoteSensing$Changing, this.#assertRemoteSensingChanging);

        // For backwards compatibility, this attributes is optionally writeable. However, any
        // writes to this attribute SHALL be silently ignored. So we just revert any changes.
        this.maybeReactTo(this.events.minSetpointDeadBand$Changing, this.#ensureMinSetpointDeadBandNotWritable);
        this.reactTo(
            this.events.controlSequenceOfOperation$Changing,
            this.#ensureControlSequenceOfOperationNotWritable,
        );

        this.reactTo(this.events.systemMode$Changing, this.#assertSystemModeChanging);
        this.maybeReactTo(this.events.thermostatRunningMode$Changing, this.#assertThermostatRunningModeChanging);
    }

    #assertThermostatRunningModeChanging(newRunningMode: Thermostat.ThermostatRunningMode) {
        const forbiddenRunningModes = new Array<Thermostat.ThermostatRunningMode>();
        // We use the internal value here to ensure not a temporarily invalid state during writes
        switch (this.internal.controlSequenceOfOperation) {
            case Thermostat.ControlSequenceOfOperation.CoolingOnly:
            case Thermostat.ControlSequenceOfOperation.CoolingAndHeatingWithReheat:
                forbiddenRunningModes.push(Thermostat.ThermostatRunningMode.Heat);
                break;
            case Thermostat.ControlSequenceOfOperation.HeatingOnly:
            case Thermostat.ControlSequenceOfOperation.HeatingWithReheat:
                forbiddenRunningModes.push(Thermostat.ThermostatRunningMode.Cool);
                break;
        }
        if (forbiddenRunningModes.includes(newRunningMode)) {
            throw new StatusResponse.ConstraintErrorError(
                `ThermostatRunningMode ${Thermostat.ThermostatRunningMode[newRunningMode]} is not allowed with ControlSequenceOfOperation ${
                    Thermostat.ControlSequenceOfOperation[this.internal.controlSequenceOfOperation]
                }`,
            );
        }
    }

    #assertSystemModeChanging(newMode: Thermostat.SystemMode) {
        const forbiddenModes = new Array<Thermostat.SystemMode>();
        switch (this.internal.controlSequenceOfOperation) {
            case Thermostat.ControlSequenceOfOperation.CoolingOnly:
            case Thermostat.ControlSequenceOfOperation.CoolingAndHeatingWithReheat:
                forbiddenModes.push(Thermostat.SystemMode.Heat, Thermostat.SystemMode.EmergencyHeat);
                break;
            case Thermostat.ControlSequenceOfOperation.HeatingOnly:
            case Thermostat.ControlSequenceOfOperation.HeatingWithReheat:
                forbiddenModes.push(Thermostat.SystemMode.Cool, Thermostat.SystemMode.Precooling);
                break;
        }
        if (forbiddenModes.includes(newMode)) {
            throw new StatusResponse.ConstraintErrorError(
                `SystemMode ${Thermostat.SystemMode[newMode]} is not allowed with ControlSequenceOfOperation ${
                    Thermostat.ControlSequenceOfOperation[this.internal.controlSequenceOfOperation]
                }`,
            );
        }
    }

    /** Attribute is not writable, revert any changes */
    #ensureControlSequenceOfOperationNotWritable() {
        this.state.controlSequenceOfOperation = this.internal.controlSequenceOfOperation;
    }

    /** Attribute is not writable, revert any changes, but also ensure proper errors when write try was invalid */
    #ensureMinSetpointDeadBandNotWritable(value: number) {
        if (value < 0 || value > 127) {
            throw new StatusResponse.ConstraintErrorError("MinSetpointDeadBand is out of valid range 0..127");
        }
        this.state.minSetpointDeadBand = this.internal.minSetpointDeadBand;
    }

    #assertRemoteSensingChanging(remoteSensing: TypeFromPartialBitSchema<typeof Thermostat.RemoteSensing>) {
        if (this.features.localTemperatureNotExposed && remoteSensing.localTemperature) {
            throw new StatusResponse.ConstraintErrorError(
                "LocalTemperature is not exposed, so RemoteSensing cannot be set to LocalTemperature",
            );
        }
    }

    #assertUnoccupiedCoolingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        this.#assertSetpointWithinLimits("Cool", "Unoccupied", setpoint);
        this.#assertSetpointDeadband("Cooling", setpoint);
        // Only ensure Deadband and preset adjustment when the value is written directly (not changed via a command)
        if (!this.#isCommandContext(context)) {
            this.#ensureSetpointDeadband("Cooling", "unoccupied", setpoint);

            if (this.features.presets && this.state.activePresetHandle !== null && !this.occupied) {
                this.agent.asLocalActor(() => {
                    this.state.activePresetHandle = null;
                });
            }
        }
    }

    #assertUnoccupiedHeatingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        this.#assertSetpointWithinLimits("Heat", "Unoccupied", setpoint);
        this.#assertSetpointDeadband("Heating", setpoint);
        // Only ensure Deadband and preset adjustment when the value is written directly (not changed via a command)
        if (!this.#isCommandContext(context)) {
            this.#ensureSetpointDeadband("Heating", "unoccupied", setpoint);

            if (this.features.presets && this.state.activePresetHandle !== null && !this.occupied) {
                this.agent.asLocalActor(() => {
                    this.state.activePresetHandle = null;
                });
            }
        }
    }

    #assertAbsMaxCoolSetpointLimitChanging(absMax: number) {
        this.#assertUserSetpointLimits("CoolSetpointLimit", { absMax });
    }

    #assertMaxCoolSetpointLimitChanging(max: number) {
        this.#assertUserSetpointLimits("CoolSetpointLimit", { max });
        if (this.features.autoMode) {
            if (max < this.heatSetpointMaximum + this.setpointDeadBand) {
                throw new StatusResponse.ConstraintErrorError(
                    `maxCoolSetpointLimit (${max}) must be greater than or equal to maxHeatSetpointLimit (${this.heatSetpointMaximum}) plus minSetpointDeadBand (${this.setpointDeadBand})`,
                );
            }
        }
    }

    #assertMinCoolSetpointLimitChanging(min: number) {
        this.#assertUserSetpointLimits("CoolSetpointLimit", { min });
        if (this.features.autoMode) {
            if (min < this.heatSetpointMinimum + this.setpointDeadBand) {
                throw new StatusResponse.ConstraintErrorError(
                    `minCoolSetpointLimit (${min}) must be greater than or equal to minHeatSetpointLimit (${this.heatSetpointMinimum}) plus minSetpointDeadBand (${this.setpointDeadBand})`,
                );
            }
        }
    }

    #assertAbsMinCoolSetpointLimitChanging(absMin: number) {
        this.#assertUserSetpointLimits("CoolSetpointLimit", { absMin });
    }

    #assertAbsMaxHeatSetpointLimitChanging(absMax: number) {
        this.#assertUserSetpointLimits("HeatSetpointLimit", { absMax });
    }

    #assertMaxHeatSetpointLimitChanging(max: number) {
        this.#assertUserSetpointLimits("HeatSetpointLimit", { max });
        if (this.features.autoMode) {
            if (max > this.coolSetpointMaximum - this.setpointDeadBand) {
                throw new StatusResponse.ConstraintErrorError(
                    `maxHeatSetpointLimit (${max}) must be less than or equal to maxCoolSetpointLimit (${this.coolSetpointMaximum}) minus minSetpointDeadBand (${this.setpointDeadBand})`,
                );
            }
        }
    }

    #assertMinHeatSetpointLimitChanging(min: number) {
        this.#assertUserSetpointLimits("HeatSetpointLimit", { min });
        if (this.features.autoMode) {
            if (min > this.coolSetpointMinimum - this.setpointDeadBand) {
                throw new StatusResponse.ConstraintErrorError(
                    `minHeatSetpointLimit (${min}) must be less than or equal to minCoolSetpointLimit (${this.state.minCoolSetpointLimit}) minus minSetpointDeadBand (${this.setpointDeadBand})`,
                );
            }
        }
    }

    #assertAbsMinHeatSetpointLimitChanging(absMin: number) {
        this.#assertUserSetpointLimits("HeatSetpointLimit", { absMin });
    }

    #assertOccupiedCoolingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        this.#assertSetpointWithinLimits("Cool", "Occupied", setpoint);
        this.#assertSetpointDeadband("Cooling", setpoint);
        // Only ensure Deadband and preset adjustment when the value is written directly (not changed via a command)
        if (!this.#isCommandContext(context)) {
            this.#ensureSetpointDeadband("Cooling", "occupied", setpoint);

            if (this.features.presets && this.state.activePresetHandle !== null && this.occupied) {
                this.agent.asLocalActor(() => {
                    this.state.activePresetHandle = null;
                });
            }
        }
    }

    #assertOccupiedHeatingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        this.#assertSetpointWithinLimits("Heat", "Occupied", setpoint);
        this.#assertSetpointDeadband("Heating", setpoint);
        // Only ensure Deadband and preset adjustment when the value is written directly (not changed via a command)
        if (!this.#isCommandContext(context)) {
            this.#ensureSetpointDeadband("Heating", "occupied", setpoint);

            if (this.features.presets && this.state.activePresetHandle !== null && this.occupied) {
                this.agent.asLocalActor(() => {
                    this.state.activePresetHandle = null;
                });
            }
        }
    }

    /**
     * The current mode the thermostat is considered to be in based on local temperature and setpoints
     */
    protected get temperatureConsideration(): "belowTarget" | "onTarget" | "aboveTarget" | undefined {
        const localTemp = this.internal.localTemperature;
        if (localTemp === null) {
            return undefined;
        }
        const minSetPointDeadband = this.setpointDeadBand;
        const heatingSetpoint = this.heatingSetpoint;
        const coolingSetpoint = this.coolingSetpoint;
        switch (this.state.systemMode) {
            case Thermostat.SystemMode.Heat:
                if (localTemp < heatingSetpoint) {
                    return "belowTarget";
                }
                if (localTemp > coolingSetpoint) {
                    return "onTarget";
                }
                break;
            case Thermostat.SystemMode.Cool:
                if (localTemp < heatingSetpoint) {
                    return "onTarget";
                }
                if (localTemp > coolingSetpoint) {
                    return "aboveTarget";
                }
                break;
            case Thermostat.SystemMode.Auto:
                if (localTemp < heatingSetpoint - minSetPointDeadband) {
                    return "belowTarget";
                }
                if (localTemp > coolingSetpoint + minSetPointDeadband) {
                    return "aboveTarget";
                }
                break;
        }
        return "onTarget";
    }

    get #heatDefaults() {
        return {
            absMin: 700,
            absMax: 3000,
        };
    }

    get #coolDefaults() {
        return {
            absMin: 1600,
            absMax: 3200,
        };
    }

    /**
     * Used to validate generically that user configurable limits must be within device limits follow:
     * * AbsMinHeatSetpointLimit <= MinHeatSetpointLimit <= MaxHeatSetpointLimit <= AbsMaxHeatSetpointLimit
     * * AbsMinCoolSetpointLimit <= MinCoolSetpointLimit <= MaxCoolSetpointLimit <= AbsMaxCoolSetpointLimit
     * Values not provided are taken from the state
     */
    #assertUserSetpointLimits(
        scope: "HeatSetpointLimit" | "CoolSetpointLimit",
        details: { absMin?: number; min?: number; max?: number; absMax?: number } = {},
    ) {
        const defaults = scope === "HeatSetpointLimit" ? this.#heatDefaults : this.#coolDefaults;
        const {
            absMin = this.state[`absMin${scope}`] ?? defaults.absMin,
            min = this.state[`min${scope}`] ?? defaults.absMin,
            max = this.state[`max${scope}`] ?? defaults.absMax,
            absMax = this.state[`absMax${scope}`] ?? defaults.absMax,
        } = details;
        logger.debug(
            `Validating user setpoint limits for ${scope}: absMin=${absMin}, min=${min}, max=${max}, absMax=${absMax}`,
        );
        if (absMin > min) {
            throw new StatusResponse.ConstraintErrorError(
                `absMin${scope} (${absMin}) must be less than or equal to min${scope} (${min})`,
            );
        }
        if (min > max) {
            throw new StatusResponse.ConstraintErrorError(
                `min${scope} (${min}) must be less than or equal to max${scope} (${max})`,
            );
        }
        if (max > absMax) {
            throw new StatusResponse.ConstraintErrorError(
                `max${scope} (${max}) must be less than or equal to absMax${scope} (${absMax})`,
            );
        }
    }

    get heatSetpointMinimum() {
        const absMin = this.state.absMinHeatSetpointLimit ?? this.#heatDefaults.absMin;
        const min = this.state.minHeatSetpointLimit ?? this.#heatDefaults.absMin;
        return Math.max(min, absMin);
    }

    get heatSetpointMaximum() {
        const absMax = this.state.absMaxHeatSetpointLimit ?? this.#heatDefaults.absMax;
        const max = this.state.maxHeatSetpointLimit ?? this.#heatDefaults.absMax;
        return Math.min(max, absMax);
    }

    get coolSetpointMinimum() {
        const absMin = this.state.absMinCoolSetpointLimit ?? this.#coolDefaults.absMin;
        const min = this.state.minCoolSetpointLimit ?? this.#coolDefaults.absMin;
        return Math.max(min, absMin);
    }

    get coolSetpointMaximum() {
        const absMax = this.state.absMaxCoolSetpointLimit ?? this.#coolDefaults.absMax;
        const max = this.state.maxCoolSetpointLimit ?? this.#coolDefaults.absMax;
        return Math.min(max, absMax);
    }

    get setpointDeadBand() {
        return this.features.autoMode ? this.internal.minSetpointDeadBand * 10 : 0;
    }

    #clampSetpointToLimits(scope: "Heat" | "Cool", setpoint: number): number {
        const limitMin = scope === "Heat" ? this.heatSetpointMinimum : this.coolSetpointMinimum;
        const limitMax = scope === "Heat" ? this.heatSetpointMaximum : this.coolSetpointMaximum;
        const result = cropValueRange(setpoint, limitMin, limitMax);
        if (result !== setpoint) {
            logger.debug(
                `${scope} setpoint (${setpoint}) is out of limits [${limitMin}, ${limitMax}], clamping to ${result}`,
            );
        }
        return result;
    }

    /**
     * Used to validate that Setpoints must be within user configurable limits
     */
    #assertSetpointWithinLimits(scope: "Heat" | "Cool", type: "Occupied" | "Unoccupied", setpoint: number) {
        const limitMin = scope === "Heat" ? this.heatSetpointMinimum : this.coolSetpointMinimum;
        const limitMax = scope === "Heat" ? this.heatSetpointMaximum : this.coolSetpointMaximum;
        if (limitMin !== undefined && setpoint < limitMin) {
            throw new StatusResponse.ConstraintErrorError(
                `${scope}${type}Setpoint (${setpoint}) must be greater than or equal to min${scope}SetpointLimit (${limitMin})`,
            );
        }
        if (limitMax !== undefined && setpoint > limitMax) {
            throw new StatusResponse.ConstraintErrorError(
                `${scope}${type}Setpoint (${setpoint}) must be less than or equal to max${scope}SetpointLimit (${limitMax})`,
            );
        }
    }

    /**
     * Attempts to ensure that a change to the heating/cooling setpoint maintains the deadband with the cooling/heating
     * setpoint by adjusting the cooling setpoint
     */
    #ensureSetpointDeadband(scope: "Heating" | "Cooling", type: "occupied" | "unoccupied", value: number) {
        if (!this.features.autoMode) {
            // Only validated when AutoMode feature is enabled
            return;
        }

        const otherType = scope === "Heating" ? "Cooling" : "Heating";
        const deadband = this.setpointDeadBand;
        const otherSetpoint = otherType === "Heating" ? this.heatingSetpoint : this.coolingSetpoint; // current
        const otherLimit = otherType === "Heating" ? this.heatSetpointMinimum : this.coolSetpointMaximum;
        if (otherType === "Cooling") {
            const minValidSetpoint = value + deadband;
            logger.debug(
                `Ensuring deadband for ${type}${otherType}Setpoint, min valid setpoint is ${minValidSetpoint}`,
            );
            if (otherSetpoint >= minValidSetpoint) {
                // The current cooling setpoint doesn't violate the deadband
                return;
            }
            if (minValidSetpoint > otherLimit) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot adjust cooling setpoint to maintain deadband, would exceed max cooling setpoint (${otherLimit})`,
                );
            }
            logger.debug(`Adjusting ${type}${otherType}Setpoint to ${minValidSetpoint} to maintain deadband`);
            this.state[`${type}${otherType}Setpoint`] = minValidSetpoint;
        } else {
            const maxValidSetpoint = value - deadband;
            logger.debug(
                `Ensuring deadband for ${type}${otherType}Setpoint, max valid setpoint is ${maxValidSetpoint}`,
            );
            if (otherSetpoint <= maxValidSetpoint) {
                // The current heating setpoint doesn't violate the deadband
                return;
            }
            if (maxValidSetpoint < otherLimit) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot adjust heating setpoint to maintain deadband, would exceed min heating setpoint (${otherLimit})`,
                );
            }
            logger.debug(`Adjusting ${type}${otherType}Setpoint to ${maxValidSetpoint} to maintain deadband`);
            this.state[`${type}${otherType}Setpoint`] = maxValidSetpoint;
        }
    }

    /**
     * Checks to see if it's possible to adjust the heating/cooling setpoint to preserve a given deadband if the
     * cooling/heating setpoint is changed
     */
    #assertSetpointDeadband(type: "Heating" | "Cooling", value: number) {
        if (!this.features.autoMode) {
            // Only validated when AutoMode feature is enabled
            return;
        }

        const deadband = this.setpointDeadBand;
        const otherValue = type === "Heating" ? this.coolSetpointMaximum : this.heatSetpointMinimum;

        // No error is reported but the value is adjusted accordingly.
        if (type === "Heating" && value + deadband > otherValue) {
            throw new StatusResponse.ConstraintErrorError(
                `HeatingSetpoint (${value}) plus deadband (${deadband}) exceeds CoolingSetpoint (${otherValue})`,
            );
        } else if (type === "Cooling" && value - deadband < otherValue) {
            throw new StatusResponse.ConstraintErrorError(
                `CoolingSetpoint (${value}) minus deadband (${deadband}) is less than HeatingSetpoint (${otherValue})`,
            );
        }
    }

    #setupModeHandling() {
        this.reactTo(this.events.systemMode$Changed, this.#handleSystemModeChange);
        this.maybeReactTo(this.events.thermostatRunningMode$Changed, this.#handleThermostatRunningModeChange);
        if (this.state.useAutomaticModeManagement && this.state.thermostatRunningMode !== undefined) {
            this.reactTo(this.events.calibratedTemperature$Changed, this.#handleTemperatureChangeForMode);
            this.#handleTemperatureChangeForMode(this.internal.localTemperature); // initialize
        }
    }

    #handleSystemModeChange(newMode: Thermostat.SystemMode) {
        if (this.state.thermostatRunningMode !== undefined && newMode !== Thermostat.SystemMode.Auto) {
            if (newMode === Thermostat.SystemMode.Off) {
                this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Off;
            } else if (newMode === Thermostat.SystemMode.Heat) {
                this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Heat;
            } else if (newMode === Thermostat.SystemMode.Cool) {
                this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Cool;
            }
        }
    }

    #handleThermostatRunningModeChange(newRunningMode: Thermostat.ThermostatRunningMode) {
        if (this.state.piCoolingDemand !== undefined) {
            if (
                newRunningMode === Thermostat.ThermostatRunningMode.Off ||
                newRunningMode === Thermostat.ThermostatRunningMode.Heat
            ) {
                this.state.piCoolingDemand = 0;
            }
        }
        if (this.state.piHeatingDemand !== undefined) {
            if (
                newRunningMode === Thermostat.ThermostatRunningMode.Off ||
                newRunningMode === Thermostat.ThermostatRunningMode.Cool
            ) {
                this.state.piHeatingDemand = 0;
            }
        }
    }

    /**
     * Handles temperature changes to automatically adjust the system mode based on the current temperature
     * consideration. This logic is disabled by default and will be enabled by setting useAutomaticModeManagement to
     * true.
     */
    #handleTemperatureChangeForMode(temperature: number | null) {
        if (temperature == null) {
            return;
        }
        const consideration = this.temperatureConsideration;
        switch (this.state.systemMode) {
            case Thermostat.SystemMode.Heat:
                switch (consideration) {
                    case "belowTarget":
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Heat);
                        break;
                    default:
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Off);
                        break;
                }
                break;

            case Thermostat.SystemMode.Cool:
                switch (consideration) {
                    case "aboveTarget":
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Cool);
                        break;
                    default:
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Off);
                        break;
                }
                break;

            case Thermostat.SystemMode.Auto:
                switch (consideration) {
                    case "belowTarget":
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Heat);
                        break;
                    case "aboveTarget":
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Cool);
                        break;
                    default:
                        this.adjustRunningMode(Thermostat.ThermostatRunningMode.Off);
                        break;
                }
                break;
        }
    }

    #setupPresets() {
        if (!this.features.presets) {
            return;
        }
        this.reactTo(this.events.presets$AtomicChanging, this.#handlePresetsChanging);
        this.reactTo(this.events.presets$AtomicChanged, this.#handlePresetsChanged);
        this.reactTo(this.events.persistedPresets$Changing, this.#handlePresetsChanging);
        this.reactTo(this.events.persistedPresets$Changed, this.#handlePersistedPresetsChanged);

        this.reactTo(this.events.updatePresets, this.#updatePresets, { lock: true });
    }

    /** Handles changes to the Presets attribute and ensures persistedPresets are updated accordingly */
    #updatePresets(newPresets: Thermostat.Preset[]) {
        this.state.persistedPresets = newPresets;
    }

    /**
     * Handles "In-flight" validation of newly written Presets via atomic-write and does the required validations.
     */
    #handlePresetsChanging(newPresets: Thermostat.Preset[], oldPresets: Thermostat.Preset[]) {
        if (newPresets.length > this.state.numberOfPresets) {
            throw new StatusResponse.ResourceExhaustedError(
                `Number of presets (${newPresets.length}) exceeds NumberOfPresets (${this.state.numberOfPresets})`,
            );
        }

        const oldPresetsMap = new Map<string, Thermostat.Preset>();
        if (oldPresets !== undefined) {
            for (const preset of oldPresets) {
                if (preset.presetHandle !== null) {
                    const presetHex = Bytes.toHex(preset.presetHandle);
                    oldPresetsMap.set(presetHex, preset);
                }
            }
        }

        const persistedPresetsMap = new Map<string, Thermostat.Preset>();
        if (this.state.persistedPresets !== undefined) {
            for (const preset of this.state.persistedPresets) {
                if (preset.presetHandle === null) {
                    throw new InternalError("Persisted preset is missing presetHandle, this should not happen");
                }
                const presetHex = Bytes.toHex(preset.presetHandle);
                persistedPresetsMap.set(presetHex, preset);
            }
        }

        const presetTypeMap = new Map<Thermostat.PresetScenario, Thermostat.PresetType>();
        for (const type of this.state.presetTypes) {
            presetTypeMap.set(type.presetScenario, type);
        }

        const presetScenarioNames = new Map<Thermostat.PresetScenario, (string | null)[]>();
        const presetScenarioCounts = new Map<Thermostat.PresetScenario, number>();
        const newPresetsSet = new Set<string>();
        const newBuildInPresets = new Set<string>();
        for (const preset of newPresets) {
            if (preset.presetHandle !== null) {
                const presetHex = Bytes.toHex(preset.presetHandle);
                if (newPresetsSet.has(presetHex)) {
                    throw new StatusResponse.ConstraintErrorError(`Duplicate presetHandle ${presetHex} in new Presets`);
                }

                if (this.state.persistedPresets !== undefined) {
                    const persistedPreset = persistedPresetsMap.get(presetHex);
                    if (persistedPreset === undefined) {
                        throw new StatusResponse.NotFoundError(
                            `Preset with presetHandle ${presetHex} does not exist in old Presets, cannot add new Presets with non-null presetHandle`,
                        );
                    }
                    if (preset.builtIn !== null && persistedPreset.builtIn !== preset.builtIn) {
                        throw new StatusResponse.ConstraintErrorError(
                            `Cannot change built-in status of preset with presetHandle ${presetHex}`,
                        );
                    }
                }

                newPresetsSet.add(presetHex);
            } else if (preset.builtIn) {
                throw new StatusResponse.ConstraintErrorError(`Can not add a new built-in preset`);
            }

            const presetType = presetTypeMap.get(preset.presetScenario);
            if (presetType === undefined) {
                throw new StatusResponse.ConstraintErrorError(
                    `No PresetType defined for scenario ${Thermostat.PresetScenario[preset.presetScenario]}`,
                );
            }

            if (preset.name !== undefined) {
                const scenarioNames = presetScenarioNames.get(preset.presetScenario) ?? [];
                if (scenarioNames.includes(preset.name)) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Duplicate preset name "${preset.name}" for scenario ${Thermostat.PresetScenario[preset.presetScenario]}`,
                    );
                }

                if (!presetType.presetTypeFeatures.supportsNames) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Preset names are not supported for scenario ${Thermostat.PresetScenario[preset.presetScenario]}`,
                    );
                }

                scenarioNames.push(preset.name);
                presetScenarioNames.set(preset.presetScenario, scenarioNames);
            }

            const count = presetScenarioCounts.get(preset.presetScenario) ?? 0;
            if (count === presetType.numberOfPresets) {
                throw new StatusResponse.ResourceExhaustedError(
                    `Number of presets (${count}) for scenario ${Thermostat.PresetScenario[preset.presetScenario]} exceeds allowed number (${presetType.numberOfPresets})`,
                );
            }
            presetScenarioCounts.set(preset.presetScenario, count + 1);

            if (this.features.cooling) {
                if (preset.coolingSetpoint === undefined) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Preset for scenario ${Thermostat.PresetScenario[preset.presetScenario]} is missing required coolingSetpoint`,
                    );
                }
                if (
                    preset.coolingSetpoint < this.coolSetpointMinimum ||
                    preset.coolingSetpoint > this.coolSetpointMaximum
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Preset coolingSetpoint (${preset.coolingSetpoint}) for scenario ${Thermostat.PresetScenario[preset.presetScenario]} is out of bounds [${this.coolSetpointMinimum}, ${this.coolSetpointMaximum}]`,
                    );
                }
            }
            if (this.features.heating) {
                if (preset.heatingSetpoint === undefined) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Preset for scenario ${Thermostat.PresetScenario[preset.presetScenario]} is missing required heatingSetpoint`,
                    );
                }
                if (
                    preset.heatingSetpoint < this.heatSetpointMinimum ||
                    preset.heatingSetpoint > this.heatSetpointMaximum
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Preset heatingSetpoint (${preset.heatingSetpoint}) for scenario ${Thermostat.PresetScenario[preset.presetScenario]} is out of bounds [${this.heatSetpointMinimum}, ${this.heatSetpointMaximum}]`,
                    );
                }
            }
            if (preset.builtIn && preset.presetHandle !== null) {
                newBuildInPresets.add(Bytes.toHex(preset.presetHandle));
            }
        }
    }

    /**
     * Handles additional validation of preset changes when all chunks were written in an atomic write operation.
     */
    #handlePresetsChanged(newPresets: Thermostat.Preset[], oldPresets: Thermostat.Preset[]) {
        this.#handlePersistedPresetsChanged(newPresets, oldPresets);

        // Store old Presets for lookup convenience
        const oldPresetsMap = new Map<string, Thermostat.Preset>();
        const oldBuildInPresets = new Set<string>();
        if (oldPresets !== undefined) {
            for (const preset of oldPresets) {
                if (preset.presetHandle === null) {
                    throw new InternalError("Old preset is missing presetHandle, this must not happen");
                }
                const presetHex = Bytes.toHex(preset.presetHandle);
                oldPresetsMap.set(presetHex, preset);
                if (preset.builtIn) {
                    oldBuildInPresets.add(presetHex);
                }
            }
        }

        for (const preset of newPresets) {
            if (preset.presetHandle === null) {
                if (preset.builtIn) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Preset for scenario ${Thermostat.PresetScenario[preset.presetScenario]} is built-in and must have a non-null presetHandle`,
                    );
                }
            }
        }
    }

    /**
     * Handles additional validation and required value adjustments of persistedPresets changes when all chunks were
     * written in an atomic write.
     */
    #handlePersistedPresetsChanged(newPresets: Thermostat.Preset[], oldPresets: Thermostat.Preset[]) {
        if (oldPresets === undefined) {
            logger.debug(
                "Old presets is undefined, skipping some checks. This should only happen on setup of the behavior.",
            );
        }

        const crypto = this.endpoint.env.get(Crypto);
        let changed = false;
        const newPresetHandles = new Set<string>();
        for (const preset of newPresets) {
            if (preset.presetHandle === null) {
                logger.error("Preset is missing presetHandle, generating a new one");
                preset.presetHandle = crypto.randomBytes(16);
                changed = true;
            }
            newPresetHandles.add(Bytes.toHex(preset.presetHandle));
            if (oldPresets === undefined) {
                if (preset.builtIn === null) {
                    preset.builtIn = false;
                    changed = true;
                }
            } else {
                if (preset.builtIn === null) {
                    const oldPreset = oldPresets.find(
                        p =>
                            p.presetHandle &&
                            preset.presetHandle &&
                            Bytes.areEqual(p.presetHandle, preset.presetHandle),
                    );
                    if (oldPreset !== undefined) {
                        preset.builtIn = oldPreset.builtIn;
                    } else {
                        preset.builtIn = false;
                    }
                    changed = true;
                }
            }
        }

        const newBuildInPresets = new Set<string>();
        for (const preset of newPresets) {
            if (preset.builtIn) {
                newBuildInPresets.add(Bytes.toHex(preset.presetHandle!));
            }
        }
        const oldBuildInPresets = new Set<string>();
        if (oldPresets !== undefined) {
            for (const preset of oldPresets) {
                if (preset.builtIn) {
                    oldBuildInPresets.add(Bytes.toHex(preset.presetHandle!));
                }
            }
        }

        // Ensure built-in presets are not removed
        for (const oldBuiltInPreset of oldBuildInPresets) {
            if (!newBuildInPresets.has(oldBuiltInPreset)) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot remove built-in preset with presetHandle ${oldBuiltInPreset}`,
                );
            }
        }

        /*if (this.features.matterScheduleConfiguration) {
            for (const schedule of this.state.schedules) {
                if (schedule.presetHandle && !newPresetHandles.has(Bytes.toHex(schedule.presetHandle))) {
                    throw new StatusResponse.InvalidInStateError(`Schedule references non-existing presetHandle`);
                }
            }
        }*/
        if (
            this.state.activePresetHandle !== null &&
            !newPresetHandles.has(Bytes.toHex(this.state.activePresetHandle))
        ) {
            throw new StatusResponse.InvalidInStateError(`ActivePresetHandle references non-existing presetHandle`);
        }

        if (changed) {
            logger.error("PresetHandles or BuiltIn flags were updated, updating persistedPresets");
            this.state.persistedPresets = deepCopy(newPresets);
        }
    }

    override async [Symbol.asyncDispose]() {
        // Because we are basically the only user right now ensure the service is closed when we are disposed
        this.endpoint.env.close(AtomicWriteHandler);
    }

    /** Implementation of the atomic request handling */
    override async atomicRequest(request: Thermostat.AtomicRequest): Promise<Thermostat.AtomicResponse> {
        const atomicWriteHandler = this.endpoint.env.get(AtomicWriteHandler);
        const { requestType } = request;
        switch (requestType) {
            case Thermostat.RequestType.BeginWrite:
                return atomicWriteHandler.beginWrite(request, this.context, this.endpoint, this.type);
            case Thermostat.RequestType.CommitWrite:
                return await atomicWriteHandler.commitWrite(
                    request,
                    this.context,
                    this.endpoint,
                    this.type,
                    this.state,
                );
            case Thermostat.RequestType.RollbackWrite:
                return atomicWriteHandler.rollbackWrite(request, this.context, this.endpoint, this.type);
        }
    }
}

export namespace ThermostatBaseServer {
    export class State extends ThermostatBehaviorLogicBase.State {
        /**
         * Otherwise measured temperature in Matter format as uint16 with a factor of 100. A calibration offset is applied
         * additionally from localTemperatureCalibration if set.
         * Use this if you have an external temperature sensor that should be used for thermostat control instead of a
         * local temperature measurement cluster.
         */
        externalMeasuredIndoorTemperature?: number;

        /**
         * Otherwise measured occupancy as boolean.
         * Use this if you have an external occupancy sensor that should be used for thermostat control instead of a
         * internal occupancy sensing cluster.
         */
        externallyMeasuredOccupancy?: boolean;

        /**
         * Use to enable the automatic mode management, implemented by this standard implementation.  This is beyond
         * Matter specification! It reacts to temperature changes to adjust system running mode automatically. It also
         * requires the Auto feature to be  enabled and the ThermostatRunningMode attribute to be present.
         */
        useAutomaticModeManagement: boolean = false;

        /**
         * Persisted presets stored in the device, needed because the original "presets" is a virtual property
         */
        persistedPresets?: Thermostat.Preset[];

        /**
         * Implementation of the needed Preset attribute logic for Atomic Write handling.
         */
        [Val.properties](endpoint: Endpoint, session: ValueSupervisor.Session) {
            // Only return remaining time if the attribute is defined in the endpoint
            const properties = {};
            if (
                (endpoint.behaviors.optionsFor(ThermostatBaseServer) as Record<string, unknown>)?.presets !==
                    undefined ||
                (endpoint.behaviors.defaultsFor(ThermostatBaseServer) as Record<string, unknown>)?.presets !== undefined
            ) {
                Object.defineProperty(properties, "presets", {
                    /**
                     * Getter will return a pending atomic write state when there is one, otherwise the stored value or
                     * the default value.
                     */
                    get(): Readonly<Thermostat.Preset[]> {
                        // When we have a pending value for this attribute, return that instead
                        const pendingValue = endpoint.env
                            .get(AtomicWriteHandler)
                            .pendingValueForAttributeAndPeer(
                                session,
                                endpoint,
                                ThermostatBaseServer,
                                Thermostat.Complete.attributes.presets.id,
                            );
                        if (pendingValue !== undefined) {
                            return pendingValue as Thermostat.Preset[];
                        }

                        let value = endpoint.stateOf(ThermostatBaseServer.id).persistedPresets;
                        if (value === undefined) {
                            value = (endpoint.behaviors.optionsFor(ThermostatBaseServer) as Record<string, unknown>)
                                ?.presets;
                        }
                        return (value ?? []) as Thermostat.Preset[];
                    },

                    /**
                     * Setter will either emit an update event directly when in local actor context or command context,
                     * otherwise it will go through the AtomicWriteHandler to ensure proper atomic write handling.
                     */
                    set(value: Thermostat.Preset[]) {
                        if (hasLocalActor(session) || ("command" in session && session.command)) {
                            // Local set or command context bypass atomic write handling
                            // We use this event to property apply state changes
                            endpoint.eventsOf(ThermostatBaseServer.id).updatePresets!.emit(value);
                        } else {
                            endpoint.env
                                .get(AtomicWriteHandler)
                                .writeAttribute(
                                    session,
                                    endpoint,
                                    ThermostatBaseServer,
                                    Thermostat.Complete.attributes.presets.id,
                                    value,
                                );
                        }
                    },
                });
            }

            return properties;
        }
    }

    export class Events extends ThermostatBehaviorLogicBase.Events {
        externalMeasuredIndoorTemperature$Changed =
            Observable<[value: number, oldValue: number, context: ActionContext]>();
        externallyMeasuredOccupancy$Changed = Observable<[value: boolean, oldValue: boolean, context: ActionContext]>();
        persistedPresets$Changed =
            Observable<[value: Thermostat.Preset[], oldValue: Thermostat.Preset[], context: ActionContext]>();
        persistedPresets$Changing =
            Observable<[value: Thermostat.Preset[], oldValue: Thermostat.Preset[], context: ActionContext]>();

        /**
         * Custom event emitted when the calibrated temperature changes.
         */
        calibratedTemperature$Changed =
            Observable<[value: number | null, oldValue: number | null, context: ActionContext]>();

        /**
         * Custom event emitted when the Presets attribute is "virtually" changing as part of an atomic write operation.
         * Info: The events is currently needed to be a pure Observable to get errors thrown in the event handler be
         *  reported back to the emitter.
         */
        presets$AtomicChanging =
            Observable<[value: Thermostat.Preset[], oldValue: Thermostat.Preset[], context: ActionContext]>();

        /**
         * Custom event emitted when the Presets attribute has "virtually" changed as part of an atomic write operation.
         * Info: The events is currently needed to be a pure Observable to get errors thrown in the event handler be
         * reported back to the emitter.
         */
        presets$AtomicChanged =
            Observable<[value: Thermostat.Preset[], oldValue: Thermostat.Preset[], context: ActionContext]>();

        /**
         * Custom event emitted to inform the behavior implementation of an update of the PersistedPresets attribute.
         */
        updatePresets = Observable<[value: Thermostat.Preset[]]>();
    }

    export class Internal {
        /**
         * Local temperature in Matter format as uint16 with a factor of 100. It is the same value as the one reported
         * in the localTemperature Attribute, but also present when the LocalTemperatureNotExposed feature is enabled.
         * Means all logic and calculations are always done with this value.
         * The value will be updated on initialization and when the localTemperature Attribute changes.
         */
        localTemperature: number | null = null;

        /**
         * Storing fixed value internally to ensure it can not be modified.
         * This value will be initialized when the behavior is initialized and is static afterward.
         */
        minSetpointDeadBand: number = 0;

        /**
         * Storing fixed value internally to ensure it can not be modified.
         * This value will be initialized when the behavior is initialized and is static afterward.
         */
        controlSequenceOfOperation!: Thermostat.ControlSequenceOfOperation;
    }
}

// We had turned on some more features to provide a default implementation, but export the cluster with default
// Features again.
export class ThermostatServer extends ThermostatBaseServer.for(ClusterType(Thermostat.Base)) {}
