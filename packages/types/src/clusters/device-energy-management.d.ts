/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the DeviceEnergyManagement cluster.
 *
 * This cluster allows a client to manage the power draw of a device. An example of such a client could be an Energy
 * Management System (EMS) which controls an Energy Smart Appliance (ESA).
 *
 * In most deployments the EMS will be the client, and the ESA will host the Device Energy Management Cluster server.
 *
 * This cluster is intended to be generic in nature and could apply to any electrical load or generator (e.g. a Battery
 * Electric Storage System - BESS, solar PV inverter, EVSE, HVAC, heat pump, hot water heater, white goods appliances
 * etc).
 *
 * It consists of the following areas which shall be supported by all devices implementing this cluster:
 *
 *   - Description of ESA and its capabilities & power limits (sometimes referred to as a nameplate)
 *
 *   - Current state of operation (including user opt-out, safety limitations / alarms)
 *
 * There are some optional capabilities that some ESAs may be able to offer:
 *
 *   - Ability to control the load or generation
 *
 *   - Forecast data, including when it can be flexible (i.e. modify the power or time period)
 *
 *   - The ability to have their power profile adjusted by an EMS, and to provide an updated Forecast back to the EMS.
 *
 * This allows the EMS to manage multiple home loads and where ESAs can be flexible, continuously optimizing the home
 * energy to minimize cost, reduce CO2 impact, maximize self-consumption of solar PV and provide Demand Side Response
 * (DSR) Grid services.
 *
 * It is likely that the ESA may also use the Pricing Cluster to obtain incentive signals such as 'grid carbon
 * intensity', 'time of use' or 'type of use' tariffs to schedule its operation to run at the cheapest and greenest
 * times.
 *
 * > [!NOTE]
 *
 * > Grid Services are market dependent and will use other protocols ([OpenADR] / [IEEE2030.5]) to communicate grid
 *   events to the EMS. These are outside the scope of Matter.
 *
 * > [!NOTE]
 *
 * > Different markets may follow different approaches, but the UK [PAS1878] and [EUCodeOfConduct] give examples of how
 *   ESAs may be mandated to support these features in the future.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 9.2
 */
export declare namespace DeviceEnergyManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0098;

    /**
     * Textual cluster identifier.
     */
    export const name: "DeviceEnergyManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the DeviceEnergyManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link DeviceEnergyManagement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the type of ESA.
         *
         * This attribute enables an EMS to understand some of the basic properties about how the energy may be
         * consumed, generated, and stored by the ESA.
         *
         * For example, the heat energy converted by a heat pump will naturally be lost through the building to the
         * outdoor environment relatively quickly, compared to storing heat in a well-insulated hot water tank.
         * Similarly, battery storage and EVs can store electrical energy for much longer durations.
         *
         * This attribute can also help the EMS display information to a user and to make basic assumptions about
         * typical best use of energy. For example, an EVSE may not always have an EV plugged in, so knowing the type of
         * ESA that is being controlled can allow advanced energy management strategies.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.1
         */
        esaType: EsaType;

        /**
         * Indicates whether the ESA is classed as a generator or load. This allows an EMS to understand whether the
         * power values reported by the ESA need to have their sign inverted when dealing with forecasts and
         * adjustments.
         *
         * For example, a solar PV inverter (being a generator) may produce negative values to indicate generation
         * (since power is flowing out of the node into the home), however a display showing the power to the consumers
         * may need to present a positive solar production value to the consumer.
         *
         * For example, a home battery storage system (BESS) which needs to charge the battery and then discharge to the
         * home loads, would be classed as a generator. These types of devices shall have this field set to true. When
         * generating its forecast or advertising its PowerAdjustmentCapability, the power values shall be negative to
         * indicate discharging to the loads in the home, and positive to indicate when it is charging its battery.
         *
         * GRID meter = Σ LoadPowers + Σ GeneratorPowers
         *
         * Example:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.2
         */
        esaCanGenerate: boolean;

        /**
         * Indicates the current state of the ESA.
         *
         * If the ESA is in the Offline or Fault state it cannot be controlled by an EMS, and may not be able to report
         * its Forecast information. An EMS may subscribe to the ESAState to get notified about changes in operational
         * state.
         *
         * The ESA may have a local user interface to allow a service technician to put the ESA into Offline mode, for
         * example to avoid the EMS accidentally starting or stopping the appliance when it is being serviced or tested.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.3
         */
        esaState: EsaState;

        /**
         * Indicates the minimum electrical power that the ESA can consume when switched on. This does not include when
         * in power save or standby modes.
         *
         * > [!NOTE]
         *
         * > For Generator ESAs that can discharge an internal battery (such as a battery storage inverter) to loads in
         *   the home, the AbsMinPower will be a negative number representing the maximum power that the ESA can
         *   discharge its internal battery.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.4
         */
        absMinPower: number | bigint;

        /**
         * Indicates the maximum electrical power that the ESA can consume when switched on.
         *
         * Note that for Generator ESAs that can charge a battery by importing power into the node (such as a battery
         * storage inverter), the AbsMaxPower will be a positive number representing the maximum power at which the ESA
         * can charge its internal battery.
         *
         * For example, a battery storage inverter that can charge its battery at a maximum power of 2000W and can
         * discharge the battery at a maximum power of 3000W, would have a AbsMinPower: -3000, AbsMaxPower: 2000W.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.5
         */
        absMaxPower: number | bigint;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "PowerAdjustment".
     */
    export interface PowerAdjustmentAttributes {
        /**
         * Indicates how the ESA can be adjusted at the current time, and the state of any active adjustment.
         *
         * A null value indicates that no power adjustment is currently possible, and nor is any adjustment currently
         * active.
         *
         * This attribute SHOULD be updated periodically by ESAs to reflect any changes in internal state, for example
         * temperature or stored energy, which would affect the power or duration limits.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once every 10 seconds on changes, or
         *
         *   - When it changes from null to any other value and vice versa.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.6
         */
        powerAdjustmentCapability: PowerAdjustCapability | null;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature
     * "PowerForecastReportingOrStateForecastReporting".
     */
    export interface PowerForecastReportingOrStateForecastReportingAttributes {
        /**
         * This attribute allows an ESA to share its intended forecast with a client (such as an Energy Management
         * System).
         *
         * A null value indicates that there is no forecast currently available (for example, a program has not yet been
         * selected by the user).
         *
         * A server may reset this value attribute to null on a reboot, and it does not need to persist any previous
         * forecasts.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once every 10 seconds on changes, or
         *
         *   - When it changes from null to any other value and vice versa, or
         *
         *   - As a result of a command which causes the forecast to be updated, or
         *
         *   - As a result of a change in the opt-out status which in turn may cause the ESA to recalculate its
         *     forecast.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.7
         */
        forecast: Forecast | null;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature
     * "PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustment".
     */
    export interface PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustmentAttributes {
        /**
         * Indicates the current Opt-Out state of the ESA. The ESA may have a local user interface to allow the user to
         * control this OptOutState. An EMS may subscribe to the OptOutState to get notified about changes in
         * operational state.
         *
         * If the ESA is in the LocalOptOut or OptOut states, so it cannot be controlled by an EMS for local
         * optimization reasons, it shall reject any commands which have the AdjustmentCauseEnum value
         * LocalOptimization. If the ESA is in the GridOptOut or OptOut states, so it cannot be controlled by an EMS for
         * grid optimization reasons, it shall reject any commands which have the AdjustmentCauseEnum value
         * GridOptimization.
         *
         * If the user changes the Opt-Out state of the ESA which is currently operating with a Forecast that is due to
         * a previous StartTimeAdjustRequest, ModifyForecastRequest or RequestConstraintBasedForecast command that would
         * now not be permitted due to the new Opt-out state (i.e. the Forecast attribute ForecastUpdateReason field
         * currently contains a reason which is now opted out), the ESA shall behave as if it had received a
         * CancelRequest command.
         *
         * If the user changes the Opt-Out state of the ESA which currently has the ESAStateEnum with value Paused due
         * to a previous PauseRequest command that would now not be permitted due to the new Opt-out state, and the ESA
         * supports the PFR or SFR features (i.e. the Forecast attribute ForecastUpdateReason field currently contains a
         * reason which is now opted out), the ESA shall behave as if it had received a ResumeRequest command.
         *
         * If the user changes the Opt-Out state of the ESA which currently has the ESAStateEnum with value
         * PowerAdjustActive due to a previous PowerAdjustRequest command that would now not be permitted due to the new
         * Opt-out state (i.e. the Forecast attribute ForecastUpdateReason field currently contains a reason which is
         * now opted out), the ESA shall behave as if it had received a CancelPowerAdjustRequest command.
         *
         * If the ESA is in the LocalOptOut, GridOptOut, or NoOptOut states, the device is still permitted to optimize
         * its own energy usage, for example, using tariff information it may obtain.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.8
         */
        optOutState: OptOutState;
    }

    /**
     * Attributes that may appear in {@link DeviceEnergyManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the type of ESA.
         *
         * This attribute enables an EMS to understand some of the basic properties about how the energy may be
         * consumed, generated, and stored by the ESA.
         *
         * For example, the heat energy converted by a heat pump will naturally be lost through the building to the
         * outdoor environment relatively quickly, compared to storing heat in a well-insulated hot water tank.
         * Similarly, battery storage and EVs can store electrical energy for much longer durations.
         *
         * This attribute can also help the EMS display information to a user and to make basic assumptions about
         * typical best use of energy. For example, an EVSE may not always have an EV plugged in, so knowing the type of
         * ESA that is being controlled can allow advanced energy management strategies.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.1
         */
        esaType: EsaType;

        /**
         * Indicates whether the ESA is classed as a generator or load. This allows an EMS to understand whether the
         * power values reported by the ESA need to have their sign inverted when dealing with forecasts and
         * adjustments.
         *
         * For example, a solar PV inverter (being a generator) may produce negative values to indicate generation
         * (since power is flowing out of the node into the home), however a display showing the power to the consumers
         * may need to present a positive solar production value to the consumer.
         *
         * For example, a home battery storage system (BESS) which needs to charge the battery and then discharge to the
         * home loads, would be classed as a generator. These types of devices shall have this field set to true. When
         * generating its forecast or advertising its PowerAdjustmentCapability, the power values shall be negative to
         * indicate discharging to the loads in the home, and positive to indicate when it is charging its battery.
         *
         * GRID meter = Σ LoadPowers + Σ GeneratorPowers
         *
         * Example:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.2
         */
        esaCanGenerate: boolean;

        /**
         * Indicates the current state of the ESA.
         *
         * If the ESA is in the Offline or Fault state it cannot be controlled by an EMS, and may not be able to report
         * its Forecast information. An EMS may subscribe to the ESAState to get notified about changes in operational
         * state.
         *
         * The ESA may have a local user interface to allow a service technician to put the ESA into Offline mode, for
         * example to avoid the EMS accidentally starting or stopping the appliance when it is being serviced or tested.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.3
         */
        esaState: EsaState;

        /**
         * Indicates the minimum electrical power that the ESA can consume when switched on. This does not include when
         * in power save or standby modes.
         *
         * > [!NOTE]
         *
         * > For Generator ESAs that can discharge an internal battery (such as a battery storage inverter) to loads in
         *   the home, the AbsMinPower will be a negative number representing the maximum power that the ESA can
         *   discharge its internal battery.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.4
         */
        absMinPower: number | bigint;

        /**
         * Indicates the maximum electrical power that the ESA can consume when switched on.
         *
         * Note that for Generator ESAs that can charge a battery by importing power into the node (such as a battery
         * storage inverter), the AbsMaxPower will be a positive number representing the maximum power at which the ESA
         * can charge its internal battery.
         *
         * For example, a battery storage inverter that can charge its battery at a maximum power of 2000W and can
         * discharge the battery at a maximum power of 3000W, would have a AbsMinPower: -3000, AbsMaxPower: 2000W.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.5
         */
        absMaxPower: number | bigint;

        /**
         * Indicates how the ESA can be adjusted at the current time, and the state of any active adjustment.
         *
         * A null value indicates that no power adjustment is currently possible, and nor is any adjustment currently
         * active.
         *
         * This attribute SHOULD be updated periodically by ESAs to reflect any changes in internal state, for example
         * temperature or stored energy, which would affect the power or duration limits.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once every 10 seconds on changes, or
         *
         *   - When it changes from null to any other value and vice versa.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.6
         */
        powerAdjustmentCapability: PowerAdjustCapability | null;

        /**
         * This attribute allows an ESA to share its intended forecast with a client (such as an Energy Management
         * System).
         *
         * A null value indicates that there is no forecast currently available (for example, a program has not yet been
         * selected by the user).
         *
         * A server may reset this value attribute to null on a reboot, and it does not need to persist any previous
         * forecasts.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once every 10 seconds on changes, or
         *
         *   - When it changes from null to any other value and vice versa, or
         *
         *   - As a result of a command which causes the forecast to be updated, or
         *
         *   - As a result of a change in the opt-out status which in turn may cause the ESA to recalculate its
         *     forecast.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.7
         */
        forecast: Forecast | null;

        /**
         * Indicates the current Opt-Out state of the ESA. The ESA may have a local user interface to allow the user to
         * control this OptOutState. An EMS may subscribe to the OptOutState to get notified about changes in
         * operational state.
         *
         * If the ESA is in the LocalOptOut or OptOut states, so it cannot be controlled by an EMS for local
         * optimization reasons, it shall reject any commands which have the AdjustmentCauseEnum value
         * LocalOptimization. If the ESA is in the GridOptOut or OptOut states, so it cannot be controlled by an EMS for
         * grid optimization reasons, it shall reject any commands which have the AdjustmentCauseEnum value
         * GridOptimization.
         *
         * If the user changes the Opt-Out state of the ESA which is currently operating with a Forecast that is due to
         * a previous StartTimeAdjustRequest, ModifyForecastRequest or RequestConstraintBasedForecast command that would
         * now not be permitted due to the new Opt-out state (i.e. the Forecast attribute ForecastUpdateReason field
         * currently contains a reason which is now opted out), the ESA shall behave as if it had received a
         * CancelRequest command.
         *
         * If the user changes the Opt-Out state of the ESA which currently has the ESAStateEnum with value Paused due
         * to a previous PauseRequest command that would now not be permitted due to the new Opt-out state, and the ESA
         * supports the PFR or SFR features (i.e. the Forecast attribute ForecastUpdateReason field currently contains a
         * reason which is now opted out), the ESA shall behave as if it had received a ResumeRequest command.
         *
         * If the user changes the Opt-Out state of the ESA which currently has the ESAStateEnum with value
         * PowerAdjustActive due to a previous PowerAdjustRequest command that would now not be permitted due to the new
         * Opt-out state (i.e. the Forecast attribute ForecastUpdateReason field currently contains a reason which is
         * now opted out), the ESA shall behave as if it had received a CancelPowerAdjustRequest command.
         *
         * If the ESA is in the LocalOptOut, GridOptOut, or NoOptOut states, the device is still permitted to optimize
         * its own energy usage, for example, using tariff information it may obtain.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.8.8
         */
        optOutState: OptOutState;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "PowerAdjustment".
     */
    export interface PowerAdjustmentCommands {
        /**
         * Allows a client to request an adjustment in the power consumption of an ESA for a specified duration.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.1
         */
        powerAdjustRequest(request: PowerAdjustRequest): MaybePromise;

        /**
         * Allows a client to cancel an ongoing PowerAdjustmentRequest operation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.2
         */
        cancelPowerAdjustRequest(): MaybePromise;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "Pausable".
     */
    export interface PausableCommands {
        /**
         * Allows a client to temporarily pause an operation and reduce the ESAs energy demand.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.4
         */
        pauseRequest(request: PauseRequest): MaybePromise;

        /**
         * Allows a client to cancel the PauseRequest command and enable earlier resumption of operation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.5
         */
        resumeRequest(): MaybePromise;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "StartTimeAdjustment".
     */
    export interface StartTimeAdjustmentCommands {
        /**
         * Allows a client to adjust the start time of a Forecast sequence that has not yet started operation (i.e.
         * where the current Forecast StartTime is in the future).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.3
         */
        startTimeAdjustRequest(request: StartTimeAdjustRequest): MaybePromise;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "ForecastAdjustment".
     */
    export interface ForecastAdjustmentCommands {
        /**
         * Allows a client to modify a Forecast within the limits allowed by the ESA.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.6
         */
        modifyForecastRequest(request: ModifyForecastRequest): MaybePromise;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "ConstraintBasedAdjustment".
     */
    export interface ConstraintBasedAdjustmentCommands {
        /**
         * Allows a client to ask the ESA to recompute its Forecast based on power and time constraints.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.7
         */
        requestConstraintBasedForecast(request: RequestConstraintBasedForecastRequest): MaybePromise;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature
     * "StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustment".
     */
    export interface StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustmentCommands {
        /**
         * Allows a client to request cancellation of a previous adjustment request in a StartTimeAdjustRequest,
         * ModifyForecastRequest or RequestConstraintBasedForecast command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.8
         */
        cancelRequest(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link DeviceEnergyManagement}.
     */
    export interface Commands extends
        PowerAdjustmentCommands,
        PausableCommands,
        StartTimeAdjustmentCommands,
        ForecastAdjustmentCommands,
        ConstraintBasedAdjustmentCommands,
        StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustmentCommands
    {}

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "PowerAdjustment".
     */
    export interface PowerAdjustmentEvents {
        /**
         * This event shall be generated when the Power Adjustment session is started.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.1
         */
        powerAdjustStart: void;

        /**
         * This event shall be generated when the Power Adjustment session ends.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.2
         */
        powerAdjustEnd: PowerAdjustEndEvent;
    }

    /**
     * {@link DeviceEnergyManagement} supports these elements if it supports feature "Pausable".
     */
    export interface PausableEvents {
        /**
         * This event shall be generated when the ESA enters the Paused state.
         *
         * There is no data for this event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.3
         */
        paused: void;

        /**
         * This event shall be generated when the ESA leaves the Paused state and resumes operation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.4
         */
        resumed: ResumedEvent;
    }

    /**
     * Events that may appear in {@link DeviceEnergyManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the Power Adjustment session is started.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.1
         */
        powerAdjustStart: void;

        /**
         * This event shall be generated when the Power Adjustment session ends.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.2
         */
        powerAdjustEnd: PowerAdjustEndEvent;

        /**
         * This event shall be generated when the ESA enters the Paused state.
         *
         * There is no data for this event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.3
         */
        paused: void;

        /**
         * This event shall be generated when the ESA leaves the Paused state and resumes operation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.4
         */
        resumed: ResumedEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },

        {
            flags: { powerAdjustment: true },
            attributes: PowerAdjustmentAttributes,
            commands: PowerAdjustmentCommands,
            events: PowerAdjustmentEvents
        },

        {
            flags: { powerForecastReporting: true },
            attributes: PowerForecastReportingOrStateForecastReportingAttributes
        },
        {
            flags: { stateForecastReporting: true },
            attributes: PowerForecastReportingOrStateForecastReportingAttributes
        },
        {
            flags: { powerAdjustment: true },
            attributes: PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustmentAttributes
        },
        {
            flags: { startTimeAdjustment: true },
            attributes: PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustmentAttributes
        },
        {
            flags: { pausable: true },
            attributes: PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustmentAttributes
        },
        {
            flags: { forecastAdjustment: true },
            attributes: PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustmentAttributes
        },
        {
            flags: { constraintBasedAdjustment: true },
            attributes: PowerAdjustmentOrStartTimeAdjustmentOrPausableOrForecastAdjustmentOrConstraintBasedAdjustmentAttributes
        },
        { flags: { pausable: true }, commands: PausableCommands, events: PausableEvents },
        { flags: { startTimeAdjustment: true }, commands: StartTimeAdjustmentCommands },
        { flags: { forecastAdjustment: true }, commands: ForecastAdjustmentCommands },
        { flags: { constraintBasedAdjustment: true }, commands: ConstraintBasedAdjustmentCommands },
        {
            flags: { startTimeAdjustment: true },
            commands: StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustmentCommands
        },
        {
            flags: { forecastAdjustment: true },
            commands: StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustmentCommands
        },
        {
            flags: { constraintBasedAdjustment: true },
            commands: StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustmentCommands
        }
    ];

    export type Features = "PowerAdjustment" | "PowerForecastReporting" | "StateForecastReporting" | "StartTimeAdjustment" | "Pausable" | "ForecastAdjustment" | "ConstraintBasedAdjustment";

    /**
     * These are optional features supported by DeviceEnergyManagementCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.4
     */
    export enum Feature {
        /**
         * PowerAdjustment (PA)
         *
         * For Energy Smart Appliances (ESA) the definition of being 'smart' mandates that they can report their current
         * power adjustment capability and have an EMS request a temporary adjustment. This may typically be to curtail
         * power requirements during peak periods, but can also be used to turn on an ESA if there is excess renewable
         * or local generation (Solar PV).
         *
         * For example, a home may have solar PV which often produces more power than the home requires, resulting in
         * the excess power flowing into the grid. This excess power naturally fluctuates when clouds pass overhead and
         * other loads in the home are switched on and off.
         *
         * EVSE Example: An EMS may therefore be able to turn on the EVSE (if the vehicle is plugged in) and can start
         * charging the vehicle, and periodically modify the charging power depending on PV generation and other home
         * loads, so as to minimize import and export to the grid. An EMS may also use this feature to control the
         * discharging (and re-charging) of the vehicle if the EVSE and vehicle support the V2X feature of the EVSE
         * cluster of the associated EVSE device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.1
         */
        PowerAdjustment = "PowerAdjustment",

        /**
         * PowerForecastReporting (PFR)
         *
         * For Energy Smart Appliances (ESA) the definition of being 'smart' implies that they can report their
         * indicative forecast power demands or generation, to a greater or lesser extent. For some ESAs this is highly
         * predictable (in terms of both power and time), in other appliances this is more challenging and only a basic
         * level of forecast is possible.
         *
         * Forecasts are defined from a current time, using a slot format, where the slot is akin to a relatively
         * constant operating mode.
         *
         * Washing machine example: a washing machine may have stages of a washing cycle: heating, tumbling, rinse and
         * spin stages. At each stage, the approximate minimum and maximum power consumption may be known, as well as
         * the duration of that stage.
         *
         * In some circumstances the ESA may allow the stage to be delayed or paused (subject to safety and
         * manufacturer’s discretion and user preferences).
         *
         * Typically, appliances with a heating element cannot have their power consumption adjusted and can only be
         * paused or delayed.
         *
         * Some ESAs may not be flexible other than a delayed cycle start (for example, once the washing cycle has been
         * started then they run continuously until the cycle completes).
         *
         * Appliances that only support the PowerForecastReporting and not any of the adjustment features may indicate
         * that they are not flexible in the forecast slot format.
         *
         * The PowerForecastReporting and the adjustment features aim to align to the [SAREF4ENER] ontology.
         *
         * Inverter driven ESAs: some inverter driven ESAs can consume or generate a variable amount of power.
         *
         * For example, a single phase EVSE can be adjusted in the range of 6-32Amps in 0.6 Amp steps in EU or on a
         * hardwired 120V supply in the range of 6-15 Amps in US.
         *
         * For example, a home battery may be adjusted to charge or discharge in steps of 1W.
         *
         * For example, a heat pump may be able to modulate its compressor inverter between 20-100% of its rated power.
         *
         * The ESA indicates its power adjustment range and its nominal power consumption as part of its Forecast.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.2
         */
        PowerForecastReporting = "PowerForecastReporting",

        /**
         * StateForecastReporting (SFR)
         *
         * Some ESAs do not know their actual power consumption, but do know the state of operation. Like the
         * PowerForecastingReporting feature, this uses the same slot structure mechanism to indicate a change in state
         * vs time.
         *
         * An external observing EMS may have access to real-time meter readings, and could learn the typical power
         * consumption based on the advertised internal state of the ESA.
         *
         * To enable this capability, the ESA shall report its internal operational state using an manufacturer specific
         * value.
         *
         * Once the EMS has built a model of the state vs observed power consumption, it may request a forecast
         * adjustment for particular times of the day, encouraging the ESA to use power at alternative times.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.3
         */
        StateForecastReporting = "StateForecastReporting",

        /**
         * StartTimeAdjustment (STA)
         *
         * ESAs which support the Start Time Adjustment feature, allow an EMS to recommend a change to the start time of
         * the energy transfer that the ESA has previously suggested it would use.
         *
         * Washing machine example: A Washing Machine may have been set to start a wash cycle at 9pm when the variable
         * tariff normally reduces.
         *
         * However, the EMS is aware that a grid event has occurred, making it cheaper to run the cycle at a later time,
         * but the washing machine is not aware of this.
         *
         * The EMS first requests the Forecast data from each of its registered ESAs. It determines that the washing
         * machine has a power profile suggesting it will start the wash cycle at 9pm, but the EMS now knows that the
         * grid event means it will be cheaper to delay the start until 11pm.
         *
         * The EMS can then optimize the cost by asking the washing machine to delay starting the wash cycle until 11pm.
         *
         * It does this by sending a StartTimeAdjustRequest to the washing machine to request delaying the start of the
         * washing cycle.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.4
         */
        StartTimeAdjustment = "StartTimeAdjustment",

        /**
         * Pausable (PAU)
         *
         * ESAs which support the Pausable feature, allow an EMS to recommend a pause in the middle of a forecast power
         * profile that the ESA is currently using.
         *
         * Washing machine example: A Washing Machine is in operation, and starting its water heating step.
         *
         * However, the EMS becomes aware from the smart meter that the total home load on the grid is close to
         * exceeding its allowed total grid load.
         *
         * The EMS first requests the Forecast data from each of its registered ESAs. It determines that the washing
         * machine has a power profile suggesting its current step in the wash cycle is using power to heat the water,
         * but that this step can be paused.
         *
         * The EMS can then reduce the grid load by asking the washing machine to pause the wash cycle for a short
         * duration.
         *
         * It does this by sending a PauseRequest to the washing machine to request pausing the current step of the
         * forecast power usage for a period to allow other home loads to finish before resuming the washing cycle.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.5
         */
        Pausable = "Pausable",

        /**
         * ForecastAdjustment (FA)
         *
         * ESAs which support the Forecast adjustment feature, allow an EMS to recommend a change to the start, duration
         * and/or power level limits of the steps of the power profile that the ESA has previously suggested it would
         * use.
         *
         * Heat pump and Solar PV example: A heat pump may have the ability to heat hot water as well as heating the
         * home. The heat pump scheduling system may have determined that the home will be unoccupied during the day, or
         * that the indoor temperature is above the set-point and so it knows that it will not need to heat the home.
         *
         * However, the hot water tank is likely to need to be reheated before the homeowner comes home in the evening.
         * The heat pump is not aware that the property also has a solar PV inverter which is also an ESA that is
         * communicating with the EMS.
         *
         * The EMS first requests the Forecast data from each of its registered ESAs. It determines that the heat pump
         * has a power profile suggesting it needs to heat hot water around 6pm. The solar PV inverter has forecast that
         * it will generate 3.6kW of power during the middle of the day and into the afternoon before the sun goes down.
         *
         * The EMS can then optimize the home considering other non-ESA loads and can ask the heat pump to heat the hot
         * water around 3pm when it has forecast that excess solar power will be available.
         *
         * It does this by sending a ModifyForecastRequest to the heat pump and asks the heat pump to expect to run at a
         * lower power consumption (within the solar excess power) which requires the heat pump to run for a longer
         * duration to achieve its required energy demand.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.6
         */
        ForecastAdjustment = "ForecastAdjustment",

        /**
         * ConstraintBasedAdjustment (CON)
         *
         * ESAs which support the Constraint-Based Adjustment feature allow an EMS to inform the ESA of periods during
         * which power usage should be modified (for example when the EMS has been made aware that the grid supplier has
         * requested reduced energy usage due to overall peak grid demand) and may cause the ESA to modify the intended
         * power profile has previously suggested it would use.
         *
         * EVSE example: An EVSE scheduling system may have determined that the vehicle would be charged starting at a
         * moderate rate at 1am, so that it has enough charge by the time it is needed later that morning.
         *
         * However, the DSR service provider has informed the EMS that due to high forecast winds it is now forecast
         * that there will be very cheap energy available from wind generation between 2am and 3am.
         *
         * The EMS first requests the Forecast data from each of its registered ESAs. It determines that the EVSE has a
         * power profile suggesting it plans to start charging the vehicle at 1am.
         *
         * The EMS can then try to reduce the cost of charging the EV by informing the EVSE of the desire to increase
         * the charging between scheduled times.
         *
         * It does this by sending a RequestConstraintBasedForecast to the EVSE and asks it to run at a higher
         * NominalPower consumption during the constraint period, which may require it to decrease its charge rate
         * outside the constraint period to achieve its required energy demand.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.4.7
         */
        ConstraintBasedAdjustment = "ConstraintBasedAdjustment"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.2
     */
    export enum EsaType {
        /**
         * EV Supply Equipment
         */
        Evse = 0,

        /**
         * Space heating appliance
         */
        SpaceHeating = 1,

        /**
         * Water heating appliance
         */
        WaterHeating = 2,

        /**
         * Space cooling appliance
         */
        SpaceCooling = 3,

        /**
         * Space heating and cooling appliance
         */
        SpaceHeatingCooling = 4,

        /**
         * Battery Electric Storage System
         */
        BatteryStorage = 5,

        /**
         * Solar PV inverter
         */
        SolarPv = 6,

        /**
         * Fridge / Freezer
         */
        FridgeFreezer = 7,

        /**
         * Washing Machine
         */
        WashingMachine = 8,

        /**
         * Dishwasher
         */
        Dishwasher = 9,

        /**
         * Cooking appliance
         */
        Cooking = 10,

        /**
         * Home water pump (e.g. drinking well)
         */
        HomeWaterPump = 11,

        /**
         * Irrigation water pump
         */
        IrrigationWaterPump = 12,

        /**
         * Pool pump
         */
        PoolPump = 13,

        /**
         * Other appliance type
         */
        Other = 255
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.3
     */
    export enum EsaState {
        /**
         * The ESA is not available to the EMS (e.g. start-up, maintenance mode)
         */
        Offline = 0,

        /**
         * The ESA is working normally and can be controlled by the EMS
         */
        Online = 1,

        /**
         * The ESA has developed a fault and cannot provide service
         */
        Fault = 2,

        /**
         * The ESA is in the middle of a power adjustment event
         */
        PowerAdjustActive = 3,

        /**
         * The ESA is currently paused by a client using the PauseRequest command
         */
        Paused = 4
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.11
     */
    export declare class PowerAdjustCapability {
        constructor(values?: Partial<PowerAdjustCapability>);

        /**
         * This field shall indicate how the ESA can be adjusted at the current time.
         *
         * For example, a battery storage inverter may need to regulate its internal temperature, or the charging rate
         * of the battery may be limited due to cold temperatures, or a change in the state of charge of the battery may
         * mean that the maximum charging or discharging rate is limited.
         *
         * An empty list shall indicate that no power adjustment is currently possible.
         *
         * Multiple entries in the list allow indicating that permutations of scenarios may be possible.
         *
         * For example, a 10kWh battery could be at 80% state of charge. If charging at 2kW, then it would be full in 1
         * hour. However, it could be discharged at 2kW for 4 hours.
         *
         * In this example the list of PowerAdjustStructs allows multiple scenarios to be offered as follows:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.12
         */
        powerAdjustCapability: PowerAdjust[] | null;

        cause: PowerAdjustReason;
    };

    /**
     * This indicates a list of 'slots' describing the overall timing of the ESA’s planned energy and power use, with
     * different power and energy demands per slot. For example, slots might be used to describe the distinct stages of
     * a washing machine cycle.
     *
     * Where an ESA does not know the actual power and energy use of the system, it may support the SFR feature and
     * instead report its internal state.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13
     */
    export declare class Forecast {
        constructor(values?: Partial<Forecast>);

        /**
         * This field shall indicate the sequence number for the current forecast. If the ESA updates a forecast, it
         * shall monotonically increase this value.
         *
         * The ESA does not need to persist this value across reboots, since the EMS SHOULD be able to detect that any
         * previous subscriptions are lost if a device reboots. The loss of a subscription and subsequent
         * re-subscription allows the EMS to learn about any new forecasts.
         *
         * The value of ForecastID is allowed to wrap.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.1
         */
        forecastId: number;

        /**
         * This field shall indicate which element of the Slots list is currently active in the Forecast sequence. A
         * null value indicates that the sequence has not yet started.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.2
         */
        activeSlotNumber: number | null;

        /**
         * This field shall indicate the planned start time, in UTC, for the entire Forecast.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.3
         */
        startTime: number;

        /**
         * This field shall indicate the planned end time, in UTC, for the entire Forecast.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.4
         */
        endTime: number;

        /**
         * This field shall indicate the earliest start time, in UTC, that the entire Forecast can be shifted to.
         *
         * A null value indicates that it can be started immediately.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.5
         */
        earliestStartTime?: number | null;

        /**
         * This field shall indicate the latest end time, in UTC, for the entire Forecast.
         *
         * e.g. for an EVSE charging session, this may indicate the departure time for the vehicle, by which time the
         * charging session must end.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.6
         */
        latestEndTime?: number;

        /**
         * This field shall indicate that some part of the Forecast can be paused. It aims to allow a client to read
         * this flag and if it is false, then none of the slots contain SlotIsPausable set to true. This can save a
         * client from having to check each slot in the list.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.7
         */
        isPausable: boolean;

        /**
         * This field shall contain a list of SlotStructs.
         *
         * It shall contain at least 1 entry, and a maximum of 10.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.8
         */
        slots: Slot[];

        /**
         * This field shall contain the reason the current Forecast was generated.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.13.9
         */
        forecastUpdateReason: ForecastUpdateReason;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.4
     */
    export enum OptOutState {
        /**
         * The user has not opted out of either local or grid optimizations
         */
        NoOptOut = 0,

        /**
         * The user has opted out of local EMS optimizations only
         */
        LocalOptOut = 1,

        /**
         * The user has opted out of grid EMS optimizations only
         */
        GridOptOut = 2,

        /**
         * The user has opted out of all external optimizations
         */
        OptOut = 3
    }

    /**
     * Allows a client to request an adjustment in the power consumption of an ESA for a specified duration.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.1
     */
    export declare class PowerAdjustRequest {
        constructor(values?: Partial<PowerAdjustRequest>);

        /**
         * This field shall indicate the power that the ESA shall use during the adjustment period.
         *
         * This value shall be between the MinPower and MaxPower fields of the PowerAdjustStruct in the
         * PowerAdjustmentCapability attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.1.1
         */
        power: number | bigint;

        /**
         * This field shall indicate the duration that the ESA shall maintain the requested power for.
         *
         * This value shall be between the MinDuration and MaxDuration fields of the PowerAdjustStruct in the
         * PowerAdjustmentCapability attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.1.2
         */
        duration: number;

        /**
         * This field shall indicate the cause of the request from the EMS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.1.3
         */
        cause: AdjustmentCause;
    };

    /**
     * Allows a client to temporarily pause an operation and reduce the ESAs energy demand.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.4
     */
    export declare class PauseRequest {
        constructor(values?: Partial<PauseRequest>);

        /**
         * This field shall indicate the duration that the ESA shall be paused for. This value shall be between the
         * MinPauseDuration and MaxPauseDuration indicated in the ActiveSlotNumber index in the Slots list in the
         * Forecast.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.4.1
         */
        duration: number;

        /**
         * This field shall indicate the cause of the request from the EMS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.4.2
         */
        cause: AdjustmentCause;
    };

    /**
     * Allows a client to adjust the start time of a Forecast sequence that has not yet started operation (i.e. where
     * the current Forecast StartTime is in the future).
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.3
     */
    export declare class StartTimeAdjustRequest {
        constructor(values?: Partial<StartTimeAdjustRequest>);

        /**
         * This field shall indicate the requested start time, in UTC, that the client would like the appliance to shift
         * its Forecast to. This value shall be in the future.
         *
         * A client can estimate the entire Forecast sequence duration by computing the EndTime - StartTime fields from
         * the Forecast attribute, and therefore avoid scheduling the start time too late.
         *
         * This value shall be after the EarliestStartTime in the Forecast attribute. The new EndTime, that can be
         * computed from the RequestedStartTime and the Forecast sequence duration, shall be before the LatestEndTime.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.3.1
         */
        requestedStartTime: number;

        /**
         * This field shall indicate the cause of the request from the EMS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.3.2
         */
        cause: AdjustmentCause;
    };

    /**
     * Allows a client to modify a Forecast within the limits allowed by the ESA.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.6
     */
    export declare class ModifyForecastRequest {
        constructor(values?: Partial<ModifyForecastRequest>);

        /**
         * This field shall indicate the ForecastID that is to be modified.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.6.1
         */
        forecastId: number;

        /**
         * This field shall contain a list of SlotAdjustment parameters that should be modified in the corresponding
         * Forecast with matching ForecastID.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.6.2
         */
        slotAdjustments: SlotAdjustment[];

        /**
         * This field shall indicate the cause of the request from the EMS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.6.3
         */
        cause: AdjustmentCause;
    };

    /**
     * Allows a client to ask the ESA to recompute its Forecast based on power and time constraints.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.7
     */
    export declare class RequestConstraintBasedForecastRequest {
        constructor(values?: Partial<RequestConstraintBasedForecastRequest>);

        /**
         * This field shall indicate the series of turn up or turn down power requests that the ESA is being asked to
         * constrain its operation within. These requests shall be in the future, shall be in chronological order,
         * starting with the earliest start time, and shall NOT overlap in time.
         *
         * For example, a grid event which requires devices to reduce power (turn down) between 4pm and 6pm and due to
         * excess power on the grid overnight, may request ESAs to increase their power demand (turn up) between
         * midnight and 6am.
         *
         * If this ESA supports PFR this would have 2 entries in the list as follows:
         *
         * If this ESA supports SFR where it does not know the actual power, but has an understanding of the functions
         * that use more energy, it could be requested to use more or less energy using the LoadControl field as
         * follows:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.7.1
         */
        constraints: Constraints[];

        /**
         * This field shall indicate the cause of the request from the EMS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.9.7.2
         */
        cause: AdjustmentCause;
    };

    /**
     * This event shall be generated when the Power Adjustment session ends.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.2
     */
    export declare class PowerAdjustEndEvent {
        constructor(values?: Partial<PowerAdjustEndEvent>);

        /**
         * This field shall indicate the reason why the power adjustment session ended.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.2.1
         */
        cause: Cause;

        /**
         * This field shall indicate the number of seconds that the power adjustment session lasted before ending.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.2.2
         */
        duration: number;

        /**
         * This field shall indicate the approximate energy used by the ESA during the session.
         *
         * For example, if the ESA was on and was adjusted to be switched off, then this shall be 0 mWh. If this was a
         * battery inverter that was requested to discharge it would have a negative EnergyUse value. If this was a
         * normal load that was turned on, then it will have positive value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.2.3
         */
        energyUse: number | bigint;
    };

    /**
     * This event shall be generated when the ESA leaves the Paused state and resumes operation.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.4
     */
    export declare class ResumedEvent {
        constructor(values?: Partial<ResumedEvent>);

        /**
         * This field shall indicate the reason why the pause ended.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.10.4.1
         */
        cause: Cause;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.1
     */
    export enum CostType {
        /**
         * Financial cost
         *
         * This value shall indicate that the cost is related to the financial cost to provide the energy.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.1.1
         */
        Financial = 0,

        /**
         * Grid CO2e grams cost
         *
         * This value shall indicate that the cost is related to greenhouse gas emissions (in grams of CO2e).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.1.2
         */
        GhgEmissions = 1,

        /**
         * Consumer comfort impact cost
         *
         * This value shall indicate that the cost is related to some abstract sense of comfort expressed by the
         * consumer; a higher value indicates more discomfort. For example, a consumer may be more comfortable knowing
         * that their EV is charged earlier in the day in case there is a sudden need to depart and drive to the
         * hospital. Or the consumer may feel inconvenienced by the fact that they need to wait for the washing machine
         * to finish its load so that they can use it again.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.1.3
         */
        Comfort = 2,

        /**
         * Temperature impact cost
         *
         * This value shall indicate that the cost is related to the temperature of the home or water being at its
         * setpoint. Some consumers may be more sensitive to being too hot or too cold.
         *
         * This is expressed in degrees Celsius.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.1.4
         */
        Temperature = 3
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.5
     */
    export enum Cause {
        /**
         * The ESA completed the power adjustment as requested
         */
        NormalCompletion = 0,

        /**
         * The ESA was set to offline
         */
        Offline = 1,

        /**
         * The ESA has developed a fault could not complete the adjustment
         */
        Fault = 2,

        /**
         * The user has disabled the ESA’s flexibility capability
         */
        UserOptOut = 3,

        /**
         * The adjustment was cancelled by a client
         */
        Cancelled = 4
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.6
     */
    export enum AdjustmentCause {
        /**
         * The adjustment is to optimize the local energy usage
         */
        LocalOptimization = 0,

        /**
         * The adjustment is to optimize the grid energy usage
         */
        GridOptimization = 1
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.7
     */
    export enum ForecastUpdateReason {
        /**
         * The update was due to internal ESA device optimization
         */
        InternalOptimization = 0,

        /**
         * The update was due to local EMS optimization
         */
        LocalOptimization = 1,

        /**
         * The update was due to grid optimization
         */
        GridOptimization = 2
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.8
     */
    export enum PowerAdjustReason {
        /**
         * There is no Power Adjustment active
         */
        NoAdjustment = 0,

        /**
         * There is PowerAdjustment active due to local EMS optimization
         */
        LocalOptimizationAdjustment = 1,

        /**
         * There is PowerAdjustment active due to grid optimization
         */
        GridOptimizationAdjustment = 2
    }

    /**
     * This indicates a generic mechanism for expressing cost to run an appliance, in terms of financial, GHG emissions,
     * comfort value etc.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.9
     */
    export declare class Cost {
        constructor(values?: Partial<Cost>);

        /**
         * This field shall indicate the type of cost being represented (see CostTypeEnum).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.9.1
         */
        costType: CostType;

        /**
         * This field shall indicate the value of the cost. This may be negative (indicating that it is not a cost, but
         * a free benefit).
         *
         * For example, if the Value was -302 and DecimalPoints was 2, then this would represent a benefit of 3.02.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.9.2
         */
        value: number;

        /**
         * This field shall indicate the number of digits to the right of the decimal point in the Value field. For
         * example, if the Value was 102 and DecimalPoints was 2, then this would represent a cost of 1.02.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.9.3
         */
        decimalPoints: number;

        /**
         * Indicates the currency for the value in the Value field. The value of the currency field shall match the
         * values defined by [ISO 4217].
         *
         * This is an optional field. It shall be included if CostType is Financial.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.9.4
         */
        currency?: number;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.10
     */
    export declare class PowerAdjust {
        constructor(values?: Partial<PowerAdjust>);

        /**
         * This field shall indicate the minimum power that the ESA can have its power adjusted to.
         *
         * Note that this is a signed value. Negative values indicate power flows out of the node (e.g. discharging a
         * battery).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.10.1
         */
        minPower: number | bigint;

        /**
         * This field shall indicate the maximum power that the ESA can have its power adjusted to.
         *
         * Note that this is a signed value. Negative values indicate power flows out of the node (e.g. discharging a
         * battery).
         *
         * For example, if the charging current of an EVSE can be adjusted within the range of 6A to 32A on a 230V
         * supply, then the power adjustment range is between 1380W and 7360W. Here the MinPower would be 1380W, and
         * MaxPower would be 7360W.
         *
         * For example, if a battery storage inverter can discharge between 0 to 3000W towards a load, then power is
         * flowing out of the node and is therefore negative. Its MinPower would be -3000W and its MaxPower would be 0W.
         *
         * In another example, if a battery storage inverter can charge its internal battery, between 0W and 2000W. Here
         * power is flowing into the node when charging. As such the MinPower becomes 0W and MaxPower becomes 2000W.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.10.2
         */
        maxPower: number | bigint;

        /**
         * This field shall indicate the minimum duration, in seconds, that a controller may invoke an ESA power
         * adjustment. Manufacturers may use this to as an anti-cycling capability to avoid controllers from rapidly
         * making power adjustments.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.10.3
         */
        minDuration: number;

        /**
         * This field shall indicate the maximum duration, in seconds, that a controller may invoke an ESA power
         * adjustment. Manufacturers may use this to protect the user experience, to avoid over heating of the ESA,
         * ensuring that there is sufficient headroom to use or store energy in the ESA or for any other reason.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.10.4
         */
        maxDuration: number;
    };

    /**
     * This indicates a specific stage of an ESA’s operation.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14
     */
    export declare class Slot {
        constructor(values?: Partial<Slot>);

        /**
         * This field shall indicate the minimum time (in seconds) that the appliance expects to be in this slot for.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.1
         */
        minDuration: number;

        /**
         * This field shall indicate the maximum time (in seconds) that the appliance expects to be in this slot for.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.2
         */
        maxDuration: number;

        /**
         * This field shall indicate the expected time (in seconds) that the appliance expects to be in this slot for.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.3
         */
        defaultDuration: number;

        /**
         * This field shall indicate the time (in seconds) that has already elapsed whilst in this slot. If the slot has
         * not yet been started, then it shall be 0. Once the slot has been completed, then this reflects how much time
         * was spent in this slot.
         *
         * When subscribed to, a change in this field value shall NOT cause the Forecast attribute to be updated since
         * this value may change every 1 second.
         *
         * When the Forecast attribute is read, then this value shall be the most recent value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.4
         */
        elapsedSlotTime: number;

        /**
         * This field shall indicate the time (in seconds) that is estimated to be remaining.
         *
         * Note that it may not align to the DefaultDuration - ElapsedSlotTime since an appliance may have revised its
         * planned operation based on conditions.
         *
         * When subscribed to, a change in this field value shall NOT cause the Forecast attribute to be updated, since
         * this value may change every 1 second.
         *
         * Note that if the ESA is currently paused, then this value shall NOT change.
         *
         * When the Forecast attribute is read, then this value shall be the most recent value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.5
         */
        remainingSlotTime: number;

        /**
         * This field shall indicate whether this slot can be paused.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.6
         */
        slotIsPausable?: boolean;

        /**
         * This field shall indicate the shortest period that the slot can be paused for. This can be set to avoid
         * controllers trying to pause ESAs for short periods and then resuming operation in a cyclic fashion which may
         * damage or cause excess energy to be consumed with restarting of an operation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.7
         */
        minPauseDuration?: number;

        /**
         * This field shall indicate the longest period that the slot can be paused for.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.8
         */
        maxPauseDuration?: number;

        /**
         * This field shall indicate a manufacturer defined value indicating the state of the ESA.
         *
         * This may be used by an observing EMS which also has access to the metering data to ascertain the typical
         * power drawn when the ESA is in a manufacturer defined state.
         *
         * Some appliances, such as smart thermostats, may not know how much power is being drawn by the HVAC system,
         * but do know what they have asked the HVAC system to do.
         *
         * Manufacturers can use this value to indicate a variety of states in an unspecified way. For example, they may
         * choose to use values between 0-100 as a percentage of compressor modulation, or could use these values as
         * Enum states meaning heating with fan, heating without fan etc.
         *
         * > [!NOTE]
         *
         * > An ESA shall always use the same value to represent the same operating state.
         *
         * By providing this information a smart EMS may be able to learn the observed power draw when the ESA is put
         * into a specific state. It can potentially then use the ManufacturerESAState field in the Forecast attribute
         * along with observed power drawn to predict the power draw from the appliance and potentially ask it to modify
         * its timing via one of the adjustment request commands, or adjust other ESAs power to compensate.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.9
         */
        manufacturerEsaState?: number;

        /**
         * This field shall indicate the expected power that the appliance will use during this slot. It may be
         * considered the average value over the slot, and some variation from this would be expected (for example, as
         * it is ramping up).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.10
         */
        nominalPower?: number | bigint;

        /**
         * This field shall indicate the lowest power that the appliance expects to use during this slot. (e.g. during a
         * ramp up it may be 0W).
         *
         * Some appliances (e.g. battery inverters which can charge and discharge) may have a negative power.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.11
         */
        minPower?: number | bigint;

        /**
         * This field shall indicate the maximum power that the appliance expects to use during this slot. (e.g. during
         * a ramp up it may be 0W). This field ignores the effects of short-lived inrush currents.
         *
         * Some appliances (e.g. battery inverters which can charge and discharge) may have a negative power.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.12
         */
        maxPower?: number | bigint;

        /**
         * This field shall indicate the expected energy that the appliance expects to use or produce during this slot.
         *
         * Some appliances (e.g. battery inverters which can charge and discharge) may have a negative energy.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.13
         */
        nominalEnergy?: number | bigint;

        /**
         * This field shall indicate the current estimated cost for operating.
         *
         * For example, if the device has access to an Energy pricing server it may be able to use the tariff to
         * estimate the cost of energy for this slot in the power forecast.
         *
         * When an Energy Management System requests a change in the schedule, then the device may suggest a change in
         * the cost as a result of shifting its energy. This can allow a demand side response service to be informed of
         * the relative cost to use energy at a different time.
         *
         * The Costs field is a list of CostStruct structures which allows multiple CostTypeEnum and Values to be shared
         * by the energy appliance. These could be based on GHG emissions, comfort value for the consumer etc.
         *
         * For example, comfort could be expressed in abstract units or in currency. A water heater that is heated
         * earlier in the day is likely to lose some of its heat before it is needed, which could require a top-up
         * heating event to occur later in the day (which may incur additional cost).
         *
         * If the ESA cannot calculate its cost for any reason (such as losing its connection to a Price server) it may
         * omit this field. This is treated as extra meta data that an EMS may use to optimize a system.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.14
         */
        costs?: Cost[];

        /**
         * This field shall indicate the minimum power that the appliance can be requested to use.
         *
         * For example, some EVSEs cannot be switched on to charge below 6A which may equate to ~1.3kW in EU markets. If
         * the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this allows an ESA to
         * indicate it could be switched on to charge, but this would be the minimum power limit it can be set to.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.15
         */
        minPowerAdjustment?: number | bigint;

        /**
         * This field shall indicate the maximum power that the appliance can be requested to use.
         *
         * For example, an EVSE may be limited by its electrical supply to 32A which would be ~7.6kW in EU markets. If
         * the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this allows an ESA to
         * indicate it could be switched on to charge, but this would be the maximum power limit it can be set to.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.16
         */
        maxPowerAdjustment?: number | bigint;

        /**
         * This field shall indicate the minimum time, in seconds, that the slot can be requested to shortened to.
         *
         * For example, if the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this would
         * allow an ESA to specify the minimum time it could be switched on for. This is to help protect the appliance
         * from being damaged by short cycling times.
         *
         * For example, a heat pump compressor may have a minimum cycle time of order a few minutes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.17
         */
        minDurationAdjustment?: number;

        /**
         * This field shall indicate the maximum time, in seconds, that the slot can be requested to extended to.
         *
         * For example, if the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this allows
         * an ESA to specify the maximum time it could be switched on for. This may allow a battery or water heater to
         * indicate the maximum duration that it can charge for before becoming full. In the case of a battery inverter
         * which can be discharged, it may equally indicate the maximum time the battery could be discharged for (at the
         * MaxPowerAdjustment power level).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.14.18
         */
        maxDurationAdjustment?: number;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.15
     */
    export declare class SlotAdjustment {
        constructor(values?: Partial<SlotAdjustment>);

        /**
         * This field shall indicate the index into the Slots list within the Forecast that is to be modified. It shall
         * be less than the actual length of the Slots list (implicitly it must be in the range 0 to 9 based on the
         * maximum length of the Slots list constraint).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.15.1
         */
        slotIndex: number;

        /**
         * This field shall indicate the new requested power that the ESA shall operate at. It shall be between the
         * AbsMinPower and AbsMaxPower attributes as advertised by the ESA if it supports PFR.
         *
         * This is a signed value and can be used to indicate charging or discharging.
         *
         * If the ESA does NOT support PFR this value shall be ignored by the ESA.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.15.2
         */
        nominalPower?: number | bigint;

        /**
         * This field shall indicate the new requested duration, in seconds, that the ESA shall extend or shorten the
         * slot duration to. It shall be between the MinDurationAdjustment and MaxDurationAdjustment for the slot as
         * advertised by the ESA.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.15.3
         */
        duration: number;
    };

    /**
     * The ConstraintsStruct allows a client to inform an ESA about a constraint period (such as a grid event, or
     * perhaps excess solar PV). The format allows the client to suggest that the ESA can either turn up its energy
     * consumption, or turn down its energy consumption during this period.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.16
     */
    export declare class Constraints {
        constructor(values?: Partial<Constraints>);

        /**
         * This field shall indicate the start time of the constraint period that the client wishes the ESA to compute a
         * new Forecast.
         *
         * This value is in UTC and shall be in the future.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.16.1
         */
        startTime: number;

        /**
         * This field shall indicate the duration of the constraint in seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.16.2
         */
        duration: number;

        /**
         * This field shall indicate the nominal power that client wishes the ESA to operate at during the constrained
         * period. It shall be between the AbsMinPower and AbsMaxPower attributes as advertised by the ESA if it
         * supports PFR.
         *
         * This is a signed value and can be used to indicate charging or discharging.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.16.3
         */
        nominalPower?: number | bigint;

        /**
         * This field shall indicate the maximum energy that can be transferred to or from the ESA during the constraint
         * period.
         *
         * This is a signed value and can be used to indicate charging or discharging.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.16.4
         */
        maximumEnergy?: number | bigint;

        /**
         * This field shall indicate the turn up or turn down nature that the grid wants as the outcome by the ESA
         * during the constraint period.
         *
         * This is expressed as a signed value between -100 to +100. A value of 0 would indicate no bias to using more
         * or less energy. A negative value indicates a request to use less energy. A positive value indicates a request
         * to use more energy.
         *
         * Note that the mapping between values and operation is manufacturer specific.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.2.7.16.5
         */
        loadControl?: number;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link DeviceEnergyManagement}.
     */
    export const Cluster: typeof DeviceEnergyManagement;

    /**
     * @deprecated Use {@link DeviceEnergyManagement}.
     */
    export const Complete: typeof DeviceEnergyManagement;

    export const Typing: DeviceEnergyManagement;
}

/**
 * @deprecated Use {@link DeviceEnergyManagement}.
 */
export declare const DeviceEnergyManagementCluster: typeof DeviceEnergyManagement;

export interface DeviceEnergyManagement extends ClusterTyping {
    Attributes: DeviceEnergyManagement.Attributes;
    Commands: DeviceEnergyManagement.Commands;
    Events: DeviceEnergyManagement.Events;
    Features: DeviceEnergyManagement.Features;
    Components: DeviceEnergyManagement.Components;
}
