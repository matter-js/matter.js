/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { OccupancySensingServer } from "#behaviors/occupancy-sensing";
import { TemperatureMeasurementServer } from "#behaviors/temperature-measurement";
import { OccupancySensing } from "#clusters/occupancy-sensing";
import { Thermostat } from "#clusters/thermostat";
import { AsyncObservable, cropValueRange, ImplementationError, Logger, Time } from "#general";
import { ClusterType, StatusResponse, TypeFromPartialBitSchema } from "#types";
import { ThermostatBehavior } from "./ThermostatBehavior.js";

const logger = Logger.get("ThermostatServer");

const ThermostatBehaviorLogicBase = ThermostatBehavior.with(
    Thermostat.Feature.Heating,
    Thermostat.Feature.Cooling,
    Thermostat.Feature.Occupancy,
    Thermostat.Feature.AutoMode,
    Thermostat.Feature.Presets,
    Thermostat.Feature.Setback,
    Thermostat.Feature.MatterScheduleConfiguration,
);

/**
 * This is the default server implementation of {@link ThermostatBehavior}.
 *
 * The Matter specification requires the Thermostat cluster to support features we do not enable by default. You should
 * use {@link ThermostatServer.with} to specialize the class for the features your implementation supports.
 *
 * This implementation mainly provides all validation and base logic required by the Matter specification.
 * It **does not** implement any logic to actually control a thermostat device or to react to temperature changes to e.g.
 * adjust the ThermostatRunningMode when the Auto feature is supported. This is all up to the specific implementation.
 *
 * For local temperature or occupancy values we check if there is a local cluster available on the same endpoint and use
 * them, alternatively raw measurements can be set in the states externalMeasuredIndoorTemperature and
 * externallyMeasuredOccupancy. The OutdoorTemperature can be set directly on the attribute if supported.
 * The RemoteSensing attribute need to be set correctly as needed by the developer to identify the measurement source.
 */
export class ThermostatBaseServer extends ThermostatBehaviorLogicBase {
    declare protected internal: ThermostatBaseServer.Internal;
    declare state: ThermostatBaseServer.State;
    declare events: ThermostatBaseServer.Events;

    override initialize() {
        if (this.features.scheduleConfiguration) {
            throw new ImplementationError("ScheduleConfiguration features is deprecated and not allowed to be used!");
        }
        if (this.features.presets || this.features.matterScheduleConfiguration) {
            logger.warn(
                "Presets and MatterScheduleConfiguration features are not yet implemented. Please do not activate them.",
            );
        }

        this.#setupValidations();
        this.#setupLocalTemperatureMeasurementIntegration();
        this.#setupOccupancyIntegration();
        this.#setupModeHandling();
        this.#setupThermostatLogic();
        this.#setupSetback();

        // Fix invalid default we have internally and ensure correct value for now, we update model with 1.4.2 update
        if (this.state.minSetpointDeadBand === 2000) {
            this.state.minSetpointDeadBand = 200;
        }
        if (this.state.minSetpointDeadBand < 0 || this.state.minSetpointDeadBand > 127) {
            throw new ImplementationError("minSetpointDeadBand is out of valid range 0..127");
        }
        // Store these states internally to prevent changes
        this.internal.minSetpointDeadBand = this.state.minSetpointDeadBand;
        this.internal.controlSequenceOfOperation = this.state.controlSequenceOfOperation;
    }

    override setpointRaiseLower({ mode, amount }: Thermostat.SetpointRaiseLowerRequest) {
        if (mode === Thermostat.SetpointRaiseLowerMode.Heat && !this.features.heating) {
            throw new StatusResponse.InvalidCommandError("Heating feature is not supported");
        }
        if (mode === Thermostat.SetpointRaiseLowerMode.Cool && !this.features.cooling) {
            throw new StatusResponse.InvalidCommandError("Cooling feature is not supported");
        }

        // We only care about Occupied setpoints as by SDK implementation
        if (mode === Thermostat.SetpointRaiseLowerMode.Both) {
            if (this.features.heating && this.features.cooling) {
                let desiredCoolingSetpoint = this.state.occupiedCoolingSetpoint + amount * 10;
                const coolLimit = desiredCoolingSetpoint - this.#clampSetpointToLimits("Cool", desiredCoolingSetpoint);
                let desiredHeatingSetpoint = this.state.occupiedHeatingSetpoint + amount * 10;
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
                    this.state.occupiedCoolingSetpoint + amount * 10,
                );
            } else {
                this.state.occupiedHeatingSetpoint = this.#clampSetpointToLimits(
                    "Heat",
                    this.state.occupiedHeatingSetpoint + amount * 10,
                );
            }
            return;
        }

        if (mode === Thermostat.SetpointRaiseLowerMode.Cool) {
            const desiredCoolingSetpoint = this.#clampSetpointToLimits(
                "Cool",
                this.state.occupiedCoolingSetpoint + amount * 10,
            );
            if (this.features.autoMode) {
                let heatingSetpoint = this.state.occupiedHeatingSetpoint;
                if (desiredCoolingSetpoint - heatingSetpoint < this.setpointDeadBand) {
                    // We are limited by the Heating Setpoint
                    heatingSetpoint = desiredCoolingSetpoint - this.setpointDeadBand;
                    if (heatingSetpoint === this.#clampSetpointToLimits("Heat", heatingSetpoint)) {
                        // Desired cooling setpoint is enforcable
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
                this.state.occupiedHeatingSetpoint + amount * 10,
            );
            if (this.features.autoMode) {
                let coolingSetpoint = this.state.occupiedCoolingSetpoint;
                if (coolingSetpoint - desiredHeatingSetpoint < this.setpointDeadBand) {
                    // We are limited by the Cooling Setpoint
                    coolingSetpoint = desiredHeatingSetpoint + this.setpointDeadBand;
                    if (coolingSetpoint === this.#clampSetpointToLimits("Cool", coolingSetpoint)) {
                        // Desired cooling setpoint is enforcable
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

        throw new StatusResponse.InvalidCommandError("Unsupported SetpointRaiseLowerMode");
    }

    protected get occupied() {
        return this.features.occupancy ? (this.state.occupancy?.occupied ?? true) : true;
    }

    protected get heatingSetpoint() {
        if (this.occupied) {
            return this.state.occupiedHeatingSetpoint;
        }
        return this.state.unoccupiedHeatingSetpoint;
    }

    protected get coolingSetpoint() {
        if (this.occupied) {
            return this.state.occupiedCoolingSetpoint;
        }
        return this.state.unoccupiedCoolingSetpoint;
    }

    #setupThermostatLogic() {
        if (this.state.temperatureSetpointHold !== undefined) {
            // When we support temperature setpoint hold, ensure related states are initialized
            if (this.state.temperatureSetpointHoldDuration === undefined) {
                this.state.temperatureSetpointHoldDuration = null;
            }
            if (this.state.setpointHoldExpiryTimestamp === undefined) {
                this.state.setpointHoldExpiryTimestamp = null;
            }
            if (this.events.temperatureSetpointHold$Changed !== undefined) {
                this.reactTo(this.events.temperatureSetpointHold$Changed, this.#handleTemperatureSetpointHoldChange);
            }
        }
    }

    #handleTemperatureSetpointHoldChange(newValue: Thermostat.TemperatureSetpointHold) {
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
    }

    #setupSetback() {
        if (!this.features.setback) {
            return;
        }

        this.reactTo(this.events.localTemperature$Changed, this.#handleTemperatureChangeForSetback);

        this.reactTo(this.events.occupiedSetback$Changing, this.#assertOccupiedSetbackChanging);

        if (this.features.occupancy) {
            this.reactTo(this.events.unoccupiedSetback$Changing, this.#assertUnoccupiedSetbackChanging);
        }
    }

    #assertOccupiedSetbackChanging(v: number | null) {
        const croppedValue = this.#cropSetbackChange(v, "occupied");
        if (v !== croppedValue) {
            this.state.occupiedSetback = croppedValue;
        }
    }

    #assertUnoccupiedSetbackChanging(v: number | null) {
        const croppedValue = this.#cropSetbackChange(v, "unoccupied");
        if (v !== croppedValue) {
            this.state.unoccupiedSetback = croppedValue;
        }
    }

    #handleTemperatureChangeForSetback(newValue: number | null) {
        const setBackValue = this.occupied ? this.state.occupiedSetback : this.state.unoccupiedSetback;
        if (newValue === null || setBackValue === null || setBackValue === 0) {
            return;
        }
        const coolingSetPoint = this.coolingSetpoint;
        const heatingSetPoint = this.heatingSetpoint;

        // TODO ??
        if (newValue > coolingSetPoint + setBackValue && this.coolingAllowed) {
            this.adjustState(Thermostat.SystemMode.Cool);
        } else if (newValue < heatingSetPoint - setBackValue && this.heatingAllowed) {
            this.adjustState(Thermostat.SystemMode.Heat);
        }
    }

    protected get heatingAllowed() {
        return (
            this.features.heating &&
            ![
                Thermostat.ControlSequenceOfOperation.CoolingOnly,
                Thermostat.ControlSequenceOfOperation.CoolingAndHeatingWithReheat,
            ].includes(this.internal.controlSequenceOfOperation)
        );
    }

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
     * Adjust the state of the thermostat based on the new system mode.
     * When the AutoMode feature is enabled and the current system mode is Auto, the thermostat running mode
     * is adjusted instead of the system mode.
     */
    protected adjustState(newState: Thermostat.SystemMode) {
        if (this.features.autoMode && this.state.systemMode === Thermostat.SystemMode.Auto) {
            switch (newState) {
                case Thermostat.SystemMode.Heat:
                    if (!this.heatingAllowed) {
                        throw new ImplementationError(
                            "Heating is not allowed in the current ControlSequenceOfOperation",
                        );
                    }
                    if (this.state.thermostatRunningMode !== Thermostat.ThermostatRunningMode.Heat) {
                        this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Heat;
                    }
                    break;
                case Thermostat.SystemMode.Cool:
                    if (!this.coolingAllowed) {
                        throw new ImplementationError(
                            "Cooling is not allowed in the current ControlSequenceOfOperation",
                        );
                    }
                    if (this.state.thermostatRunningMode !== Thermostat.ThermostatRunningMode.Cool) {
                        this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Cool;
                    }
                    break;
                case Thermostat.SystemMode.Off:
                    if (this.state.thermostatRunningMode !== Thermostat.ThermostatRunningMode.Off) {
                        this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Off;
                    }
                    break;
            }
        } else {
            switch (newState) {
                case Thermostat.SystemMode.Heat:
                    if (!this.heatingAllowed) {
                        throw new ImplementationError(
                            "Heating is not allowed in the current ControlSequenceOfOperation",
                        );
                    }
                    if (this.state.systemMode !== Thermostat.SystemMode.Heat) {
                        this.state.systemMode = Thermostat.SystemMode.Heat;
                    }
                    break;
                case Thermostat.SystemMode.Cool:
                    if (!this.coolingAllowed) {
                        throw new ImplementationError(
                            "Cooling is not allowed in the current ControlSequenceOfOperation",
                        );
                    }
                    if (this.state.systemMode !== Thermostat.SystemMode.Cool) {
                        this.state.systemMode = Thermostat.SystemMode.Cool;
                    }
                    break;
                case Thermostat.SystemMode.Off:
                    if (this.state.systemMode !== Thermostat.SystemMode.Off) {
                        this.state.systemMode = Thermostat.SystemMode.Off;
                    }
                    break;
            }
        }
    }

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

    #setupLocalTemperatureMeasurementIntegration() {
        const preferRemoteTemperature = !!this.state.remoteSensing?.localTemperature;
        if (this.features.localTemperatureNotExposed) {
            if (preferRemoteTemperature) {
                throw new ImplementationError(
                    "RemoteSensing cannot be set to LocalTemperature when LocalTemperatureNotExposed feature is enabled",
                );
            }
            logger.debug("LocalTemperatureNotExposed feature is enabled, ignoring local temperature measurement");
            this.state.localTemperature = null;
        } else if (!preferRemoteTemperature && this.agent.has(TemperatureMeasurementServer)) {
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
            this.state.localTemperature = this.endpoint.stateOf(TemperatureMeasurementServer).measuredValue;
        } else {
            if (this.state.externalMeasuredIndoorTemperature === undefined) {
                this.state.localTemperature = null;
                logger.warn(
                    "No local TemperatureMeasurement cluster available and externalMeasuredIndoorTemperature state not set",
                );
            } else {
                logger.info("Using measured temperature via externalMeasuredIndoorTemperature state");
            }
            this.reactTo(this.events.externalMeasuredIndoorTemperature$Changed, this.#handleMeasuredTemperatureChange);
            this.state.localTemperature = this.state.externalMeasuredIndoorTemperature ?? null;
        }
        this.internal.localTemperature = this.state.localTemperature;
    }

    #handleMeasuredTemperatureChange(temperature: number | null) {
        if (temperature == null) {
            this.state.localTemperature = null;
            return;
        }

        if (this.state.localTemperatureCalibration !== undefined) {
            temperature += this.state.localTemperatureCalibration * 10;
        }
        this.state.localTemperature = temperature;
        this.internal.localTemperature = this.state.localTemperature;
    }

    #setupOccupancyIntegration() {
        if (!this.features.occupancy) {
            return;
        }
        const preferRemoteOccupancy = !!this.state.remoteSensing?.occupancy;
        if (!preferRemoteOccupancy && this.agent.has(OccupancySensingServer)) {
            logger.debug("Using existing OccupancySensing cluster on same endpoint for local occupancy sensing");
            if (this.state.externallyMeasuredOccupancy !== undefined) {
                logger.warn(
                    "Both local OccupancySensing cluster and externallyMeasuredOccupancy state are set, using local cluster",
                );
            }
            this.reactTo(this.agent.get(OccupancySensingServer).events.occupancy$Changed, this.#handleOccupancyChange);
            return;
        }

        if (this.state.externallyMeasuredOccupancy === undefined) {
            this.state.occupancy = { occupied: false };
            logger.warn("No local OccupancySensing cluster available and externallyMeasuredOccupancy state not set");
        } else {
            logger.info("Using occupancy via externallyMeasuredOccupancy state");
        }
        this.reactTo(this.events.externallyMeasuredOccupancy$Changed, this.#handleExternalOccupancyChange);
    }

    #handleExternalOccupancyChange(newValue: boolean) {
        this.state.occupancy = { occupied: newValue };
    }

    #handleOccupancyChange(newValue: TypeFromPartialBitSchema<typeof OccupancySensing.Occupancy>) {
        this.state.occupancy = newValue;
    }

    #setupValidations() {
        // Validate existing values to match the constraints at initialization
        this.#assertUserSetpointLimits("HeatSetpointLimit");
        this.#assertUserSetpointLimits("CoolSetpointLimit");
        this.#clampSetpointToLimits("Heat", this.state.occupiedHeatingSetpoint);
        this.#clampSetpointToLimits("Heat", this.state.unoccupiedHeatingSetpoint);
        this.#clampSetpointToLimits("Cool", this.state.occupiedCoolingSetpoint);
        this.#clampSetpointToLimits("Cool", this.state.unoccupiedCoolingSetpoint);

        if (this.events.absMinHeatSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.absMinHeatSetpointLimit$Changing, this.#assertAbsMinHeatSetpointLimitChanging);
        }
        if (this.events.minHeatSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.minHeatSetpointLimit$Changing, this.#assertMinHeatSetpointLimitChanging);
        }
        if (this.events.maxHeatSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.maxHeatSetpointLimit$Changing, this.#assertMaxHeatSetpointLimitChanging);
        }
        if (this.events.absMaxHeatSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.absMaxHeatSetpointLimit$Changing, this.#assertAbsMaxHeatSetpointLimitChanging);
        }

        if (this.events.absMinCoolSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.absMinCoolSetpointLimit$Changing, this.#assertAbsMinCoolSetpointLimitChanging);
        }
        if (this.events.minCoolSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.minCoolSetpointLimit$Changing, this.#assertMinCoolSetpointLimitChanging);
        }
        if (this.events.maxCoolSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.maxCoolSetpointLimit$Changing, this.#assertMaxCoolSetpointLimitChanging);
        }
        if (this.events.absMaxCoolSetpointLimit$Changing !== undefined) {
            this.reactTo(this.events.absMaxCoolSetpointLimit$Changing, this.#assertAbsMaxCoolSetpointLimitChanging);
        }

        if (this.events.occupiedHeatingSetpoint$Changing !== undefined) {
            this.reactTo(this.events.occupiedHeatingSetpoint$Changing, this.#assertOccupiedHeatingSetpointChanging);
        }
        if (this.events.unoccupiedHeatingSetpoint$Changing !== undefined) {
            this.reactTo(this.events.unoccupiedHeatingSetpoint$Changing, this.#assertUnoccupiedHeatingSetpointChanging);
        }
        if (this.events.occupiedCoolingSetpoint$Changing !== undefined) {
            this.reactTo(this.events.occupiedCoolingSetpoint$Changing, this.#assertOccupiedCoolingSetpointChanging);
        }
        if (this.events.unoccupiedCoolingSetpoint$Changing !== undefined) {
            this.reactTo(this.events.unoccupiedCoolingSetpoint$Changing, this.#assertUnoccupiedCoolingSetpointChanging);
        }

        if (this.events.remoteSensing$Changing !== undefined) {
            this.reactTo(this.events.remoteSensing$Changing, this.#assertRemoteSensingChanging);
        }

        // For backwards compatibility, this attribute is optionally writeable. However any
        // writes to this attribute SHALL be silently ignored.
        // So we just revert any changes.
        if (this.events.minSetpointDeadBand$Changing !== undefined) {
            this.reactTo(this.events.minSetpointDeadBand$Changing, this.#ensureMinSetpointDeadBandNotWritable);
        }

        this.reactTo(
            this.events.controlSequenceOfOperation$Changing,
            this.#ensureControlSequenceOfOperationNotWritable,
        );

        this.reactTo(this.events.systemMode$Changing, this.#assertSystemModeChanging);

        if (this.events.thermostatRunningMode$Changing !== undefined) {
            this.reactTo(this.events.thermostatRunningMode$Changing, this.#assertThermostatRunningModeChanging);
        }
    }

    #assertThermostatRunningModeChanging(newRunningMode: Thermostat.ThermostatRunningMode) {
        const forbiddenRunningModes = new Array<Thermostat.ThermostatRunningMode>();
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

    #ensureControlSequenceOfOperationNotWritable() {
        this.state.controlSequenceOfOperation = this.internal.controlSequenceOfOperation;
    }

    #ensureMinSetpointDeadBandNotWritable(value: number) {
        if (value < 0 || value > 127) {
            throw new StatusResponse.ConstraintErrorError("MinSetpointDeadBand is out of valid range 0..127");
        }
        logger.warn("MinSetpointDeadBand is not writable, reverting change");
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
        if ("command" in context && !context.command) {
            // Only ensure Deadband when the value is written directly (not changed via a command)
            this.#ensureSetpointDeadband("Cooling", "unoccupied", setpoint);
        }
        if (this.features.presets && !this.occupied) {
            this.agent.asLocalActor(() => {
                this.state.activePresetHandle = null;
            });
        }
    }

    #assertUnoccupiedHeatingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        this.#assertSetpointWithinLimits("Heat", "Unoccupied", setpoint);
        this.#assertSetpointDeadband("Heating", setpoint);
        // Only ensure Deadband when the value is written directly (not changed via a command)
        if ("command" in context && !context.command) {
            this.#ensureSetpointDeadband("Heating", "unoccupied", setpoint);
        }
        if (this.features.presets && this.state.activePresetHandle !== undefined && !this.occupied) {
            this.agent.asLocalActor(() => {
                this.state.activePresetHandle = null;
            });
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
        if ("command" in context && !context.command) {
            // Only ensure Deadband when the value is written directly (not changed via a command)
            this.#ensureSetpointDeadband("Cooling", "occupied", setpoint);
        }
        if (this.features.presets && this.occupied) {
            this.agent.asLocalActor(() => {
                this.state.activePresetHandle = null;
            });
        }
    }

    #assertOccupiedHeatingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        this.#assertSetpointWithinLimits("Heat", "Occupied", setpoint);
        this.#assertSetpointDeadband("Heating", setpoint);
        if ("command" in context && !context.command) {
            // Only ensure Deadband when the value is written directly (not changed via a command)
            this.#ensureSetpointDeadband("Heating", "occupied", setpoint);
        }
        if (this.features.presets && this.state.activePresetHandle !== undefined && this.occupied) {
            this.agent.asLocalActor(() => {
                this.state.activePresetHandle = null;
            });
        }
    }

    protected get temperatureStatus(): "belowTarget" | "onTarget" | "aboveTarget" | undefined {
        const localTemp = this.internal.localTemperature;
        if (localTemp === null) {
            return undefined;
        }
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
                if (localTemp < heatingSetpoint) {
                    return "belowTarget";
                }
                if (localTemp > coolingSetpoint) {
                    return "aboveTarget";
                }
                break;
        }
        return "onTarget";
    }

    get heatDefaults() {
        return {
            absMin: 700,
            absMax: 3000,
        };
    }

    get coolDefaults() {
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
        const defaults = scope === "HeatSetpointLimit" ? this.heatDefaults : this.coolDefaults;
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
        if (absMax < min || absMax < absMin) {
            throw new StatusResponse.ConstraintErrorError(
                `absMax${scope} (${absMax}) must be greater than or equal to min${scope} (${min}) and absMin${scope} (${absMin})`,
            );
        }
    }

    get heatSetpointMinimum() {
        const absMin = this.state.absMinHeatSetpointLimit ?? this.heatDefaults.absMin;
        const min = this.state.minHeatSetpointLimit ?? this.heatDefaults.absMin;
        return Math.max(min, absMin);
    }

    get heatSetpointMaximum() {
        const absMax = this.state.absMaxHeatSetpointLimit ?? this.heatDefaults.absMax;
        const max = this.state.maxHeatSetpointLimit ?? this.heatDefaults.absMax;
        return Math.min(max, absMax);
    }

    get coolSetpointMinimum() {
        const absMin = this.state.absMinCoolSetpointLimit ?? this.coolDefaults.absMin;
        const min = this.state.minCoolSetpointLimit ?? this.coolDefaults.absMin;
        return Math.max(min, absMin);
    }

    get coolSetpointMaximum() {
        const absMax = this.state.absMaxCoolSetpointLimit ?? this.coolDefaults.absMax;
        const max = this.state.maxCoolSetpointLimit ?? this.coolDefaults.absMax;
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
            logger.info(
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
            logger.info(`Ensuring deadband for ${type}${otherType}Setpoint, min valid setpoint is ${minValidSetpoint}`);
            if (otherSetpoint >= minValidSetpoint) {
                // The current cooling setpoint doesn't violate the deadband
                return;
            }
            if (minValidSetpoint > otherLimit) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot adjust cooling setpoint to maintain deadband, would exceed max cooling setpoint (${otherLimit})`,
                );
            }
            logger.info(`Adjusting ${type}${otherType}Setpoint to ${minValidSetpoint} to maintain deadband`);
            this.state[`${type}${otherType}Setpoint`] = minValidSetpoint;
        } else {
            const maxValidSetpoint = value - deadband;
            logger.info(`Ensuring deadband for ${type}${otherType}Setpoint, max valid setpoint is ${maxValidSetpoint}`);
            if (otherSetpoint <= maxValidSetpoint) {
                // The current heating setpoint doesn't violate the deadband
                return;
            }
            if (maxValidSetpoint < otherLimit) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot adjust heating setpoint to maintain deadband, would exceed min heating setpoint (${otherLimit})`,
                );
            }
            logger.info(`Adjusting ${type}${otherType}Setpoint to ${maxValidSetpoint} to maintain deadband`);
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
        if (this.events.thermostatRunningMode$Changed) {
            this.reactTo(this.events.thermostatRunningMode$Changed, this.#handleThermostatRunningModeChange);
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

    sanitizeHeatingSetpoint(value: number): number {
        return cropValueRange(value, this.heatSetpointMinimum, this.heatSetpointMaximum);
    }

    sanitizeCoolingSetpoint(value: number): number {
        return cropValueRange(value, this.coolSetpointMinimum, this.coolSetpointMaximum);
    }
}

export namespace ThermostatBaseServer {
    export class Internal {
        /**
         * Local temperature in Matter format as uint16 with a factor of 100. It is the same value as the one reported
         * in the localTemperature Attribute, but also present when the LocalTemperatureNotExposed feature is enabled.
         * Means all logic and calculations are always done with this value.
         */
        localTemperature: number | null = null;

        /**
         * Storing fixed value internally to ensure it can not be modified.
         */
        minSetpointDeadBand: number = 0;

        /** Storing fixed value internally to ensure it can not be modified. */
        controlSequenceOfOperation!: Thermostat.ControlSequenceOfOperation;
    }

    export class State extends ThermostatBehaviorLogicBase.State {
        /**
         * Otherwise measured temperature in Matter format as uint16 with a factor of 100. A calibration offset is applied
         * additionally from localTemperatureCalibration if set.
         */
        externalMeasuredIndoorTemperature?: number;

        /** Otherwise measured occupancy as boolean */
        externallyMeasuredOccupancy?: boolean;
    }

    export class Events extends ThermostatBehaviorLogicBase.Events {
        externalMeasuredIndoorTemperature$Changed =
            AsyncObservable<[value: number, oldValue: number, context: ActionContext]>();
        externallyMeasuredOccupancy$Changed =
            AsyncObservable<[value: boolean, oldValue: boolean, context: ActionContext]>();
    }
}

// We had turned on some more features to provide a default implementation, but export the cluster with default
// Features again.
export class ThermostatServer extends ThermostatBaseServer.for(ClusterType(Thermostat.Base)) {}
