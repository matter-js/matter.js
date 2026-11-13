/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { OccupancySensingServer } from "#behaviors/occupancy-sensing";
import { TemperatureMeasurementServer } from "#behaviors/temperature-measurement";
import { TimeSynchronizationBehavior } from "#behaviors/time-synchronization";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    asError,
    Bytes,
    cropValueRange,
    deepCopy,
    Entropy,
    Hours,
    ImplementationError,
    Logger,
    isDeepEqual,
    Millis,
    Observable,
    Seconds,
    Time,
    Timestamp,
    type Timer,
    type Transaction,
} from "@matter/general";
import { FieldElement, Specification } from "@matter/model";
import { hasLocalActor, Val } from "@matter/protocol";
import { StatusResponse } from "@matter/types";
import { OccupancySensing } from "@matter/types/clusters/occupancy-sensing";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { AtomicWriteHandler } from "./AtomicWriteHandler.js";
import { ThermostatBehavior } from "./ThermostatBehavior.js";

const logger = Logger.get("ThermostatServer");

/**
 * The shortest time between two LocalTemperatureChange events.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.3.13.2
 */
const LOCAL_TEMPERATURE_CHANGE_INTERVAL = Seconds(60);

/**
 * The lowest value of MaxThermostatSuggestions, the constraint in the attribute table.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.3.11
 */
const MIN_THERMOSTAT_SUGGESTIONS = 5;

/**
 * How far in the future the EffectiveTime of AddThermostatSuggestion may be, in seconds.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.4.4
 */
const MAX_SUGGESTION_LEAD_TIME_S = Seconds.of(Hours(24));

/** A wall clock before this time is assumed to be unset. */
const EARLIEST_SYNCHRONIZED_TIME_MS = Date.UTC(2025, 0, 1);

/**
 * How long after a re-evaluation that did not take effect the timer re-evaluates again, while a stored entry is due.
 */
const SUGGESTION_RETRY_DELAY = Seconds(10);

/** The state a re-evaluation of the thermostat suggestions wrote. */
interface SuggestionEvaluation {
    thermostatSuggestions: Thermostat.ThermostatSuggestion[];
    currentThermostatSuggestion: Thermostat.ThermostatSuggestion | null;
}

/**
 * The presets an application configured.  `defaultsFor` is the merged view: the endpoint's options with the
 * environment's values applied over them, which is the precedence the framework uses everywhere else.
 */
function configuredPresets(endpoint: Endpoint) {
    return presetsIn(endpoint.behaviors.defaultsFor(ThermostatBaseServer));
}

function presetsIn(values: Record<string, unknown> | undefined) {
    const presets = values?.presets;
    if (!Array.isArray(presets)) {
        return undefined;
    }

    // A type's defaults and an endpoint's options are shared by every endpoint configured from them, and validation
    // assigns handles to the presets it is given in place
    return deepCopy(presets) as Thermostat.Preset[];
}

/**
 * The schedules an application configured.  `defaultsFor` is the merged view: the endpoint's options with the
 * environment's values applied over them, which is the precedence the framework uses everywhere else.
 */
function configuredSchedules(endpoint: Endpoint) {
    return schedulesIn(endpoint.behaviors.defaultsFor(ThermostatBaseServer));
}

function schedulesIn(values: Record<string, unknown> | undefined) {
    const schedules = values?.schedules;
    if (!Array.isArray(schedules)) {
        return undefined;
    }

    // A type's defaults and an endpoint's options are shared by every endpoint configured from them, and validation
    // assigns handles to the schedules it is given in place
    return deepCopy(schedules) as Thermostat.Schedule[];
}

// Enable some features we need for implementation, they will be reset at the end again
const ThermostatBehaviorLogicBase = ThermostatBehavior.with(
    Thermostat.Feature.Heating,
    Thermostat.Feature.Cooling,
    Thermostat.Feature.Occupancy,
    Thermostat.Feature.AutoMode,
    Thermostat.Feature.Presets,
    Thermostat.Feature.MatterScheduleConfiguration,
    Thermostat.Feature.Events,
    Thermostat.Feature.ThermostatSuggestions,
);

// Enhance Schema to define conformance for some of the additional state attributes
const schema = ThermostatBehaviorLogicBase.schema.extend({
    children: [
        FieldElement({
            name: "PersistedPresets",
            type: "list",
            conformance: "[PRES]",
            quality: "N",
            children: [FieldElement({ name: "entry", type: "PresetStruct" })],
        }),
        FieldElement({
            name: "PersistedSchedules",
            type: "list",
            conformance: "[MSCH]",
            quality: "N",
            children: [FieldElement({ name: "entry", type: "ScheduleStruct" })],
        }),
        FieldElement({ name: "OverriddenSuggestionId", type: "uint8", conformance: "[TSUGGEST]", quality: "N" }),
    ],
});

/**
 * This is the default server implementation of {@link ThermostatBehavior}.
 *
 * The Matter specification requires the Thermostat cluster to support features we do not enable by default. You should
 * use {@link ThermostatServer.with} to specialize the class for the features your implementation supports.
 * We implement all features beside the following:
 * * ScheduleConfiguration: removed from the Matter specification; enabling it throws an ImplementationError.
 * * Setback: This feature is considered deprecated.
 * * The use of the "setpointHoldExpiryTimestamp" attribute is currently not supported.
 *
 * MatterScheduleConfiguration is implemented but not released yet. Enable it with the "thermostat-msch" forward feature
 * (see {@link Specification.isForwardFeatureEnabled}) for certification purposes only.
 *
 * Events is implemented but provisional in the Matter specification. Enable it with the "thermostat-events" forward
 * feature for certification purposes only. The server generates an event only when the Events feature is
 * selected and the event exists on {@link ThermostatBaseServer.Events}. The event exists when its feature conformance
 * holds (for example Occupancy for OccupancyChange) and the application enabled it with {@link ThermostatServer.enable},
 * because provisional events are optional. With the AutoMode feature the Events feature makes the
 * ThermostatRunningMode attribute mandatory. Events are generated after the change is committed:
 * * SetpointChange carries the Occupancy field only when the Occupancy feature is supported
 * * ActivePresetChange and ActiveScheduleChange are generated for every change of the handle, including changes made
 *   by the application
 * * LocalTemperatureChange is generated for significant changes only, see the state field
 *   localTemperatureChangeThreshold, and at most once per 60 seconds
 * * RunningStateChange follows the ThermostatRunningState attribute, which the application maintains
 *
 * Values that change while the node starts generate events too, for example LocalTemperatureChange when the first
 * measurement replaces null, or ActivePresetChange when initialization clears a handle that matches no preset.
 *
 * ThermostatSuggestions is implemented with these defaults, each of which an application can replace:
 * * hasSynchronizedTime: the UTCTime of a TimeSynchronization cluster on the node, otherwise the host clock, once it
 *   reads 2025 or later
 * * selectThermostatSuggestion: the entry with the earliest EffectiveTime, like the CHIP reference thermostat
 * * suggestionNotFollowingReason: OngoingHold while TemperatureSetpointHold is SetpointHoldOn
 *
 * Following a suggestion activates its preset through handleSetActivePresetRequest and moves the setpoints to the
 * preset's values itself.  It does not call setActivePresetRequest, so overriding setActivePresetRequest does not change
 * following.  Any other change of ActivePresetHandle while a suggestion is current overrides the suggestion:
 * SetActivePresetRequest by a client or the application, also during a hold, and a client or application setpoint write
 * that leaves the preset while the thermostat does not report OngoingHold.  A setpoint write in the transaction that
 * ends a hold is such an override too, so the written setpoint stays.  After a SetActivePresetRequest the preset the
 * client or application chose stays active; after a setpoint write ActivePresetHandle is null.
 * ThermostatSuggestionNotFollowingReason is 0 once no other reason applies.  A setpoint write while OngoingHold is
 * reported belongs to the hold and is no override, so the thermostat follows the suggestion again when the hold ends.
 * The override ends when ActivePresetHandle returns to the suggestion's preset or another entry or no entry becomes
 * current while the time is synchronized.  The override is stored, so after a restart it stays in effect while its
 * entry is still current.  Call reevaluateThermostatSuggestions when state the server does not observe changes.
 *
 * This implementation mainly provides all validation and base logic required by the Matter specification.
 * It implements some thermostat logic, partially beyond Matter specification definition, notably:
 * * Adjust the setpoints when a preset is activated
 * If this behavior is not desired, you can override the setActivePresetRequest method but should call
 * handleSetActivePresetRequest() to ensure compliance with the specification.
 *
 * For MatterScheduleConfiguration, setActiveScheduleRequest only records the requested ScheduleHandle; it does not
 * evaluate the schedule's transitions against wall-clock time to drive setpoints. An application that runs schedules
 * implements:
 * * time synchronization, which the feature requires (§ 4.3.4.2)
 * * selecting the active transition by local time, including earlier days and daylight saving changes (§ 4.3.10.26.5)
 * * applying a transition's preset (setting ActivePresetHandle) or setpoints, and the Occupied/Unoccupied setpoint
 *   with the Occupancy feature (§ 4.3.10.27)
 * * reporting setpoint changes it makes with SetpointChangeSource "Schedule"
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
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.3.13
 */
export class ThermostatBaseServer extends ThermostatBehaviorLogicBase {
    declare protected internal: ThermostatBaseServer.Internal;
    declare readonly state: ThermostatBaseServer.State;
    declare readonly events: ThermostatBaseServer.Events;
    static override readonly schema = schema;

    override async initialize() {
        if (this.features.scheduleConfiguration) {
            throw new ImplementationError(
                "ScheduleConfiguration feature was removed from the Matter specification and cannot be enabled",
            );
        }
        if (this.features.setback) {
            throw new ImplementationError("Setback feature is deprecated and not allowed to be enabled");
        }
        if (this.features.matterScheduleConfiguration && !Specification.isForwardFeatureEnabled("thermostat-msch")) {
            throw new ImplementationError(
                `MatterScheduleConfiguration feature is not released yet. Enable it with the "thermostat-msch" forward feature for certification purposes only`,
            );
        }
        if (this.features.events && !Specification.isForwardFeatureEnabled("thermostat-events")) {
            throw new ImplementationError(
                `Events feature is provisional in the Matter specification. Enable it with the "thermostat-events" forward feature for certification purposes only`,
            );
        }
        if (!this.features.presets && !this.features.matterScheduleConfiguration) {
            this.atomicRequest = Behavior.unimplemented;
        }

        // Add this check because we currently do not have a max in Schema and might have old invalid max values
        if (this.state.minSetpointDeadBand > 127) {
            this.state.minSetpointDeadBand = 20;
        }
        if (this.state.minSetpointDeadBand < 0 || this.state.minSetpointDeadBand > 127) {
            throw new ImplementationError("minSetpointDeadBand is out of valid range 0..127");
        }

        // We store these values internally because we need to restore them after any write try; the setpoint
        // and schedule validation reads the deadband from here
        this.internal.minSetpointDeadBand = this.state.minSetpointDeadBand;
        this.internal.controlSequenceOfOperation = this.state.controlSequenceOfOperation;

        if (this.features.presets) {
            if (this.state.persistedPresets === undefined) {
                // A behavior type carries its own configured value, which reaches neither of the endpoint's channels
                this.state.persistedPresets = configuredPresets(this.endpoint) ?? presetsIn(this.type.defaults) ?? [];
            } else {
                this.state.numberOfPresets = this.#limitCoveringStored(
                    "NumberOfPresets",
                    this.state.numberOfPresets,
                    this.state.persistedPresets.length,
                    `${this.state.persistedPresets.length} presets are stored`,
                );
            }

            const { activePresetHandle } = this.state;
            if (
                activePresetHandle !== null &&
                !this.state.persistedPresets?.some(
                    preset => preset.presetHandle !== null && Bytes.areEqual(preset.presetHandle, activePresetHandle),
                )
            ) {
                logger.warn(
                    `ActivePresetHandle ${Bytes.toHex(activePresetHandle)} matches no preset, reporting no active preset`,
                );
                this.state.activePresetHandle = null;
            }
        }

        if (this.features.matterScheduleConfiguration) {
            this.#assertScheduleTypes();

            if (this.state.persistedSchedules === undefined) {
                // A behavior type carries its own configured value, which reaches neither of the endpoint's channels
                const configured = configuredSchedules(this.endpoint) ?? schedulesIn(this.type.defaults) ?? [];

                // Every later write resends the whole list, so a configured schedule the rules refuse would block them
                // all
                try {
                    this.#validateScheduleWriteRequest(configured, configured, new Set());
                } catch (error) {
                    throw new ImplementationError(`Configured schedules are invalid: ${asError(error).message}`);
                }
                this.state.persistedSchedules = configured;
            } else {
                const stored = this.state.persistedSchedules;
                this.state.numberOfSchedules = this.#limitCoveringStored(
                    "NumberOfSchedules",
                    this.state.numberOfSchedules,
                    stored.length,
                    `${stored.length} schedules are stored`,
                );
                const transitions = Math.max(0, ...stored.map(schedule => schedule.transitions.length));
                this.state.numberOfScheduleTransitions = this.#limitCoveringStored(
                    "NumberOfScheduleTransitions",
                    this.state.numberOfScheduleTransitions,
                    transitions,
                    `a stored schedule has ${transitions} transitions`,
                );
            }

            const { activeScheduleHandle } = this.state;
            if (
                activeScheduleHandle !== null &&
                !this.state.persistedSchedules?.some(
                    schedule =>
                        schedule.scheduleHandle !== null &&
                        Bytes.areEqual(schedule.scheduleHandle, activeScheduleHandle),
                )
            ) {
                logger.warn(
                    `ActiveScheduleHandle ${Bytes.toHex(activeScheduleHandle)} matches no schedule, reporting no active schedule`,
                );
                this.state.activeScheduleHandle = null;
            }
        }

        // Initialize all the validation and logic handling
        this.#setupValidations();
        this.#setupModeHandling();
        this.#setupThermostatLogic();
        this.#setupPresets();
        this.#setupSchedules();
        this.#setupSuggestions();
        this.#setupEvents();

        const node = Node.forEndpoint(this.endpoint);
        this.reactTo(node.lifecycle.online, this.#nodeOnline);
        if (node.lifecycle.isOnline) {
            this.#nodeOnline();
        }
    }

    /**
     * The value for a limit attribute that the stored list does not exceed.  A configuration that lowers a limit below
     * what clients already stored would otherwise fail the limit's schema constraint, and the endpoint would not start.
     *
     * The stored entries stay.  Only limits with a schema constraint are raised; the per-type limits of PresetTypes and
     * ScheduleTypes and NumberOfScheduleTransitionPerDay keep their configured value, so a client that resends the
     * stored list unchanged may be refused until it removes entries.
     */
    #limitCoveringStored(name: string, limit: number, required: number, found: string) {
        if (required <= limit) {
            return limit;
        }
        logger.notice(`${name} of ${this.endpoint} is ${limit} but ${found}; raising ${name} to ${required}`);
        return required;
    }

    #nodeOnline() {
        // TODO Also react to structure changes to add/remove endpoints that are being added or removed but might be used
        //  for temperature or occupancy sensing
        this.#setupTemperatureMeasurementIntegration();
        this.#setupOccupancyIntegration();

        if (this.features.thermostatSuggestions) {
            this.#setupSuggestionTimeSource();
            this.#reevaluateSuggestions();
        }
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

        if (mode === Thermostat.SetpointRaiseLowerMode.Both) {
            if (this.features.heating && this.features.cooling) {
                let desiredCoolingSetpoint = this.coolingSetpoint + amount;
                const coolLimit = desiredCoolingSetpoint - this.#clampSetpointToLimits("Cool", desiredCoolingSetpoint);
                let desiredHeatingSetpoint = this.heatingSetpoint + amount;
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
                this.coolingSetpoint = desiredCoolingSetpoint;
                this.heatingSetpoint = desiredHeatingSetpoint;
            } else if (this.features.cooling) {
                this.coolingSetpoint = this.#clampSetpointToLimits("Cool", this.coolingSetpoint + amount);
            } else {
                this.heatingSetpoint = this.#clampSetpointToLimits("Heat", this.heatingSetpoint + amount);
            }
            return;
        }

        if (mode === Thermostat.SetpointRaiseLowerMode.Cool) {
            const desiredCoolingSetpoint = this.#clampSetpointToLimits("Cool", this.coolingSetpoint + amount);
            if (this.features.autoMode) {
                let heatingSetpoint = this.heatingSetpoint;
                if (desiredCoolingSetpoint - heatingSetpoint < this.setpointDeadBand) {
                    // We are limited by the Heating Setpoint
                    heatingSetpoint = desiredCoolingSetpoint - this.setpointDeadBand;
                    if (heatingSetpoint === this.#clampSetpointToLimits("Heat", heatingSetpoint)) {
                        // Desired cooling setpoint is enforceable
                        // Set the new cooling and heating setpoints
                        this.heatingSetpoint = heatingSetpoint;
                    } else {
                        throw new StatusResponse.InvalidCommandError(
                            "Could Not adjust heating setpoint to maintain dead band!",
                        );
                    }
                }
            }
            this.coolingSetpoint = desiredCoolingSetpoint;
            return;
        }

        if (mode === Thermostat.SetpointRaiseLowerMode.Heat) {
            const desiredHeatingSetpoint = this.#clampSetpointToLimits("Heat", this.heatingSetpoint + amount);
            if (this.features.autoMode) {
                let coolingSetpoint = this.coolingSetpoint;
                if (coolingSetpoint - desiredHeatingSetpoint < this.setpointDeadBand) {
                    // We are limited by the Cooling Setpoint
                    coolingSetpoint = desiredHeatingSetpoint + this.setpointDeadBand;
                    if (coolingSetpoint === this.#clampSetpointToLimits("Cool", coolingSetpoint)) {
                        // Desired cooling setpoint is enforceable
                        // Set the new cooling and heating setpoints
                        this.coolingSetpoint = coolingSetpoint;
                    } else {
                        throw new StatusResponse.InvalidCommandError(
                            "Could Not adjust cooling setpoint to maintain dead band!",
                        );
                    }
                }
            }
            this.heatingSetpoint = desiredHeatingSetpoint;
            return;
        }

        throw new StatusResponse.InvalidCommandError(`Unsupported SetpointRaiseLowerMode ${mode}`);
    }

    /**
     * Performs basic validation and sets the active preset handle when valid.
     * This fulfills the basic requirements of the SetActivePresetRequest matter command. Use this method if you need
     * to override setActivePresetRequest to ensure compliance.
     *
     * Override without `protected`: the {@link ThermostatBaseServer.ExtensionInterface} makes it public on the server
     * types derived with `with()`.
     *
     * Following a suggestion calls this method as the local actor, so an application's override of it also runs when the
     * thermostat follows a suggestion.
     *
     * Setpoint changes in the same transaction keep the preset active, so the caller may move the setpoints to the
     * preset's values afterwards.  This includes setpoint writes after the activation in the same transaction, because
     * the setpoint reactions run at pre-commit.  Outside of such a transaction and of commands, a client or application
     * write of a setpoint of the current occupancy clears ActivePresetHandle.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.3.2
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
        logger.debug(`Setting active preset handle to`, presetHandle);
        this.state.activePresetHandle = presetHandle;
        this.#noteActivatesPreset(this.context);

        return preset;
    }

    /**
     * This default implementation of the SetActivePresetRequest command handler sets the active preset and
     * (additionally to specification requirements!) adjusts the setpoints to the preset values if defined.
     *
     * If you do not want this behavior, you can override this method but should call handleSetActivePresetRequest to
     * ensure compliance with the specification.
     *
     * Following a thermostat suggestion does not call this method; see {@link handleSetActivePresetRequest}.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.3.2
     */
    override setActivePresetRequest({ presetHandle }: Thermostat.SetActivePresetRequest) {
        this.#applyPresetSetpoints(this.handleSetActivePresetRequest({ presetHandle }));
    }

    /** Moves the setpoints of the current occupancy to the values of `preset`, within the setpoint limits. */
    #applyPresetSetpoints(preset: Thermostat.Preset | undefined) {
        if (preset === undefined) {
            return;
        }
        const { heatingSetpoint, coolingSetpoint } = preset;
        if (this.features.heating && heatingSetpoint !== null && heatingSetpoint !== undefined) {
            this.heatingSetpoint = this.#clampSetpointToLimits("Heat", heatingSetpoint);
        }
        if (this.features.cooling && coolingSetpoint !== null && coolingSetpoint !== undefined) {
            this.coolingSetpoint = this.#clampSetpointToLimits("Cool", coolingSetpoint);
        }
    }

    /**
     * Performs basic validation and sets the active schedule handle when valid.
     * This fulfills the basic requirements of the SetActiveScheduleRequest matter command. Use this method if you need
     * to override setActiveScheduleRequest to ensure compliance.
     *
     * Override without `protected`: the {@link ThermostatBaseServer.ExtensionInterface} makes it public on the server
     * types derived with `with()`.
     *
     * Setpoints stay unchanged, because the setpoint a schedule asks for depends on the current day and time, which
     * this default implementation does not evaluate (see the class documentation).
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.2
     */
    protected handleSetActiveScheduleRequest({ scheduleHandle }: Thermostat.SetActiveScheduleRequest) {
        const schedule = this.state.persistedSchedules?.find(
            s => s.scheduleHandle !== null && Bytes.areEqual(s.scheduleHandle, scheduleHandle),
        );
        if (schedule === undefined) {
            throw new StatusResponse.InvalidCommandError("Requested ScheduleHandle not found");
        }
        logger.debug(`Setting active schedule handle to`, scheduleHandle);
        this.state.activeScheduleHandle = scheduleHandle;
    }

    /**
     * This default implementation of the SetActiveScheduleRequest command handler sets the active schedule handle.
     *
     * If you want to also adjust setpoints based on the schedule's transitions (which requires evaluating them
     * against the current day/time), override this method but should call handleSetActiveScheduleRequest to ensure
     * compliance with the specification.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.2
     */
    override setActiveScheduleRequest(request: Thermostat.SetActiveScheduleRequest) {
        this.handleSetActiveScheduleRequest(request);
    }

    /**
     * Adds a thermostat suggestion and re-evaluates the current suggestion.
     *
     * The command fields' constraints (PresetHandle length, ExpirationInMinutes range) are checked before this runs.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.4.4
     */
    override addThermostatSuggestion({
        presetHandle,
        effectiveTime,
        expirationInMinutes,
    }: Thermostat.AddThermostatSuggestionRequest): Thermostat.AddThermostatSuggestionResponse {
        if (!this.hasSynchronizedTime()) {
            throw new StatusResponse.InvalidInStateError("The time of the thermostat is not synchronized");
        }
        if (this.#presetFor(presetHandle) === undefined) {
            throw new StatusResponse.NotFoundError(`No preset with presetHandle ${Bytes.toHex(presetHandle)}`);
        }
        const suggestions = this.state.thermostatSuggestions;
        if (suggestions.length >= this.state.maxThermostatSuggestions) {
            throw new StatusResponse.ResourceExhaustedError(
                `ThermostatSuggestions holds the maximum of ${this.state.maxThermostatSuggestions} entries`,
            );
        }
        const now = Timestamp.toSeconds(Time.nowMs);
        if (effectiveTime !== null && effectiveTime > now + MAX_SUGGESTION_LEAD_TIME_S) {
            throw new StatusResponse.InvalidCommandError(
                `EffectiveTime ${effectiveTime} is more than 24 hours after the current time ${now}`,
            );
        }

        const uniqueId = this.#nextSuggestionUniqueId(suggestions);
        const effective = effectiveTime ?? now;
        this.state.thermostatSuggestions = [
            ...suggestions,
            { uniqueId, presetHandle, effectiveTime: effective, expirationTime: effective + expirationInMinutes * 60 },
        ];

        this.#reevaluateSuggestions();
        return { uniqueId };
    }

    /**
     * Removes a thermostat suggestion and re-evaluates the current suggestion.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.12.6.2
     */
    override removeThermostatSuggestion({ uniqueId }: Thermostat.RemoveThermostatSuggestionRequest) {
        const suggestions = this.state.thermostatSuggestions;
        if (!suggestions.some(suggestion => suggestion.uniqueId === uniqueId)) {
            throw new StatusResponse.NotFoundError(`No thermostat suggestion with UniqueID ${uniqueId}`);
        }
        this.state.thermostatSuggestions = suggestions.filter(suggestion => suggestion.uniqueId !== uniqueId);
        this.#reevaluateSuggestions();
    }

    /**
     * Re-evaluates the current thermostat suggestion and restarts the timer for the next EffectiveTime or ExpirationTime
     * once the transaction commits or rolls back.  The server does this by itself:
     * * at initialization, when it seeds the presets or removes stored entries that name no preset
     * * when the node goes online, and when the endpoint is initialized on a node that is online
     * * when ThermostatSuggestions, the presets or TemperatureSetpointHold change, in the same transaction
     * * when a change of ActivePresetHandle starts or ends an override, in the same transaction
     * * when the timer expires
     * * when the UTCTime of a TimeSynchronization cluster on the node changes
     *
     * Call this when anything else changes that the protected suggestion methods depend on, for example when the wall
     * clock steps or your {@link hasSynchronizedTime} changes.
     *
     * @throws ImplementationError when the ThermostatSuggestions feature is not supported
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.7
     */
    reevaluateThermostatSuggestions() {
        if (!this.features.thermostatSuggestions) {
            throw new ImplementationError(`The ThermostatSuggestions feature is not supported by ${this.endpoint}`);
        }
        this.#reevaluateSuggestions();
    }

    /**
     * Whether the thermostat has its time synchronized.  Without synchronized time AddThermostatSuggestion fails with
     * INVALID_IN_STATE and there is no current thermostat suggestion.
     *
     * The default uses the TimeSynchronization cluster on the node when there is one: the time is synchronized while
     * its UTCTime is not null.  Without that cluster the host clock is trusted once it reads 2025 or later.  Either
     * way the host clock ({@link Time.nowMs}) is the time that EffectiveTime and ExpirationTime are compared with.
     *
     * Override this to use your own time source, and call {@link reevaluateThermostatSuggestions} when its state
     * changes.
     *
     * Override without `protected`: the {@link ThermostatBaseServer.ExtensionInterface} makes it public on the server
     * types derived with `with()`.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.4.3
     */
    protected hasSynchronizedTime(): boolean {
        const node = Node.forEndpoint(this.endpoint);
        if (node.behaviors.has(TimeSynchronizationBehavior)) {
            return node.stateOf(TimeSynchronizationBehavior).utcTime !== null;
        }
        return Time.nowMs >= EARLIEST_SYNCHRONIZED_TIME_MS;
    }

    /**
     * Chooses the current thermostat suggestion from the entries whose EffectiveTime is not later than now.
     * `candidates` is never empty.
     *
     * The default chooses the entry with the earliest EffectiveTime, and of those the first in ThermostatSuggestions,
     * like the CHIP reference thermostat (§ 4.3.8 step 4 names the most recent entry instead).  The guidelines of
     * § 4.3.8 are recommendations; override this to implement them or another policy.
     *
     * Override without `protected`: the {@link ThermostatBaseServer.ExtensionInterface} makes it public on the server
     * types derived with `with()`.
     *
     * Return undefined when the entries conflict and none can be chosen.  The thermostat then follows no suggestion,
     * sets CurrentThermostatSuggestion to null and ThermostatSuggestionNotFollowingReason to ConflictingSuggestions, as
     * § 4.3.8 step 7 requires.  Note that § 4.3.11.56 asks for a null reason whenever CurrentThermostatSuggestion is
     * null, which contradicts step 7.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.8
     */
    protected selectThermostatSuggestion(
        candidates: Thermostat.ThermostatSuggestion[],
    ): Thermostat.ThermostatSuggestion | undefined {
        return candidates.reduce((earliest, candidate) =>
            candidate.effectiveTime < earliest.effectiveTime ? candidate : earliest,
        );
    }

    /**
     * The reasons the thermostat does not follow the current thermostat suggestion, or null to follow it.
     *
     * The default reports OngoingHold while TemperatureSetpointHold is SetpointHoldOn.  Override this to report other
     * reasons, such as a demand response event, and call {@link reevaluateThermostatSuggestions} when they change.  A
     * value with no bit set reports a reason that has no bit of its own.
     *
     * Override without `protected`: the {@link ThermostatBaseServer.ExtensionInterface} makes it public on the server
     * types derived with `with()`.
     *
     * A client or application setpoint write that leaves the active preset while the reason has the OngoingHold bit
     * belongs to the hold and does not override the suggestion.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.11.56
     */
    protected suggestionNotFollowingReason(
        _suggestion: Thermostat.ThermostatSuggestion,
    ): Thermostat.ThermostatSuggestionNotFollowingReason | null {
        if (this.state.temperatureSetpointHold === Thermostat.TemperatureSetpointHold.SetpointHoldOn) {
            return { ongoingHold: true };
        }
        return null;
    }

    /** Determines if the given context is from a command */
    #isCommandContext(context: ActionContext) {
        return "command" in context && context.command;
    }

    /**
     * Clears ActivePresetHandle when a client or the application writes a setpoint of the current occupancy directly.
     * A command, and every transaction that activates a preset, sets the setpoints on purpose and keeps the preset.  A
     * setpoint that only moves to keep the limits or the deadband keeps the preset too.
     */
    #leavePresetOnSetpointWrite(
        attribute: `${"occupied" | "unoccupied"}${"Heating" | "Cooling"}Setpoint`,
        setpoint: number,
        context: ActionContext,
    ) {
        const { transaction } = context;
        if (
            !this.features.presets ||
            this.state.activePresetHandle === null ||
            this.occupied !== attribute.startsWith("occupied") ||
            this.#isCommandContext(context) ||
            this.internal.presetActivations.has(transaction) ||
            this.internal.reconciledSetpoints.get(transaction)?.get(attribute) === setpoint
        ) {
            return;
        }
        this.agent.asLocalActor(() => {
            this.state.activePresetHandle = null;
        });
        this.#noteTransaction(this.internal.setpointWritesLeavingPreset, context);
    }

    /**
     * Whether a setpoint of the current occupancy differs from its committed value in the current transaction, other
     * than by a preset activation or by reconciliation.  The setpoint reactions may not have run yet, so this compares
     * the values themselves.
     */
    #setpointChangedInTransaction() {
        const { transaction } = this.context;
        if (this.internal.presetActivations.has(transaction)) {
            return false;
        }
        const committed = this.endpoint.stateOf(this.type.id);
        const reconciled = this.internal.reconciledSetpoints.get(transaction);
        const occupancy = this.occupied ? "occupied" : "unoccupied";
        return (["Heating", "Cooling"] as const).some(kind => {
            const attribute = `${occupancy}${kind}Setpoint` as const;
            const setpoint = this.state[attribute];
            return setpoint !== committed[attribute] && reconciled?.get(attribute) !== setpoint;
        });
    }

    /** Records that the transaction in context activates a preset, until the transaction commits or rolls back. */
    #noteActivatesPreset(context: ActionContext) {
        this.#noteTransaction(this.internal.presetActivations, context);
    }

    /** Adds the transaction in context to `transactions` until the transaction commits or rolls back. */
    #noteTransaction(transactions: WeakSet<Transaction>, { transaction }: ActionContext) {
        if (transactions.has(transaction)) {
            return;
        }
        transactions.add(transaction);
        transaction.onShared(() => transactions.delete(transaction), true);
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

    protected set heatingSetpoint(value: number) {
        if (this.occupied) {
            this.state.occupiedHeatingSetpoint = value;
        } else {
            this.state.unoccupiedHeatingSetpoint = value;
        }
    }

    /** The current cooling setpoint depending on occupancy */
    protected get coolingSetpoint() {
        if (this.occupied) {
            return this.state.occupiedCoolingSetpoint;
        }
        return this.state.unoccupiedCoolingSetpoint;
    }

    protected set coolingSetpoint(value: number) {
        if (this.occupied) {
            this.state.occupiedCoolingSetpoint = value;
        } else {
            this.state.unoccupiedCoolingSetpoint = value;
        }
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
                //this.agent.asLocalActor(() => {
                //    this.state.setpointHoldExpiryTimestamp = null;
                //});
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
        this.agent.asLocalActor(() => {
            this.state.thermostatRunningMode = newState;
        });
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
        const localTempEndpoint = this.state.localIndoorTemperatureMeasurementEndpoint;
        if (!preferRemoteTemperature && localTempEndpoint !== undefined) {
            const endpoints = this.env.get(ServerNode).endpoints;
            const endpoint = endpoints.has(localTempEndpoint) ? endpoints.for(localTempEndpoint) : undefined;
            if (endpoint !== undefined && endpoint.behaviors.has(TemperatureMeasurementServer)) {
                logger.debug(
                    `Using existing TemperatureMeasurement cluster on endpoint #${localTempEndpoint} for local temperature measurement`,
                );
                if (this.state.externalMeasuredIndoorTemperature !== undefined) {
                    logger.warn(
                        "Both local TemperatureMeasurement cluster and externalMeasuredIndoorTemperature state are set, using local cluster",
                    );
                }
                this.reactTo(
                    endpoint.eventsOf(TemperatureMeasurementServer).measuredValue$Changed,
                    this.#handleMeasuredTemperatureChange,
                );
                localTemperature = endpoint.stateOf(TemperatureMeasurementServer).measuredValue;
            } else {
                logger.warn(
                    `No TemperatureMeasurement cluster found on endpoint #${localTempEndpoint}, falling back to externalMeasuredIndoorTemperature state if set`,
                );
            }
        } else {
            if (this.state.externalMeasuredIndoorTemperature === undefined) {
                if (this.state.localTemperatureCalibration !== undefined) {
                    logger.warn(
                        "No local TemperatureMeasurement cluster available, externalMeasuredIndoorTemperature state not set but localTemperatureCalibration is used: Ensure to correctly consider the calibration when updating the localTemperature value",
                    );
                }
            } else {
                logger.info("Using measured temperature via externalMeasuredIndoorTemperature state");
                localTemperature = this.state.externalMeasuredIndoorTemperature ?? null;
            }
            this.reactTo(this.events.externalMeasuredIndoorTemperature$Changed, this.#handleMeasuredTemperatureChange);
        }
        if (localTemperature !== null) {
            this.#handleMeasuredTemperatureChange(localTemperature); // and initialize
        }
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
        let currentOccupancy = true;
        const preferRemoteOccupancy = !!this.state.remoteSensing?.occupancy;
        const localOccupancyEndpoint = this.state.localOccupancyMeasurementEndpoint;
        if (!preferRemoteOccupancy && localOccupancyEndpoint !== undefined) {
            const endpoints = this.env.get(ServerNode).endpoints;
            const endpoint = endpoints.has(localOccupancyEndpoint) ? endpoints.for(localOccupancyEndpoint) : undefined;
            if (endpoint !== undefined && endpoint.behaviors.has(OccupancySensingServer)) {
                logger.debug(
                    `Using existing OccupancySensing cluster on endpoint ${localOccupancyEndpoint} for local occupancy sensing`,
                );
                if (this.state.externallyMeasuredOccupancy !== undefined) {
                    logger.warn(
                        "Both local OccupancySensing cluster and externallyMeasuredOccupancy state are set, using local cluster",
                    );
                }
                this.reactTo(endpoint.eventsOf(OccupancySensingServer).occupancy$Changed, this.#handleOccupancyChange);
                currentOccupancy = !!endpoint.stateOf(OccupancySensingServer).occupancy.occupied;
            } else {
                logger.warn(
                    `No OccupancySensing cluster found on endpoint ${localOccupancyEndpoint}, falling back to externallyMeasuredOccupancy state if set`,
                );
            }
        } else {
            if (this.state.externallyMeasuredOccupancy === undefined) {
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

    #handleOccupancyChange(newValue: OccupancySensing.Occupancy) {
        this.state.occupancy = newValue;
    }

    /** Setup all validations for the Thermostat behavior */
    #setupValidations() {
        this.#reconcileInitialSetpoints();

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

        // For backwards compatibility, this attribute is optionally writeable. However, any
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

    #assertRemoteSensingChanging(remoteSensing: Thermostat.RemoteSensing) {
        if (this.features.localTemperatureNotExposed && remoteSensing.localTemperature) {
            throw new StatusResponse.ConstraintErrorError(
                "LocalTemperature is not exposed, so RemoteSensing cannot be set to LocalTemperature",
            );
        }
    }

    #assertUnoccupiedCoolingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        const direct = !this.#isCommandContext(context);
        if (direct) {
            this.#assertSetpointWithinLimits("Cool", "Unoccupied", setpoint);
        }
        this.#reconcileSetpoints(new Set(["unoccupiedCoolingSetpoint"]));
        this.#leavePresetOnSetpointWrite("unoccupiedCoolingSetpoint", setpoint, context);
    }

    #assertUnoccupiedHeatingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        const direct = !this.#isCommandContext(context);
        if (direct) {
            this.#assertSetpointWithinLimits("Heat", "Unoccupied", setpoint);
        }
        this.#reconcileSetpoints(new Set(["unoccupiedHeatingSetpoint"]));
        this.#leavePresetOnSetpointWrite("unoccupiedHeatingSetpoint", setpoint, context);
    }

    #assertAbsMaxCoolSetpointLimitChanging(absMax: number) {
        this.#assertUserSetpointLimits("Cool", { absMax });
    }

    #assertMaxCoolSetpointLimitChanging(max: number) {
        this.#assertLimitWithinAbs("Cool", max);
        this.#reconcileSetpoints(new Set(["maxCoolSetpointLimit"]));
    }

    #assertMinCoolSetpointLimitChanging(min: number) {
        this.#assertLimitWithinAbs("Cool", min);
        this.#reconcileSetpoints(new Set(["minCoolSetpointLimit"]));
    }

    #assertAbsMinCoolSetpointLimitChanging(absMin: number) {
        this.#assertUserSetpointLimits("Cool", { absMin });
    }

    #assertAbsMaxHeatSetpointLimitChanging(absMax: number) {
        this.#assertUserSetpointLimits("Heat", { absMax });
    }

    #assertMaxHeatSetpointLimitChanging(max: number) {
        this.#assertLimitWithinAbs("Heat", max);
        this.#reconcileSetpoints(new Set(["maxHeatSetpointLimit"]));
    }

    #assertMinHeatSetpointLimitChanging(min: number) {
        this.#assertLimitWithinAbs("Heat", min);
        this.#reconcileSetpoints(new Set(["minHeatSetpointLimit"]));
    }

    #assertAbsMinHeatSetpointLimitChanging(absMin: number) {
        this.#assertUserSetpointLimits("Heat", { absMin });
    }

    #assertOccupiedCoolingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        const direct = !this.#isCommandContext(context);
        if (direct) {
            this.#assertSetpointWithinLimits("Cool", "Occupied", setpoint);
        }
        this.#reconcileSetpoints(new Set(["occupiedCoolingSetpoint"]));
        this.#leavePresetOnSetpointWrite("occupiedCoolingSetpoint", setpoint, context);
    }

    #assertOccupiedHeatingSetpointChanging(setpoint: number, _old: number, context: ActionContext) {
        const direct = !this.#isCommandContext(context);
        if (direct) {
            this.#assertSetpointWithinLimits("Heat", "Occupied", setpoint);
        }
        this.#reconcileSetpoints(new Set(["occupiedHeatingSetpoint"]));
        this.#leavePresetOnSetpointWrite("occupiedHeatingSetpoint", setpoint, context);
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
     * Used to validate generically that user configurable limits must be within device limits as follows:
     * * AbsMinHeatSetpointLimit <= MinHeatSetpointLimit <= MaxHeatSetpointLimit <= AbsMaxHeatSetpointLimit
     * * AbsMinCoolSetpointLimit <= MinCoolSetpointLimit <= MaxCoolSetpointLimit <= AbsMaxCoolSetpointLimit
     * Absolute limits not provided are taken from the state; an unset user limit defaults to its absolute limit.
     */
    #assertUserSetpointLimits(scope: "Heat" | "Cool", details: { absMin?: number; absMax?: number }) {
        const abs = this.#absLimits(scope);
        const { absMin = abs.min, absMax = abs.max } = details;
        const min = this.state[`min${scope}SetpointLimit`] ?? absMin;
        const max = this.state[`max${scope}SetpointLimit`] ?? absMax;
        logger.debug(
            `Validating user setpoint limits for ${scope}: absMin=${absMin}, min=${min}, max=${max}, absMax=${absMax}`,
        );
        if (absMin > min) {
            throw new StatusResponse.ConstraintErrorError(
                `absMin${scope}SetpointLimit (${absMin}) must be less than or equal to min${scope}SetpointLimit (${min})`,
            );
        }
        if (min > max) {
            throw new StatusResponse.ConstraintErrorError(
                `min${scope}SetpointLimit (${min}) must be less than or equal to max${scope}SetpointLimit (${max})`,
            );
        }
        if (max > absMax) {
            throw new StatusResponse.ConstraintErrorError(
                `max${scope}SetpointLimit (${max}) must be less than or equal to absMax${scope}SetpointLimit (${absMax})`,
            );
        }
    }

    get heatSetpointMinimum() {
        return Math.max(this.#userLimit("Heat", "min"), this.#absLimits("Heat").min);
    }

    get heatSetpointMaximum() {
        return Math.min(this.#userLimit("Heat", "max"), this.#absLimits("Heat").max);
    }

    get coolSetpointMinimum() {
        return Math.max(this.#userLimit("Cool", "min"), this.#absLimits("Cool").min);
    }

    get coolSetpointMaximum() {
        return Math.min(this.#userLimit("Cool", "max"), this.#absLimits("Cool").max);
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
     * A written user setpoint limit outside its own mode's absolute range is a hard CONSTRAINT_ERROR (CHIP
     * `ChangeLimits`); everything else is accepted and reconciled.
     */
    #assertLimitWithinAbs(scope: "Heat" | "Cool", value: number) {
        const abs = this.#absLimits(scope);
        if (value < abs.min || value > abs.max) {
            throw new StatusResponse.ConstraintErrorError(
                `${scope}SetpointLimit (${value}) must be within absolute limits [${abs.min}, ${abs.max}]`,
            );
        }
    }

    /** Absolute [min, max] for a mode, falling back to the Matter defaults when unset. */
    #absLimits(scope: "Heat" | "Cool") {
        const defaults = scope === "Heat" ? this.#heatDefaults : this.#coolDefaults;
        return {
            min: this.state[`absMin${scope}SetpointLimit`] ?? defaults.absMin,
            max: this.state[`absMax${scope}SetpointLimit`] ?? defaults.absMax,
        };
    }

    /** Effective user limit: the override if set, else the corresponding absolute bound (CHIP OptionalSetpoint). */
    #userLimit(scope: "Heat" | "Cool", bound: "min" | "max") {
        const abs = this.#absLimits(scope);
        return this.state[`${bound}${scope}SetpointLimit`] ?? (bound === "min" ? abs.min : abs.max);
    }

    /**
     * Mirror of CHIP `Setpoints::Valid()`: the invariant that {@link #reconcileSetpoints} and
     * {@link #reconcileInitialSetpoints} restore. Checks, per supported mode, that absolute and user limits are ordered
     * and nested and that setpoints sit within the user limits; and, with AutoMode, that heat/cool limits and setpoints
     * maintain the deadband.
     *
     * @returns a description of the first violated condition, or `undefined` if all hold
     */
    #setpointViolation(): string | undefined {
        const dead = this.setpointDeadBand;
        for (const scope of ["Heat", "Cool"] as const) {
            if (scope === "Heat" ? !this.features.heating : !this.features.cooling) {
                continue;
            }
            const abs = this.#absLimits(scope);
            if (abs.min > abs.max) {
                return `absMin${scope}SetpointLimit (${abs.min}) is above absMax${scope}SetpointLimit (${abs.max})`;
            }
            const min = this.#userLimit(scope, "min");
            const max = this.#userLimit(scope, "max");
            if (min > max || min < abs.min || max > abs.max) {
                return `${scope} setpoint limits [${min}, ${max}] are not ordered within absolute limits [${abs.min}, ${abs.max}]`;
            }
            for (const type of ["occupied", "unoccupied"] as const) {
                if (type === "unoccupied" && !this.features.occupancy) {
                    continue;
                }
                const key = `${type}${scope}ingSetpoint` as const;
                const value = this.state[key];
                if (value !== undefined && (value < min || value > max)) {
                    return `${key} (${value}) is outside ${scope} setpoint limits [${min}, ${max}]`;
                }
            }
        }
        if (this.features.autoMode) {
            for (const bound of ["max", "min"] as const) {
                const heat = this.#userLimit("Heat", bound);
                const cool = this.#userLimit("Cool", bound);
                if (cool - heat < dead) {
                    return `${bound}CoolSetpointLimit (${cool}) - ${bound}HeatSetpointLimit (${heat}) is below the deadband (${dead})`;
                }
            }
            for (const type of ["occupied", "unoccupied"] as const) {
                if (type === "unoccupied" && !this.features.occupancy) {
                    continue;
                }
                const heat = this.state[`${type}HeatingSetpoint`];
                const cool = this.state[`${type}CoolingSetpoint`];
                if (heat !== undefined && cool !== undefined && cool - heat < dead) {
                    return `${type}CoolingSetpoint (${cool}) - ${type}HeatingSetpoint (${heat}) is below the deadband (${dead})`;
                }
            }
        }
    }

    /**
     * Single-pass reconciliation of the setpoint/limit invariants after a write, mirroring CHIP `Setpoints::Fix()`
     * (Thermostat cluster spec §4.3.11.15-18): user-limit ordering, then AutoMode limit deadband, then setpoint range
     * and deadband. Adjustments move the coupled (unwritten) value; when they cannot be resolved within the absolute
     * bounds the state stays invalid and CONSTRAINT_ERROR is raised. `changed` holds the state key(s) the client
     * touched so the reconciliation preserves the client's intent and moves the other side.
     */
    #reconcileSetpoints(changed: Set<string>) {
        const violation = this.#setpointViolation();
        if (violation === undefined) {
            return;
        }
        const before = this.#effectiveSetpoints();
        this.#fixSetpoints(changed);
        this.#noteReconciledSetpoints(before);
        const remaining = this.#setpointViolation();
        if (remaining !== undefined) {
            throw new StatusResponse.ConstraintErrorError(
                `Thermostat setpoints could not be reconciled within the configured limits: ${violation}; after adjusting, ${remaining}`,
            );
        }
    }

    /**
     * Records the values reconciliation set in the current transaction, until it commits or rolls back.  A setpoint
     * that changes to such a value keeps the active preset.
     */
    #noteReconciledSetpoints(before: Record<string, number | undefined>) {
        const { transaction } = this.context;
        const { reconciledSetpoints } = this.internal;
        let reconciled = reconciledSetpoints.get(transaction);
        for (const [key, value] of Object.entries(this.#effectiveSetpoints())) {
            if (value === undefined || value === before[key]) {
                continue;
            }
            if (reconciled === undefined) {
                reconciled = new Map();
                reconciledSetpoints.set(transaction, reconciled);
                transaction.onShared(() => reconciledSetpoints.delete(transaction), true);
            }
            reconciled.set(key, value);
        }
    }

    /**
     * Reconciles configured or persisted state that violates the setpoint invariants, preferring the heating side (the
     * cooling side without Heating): the other side moves first, and the preferred side is pulled back only where the
     * other would leave its absolute limits. Unordered user limits are ordered by raising the max limit. Without this,
     * every later setpoint write fails because a setpoint write never moves a limit.
     */
    #reconcileInitialSetpoints() {
        const violation = this.#setpointViolation();
        if (violation === undefined) {
            return;
        }
        const before = this.#effectiveSetpoints();
        const kept = this.features.heating ? "Heat" : "Cool";
        this.#fixSetpoints(
            new Set([
                `min${kept}SetpointLimit`,
                `max${kept}SetpointLimit`,
                `occupied${kept}ingSetpoint`,
                `unoccupied${kept}ingSetpoint`,
                "minCoolSetpointLimit",
            ]),
        );
        const remaining = this.#setpointViolation();
        if (remaining !== undefined) {
            throw new ImplementationError(
                `Thermostat setpoint configuration cannot be fixed: ${violation}; after adjusting, ${remaining}`,
            );
        }
        const after = this.#effectiveSetpoints();
        const adjusted = Object.entries(after).flatMap(([key, value]) =>
            value === before[key] ? [] : [`${key} ${before[key]} -> ${value}`],
        );
        logger.warn(`Thermostat setpoint configuration is invalid (${violation}), adjusted ${adjusted.join(", ")}`);
    }

    /** User limits (unset ones at their absolute fallback) and setpoints, for reporting adjustments. */
    #effectiveSetpoints(): Record<string, number | undefined> {
        return {
            minHeatSetpointLimit: this.#userLimit("Heat", "min"),
            maxHeatSetpointLimit: this.#userLimit("Heat", "max"),
            minCoolSetpointLimit: this.#userLimit("Cool", "min"),
            maxCoolSetpointLimit: this.#userLimit("Cool", "max"),
            occupiedHeatingSetpoint: this.state.occupiedHeatingSetpoint,
            occupiedCoolingSetpoint: this.state.occupiedCoolingSetpoint,
            unoccupiedHeatingSetpoint: this.state.unoccupiedHeatingSetpoint,
            unoccupiedCoolingSetpoint: this.state.unoccupiedCoolingSetpoint,
        };
    }

    #fixSetpoints(changed: Set<string>) {
        if (this.features.heating) {
            this.#fixUserLimits("Heat", changed);
        }
        if (this.features.cooling) {
            this.#fixUserLimits("Cool", changed);
        }
        if (this.features.autoMode) {
            this.#fixLimitDeadband("max", changed);
            this.#fixLimitDeadband("min", changed);
        }
        this.#fixSetpointRange("occupied", changed);
        if (this.features.occupancy) {
            this.#fixSetpointRange("unoccupied", changed);
        }
    }

    /** CHIP `FixUserLimits`: pull user limits inside the absolute range, then repair min <= max ordering. */
    #fixUserLimits(scope: "Heat" | "Cool", changed: Set<string>) {
        const abs = this.#absLimits(scope);
        if (abs.min > abs.max) {
            return;
        }
        const minKey = `min${scope}SetpointLimit` as const;
        const maxKey = `max${scope}SetpointLimit` as const;
        const min = this.state[minKey];
        if (min !== undefined && (min < abs.min || min > abs.max)) {
            this.state[minKey] = abs.min;
        }
        const max = this.state[maxKey];
        if (max !== undefined && (max < abs.min || max > abs.max)) {
            this.state[maxKey] = abs.max;
        }
        if (this.#userLimit(scope, "min") > this.#userLimit(scope, "max")) {
            if (changed.has(minKey) && this.state[maxKey] !== undefined) {
                this.state[maxKey] = this.#userLimit(scope, "min");
            } else if (changed.has(maxKey) && this.state[minKey] !== undefined) {
                this.state[minKey] = this.#userLimit(scope, "max");
            }
        }
    }

    /**
     * CHIP `FixUserLimitDeadband`: restore `cool - heat >= deadband` for a limit pair by moving the coupled
     * (unwritten) mode's limit; if that would leave the coupled mode's absolute range, pin it to the bound and pull
     * the written mode's limit back instead.
     */
    #fixLimitDeadband(bound: "min" | "max", changed: Set<string>) {
        const dead = this.setpointDeadBand;
        const heat = this.#userLimit("Heat", bound);
        const cool = this.#userLimit("Cool", bound);
        if (cool - heat >= dead) {
            return;
        }
        const heatKey = `${bound}HeatSetpointLimit` as const;
        const coolKey = `${bound}CoolSetpointLimit` as const;
        const absCool = this.#absLimits("Cool");
        const absHeat = this.#absLimits("Heat");
        if (changed.has("minHeatSetpointLimit") || changed.has("maxHeatSetpointLimit")) {
            const newCool = heat + dead;
            if (newCool >= absCool.min && newCool <= absCool.max) {
                this.state[coolKey] = newCool;
            } else {
                const pinned = bound === "min" ? absCool.min : absCool.max;
                this.state[coolKey] = pinned;
                this.state[heatKey] = pinned - dead;
            }
        } else if (changed.has("minCoolSetpointLimit") || changed.has("maxCoolSetpointLimit")) {
            const newHeat = cool - dead;
            if (newHeat >= absHeat.min && newHeat <= absHeat.max) {
                this.state[heatKey] = newHeat;
            } else {
                const pinned = bound === "min" ? absHeat.min : absHeat.max;
                this.state[heatKey] = pinned;
                this.state[coolKey] = pinned + dead;
            }
        }
    }

    /**
     * CHIP `FixRange`: clamp a setpoint range back inside the (possibly changed) user limits, then restore the
     * AutoMode setpoint deadband by moving the coupled setpoint; if that leaves the user limits, pin it to the user
     * limit and pull the touched setpoint back instead.
     */
    #fixSetpointRange(type: "occupied" | "unoccupied", changed: Set<string>) {
        const dead = this.setpointDeadBand;
        const heatKey = `${type}HeatingSetpoint` as const;
        const coolKey = `${type}CoolingSetpoint` as const;
        const uHeatMin = this.#userLimit("Heat", "min");
        const uHeatMax = this.#userLimit("Heat", "max");
        const uCoolMin = this.#userLimit("Cool", "min");
        const uCoolMax = this.#userLimit("Cool", "max");

        if (this.features.heating && this.state[heatKey] !== undefined) {
            this.state[heatKey] = cropValueRange(this.state[heatKey], uHeatMin, uHeatMax);
        }
        if (this.features.cooling && this.state[coolKey] !== undefined) {
            this.state[coolKey] = cropValueRange(this.state[coolKey], uCoolMin, uCoolMax);
        }

        if (!this.features.autoMode) {
            return;
        }
        const heat = this.state[heatKey];
        const cool = this.state[coolKey];
        if (heat === undefined || cool === undefined || cool - heat >= dead) {
            return;
        }
        if (changed.has(heatKey) || changed.has("minHeatSetpointLimit") || changed.has("maxHeatSetpointLimit")) {
            const newCool = heat + dead;
            if (newCool >= uCoolMin && newCool <= uCoolMax) {
                this.state[coolKey] = newCool;
            } else {
                this.state[coolKey] = uCoolMax;
                this.state[heatKey] = uCoolMax - dead;
            }
        } else if (changed.has(coolKey) || changed.has("minCoolSetpointLimit") || changed.has("maxCoolSetpointLimit")) {
            const newHeat = cool - dead;
            if (newHeat >= uHeatMin && newHeat <= uHeatMax) {
                this.state[heatKey] = newHeat;
            } else {
                this.state[heatKey] = uHeatMin;
                this.state[coolKey] = uHeatMin + dead;
            }
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
            this.agent.asLocalActor(() => {
                if (newMode === Thermostat.SystemMode.Off) {
                    this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Off;
                } else if (newMode === Thermostat.SystemMode.Heat) {
                    this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Heat;
                } else if (newMode === Thermostat.SystemMode.Cool) {
                    this.state.thermostatRunningMode = Thermostat.ThermostatRunningMode.Cool;
                }
            });
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
        if (temperature === null) {
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
        this.reactTo(this.events.presets$AtomicChanging, this.#handlePresetsAtomicChanging);
        this.reactTo(this.events.presets$AtomicChanged, this.#handlePresetsAtomicChanged);
        this.reactTo(this.events.persistedPresets$Changing, this.#handlePersistedPresetsChanging);
        this.reactTo(this.events.persistedPresets$Changed, this.#handlePersistedPresetsChanged);
    }

    /**
     * A staged atomic write is validated against the stored presets, which it has not replaced yet.
     */
    #handlePresetsAtomicChanging(newPresets: Thermostat.Preset[], _oldPresets: unknown, context: ActionContext) {
        this.#validatePresetWriteRequest(newPresets, this.state.persistedPresets, this.#presetsIn(context).handles);
    }

    /**
     * A stored write is already applied when validation runs, so the presets it replaces are the baseline.
     *
     * Pre-commit announces the presets again after any change in flight, with the previous announcement as
     * `oldPresets`.  Every announcement is therefore validated against the presets the first announcement of the
     * transaction replaces.
     *
     * Once initialized, the presets stay stored: a transaction that leaves `persistedPresets` undefined fails with an
     * {@link ImplementationError}.
     */
    #handlePersistedPresetsChanging(
        newPresets: Thermostat.Preset[] | undefined,
        oldPresets: Thermostat.Preset[] | undefined,
        context: ActionContext,
    ) {
        if (newPresets === undefined) {
            throw new ImplementationError(
                `Cannot clear persistedPresets of ${this.endpoint}; store an empty list to remove all presets`,
            );
        }

        const presets = this.#presetsIn(context);
        presets.stored ??= { presets: oldPresets };
        const storedPresets = presets.stored.presets;

        this.#validatePresetWriteRequest(newPresets, storedPresets, presets.handles);
        const presetHandles = this.#normalizePresets(newPresets, storedPresets, presets.handles);
        this.#validatePresetCommit(newPresets, storedPresets);
        if (this.features.thermostatSuggestions) {
            this.#reevaluateOnPresetsChange(presetHandles);
        }

        if (!presets.validatesOnceSettled) {
            context.transaction.addParticipants({
                toString: () => `presets of ${this.endpoint}`,
                settled: () => this.#assertSettledPresetsCarryHandles(),
            });
            presets.validatesOnceSettled = true;
        }
    }

    /**
     * A null handle is only valid in the write that arrives; the device issues one before the value commits.
     */
    #assertSettledPresetsCarryHandles() {
        for (const preset of this.state.persistedPresets ?? []) {
            if (preset.presetHandle == null) {
                throw new StatusResponse.ConstraintErrorError(
                    `Preset for scenario ${Thermostat.PresetScenario[preset.presetScenario]} of ${this.endpoint} carries no presetHandle`,
                );
            }
        }
    }

    /**
     * What this behavior did to the presets of the transaction in context.
     *
     * `handles` are the ones this device issued.  Normalization mutates the value in flight, so pre-commit announces
     * the presets again, and an atomic write stores what it staged; both carry handles the stored presets do not carry.
     * Every announcement is still validated - the handles are what the client did not supply.
     *
     * `stored` holds the presets the transaction replaces, as the first announcement reports them.  Later announcements
     * report the value in flight as the old value instead.  `stored` wraps the presets because they are undefined
     * while the behavior seeds them, and that first announcement still counts as recorded.
     *
     * `validatesOnceSettled` records that the transaction will check the settled presets.  An observer that puts back
     * exactly the value it was handed leaves pre-commit nothing to announce, so a revert of the handle this device
     * just issued would otherwise reach the store unvalidated; the settled phase is the one place that sees the final
     * presets with nothing written yet.
     */
    #presetsIn({ transaction }: ActionContext) {
        let presets = this.internal.presetTransactions.get(transaction);

        if (presets === undefined) {
            presets = { handles: new Set<string>() };
            this.internal.presetTransactions.set(transaction, presets);

            transaction.onShared(() => this.internal.presetTransactions.delete(transaction), true);
        }

        return presets;
    }

    /**
     * Validates presets a client wants to store against the presets they replace.
     */
    #validatePresetWriteRequest(
        newPresets: Thermostat.Preset[],
        oldPresets: Thermostat.Preset[] | undefined,
        issuedHandles: ReadonlySet<string>,
    ) {
        const oldPresetsMap = new Map<string, Thermostat.Preset>();
        if (oldPresets !== undefined) {
            for (const preset of oldPresets) {
                if (preset.presetHandle !== null) {
                    oldPresetsMap.set(Bytes.toHex(preset.presetHandle), preset);
                }
            }
        }

        const presetTypeMap = new Map<Thermostat.PresetScenario, Thermostat.PresetType>();
        for (const type of this.state.presetTypes) {
            presetTypeMap.set(type.presetScenario, type);
        }

        const presetScenarioNames = new Map<Thermostat.PresetScenario, (string | null)[]>();
        const presetScenarioCounts = new Map<Thermostat.PresetScenario, number>();
        const newPresetsSet = new Set<string>();
        for (const [index, preset] of newPresets.entries()) {
            // Name is optional, so an atomic write's decoded payload omits it where a stored write's managed value
            // reads it as its schema fallback of null
            const name = preset.name ?? null;

            if (preset.presetHandle !== null) {
                const presetHex = Bytes.toHex(preset.presetHandle);
                if (newPresetsSet.has(presetHex)) {
                    throw new StatusResponse.ConstraintErrorError(`Duplicate presetHandle ${presetHex} in new Presets`);
                }

                const oldPreset = oldPresetsMap.get(presetHex);
                if (oldPreset === undefined) {
                    if (oldPresets === undefined) {
                        // Initial seeding, where the application states the presets the device ships with
                    } else if (!issuedHandles.has(presetHex)) {
                        throw new StatusResponse.NotFoundError(
                            `Preset with presetHandle ${presetHex} does not exist in old Presets, cannot add new Presets with non-null presetHandle`,
                        );
                    } else if (preset.builtIn) {
                        // The handle is one this write asked for, so the preset is an addition whatever it now carries
                        throw new StatusResponse.ConstraintErrorError(`Can not add a new built-in preset`);
                    }
                } else if (preset.builtIn !== null && oldPreset.builtIn !== preset.builtIn) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Cannot change built-in status of preset with presetHandle ${presetHex}`,
                    );
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

            if (name !== null && !presetType.presetTypeFeatures.supportsNames) {
                throw new StatusResponse.ConstraintErrorError(
                    `Preset names are not supported for scenario ${Thermostat.PresetScenario[preset.presetScenario]}`,
                );
            }

            // The write rules check each appended preset in order: its handle, scenario and name, then both counts
            if (index + 1 > this.state.numberOfPresets) {
                throw new StatusResponse.ResourceExhaustedError(
                    `Number of presets (${newPresets.length}) exceeds NumberOfPresets (${this.state.numberOfPresets})`,
                );
            }

            const count = presetScenarioCounts.get(preset.presetScenario) ?? 0;
            if (count === presetType.numberOfPresets) {
                throw new StatusResponse.ResourceExhaustedError(
                    `Number of presets (${count + 1}) for scenario ${Thermostat.PresetScenario[preset.presetScenario]} exceeds allowed number (${presetType.numberOfPresets})`,
                );
            }
            presetScenarioCounts.set(preset.presetScenario, count + 1);

            const scenarioNames = presetScenarioNames.get(preset.presetScenario) ?? [];

            // The specification counts null - "no name" - as a value that may not repeat within a scenario
            if (scenarioNames.includes(name)) {
                throw new StatusResponse.ConstraintErrorError(
                    `Duplicate preset name ${JSON.stringify(name)} for scenario ${Thermostat.PresetScenario[preset.presetScenario]}`,
                );
            }
            scenarioNames.push(name);
            presetScenarioNames.set(preset.presetScenario, scenarioNames);

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
        }
    }

    /**
     * Refuses a commit that removes a built-in preset or the active preset, once every attribute of the atomic write is
     * staged, so the failure names the presets attribute.  The staged value is a copy the store does not keep, so it is
     * checked, not normalized; pre-commit normalizes the stored value.
     */
    #handlePresetsAtomicChanged(newPresets: Thermostat.Preset[], oldPresets: Thermostat.Preset[] | undefined) {
        this.#validatePresetCommit(newPresets, oldPresets);
    }

    /**
     * `Presets` is computed on read, so no `presets$Changed` event fires for it; react to `persistedPresets$Changed` to
     * observe preset changes inside the device.
     */
    #handlePersistedPresetsChanged() {
        this.markChanged("presets");
    }

    /**
     * Assigns a handle to any preset lacking one and resolves a null `builtIn` from the stored preset with that handle.
     * Normalizes in place: the report that follows reads the presets back through the attribute's accessor.
     *
     * @returns the hex handles of all presets
     */
    #normalizePresets(
        newPresets: Thermostat.Preset[],
        oldPresets: Thermostat.Preset[] | undefined,
        issuedHandles: Set<string>,
    ) {
        const entropy = this.endpoint.env.get(Entropy);

        const presetHandles = new Set<string>();
        for (const preset of newPresets) {
            if (preset.presetHandle == null) {
                logger.debug("Preset is missing presetHandle, generating a new one");
                preset.presetHandle = entropy.randomBytes(16);
                issuedHandles.add(Bytes.toHex(preset.presetHandle));
            }
            presetHandles.add(Bytes.toHex(preset.presetHandle));
            if (preset.builtIn === null) {
                const { presetHandle } = preset;
                const oldPreset = oldPresets?.find(
                    p => p.presetHandle !== null && Bytes.areEqual(p.presetHandle, presetHandle),
                );
                preset.builtIn = oldPreset?.builtIn ?? false;
            }
        }
        return presetHandles;
    }

    /**
     * Refuses presets that drop a built-in preset or the active preset.  Checks handles only, so it needs no
     * normalization: {@link #validatePresetWriteRequest} already refused a preset whose `builtIn` differs from the
     * stored one, and a preset without a handle is new.
     */
    #validatePresetCommit(newPresets: Thermostat.Preset[], oldPresets: Thermostat.Preset[] | undefined) {
        const newPresetHandles = new Set<string>();
        for (const { presetHandle } of newPresets) {
            if (presetHandle != null) {
                newPresetHandles.add(Bytes.toHex(presetHandle));
            }
        }

        for (const { presetHandle, builtIn } of oldPresets ?? []) {
            if (builtIn && presetHandle !== null && !newPresetHandles.has(Bytes.toHex(presetHandle))) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot remove built-in preset with presetHandle ${Bytes.toHex(presetHandle)}`,
                );
            }
        }

        // § 4.3.11.50 names only transition references; a schedule-level reference is refused too, as CHIP does, so no
        // stored PresetHandle names a missing preset
        if (this.features.matterScheduleConfiguration) {
            for (const schedule of this.state.persistedSchedules ?? []) {
                if (schedule.presetHandle && !newPresetHandles.has(Bytes.toHex(schedule.presetHandle))) {
                    throw new StatusResponse.InvalidInStateError(
                        `Cannot remove preset referenced by schedule ${Bytes.toHex(schedule.scheduleHandle!)}`,
                    );
                }
                for (const transition of schedule.transitions) {
                    if (transition.presetHandle && !newPresetHandles.has(Bytes.toHex(transition.presetHandle))) {
                        throw new StatusResponse.InvalidInStateError(
                            `Cannot remove preset referenced by a transition of schedule ${Bytes.toHex(schedule.scheduleHandle!)}`,
                        );
                    }
                }
            }
        }

        // The specification refuses the removal of the active preset, not a handle that named no preset to begin with
        const { activePresetHandle } = this.state;
        if (
            activePresetHandle !== null &&
            !newPresetHandles.has(Bytes.toHex(activePresetHandle)) &&
            oldPresets?.some(
                preset => preset.presetHandle !== null && Bytes.areEqual(preset.presetHandle, activePresetHandle),
            )
        ) {
            throw new StatusResponse.InvalidInStateError(
                `Cannot remove preset ${Bytes.toHex(activePresetHandle)} while it is the active preset`,
            );
        }
    }

    /**
     * Generates the Thermostat events from committed attribute changes.  Events record at once when emitted, so they
     * are never emitted from a write site that could still roll back.
     */
    #setupEvents() {
        const { events } = this;

        const systemModeChange = events.systemModeChange;
        if (systemModeChange) {
            this.reactTo(
                events.systemMode$Changed,
                function (this: ThermostatBaseServer, currentSystemMode, previousSystemMode) {
                    systemModeChange.emit({ previousSystemMode, currentSystemMode }, this.context);
                },
            );
        }

        const occupancyChange = events.occupancyChange;
        if (occupancyChange) {
            this.reactTo(events.occupancy$Changed, function (this: ThermostatBaseServer, currentOccupancy, previous) {
                occupancyChange.emit({ previousOccupancy: previous, currentOccupancy }, this.context);
            });
        }

        const runningModeChange = events.runningModeChange;
        if (runningModeChange) {
            this.maybeReactTo(
                events.thermostatRunningMode$Changed,
                function (this: ThermostatBaseServer, currentRunningMode, previousRunningMode) {
                    runningModeChange.emit({ previousRunningMode, currentRunningMode }, this.context);
                },
            );
        }

        const runningStateChange = events.runningStateChange;
        if (runningStateChange) {
            this.maybeReactTo(
                events.thermostatRunningState$Changed,
                function (this: ThermostatBaseServer, currentRunningState, previousRunningState) {
                    runningStateChange.emit({ previousRunningState, currentRunningState }, this.context);
                },
            );
        }

        const activePresetChange = events.activePresetChange;
        if (activePresetChange) {
            this.reactTo(
                events.activePresetHandle$Changed,
                function (this: ThermostatBaseServer, currentPresetHandle, previousPresetHandle) {
                    activePresetChange.emit({ previousPresetHandle, currentPresetHandle }, this.context);
                },
            );
        }

        const activeScheduleChange = events.activeScheduleChange;
        if (activeScheduleChange) {
            this.reactTo(
                events.activeScheduleHandle$Changed,
                function (this: ThermostatBaseServer, currentScheduleHandle, previousScheduleHandle) {
                    activeScheduleChange.emit({ previousScheduleHandle, currentScheduleHandle }, this.context);
                },
            );
        }

        this.#setupSetpointChange();
        this.#setupLocalTemperatureChange();
    }

    #setupSetpointChange() {
        const setpointChange = this.events.setpointChange;
        if (!setpointChange) {
            return;
        }

        const { events, features } = this;
        const emitChange = (
            systemMode: Thermostat.SystemMode,
            occupied: boolean,
            currentSetpoint: number,
            previousSetpoint: number | undefined,
            context: ActionContext,
        ) => {
            setpointChange.emit(
                {
                    systemMode,
                    occupancy: features.occupancy ? { occupied } : undefined,
                    previousSetpoint,
                    currentSetpoint,
                },
                context,
            );
        };

        const { Heat, Cool } = Thermostat.SystemMode;
        this.maybeReactTo(events.occupiedHeatingSetpoint$Changed, function (this: ThermostatBaseServer, value, old) {
            emitChange(Heat, true, value, old, this.context);
        });
        this.maybeReactTo(events.unoccupiedHeatingSetpoint$Changed, function (this: ThermostatBaseServer, value, old) {
            emitChange(Heat, false, value, old, this.context);
        });
        this.maybeReactTo(events.occupiedCoolingSetpoint$Changed, function (this: ThermostatBaseServer, value, old) {
            emitChange(Cool, true, value, old, this.context);
        });
        this.maybeReactTo(events.unoccupiedCoolingSetpoint$Changed, function (this: ThermostatBaseServer, value, old) {
            emitChange(Cool, false, value, old, this.context);
        });
    }

    #setupLocalTemperatureChange() {
        if (!this.events.localTemperatureChange) {
            return;
        }

        this.#assertLocalTemperatureChangeThreshold(this.state.localTemperatureChangeThreshold);
        this.reactTo(this.events.localTemperatureChangeThreshold$Changing, this.#assertLocalTemperatureChangeThreshold);

        this.internal.lastReportedLocalTemperature = this.state.localTemperature;
        this.reactTo(this.events.localTemperature$Changed, this.#handleLocalTemperatureChange);
    }

    #assertLocalTemperatureChangeThreshold(threshold: number) {
        if (!Number.isFinite(threshold) || threshold <= 0) {
            throw new ImplementationError(
                `localTemperatureChangeThreshold of ${this.endpoint} is ${threshold} but must be a finite number greater than 0`,
            );
        }
    }

    /**
     * Reports a significant change at once, or at the end of the {@link LOCAL_TEMPERATURE_CHANGE_INTERVAL} after the
     * last report.  A pending report stops when the value moves back to one that is not significant.  The timer runs
     * this decision again when it expires because it may expire up to one millisecond early.
     */
    #handleLocalTemperatureChange(localTemperature: number | null) {
        const { internal } = this;
        internal.localTemperatureChangeTimer?.stop();
        if (!this.#isSignificantLocalTemperatureChange(localTemperature)) {
            return;
        }

        const { lastLocalTemperatureReportAt } = internal;
        const elapsed =
            lastLocalTemperatureReportAt === undefined
                ? LOCAL_TEMPERATURE_CHANGE_INTERVAL
                : Timestamp.delta(lastLocalTemperatureReportAt, Time.nowUs);
        if (elapsed >= LOCAL_TEMPERATURE_CHANGE_INTERVAL) {
            this.#reportLocalTemperatureChange(localTemperature);
            return;
        }

        internal.localTemperatureChangeTimer = this.reactorTimer(
            "Thermostat LocalTemperatureChange",
            Millis(LOCAL_TEMPERATURE_CHANGE_INTERVAL - elapsed),
            this.#handlePendingLocalTemperatureChange,
        ).start();
    }

    #handlePendingLocalTemperatureChange() {
        this.#handleLocalTemperatureChange(this.state.localTemperature);
    }

    #reportLocalTemperatureChange(currentLocalTemperature: number | null) {
        this.internal.lastReportedLocalTemperature = currentLocalTemperature;
        this.internal.lastLocalTemperatureReportAt = Time.nowUs;
        this.events.localTemperatureChange?.emit({ currentLocalTemperature }, this.context);
    }

    /**
     * A change is significant when the value switches between null and not null, or when it differs from the last
     * reported value by at least the localTemperatureChangeThreshold.
     */
    #isSignificantLocalTemperatureChange(localTemperature: number | null) {
        const reported = this.internal.lastReportedLocalTemperature;
        if (localTemperature === null || reported === null) {
            return localTemperature !== reported;
        }
        return Math.abs(localTemperature - reported) >= this.state.localTemperatureChangeThreshold;
    }

    #setupSuggestions() {
        if (!this.features.thermostatSuggestions) {
            return;
        }

        const max = this.state.maxThermostatSuggestions;
        if (max < MIN_THERMOSTAT_SUGGESTIONS) {
            throw new ImplementationError(
                `MaxThermostatSuggestions of ${this.endpoint} is ${max} but must be at least ${MIN_THERMOSTAT_SUGGESTIONS}`,
            );
        }

        const stored = this.state.thermostatSuggestions;
        const suggestions = stored.filter(({ presetHandle }) => this.#presetFor(presetHandle) !== undefined);
        if (suggestions.length !== stored.length) {
            logger.notice(
                `Removing ${stored.length - suggestions.length} thermostat suggestions of ${this.endpoint} that name no preset`,
            );
            this.state.thermostatSuggestions = suggestions;
        }
        this.state.maxThermostatSuggestions = this.#limitCoveringStored(
            "MaxThermostatSuggestions",
            max,
            suggestions.length,
            `${suggestions.length} thermostat suggestions are stored`,
        );
        this.internal.lastSuggestionUniqueId = Math.max(0, ...suggestions.map(({ uniqueId }) => uniqueId));
        this.internal.restartSuggestionTimer = this.callback(this.#restartSuggestionTimer);

        this.reactTo(this.events.thermostatSuggestions$Changing, this.#reevaluateOnSuggestionsChange);
        this.maybeReactTo(this.events.temperatureSetpointHold$Changing, this.#reevaluateSuggestions);
        this.reactTo(this.events.activePresetHandle$Changing, this.#trackOverrideOnPresetChange);
    }

    /** Skips the change that a re-evaluation in the same transaction already covers, such as its own pruning. */
    #reevaluateOnSuggestionsChange(
        suggestions: Thermostat.ThermostatSuggestion[],
        _old: unknown,
        context: ActionContext,
    ) {
        const evaluated = this.internal.suggestionEvaluations.get(context.transaction)?.thermostatSuggestions;
        if (evaluated !== undefined && isDeepEqual(evaluated, suggestions)) {
            return;
        }
        this.#reevaluateSuggestions();
    }

    /**
     * Sets or clears overriddenSuggestionId in the transaction that changes ActivePresetHandle, and re-evaluates when it
     * changes.
     *
     * | ActivePresetHandle changes to                    | overriddenSuggestionId |
     * | ------------------------------------------------ | ---------------------- |
     * | the suggestion's preset                          | cleared                |
     * | another value, by a setpoint write during a hold | unchanged              |
     * | another value, null included, otherwise          | the current UniqueID   |
     *
     * Following only activates the suggestion's preset, so a change to another value comes from a client or the
     * application.  A setpoint write during a hold belongs to the hold, which ends in following the suggestion again.
     * The hold is the OngoingHold bit of the reason the last re-evaluation determined.  While no suggestion is current,
     * the overridden entry takes the place of the suggestion, so returning to its preset ends the override.
     */
    #trackOverrideOnPresetChange(activePresetHandle: Bytes | null, _old: Bytes | null, context: ActionContext) {
        const { state } = this;
        const current =
            state.currentThermostatSuggestion ??
            state.thermostatSuggestions.find(({ uniqueId }) => uniqueId === state.overriddenSuggestionId);
        if (current === undefined) {
            return;
        }
        const matchesSuggestion =
            activePresetHandle !== null && Bytes.areEqual(activePresetHandle, current.presetHandle);
        const belongsToHold =
            state.thermostatSuggestionNotFollowingReason?.ongoingHold === true &&
            this.internal.setpointWritesLeavingPreset.has(context.transaction);
        if (!matchesSuggestion && belongsToHold) {
            return;
        }
        const overriddenSuggestionId = matchesSuggestion ? undefined : current.uniqueId;
        if (state.overriddenSuggestionId === overriddenSuggestionId) {
            return;
        }
        this.agent.asLocalActor(() => {
            state.overriddenSuggestionId = overriddenSuggestionId;
        });
        this.#reevaluateSuggestions();
    }

    /**
     * Re-evaluates when the UTCTime of a TimeSynchronization cluster on the node changes: the default
     * {@link hasSynchronizedTime} follows it, and a new time may pass an EffectiveTime or ExpirationTime.
     */
    #setupSuggestionTimeSource() {
        const node = Node.forEndpoint(this.endpoint);
        if (node.behaviors.has(TimeSynchronizationBehavior)) {
            this.reactTo(node.eventsOf(TimeSynchronizationBehavior).utcTime$Changed, this.#reevaluateSuggestions);
        }
    }

    /**
     * Writes the attributes a re-evaluation determines as a local actor, because the server, not the client whose
     * change triggered it, changes them.  The timer restarts once the transaction commits or rolls back, also when the
     * re-evaluation throws, so it always follows the stored entries.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.7
     */
    #reevaluateSuggestions() {
        const { internal } = this;
        const { transaction } = this.context;
        if (!internal.timerRestarts.has(transaction)) {
            internal.timerRestarts.add(transaction);
            const evaluatedAt = Timestamp.toSeconds(Time.nowMs);
            transaction.onFinalize(() => {
                internal.timerRestarts.delete(transaction);
                const evaluation = internal.suggestionEvaluations.get(transaction);
                internal.suggestionEvaluations.delete(transaction);
                internal.restartSuggestionTimer?.(evaluatedAt, evaluation);
            });
        }

        this.agent.asLocalActor(() => this.#determineCurrentSuggestion());
        const { thermostatSuggestions, currentThermostatSuggestion } = this.state;
        internal.suggestionEvaluations.set(
            transaction,
            deepCopy({ thermostatSuggestions, currentThermostatSuggestion }),
        );
    }

    /**
     * Sets CurrentThermostatSuggestion and ThermostatSuggestionNotFollowingReason, activates the preset of the
     * suggestion the thermostat follows, and removes expired entries.  When there is no current suggestion,
     * ActivePresetHandle stays as it is.
     */
    #determineCurrentSuggestion() {
        const { state } = this;
        if (!this.hasSynchronizedTime()) {
            // Without synchronized time no entry is known to be current, so an override stays until time returns
            state.currentThermostatSuggestion = null;
            state.thermostatSuggestionNotFollowingReason = null;
            return;
        }

        const now = Timestamp.toSeconds(Time.nowMs);
        const suggestions = state.thermostatSuggestions.filter(({ expirationTime }) => expirationTime > now);
        if (suggestions.length !== state.thermostatSuggestions.length) {
            state.thermostatSuggestions = suggestions;
        }

        const candidates = suggestions.filter(({ effectiveTime }) => effectiveTime <= now);
        if (candidates.length === 0) {
            this.#setCurrentSuggestion(null, null);
            return;
        }

        const selected = this.selectThermostatSuggestion(candidates);
        if (selected === undefined) {
            this.#setCurrentSuggestion(null, { conflictingSuggestions: true });
            return;
        }

        const { uniqueId, presetHandle, effectiveTime, expirationTime } = selected;
        const { activePresetHandle } = state;
        const presetActive = activePresetHandle !== null && Bytes.areEqual(activePresetHandle, presetHandle);
        let reason =
            this.suggestionNotFollowingReason(selected) ?? (state.overriddenSuggestionId === uniqueId ? {} : null);
        if (reason === null && !presetActive && this.#setpointChangedInTransaction()) {
            state.overriddenSuggestionId = uniqueId;
            reason = {};
        }
        this.#setCurrentSuggestion({ uniqueId, presetHandle, effectiveTime, expirationTime }, reason);

        if (reason !== null || presetActive) {
            return;
        }
        this.#applyPresetSetpoints(this.handleSetActivePresetRequest({ presetHandle }));
    }

    /**
     * Sets CurrentThermostatSuggestion and its not-following reason, and ends the override when another entry or no
     * entry becomes current.
     */
    #setCurrentSuggestion(
        suggestion: Thermostat.ThermostatSuggestion | null,
        reason: Thermostat.ThermostatSuggestionNotFollowingReason | null,
    ) {
        const { state } = this;
        state.currentThermostatSuggestion = suggestion;
        state.thermostatSuggestionNotFollowingReason = reason;
        if (state.overriddenSuggestionId !== undefined && state.overriddenSuggestionId !== suggestion?.uniqueId) {
            state.overriddenSuggestionId = undefined;
        }
    }

    /**
     * Starts the timer for the earliest EffectiveTime or ExpirationTime of the stored entries after `evaluatedAt`, the
     * UTC time in seconds of the first re-evaluation in the transaction, and stops it without synchronized time.  A
     * time that passed while the transaction ran, also one that rolled back, re-evaluates at once.
     *
     * A time up to `evaluatedAt` is retried after {@link SUGGESTION_RETRY_DELAY} only when the committed state differs
     * from `evaluation`, the state the last re-evaluation in the transaction wrote.  This is the case when the
     * transaction rolled back or the re-evaluation threw.  A re-evaluation that keeps failing therefore repeats at that
     * delay, not at once.
     *
     * The timer runs on the monotonic clock, so call {@link reevaluateThermostatSuggestions} when the wall clock steps.
     */
    #restartSuggestionTimer(evaluatedAt: number, evaluation: SuggestionEvaluation | undefined) {
        const { internal } = this;
        internal.suggestionTimer?.stop();
        internal.suggestionTimer = undefined;
        if (!this.hasSynchronizedTime()) {
            return;
        }

        const { thermostatSuggestions, currentThermostatSuggestion } = this.state;
        const times = thermostatSuggestions.flatMap(({ effectiveTime, expirationTime }) => [
            effectiveTime,
            expirationTime,
        ]);
        const upcoming = times.filter(time => time > evaluatedAt);
        const delays = upcoming.length === 0 ? [] : [Math.max(0, Seconds(Math.min(...upcoming)) - Time.nowMs)];
        const tookEffect =
            evaluation !== undefined && isDeepEqual(evaluation, { thermostatSuggestions, currentThermostatSuggestion });
        if (!tookEffect && upcoming.length < times.length) {
            delays.push(SUGGESTION_RETRY_DELAY);
        }
        if (delays.length === 0) {
            return;
        }
        internal.suggestionTimer = this.reactorTimer(
            "Thermostat suggestion",
            Millis(Math.min(...delays)),
            this.#reevaluateSuggestions,
        ).start();
    }

    /** The UniqueID after the last one issued that no entry carries; the list never holds all 256 values. */
    #nextSuggestionUniqueId(suggestions: Thermostat.ThermostatSuggestion[]) {
        const used = new Set(suggestions.map(({ uniqueId }) => uniqueId));
        let uniqueId = this.internal.lastSuggestionUniqueId;
        do {
            uniqueId = (uniqueId + 1) % 256;
        } while (used.has(uniqueId));
        this.internal.lastSuggestionUniqueId = uniqueId;
        return uniqueId;
    }

    #presetFor(presetHandle: Bytes) {
        return this.state.persistedPresets?.find(
            preset => preset.presetHandle !== null && Bytes.areEqual(preset.presetHandle, presetHandle),
        );
    }

    /**
     * Removes the thermostat suggestions that name a preset the commit removes and re-evaluates, in the committing
     * transaction.  Presets are stored by the device or by an atomic commit command, so the writes need no local actor.
     *
     * @param presetHandles the hex handles of all presets the commit stores
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.11.50
     */
    #reevaluateOnPresetsChange(presetHandles: Set<string>) {
        const { thermostatSuggestions } = this.state;
        const remaining = thermostatSuggestions.filter(({ presetHandle }) =>
            presetHandles.has(Bytes.toHex(presetHandle)),
        );
        if (remaining.length !== thermostatSuggestions.length) {
            this.state.thermostatSuggestions = remaining;
        }
        this.#reevaluateSuggestions();
    }

    #setupSchedules() {
        if (!this.features.matterScheduleConfiguration) {
            return;
        }
        this.reactTo(this.events.schedules$AtomicChanging, this.#handleSchedulesAtomicChanging);
        this.reactTo(this.events.schedules$AtomicChanged, this.#handleSchedulesAtomicChanged);
        this.reactTo(this.events.persistedSchedules$Changing, this.#handlePersistedSchedulesChanging);
        this.reactTo(this.events.persistedSchedules$Changed, this.#handlePersistedSchedulesChanged);
    }

    /**
     * A staged atomic write is validated against the stored schedules, which it has not replaced yet. Its preset
     * references resolve against the presets pending in the same atomic write.
     */
    #handleSchedulesAtomicChanging(
        newSchedules: Thermostat.Schedule[],
        _oldSchedules: unknown,
        context: ActionContext,
    ) {
        this.#validateScheduleWriteRequest(
            newSchedules,
            this.state.persistedSchedules,
            this.#schedulesIn(context).handles,
        );
    }

    /**
     * A stored write is already applied when validation runs, so the schedules it replaces are the baseline.
     *
     * Pre-commit announces the schedules again after any change in flight, with the previous announcement as
     * `oldSchedules`. Every announcement is therefore validated against the schedules the first announcement of the
     * transaction replaces.
     *
     * Once initialized, the schedules stay stored: a transaction that leaves `persistedSchedules` undefined fails with
     * an {@link ImplementationError}.
     */
    #handlePersistedSchedulesChanging(
        newSchedules: Thermostat.Schedule[] | undefined,
        oldSchedules: Thermostat.Schedule[] | undefined,
        context: ActionContext,
    ) {
        if (newSchedules === undefined) {
            throw new ImplementationError(
                `Cannot clear persistedSchedules of ${this.endpoint}; store an empty list to remove all schedules`,
            );
        }

        const schedules = this.#schedulesIn(context);
        schedules.stored ??= { schedules: oldSchedules };
        const storedSchedules = schedules.stored.schedules;

        this.#validateScheduleWriteRequest(newSchedules, storedSchedules, schedules.handles);
        this.#normalizeSchedules(newSchedules, storedSchedules, schedules.handles);
        this.#validateScheduleCommit(newSchedules, storedSchedules);

        if (!schedules.validatesOnceSettled) {
            context.transaction.addParticipants({
                toString: () => `schedules of ${this.endpoint}`,
                settled: () => this.#assertSettledSchedulesCarryHandles(),
            });
            schedules.validatesOnceSettled = true;
        }
    }

    /**
     * A null handle is only valid in the write that arrives; the device issues one before the value commits.
     */
    #assertSettledSchedulesCarryHandles() {
        for (const schedule of this.state.persistedSchedules ?? []) {
            if (schedule.scheduleHandle == null) {
                throw new StatusResponse.ConstraintErrorError(
                    `Schedule for systemMode ${Thermostat.SystemMode[schedule.systemMode]} of ${this.endpoint} carries no scheduleHandle`,
                );
            }
        }
    }

    /**
     * What this behavior did to the schedules of the transaction in context. See #presetsIn for the rationale; the
     * same reasoning applies here.
     */
    #schedulesIn({ transaction }: ActionContext) {
        let schedules = this.internal.scheduleTransactions.get(transaction);

        if (schedules === undefined) {
            schedules = { handles: new Set<string>() };
            this.internal.scheduleTransactions.set(transaction, schedules);

            transaction.onShared(() => this.internal.scheduleTransactions.delete(transaction), true);
        }

        return schedules;
    }

    /**
     * Refuses a ScheduleTypes configuration the schedule rules cannot resolve.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 4.3.10.28, § 4.3.11.43
     */
    #assertScheduleTypes() {
        const modes = new Set<Thermostat.SystemMode>();
        for (const { systemMode, scheduleTypeFeatures } of this.state.scheduleTypes) {
            const mode = Thermostat.SystemMode[systemMode];
            switch (systemMode) {
                case Thermostat.SystemMode.Auto:
                case Thermostat.SystemMode.Heat:
                case Thermostat.SystemMode.Cool:
                    break;
                default:
                    throw new ImplementationError(`ScheduleTypes may only name Auto, Heat or Cool, not ${mode}`);
            }
            if (modes.has(systemMode)) {
                throw new ImplementationError(`ScheduleTypes names systemMode ${mode} more than once`);
            }
            modes.add(systemMode);
            if (!scheduleTypeFeatures.supportsPresets && !scheduleTypeFeatures.supportsSetpoints) {
                throw new ImplementationError(
                    `ScheduleTypes entry for systemMode ${mode} supports neither presets nor setpoints`,
                );
            }
        }
    }

    /**
     * Validates schedules a client wants to store against the schedules they replace.
     */
    #validateScheduleWriteRequest(
        newSchedules: Thermostat.Schedule[],
        oldSchedules: Thermostat.Schedule[] | undefined,
        issuedHandles: ReadonlySet<string>,
    ) {
        const oldSchedulesMap = new Map<string, Thermostat.Schedule>();
        if (oldSchedules !== undefined) {
            for (const schedule of oldSchedules) {
                // Pre-commit announces the schedules again after normalization, so the value this one replaces is the
                // one a client wrote, where a schedule it is adding carries no handle yet
                if (schedule.scheduleHandle !== null) {
                    oldSchedulesMap.set(Bytes.toHex(schedule.scheduleHandle), schedule);
                }
            }
        }

        const scheduleTypeMap = new Map<Thermostat.SystemMode, Thermostat.ScheduleType>();
        for (const type of this.state.scheduleTypes) {
            scheduleTypeMap.set(type.systemMode, type);
        }

        const scheduleModeCounts = new Map<Thermostat.SystemMode, number>();
        const newScheduleHandlesSet = new Set<string>();
        const numberOfScheduleTransitionPerDay = this.state.numberOfScheduleTransitionPerDay;

        for (const schedule of newSchedules) {
            if (schedule.scheduleHandle !== null) {
                const scheduleHex = Bytes.toHex(schedule.scheduleHandle);
                if (newScheduleHandlesSet.has(scheduleHex)) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Duplicate scheduleHandle ${scheduleHex} in new Schedules`,
                    );
                }

                const oldSchedule = oldSchedulesMap.get(scheduleHex);
                if (oldSchedule === undefined) {
                    if (oldSchedules === undefined) {
                        // Initial seeding, where the application states the schedules the device ships with
                    } else if (!issuedHandles.has(scheduleHex)) {
                        throw new StatusResponse.NotFoundError(
                            `Schedule with scheduleHandle ${scheduleHex} does not exist in old Schedules, cannot add new Schedules with non-null scheduleHandle`,
                        );
                    } else if (schedule.builtIn) {
                        // The handle is one this write asked for, so the schedule is an addition whatever it now carries
                        throw new StatusResponse.ConstraintErrorError(`Can not add a new built-in schedule`);
                    }
                } else if (schedule.builtIn !== null && oldSchedule.builtIn !== schedule.builtIn) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Cannot change built-in status of schedule with scheduleHandle ${scheduleHex}`,
                    );
                }

                newScheduleHandlesSet.add(scheduleHex);
            } else if (schedule.builtIn) {
                throw new StatusResponse.ConstraintErrorError(`Can not add a new built-in schedule`);
            }

            const scheduleType = scheduleTypeMap.get(schedule.systemMode);
            if (scheduleType === undefined) {
                throw new StatusResponse.ConstraintErrorError(
                    `No ScheduleType defined for systemMode ${Thermostat.SystemMode[schedule.systemMode]}`,
                );
            }
            const { scheduleTypeFeatures } = scheduleType;

            if (schedule.transitions.length > this.state.numberOfScheduleTransitions) {
                throw new StatusResponse.ResourceExhaustedError(
                    `Number of transitions (${schedule.transitions.length}) exceeds NumberOfScheduleTransitions (${this.state.numberOfScheduleTransitions})`,
                );
            }

            scheduleModeCounts.set(schedule.systemMode, (scheduleModeCounts.get(schedule.systemMode) ?? 0) + 1);

            if (schedule.name !== undefined && !scheduleTypeFeatures.supportsNames) {
                throw new StatusResponse.ConstraintErrorError(
                    `Schedule names are not supported for systemMode ${Thermostat.SystemMode[schedule.systemMode]}`,
                );
            }

            if (schedule.presetHandle !== undefined) {
                if (!scheduleTypeFeatures.supportsPresets) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Presets are not supported for systemMode ${Thermostat.SystemMode[schedule.systemMode]}`,
                    );
                }
                if (
                    !this.state.presets?.some(
                        preset =>
                            preset.presetHandle !== null && Bytes.areEqual(preset.presetHandle, schedule.presetHandle!),
                    )
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Schedule presetHandle ${Bytes.toHex(schedule.presetHandle)} does not match any existing Preset`,
                    );
                }
            }

            this.#validateScheduleTransitions(schedule, scheduleTypeFeatures, numberOfScheduleTransitionPerDay);
        }

        // The count limits apply only after every schedule passed its own checks (§ 4.3.11.51 steps 2 and 3)
        if (newSchedules.length > this.state.numberOfSchedules) {
            throw new StatusResponse.ResourceExhaustedError(
                `Number of schedules (${newSchedules.length}) exceeds NumberOfSchedules (${this.state.numberOfSchedules})`,
            );
        }
        for (const [systemMode, count] of scheduleModeCounts) {
            const allowed = scheduleTypeMap.get(systemMode)?.numberOfSchedules ?? 0;
            if (count > allowed) {
                throw new StatusResponse.ResourceExhaustedError(
                    `Number of schedules (${count}) for systemMode ${Thermostat.SystemMode[systemMode]} exceeds allowed number (${allowed})`,
                );
            }
        }
    }

    /** The (non-Away) days of the week, in the order ScheduleDayOfWeek's bits are enumerated. */
    static readonly #daysOfWeek = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ] as const;

    /**
     * Validates the transitions of a single schedule being written against Sections 4.3.10.26.5, 4.3.10.27 and
     * 4.3.11.51 of the specification. Where the specification is ambiguous or silent, this matches the CHIP reference
     * implementation.
     */
    #validateScheduleTransitions(
        schedule: Thermostat.Schedule,
        scheduleTypeFeatures: Thermostat.ScheduleTypeFeatures,
        numberOfScheduleTransitionPerDay: number | null,
    ) {
        const dayCounts = new Array<number>(ThermostatBaseServer.#daysOfWeek.length).fill(0);
        const { transitions } = schedule;

        for (let i = 0; i < transitions.length; i++) {
            const transition = transitions[i];

            if (transition.dayOfWeek.away) {
                throw new StatusResponse.ConstraintErrorError(
                    "Away/Vacation bit must not be set on a schedule transition's dayOfWeek",
                );
            }
            if (!ThermostatBaseServer.#daysOfWeek.some(day => transition.dayOfWeek[day])) {
                throw new StatusResponse.ConstraintErrorError(
                    "A schedule transition's dayOfWeek must set at least one day",
                );
            }

            for (let j = 0; j < i; j++) {
                const other = transitions[j];
                if (
                    other.transitionTime === transition.transitionTime &&
                    ThermostatBaseServer.#daysOfWeek.some(day => other.dayOfWeek[day] && transition.dayOfWeek[day])
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Duplicate transitions at transitionTime ${transition.transitionTime} for overlapping days of week`,
                    );
                }
            }

            ThermostatBaseServer.#daysOfWeek.forEach((day, index) => {
                if (transition.dayOfWeek[day]) {
                    dayCounts[index]++;
                }
            });

            if (transition.presetHandle !== undefined) {
                if (
                    transition.systemMode !== undefined ||
                    transition.coolingSetpoint !== undefined ||
                    transition.heatingSetpoint !== undefined
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        "A schedule transition with a presetHandle must not also specify systemMode, coolingSetpoint or heatingSetpoint",
                    );
                }
                if (!scheduleTypeFeatures.supportsPresets) {
                    throw new StatusResponse.ConstraintErrorError(
                        "Presets are not supported for this schedule's systemMode",
                    );
                }
                if (
                    !this.state.presets?.some(
                        preset =>
                            preset.presetHandle !== null &&
                            Bytes.areEqual(preset.presetHandle, transition.presetHandle!),
                    )
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Transition presetHandle ${Bytes.toHex(transition.presetHandle)} does not match any existing Preset`,
                    );
                }
            }

            if (
                (transition.systemMode !== undefined ||
                    transition.coolingSetpoint !== undefined ||
                    transition.heatingSetpoint !== undefined) &&
                !scheduleTypeFeatures.supportsSetpoints
            ) {
                throw new StatusResponse.ConstraintErrorError(
                    "Setpoints are not supported for this schedule's systemMode",
                );
            }

            if (transition.systemMode !== undefined) {
                if (transition.systemMode === schedule.systemMode) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Transition systemMode ${Thermostat.SystemMode[transition.systemMode]} must be omitted when it equals the schedule's systemMode`,
                    );
                }
                switch (transition.systemMode) {
                    case Thermostat.SystemMode.Off:
                        if (!scheduleTypeFeatures.supportsOff) {
                            throw new StatusResponse.ConstraintErrorError(
                                "SystemMode Off is not supported for this schedule's systemMode",
                            );
                        }
                        break;

                    // The feature each of these needs is enforced by the value conformance of SystemModeEnum
                    case Thermostat.SystemMode.Heat:
                    case Thermostat.SystemMode.Cool:
                    case Thermostat.SystemMode.Auto:
                        break;

                    default:
                        throw new StatusResponse.ConstraintErrorError(
                            `Transition systemMode ${Thermostat.SystemMode[transition.systemMode]} is not allowed, only Auto, Heat, Cool and Off are`,
                        );
                }
            }

            const effectiveSystemMode = transition.systemMode ?? schedule.systemMode;
            const heats =
                effectiveSystemMode === Thermostat.SystemMode.Heat ||
                effectiveSystemMode === Thermostat.SystemMode.Auto;
            const cools =
                effectiveSystemMode === Thermostat.SystemMode.Cool ||
                effectiveSystemMode === Thermostat.SystemMode.Auto;

            // The schedule's presetHandle is the fallback for every transition, including one that overrides systemMode
            const hasPreset = transition.presetHandle !== undefined || schedule.presetHandle !== undefined;
            if (!hasPreset && heats && transition.heatingSetpoint === undefined) {
                throw new StatusResponse.ConstraintErrorError(
                    "A Heat or Auto schedule transition must specify a heatingSetpoint or presetHandle",
                );
            }
            if (!hasPreset && cools && transition.coolingSetpoint === undefined) {
                throw new StatusResponse.ConstraintErrorError(
                    "A Cool or Auto schedule transition must specify a coolingSetpoint or presetHandle",
                );
            }

            if (transition.coolingSetpoint !== undefined) {
                if (!cools) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Transition coolingSetpoint is not allowed with systemMode ${Thermostat.SystemMode[effectiveSystemMode]}`,
                    );
                }
                if (
                    transition.coolingSetpoint < this.coolSetpointMinimum ||
                    transition.coolingSetpoint > this.coolSetpointMaximum
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Transition coolingSetpoint (${transition.coolingSetpoint}) is out of bounds [${this.coolSetpointMinimum}, ${this.coolSetpointMaximum}]`,
                    );
                }
            }
            if (transition.heatingSetpoint !== undefined) {
                if (!heats) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Transition heatingSetpoint is not allowed with systemMode ${Thermostat.SystemMode[effectiveSystemMode]}`,
                    );
                }
                if (
                    transition.heatingSetpoint < this.heatSetpointMinimum ||
                    transition.heatingSetpoint > this.heatSetpointMaximum
                ) {
                    throw new StatusResponse.ConstraintErrorError(
                        `Transition heatingSetpoint (${transition.heatingSetpoint}) is out of bounds [${this.heatSetpointMinimum}, ${this.heatSetpointMaximum}]`,
                    );
                }
            }
            if (
                transition.heatingSetpoint !== undefined &&
                transition.coolingSetpoint !== undefined &&
                transition.coolingSetpoint - transition.heatingSetpoint < this.setpointDeadBand
            ) {
                throw new StatusResponse.ConstraintErrorError(
                    `Transition coolingSetpoint (${transition.coolingSetpoint}) and heatingSetpoint (${transition.heatingSetpoint}) are closer than the deadband (${this.setpointDeadBand})`,
                );
            }
        }

        if (numberOfScheduleTransitionPerDay !== null) {
            const exceededIndex = dayCounts.findIndex(count => count > numberOfScheduleTransitionPerDay);
            if (exceededIndex >= 0) {
                throw new StatusResponse.ResourceExhaustedError(
                    `Number of transitions (${dayCounts[exceededIndex]}) on ${ThermostatBaseServer.#daysOfWeek[exceededIndex]} exceeds NumberOfScheduleTransitionPerDay (${numberOfScheduleTransitionPerDay})`,
                );
            }
        }
    }

    /**
     * Refuses a commit that removes a built-in schedule or the active schedule, once every attribute of the atomic
     * write is staged, so the failure names the schedules attribute. The staged value is a copy the store does not
     * keep, so it is checked, not normalized; pre-commit normalizes the stored value.
     */
    #handleSchedulesAtomicChanged(
        newSchedules: Thermostat.Schedule[],
        oldSchedules: Thermostat.Schedule[] | undefined,
    ) {
        this.#validateScheduleCommit(newSchedules, oldSchedules);
    }

    /**
     * `Schedules` is computed on read, so no `schedules$Changed` event fires for it; react to
     * `persistedSchedules$Changed` to observe schedule changes inside the device.
     */
    #handlePersistedSchedulesChanged() {
        this.markChanged("schedules");
    }

    /**
     * Assigns a handle to any schedule lacking one and resolves a null `builtIn` from the stored schedule with that
     * handle. Normalizes in place: the report that follows reads the schedules back through the attribute's accessor.
     */
    #normalizeSchedules(
        newSchedules: Thermostat.Schedule[],
        oldSchedules: Thermostat.Schedule[] | undefined,
        issuedHandles: Set<string>,
    ) {
        const entropy = this.endpoint.env.get(Entropy);

        for (const schedule of newSchedules) {
            if (schedule.scheduleHandle == null) {
                logger.debug("Schedule is missing scheduleHandle, generating a new one");
                schedule.scheduleHandle = entropy.randomBytes(16);
                issuedHandles.add(Bytes.toHex(schedule.scheduleHandle));
            }
            if (schedule.builtIn === null) {
                const { scheduleHandle } = schedule;
                const oldSchedule = oldSchedules?.find(
                    s => s.scheduleHandle !== null && Bytes.areEqual(s.scheduleHandle, scheduleHandle),
                );
                schedule.builtIn = oldSchedule?.builtIn ?? false;
            }
        }
    }

    /**
     * Refuses schedules that drop a built-in schedule or the active schedule. Checks handles only, so it needs no
     * normalization: {@link #validateScheduleWriteRequest} already refused a schedule whose `builtIn` differs from
     * the stored one, and a schedule without a handle is new.
     */
    #validateScheduleCommit(newSchedules: Thermostat.Schedule[], oldSchedules: Thermostat.Schedule[] | undefined) {
        const newScheduleHandles = new Set<string>();
        for (const { scheduleHandle } of newSchedules) {
            if (scheduleHandle != null) {
                newScheduleHandles.add(Bytes.toHex(scheduleHandle));
            }
        }

        for (const { scheduleHandle, builtIn } of oldSchedules ?? []) {
            if (builtIn && scheduleHandle !== null && !newScheduleHandles.has(Bytes.toHex(scheduleHandle))) {
                throw new StatusResponse.ConstraintErrorError(
                    `Cannot remove built-in schedule with scheduleHandle ${Bytes.toHex(scheduleHandle)}`,
                );
            }
        }

        // The specification refuses the removal of the active schedule, not a handle that named no schedule to begin with
        const { activeScheduleHandle } = this.state;
        if (
            activeScheduleHandle !== null &&
            !newScheduleHandles.has(Bytes.toHex(activeScheduleHandle)) &&
            oldSchedules?.some(
                schedule =>
                    schedule.scheduleHandle !== null && Bytes.areEqual(schedule.scheduleHandle, activeScheduleHandle),
            )
        ) {
            throw new StatusResponse.InvalidInStateError(
                `Cannot remove schedule ${Bytes.toHex(activeScheduleHandle)} while it is the active schedule`,
            );
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
         * Endpoint (Number or string-Id) where to find the indoor temperature measurement cluster to use as
         * local temperature measurement for the thermostat behavior.
         */
        localIndoorTemperatureMeasurementEndpoint?: number | string;

        /**
         * Otherwise measured occupancy as boolean.
         * Use this if you have an external occupancy sensor that should be used for thermostat control instead of a
         * internal occupancy sensing cluster.
         */
        externallyMeasuredOccupancy?: boolean;

        /**
         * Endpoint (Number or string-Id) where to find the occupancy sensing cluster to use as
         * local occupancy measurement for the thermostat behavior.
         */
        localOccupancyMeasurementEndpoint?: number | string;

        /**
         * Use to enable the automatic mode management, implemented by this standard implementation.  This is beyond
         * Matter specification! It reacts to temperature changes to adjust system running mode automatically. It also
         * requires the Auto feature to be  enabled and the ThermostatRunningMode attribute to be present.
         */
        useAutomaticModeManagement: boolean = false;

        /**
         * The smallest change of the local temperature that is significant for the LocalTemperatureChange event, in
         * 0.01 degrees Celsius, like the localTemperature attribute.  The default of 50 is 0.5 degrees Celsius.
         *
         * Matter leaves the size of a significant change to the server.  Used only when the LocalTemperatureChange
         * event is enabled.  Must be a finite number greater than 0.
         *
         * @see {@link MatterSpecification.v161.Cluster} § 4.3.13.2
         */
        localTemperatureChangeThreshold: number = 50;

        /**
         * The maximum number of thermostat suggestions.  The Matter specification requires at least 5.
         *
         * @see {@link MatterSpecification.v161.Cluster} § 4.3.11.53
         */
        override maxThermostatSuggestions = MIN_THERMOSTAT_SUGGESTIONS;

        /**
         * Persisted presets stored in the device, needed because the original "presets" is a virtual property
         */
        persistedPresets?: Thermostat.Preset[];

        /**
         * Persisted schedules stored in the device, needed because the original "schedules" is a virtual property
         */
        persistedSchedules?: Thermostat.Schedule[];

        /**
         * The UniqueID of the current thermostat suggestion that a client or the application overrode by changing
         * ActivePresetHandle away from its preset.  The thermostat does not follow that entry while it stays current.
         * Stored, so the override stays in effect after a restart while its entry is still current.
         */
        overriddenSuggestionId?: number;

        /**
         * Implementation of the needed Preset/Schedule attribute logic for Atomic Write handling.
         */
        [Val.properties](endpoint: Endpoint, session: ValueSupervisor.Session) {
            const state = this;
            const properties = {};

            // This runs for every member of the struct on every access, so it must stay a lookup rather than derive
            // anything
            const thermostat = endpoint.behaviors.forCluster(Thermostat.Complete.id);
            if (thermostat?.features.presets) {
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
                                Thermostat.attributes.presets.id,
                            );
                        if (pendingValue !== undefined) {
                            return pendingValue as Thermostat.Preset[];
                        }

                        if (state.persistedPresets !== undefined) {
                            return state.persistedPresets;
                        }

                        const internal = endpoint.behaviors.internalsOf(ThermostatBaseServer);
                        return (internal.defaultPresets ??=
                            configuredPresets(endpoint) ?? presetsIn(thermostat.defaults) ?? []);
                    },

                    set(value: Thermostat.Preset[]) {
                        if (hasLocalActor(session) || ("command" in session && session.command)) {
                            // A list is written element-wise, and each step reads back what the previous step stored
                            state.persistedPresets = value;
                        } else {
                            endpoint.env
                                .get(AtomicWriteHandler)
                                .writeAttribute(
                                    session,
                                    endpoint,
                                    ThermostatBaseServer,
                                    Thermostat.attributes.presets.id,
                                    value,
                                );
                        }
                    },
                });
            }

            if (thermostat?.features.matterScheduleConfiguration) {
                Object.defineProperty(properties, "schedules", {
                    /**
                     * Getter will return a pending atomic write state when there is one, otherwise the stored value or
                     * the default value.
                     */
                    get(): Readonly<Thermostat.Schedule[]> {
                        // When we have a pending value for this attribute, return that instead
                        const pendingValue = endpoint.env
                            .get(AtomicWriteHandler)
                            .pendingValueForAttributeAndPeer(
                                session,
                                endpoint,
                                ThermostatBaseServer,
                                Thermostat.attributes.schedules.id,
                            );
                        if (pendingValue !== undefined) {
                            return pendingValue as Thermostat.Schedule[];
                        }

                        if (state.persistedSchedules !== undefined) {
                            return state.persistedSchedules;
                        }

                        const internal = endpoint.behaviors.internalsOf(ThermostatBaseServer);
                        return (internal.defaultSchedules ??=
                            configuredSchedules(endpoint) ?? schedulesIn(thermostat.defaults) ?? []);
                    },

                    set(value: Thermostat.Schedule[]) {
                        if (hasLocalActor(session) || ("command" in session && session.command)) {
                            // A list is written element-wise, and each step reads back what the previous step stored
                            state.persistedSchedules = value;
                        } else {
                            endpoint.env
                                .get(AtomicWriteHandler)
                                .writeAttribute(
                                    session,
                                    endpoint,
                                    ThermostatBaseServer,
                                    Thermostat.attributes.schedules.id,
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
        localTemperatureChangeThreshold$Changing =
            Observable<[value: number, oldValue: number, context: ActionContext]>();
        externalMeasuredIndoorTemperature$Changed =
            Observable<[value: number, oldValue: number, context: ActionContext]>();
        externallyMeasuredOccupancy$Changed = Observable<[value: boolean, oldValue: boolean, context: ActionContext]>();
        persistedPresets$Changed =
            Observable<
                [
                    value: Thermostat.Preset[] | undefined,
                    oldValue: Thermostat.Preset[] | undefined,
                    context: ActionContext,
                ]
            >();
        persistedPresets$Changing =
            Observable<
                [
                    value: Thermostat.Preset[] | undefined,
                    oldValue: Thermostat.Preset[] | undefined,
                    context: ActionContext,
                ]
            >();
        persistedSchedules$Changed =
            Observable<
                [
                    value: Thermostat.Schedule[] | undefined,
                    oldValue: Thermostat.Schedule[] | undefined,
                    context: ActionContext,
                ]
            >();
        persistedSchedules$Changing =
            Observable<
                [
                    value: Thermostat.Schedule[] | undefined,
                    oldValue: Thermostat.Schedule[] | undefined,
                    context: ActionContext,
                ]
            >();

        /**
         * Custom event emitted when the calibrated temperature changes.
         */
        calibratedTemperature$Changed =
            Observable<[value: number | null, oldValue: number | null, context: ActionContext]>();

        /**
         * Custom event emitted when the Presets attribute is "virtually" changing as part of an atomic write operation.
         * Info: The event currently needs to be a pure Observable to get errors thrown in the event handler be
         *  reported back to the emitter.
         */
        presets$AtomicChanging =
            Observable<[value: Thermostat.Preset[], oldValue: Thermostat.Preset[], context: ActionContext]>();

        /**
         * Custom event emitted when the Presets attribute has "virtually" changed as part of an atomic write operation.
         * Info: The event currently needs to be a pure Observable to get errors thrown in the event handler be
         * reported back to the emitter.
         */
        presets$AtomicChanged =
            Observable<[value: Thermostat.Preset[], oldValue: Thermostat.Preset[], context: ActionContext]>();

        /**
         * Custom event emitted when the Schedules attribute is "virtually" changing as part of an atomic write
         * operation.
         * Info: The event currently needs to be a pure Observable to get errors thrown in the event handler be
         *  reported back to the emitter.
         */
        schedules$AtomicChanging =
            Observable<[value: Thermostat.Schedule[], oldValue: Thermostat.Schedule[], context: ActionContext]>();

        /**
         * Custom event emitted when the Schedules attribute has "virtually" changed as part of an atomic write
         * operation.
         * Info: The event currently needs to be a pure Observable to get errors thrown in the event handler be
         * reported back to the emitter.
         */
        schedules$AtomicChanged =
            Observable<[value: Thermostat.Schedule[], oldValue: Thermostat.Schedule[], context: ActionContext]>();
    }

    export class Internal {
        /**
         * Local temperature in Matter format as uint16 with a factor of 100. It is the same value as the one reported
         * in the localTemperature Attribute, but also present when the LocalTemperatureNotExposed feature is enabled.
         * Means all logic and calculations are always done with this value.
         * The value will be updated on initialization and when the localTemperature Attribute changes.
         */
        localTemperature: number | null = null;

        /** The value of the last LocalTemperatureChange event, or the value at startup before the first event. */
        lastReportedLocalTemperature: number | null = null;

        /** The time of the last LocalTemperatureChange event on the monotonic clock ({@link Time.nowUs}). */
        lastLocalTemperatureReportAt?: Timestamp;

        /** Runs while a LocalTemperatureChange event waits for the end of the minimum interval. */
        localTemperatureChangeTimer?: Timer;

        /** Runs until the next EffectiveTime or ExpirationTime of a thermostat suggestion. */
        suggestionTimer?: Timer;

        /** Restarts {@link suggestionTimer} in a reactor, after the transaction of a re-evaluation ends. */
        restartSuggestionTimer?: (evaluatedAt: number, evaluation: SuggestionEvaluation | undefined) => void;

        /** Transactions that restart {@link suggestionTimer} once they commit or roll back. */
        timerRestarts = new WeakSet<Transaction>();

        /** The state the last re-evaluation in each transaction wrote, until the transaction commits or rolls back. */
        suggestionEvaluations = new WeakMap<Transaction, SuggestionEvaluation>();

        /** The UniqueID of the last thermostat suggestion added; the next one takes the next free value after it. */
        lastSuggestionUniqueId = 0;

        /** Transactions that activate a preset; setpoint changes in them keep the preset active. */
        presetActivations = new WeakSet<Transaction>();

        /** The values reconciliation set per transaction, by attribute name, until the transaction ends. */
        reconciledSetpoints = new WeakMap<Transaction, Map<string, number>>();

        /** Transactions in which a setpoint write cleared ActivePresetHandle. */
        setpointWritesLeavingPreset = new WeakSet<Transaction>();

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

        /**
         * The presets the `presets` getter serves until `persistedPresets` is set.  One copy, because a getter returns
         * the same list on every read (see {@link Val.Dynamic}).
         *
         * After initialization the getter serves it only inside a transaction that sets `persistedPresets` to
         * undefined, which cannot commit unless it stores presets again.
         */
        defaultPresets?: Thermostat.Preset[];

        /**
         * The schedules the `schedules` getter serves until `persistedSchedules` is set.  One copy, because a getter
         * returns the same list on every read (see {@link Val.Dynamic}).
         *
         * After initialization the getter serves it only inside a transaction that sets `persistedSchedules` to
         * undefined, which cannot commit unless it stores schedules again.
         */
        defaultSchedules?: Thermostat.Schedule[];

        /**
         * What this behavior did to the presets of each transaction in flight: the handles it issued, the presets the
         * transaction replaces, and whether it enlisted the check of the settled presets.
         *
         * Several transactions reach one endpoint at a time: an atomic write announces its staged presets before it
         * takes any lock.
         */
        presetTransactions = new WeakMap<
            Transaction,
            {
                handles: Set<string>;
                stored?: { presets: Thermostat.Preset[] | undefined };
                validatesOnceSettled?: boolean;
            }
        >();

        /**
         * What this behavior did to the schedules of each transaction in flight: the handles it issued, the schedules
         * the transaction replaces, and whether it enlisted the check of the settled schedules.
         *
         * Several transactions reach one endpoint at a time: an atomic write announces its staged schedules before it
         * takes any lock.
         */
        scheduleTransactions = new WeakMap<
            Transaction,
            {
                handles: Set<string>;
                stored?: { schedules: Thermostat.Schedule[] | undefined };
                validatesOnceSettled?: boolean;
            }
        >();
    }

    export declare const ExtensionInterface: {
        handleSetActivePresetRequest(request: Thermostat.SetActivePresetRequest): Thermostat.Preset | undefined;
        handleSetActiveScheduleRequest(request: Thermostat.SetActiveScheduleRequest): void;
        hasSynchronizedTime(): boolean;
        selectThermostatSuggestion(
            candidates: Thermostat.ThermostatSuggestion[],
        ): Thermostat.ThermostatSuggestion | undefined;
        suggestionNotFollowingReason(
            suggestion: Thermostat.ThermostatSuggestion,
        ): Thermostat.ThermostatSuggestionNotFollowingReason | null;
    };
}

// Drop the features the base implementation enables internally so consumers select their own
export class ThermostatServer extends ThermostatBaseServer.with() {}
