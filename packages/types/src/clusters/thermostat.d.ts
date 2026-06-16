/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";
import type { AttributeId } from "../datatype/AttributeId.js";
import type { Status } from "../globals/Status.js";

/**
 * Definitions for the Thermostat cluster.
 *
 * This cluster provides an interface to the functionality of a thermostat.
 *
 * !thermostat devices
 *
 * @see {@link MatterSpecification.v16.Cluster} § 4.3
 */
export declare namespace Thermostat {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0201;

    /**
     * Textual cluster identifier.
     */
    export const name: "Thermostat";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v16.Cluster}.
     */
    export const revision: 11;

    /**
     * Canonical metadata for the Thermostat cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Thermostat} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the current Calculated Local Temperature, when available.
         *
         *   - If the LTNE feature is not supported:
         *
         *   - If the LocalTemperatureCalibration is invalid or currently unavailable, the attribute shall report null.
         *
         *   - If the LocalTemperatureCalibration is valid, the attribute shall report that value.
         *
         *   - Otherwise, if the LTNE feature is supported, there is no feedback externally available for the
         *     LocalTemperatureCalibration. In that case, the LocalTemperature attribute shall always report null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.2
         */
        localTemperature: number | null;

        /**
         * Indicates the overall operating environment of the thermostat, and thus the possible system modes that the
         * thermostat can operate in.
         *
         * If an attempt is made to write to this attribute, the server shall silently ignore the write and the value of
         * this attribute shall remain unchanged. This behavior is in place for backwards compatibility with existing
         * thermostats.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.21
         */
        controlSequenceOfOperation: ControlSequenceOfOperation;

        /**
         * Indicates the current operating mode of the thermostat. Its value shall be limited by the
         * ControlSequenceOfOperation attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.22
         */
        systemMode: SystemMode;

        /**
         * Indicates the outdoor temperature, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.3
         */
        outdoorTemperature?: number | null;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        piCoolingDemand?: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        piHeatingDemand?: any;

        /**
         * Indicates the HVAC system type controlled by the thermostat. If the thermostat uses physical DIP switches to
         * set these parameters, this information shall be available read-only from the DIP switches. If these
         * parameters are set via software, there shall be read/write access in order to provide remote programming
         * capability.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.9
         * @deprecated
         */
        hvacSystemTypeConfiguration?: any;

        /**
         * Indicates when the local temperature, outdoor temperature and occupancy are being sensed by remote networked
         * sensors, rather than internal sensors.
         *
         * If the LTNE feature is present in the server, the LocalTemperature RemoteSensing bit value shall always
         * report a value of 0.
         *
         * If the LocalTemperature RemoteSensing bit is written with a value of 1 when the LTNE feature is present, the
         * write shall fail and the server shall report a CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.20
         */
        remoteSensing?: RemoteSensing;

        /**
         * Indicates the temperature hold status on the thermostat. If hold status is on, the thermostat SHOULD maintain
         * the temperature setpoint for the current mode until a system mode change. If hold status is off, the
         * thermostat SHOULD follow the setpoint transitions specified by its internal scheduling program. If the
         * thermostat supports setpoint hold for a specific duration, it SHOULD also implement the
         * TemperatureSetpointHoldDuration attribute.
         *
         * If the server supports a setpoint hold for a specific duration, it SHOULD also implement the
         * SetpointHoldExpiryTimestamp attribute.
         *
         * If this attribute is updated to SetpointHoldOn and the TemperatureSetpointHoldDuration has a non-null value
         * and the SetpointHoldExpiryTimestamp is supported, the server shall update the SetpointHoldExpiryTimestamp
         * with a value of current UTC timestamp, in seconds, plus the value in TemperatureSetpointHoldDuration
         * multiplied by 60.
         *
         * If this attribute is updated to SetpointHoldOff and the SetpointHoldExpiryTimestamp is supported, the server
         * shall set the SetpointHoldExpiryTimestamp to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.27
         */
        temperatureSetpointHold?: TemperatureSetpointHold;

        /**
         * Indicates the period in minutes for which a setpoint hold is active. Thermostats that support hold for a
         * specified duration SHOULD implement this attribute. The null value indicates the field is unused. All other
         * values are reserved.
         *
         * If this attribute is updated to a non-null value and the TemperatureSetpointHold is set to SetpointHoldOn and
         * the SetpointHoldExpiryTimestamp is supported, the server shall update SetpointHoldExpiryTimestamp with a
         * value of current UTC timestamp, in seconds, plus the new value of this attribute multiplied by 60.
         *
         * If this attribute is set to null and the SetpointHoldExpiryTimestamp is supported, the server shall set the
         * SetpointHoldExpiryTimestamp to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.28
         */
        temperatureSetpointHoldDuration?: number | null;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        thermostatProgrammingOperationMode?: any;

        /**
         * Indicates the current relay state of the heat, cool, and fan relays.
         *
         * Unimplemented outputs shall be treated as if they were Off.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.29
         */
        thermostatRunningState?: RelayState;

        /**
         * Indicates the source of the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint (i.e., who or
         * what determined the current setpoint).
         *
         * This attribute enables service providers to determine whether changes to setpoints were initiated due to
         * occupant comfort, scheduled programming or some other source (e.g., electric utility or other service
         * provider). Because automation services may initiate frequent setpoint changes, this attribute clearly
         * differentiates the source of setpoint changes made at the thermostat.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.30
         */
        setpointChangeSource?: SetpointChangeSource;

        /**
         * Indicates the delta between the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint and the
         * previous active setpoint. This attribute is meant to accompany the SetpointChangeSource attribute; devices
         * implementing SetpointChangeAmount SHOULD also implement SetpointChangeSource.
         *
         * The null value indicates that the previous setpoint was unknown.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.31
         */
        setpointChangeAmount?: number | null;

        /**
         * Indicates the time in UTC at which the SetpointChangeAmount attribute change was recorded.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.32
         */
        setpointChangeSourceTimestamp?: number;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        occupiedSetback?: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        occupiedSetbackMin?: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        occupiedSetbackMax?: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        unoccupiedSetback?: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        unoccupiedSetbackMin?: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        unoccupiedSetbackMax?: any;

        /**
         * Indicates the delta between the Calculated Local Temperature and the OccupiedHeatingSetpoint or
         * UnoccupiedHeatingSetpoint attributes at which the Thermostat server will operate in emergency heat mode.
         *
         * If the difference between the Calculated Local Temperature and OccupiedCoolingSetpoint or
         * UnoccupiedCoolingSetpoint is greater than or equal to the EmergencyHeatDelta and the Thermostat server's
         * SystemMode attribute is in a heating-related mode, then the Thermostat server shall immediately switch to the
         * SystemMode attribute value that provides the highest stage of heating (e.g., emergency heat) and continue
         * operating in that running state until the OccupiedHeatingSetpoint value is reached. For example:
         *
         *   - Calculated Local Temperature = 10.0°C
         *
         *   - OccupiedHeatingSetpoint = 16.0°C
         *
         *   - EmergencyHeatDelta = 2.0°C
         *
         * => OccupiedHeatingSetpoint - Calculated Local Temperature ≥? EmergencyHeatDelta
         *
         *   - => 16°C - 10°C ≥? 2°C
         *
         * => TRUE >>> Thermostat server changes its SystemMode to operate in 2^nd stage or emergency heat mode
         *
         * The purpose of this attribute is to provide Thermostat clients the ability to configure rapid heating when a
         * setpoint is of a specified amount greater than the measured temperature. This allows the heated space to be
         * quickly heated to the desired level set by the user.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.33
         */
        emergencyHeatDelta?: number;

        /**
         * Indicates the type of Mini Split ACTypeEnum of Mini Split AC is defined depending on how Cooling and Heating
         * condition is achieved by Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.34
         */
        acType?: AcType;

        /**
         * Indicates capacity of Mini Split AC in terms of the format defined by the ACCapacityFormat attribute
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.35
         */
        acCapacity?: number;

        /**
         * Indicates type of refrigerant used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.36
         */
        acRefrigerantType?: AcRefrigerantType;

        /**
         * Indicates the type of compressor used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.37
         */
        acCompressorType?: AcCompressorType;

        /**
         * Indicates the type of errors encountered within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.38
         */
        acErrorCode?: AcErrorCode;

        /**
         * Indicates the position of Louver on the AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.39
         */
        acLouverPosition?: AcLouverPosition;

        /**
         * Indicates the temperature of the AC coil, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.40
         */
        acCoilTemperature?: number | null;

        /**
         * Indicates the format for the ACCapacity attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.41
         */
        acCapacityFormat?: AcCapacityFormat;

        /**
         * If there is a known time when the TemperatureSetpointHold shall be cleared, this attribute shall contain the
         * timestamp in UTC indicating when that will happen. If there is no such known time, this attribute shall be
         * null.
         *
         * If the TemperatureSetpointHold is set to SetpointHoldOn and the TemperatureSetpointHoldDuration is set to
         * null, this attribute shall be set to null indicating there is a hold on the Thermostat without a duration.
         *
         * If the TemperatureSetpointHold is set to SetpointHoldOff, this attribute shall be set to null indicating
         * there is no hold on the Thermostat.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.52
         */
        setpointHoldExpiryTimestamp?: number | null;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "Occupancy".
     */
    export interface OccupancyAttributes {
        /**
         * Indicates whether the heated/cooled space is occupied or not, as measured locally or remotely (over the
         * network).
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.4
         */
        occupancy: Occupancy;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "Heating".
     */
    export interface HeatingAttributes {
        /**
         * Indicates the heating mode setpoint when the room is occupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less than
         * MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is greater than (OccupiedCoolingSetpoint - MinSetpointDeadBand), the
         * value of OccupiedCoolingSetpoint shall be adjusted to (OccupiedHeatingSetpoint + MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall be used as the heating mode setpoint.
         *
         * If a client changes the value of this attribute, the server supports the PRES feature, and the server either
         * does not support the OCC feature or the Occupied bit is set on the Occupancy attribute, the value of the
         * ActivePresetHandle attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.12
         */
        occupiedHeatingSetpoint: number;

        /**
         * Indicates the absolute minimum level that the heating setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.5
         */
        absMinHeatSetpointLimit?: number;

        /**
         * Indicates the absolute maximum level that the heating setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.6
         */
        absMaxHeatSetpointLimit?: number;

        /**
         * Indicates the minimum level that the heating setpoint may be set to.
         *
         * This attribute, and the following three attributes, allow the user to define setpoint limits more
         * constrictive than the manufacturer imposed ones. Limiting users (e.g., in a commercial building) to such
         * setpoint limits can help conserve power.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.15
         */
        minHeatSetpointLimit?: number;

        /**
         * Indicates the maximum level that the heating setpoint may be set to.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.16
         */
        maxHeatSetpointLimit?: number;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "Cooling".
     */
    export interface CoolingAttributes {
        /**
         * Indicates the cooling mode setpoint when the room is occupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less than
         * MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is less than (OccupiedHeatingSetpoint + MinSetpointDeadBand), the
         * value of OccupiedHeatingSetpoint shall be adjusted to (OccupiedCoolingSetpoint - MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall be used as the cooling mode setpoint.
         *
         * If a client changes the value of this attribute, the server supports the PRES feature, and the server either
         * does not support the OCC feature or the Occupied bit is set on the Occupancy attribute, the value of the
         * ActivePresetHandle attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.11
         */
        occupiedCoolingSetpoint: number;

        /**
         * Indicates the absolute minimum level that the cooling setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.7
         */
        absMinCoolSetpointLimit?: number;

        /**
         * Indicates the absolute maximum level that the cooling setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.8
         */
        absMaxCoolSetpointLimit?: number;

        /**
         * Indicates the minimum level that the cooling setpoint may be set to.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.17
         */
        minCoolSetpointLimit?: number;

        /**
         * Indicates the maximum level that the cooling setpoint may be set to.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.18
         */
        maxCoolSetpointLimit?: number;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "NotLocalTemperatureNotExposed".
     */
    export interface NotLocalTemperatureNotExposedAttributes {
        /**
         * Indicates the offset the Thermostat server shall make to the measured temperature (locally or remotely) to
         * adjust the Calculated Local Temperature prior to using, displaying or reporting it.
         *
         * The purpose of this attribute is to adjust the calibration of the Thermostat server per the user's
         * preferences (e.g., to match if there are multiple servers displaying different values for the same HVAC area)
         * or compensate for variability amongst temperature sensors.
         *
         * If a Thermostat client attempts to write LocalTemperatureCalibration attribute to an unsupported value (e.g.,
         * out of the range supported by the Thermostat server), the Thermostat server shall respond with a status of
         * SUCCESS and set the value of LocalTemperatureCalibration to the upper or lower limit reached.
         *
         * > [!NOTE]
         *
         * > NOTE: Prior to revision 8 of this cluster specification the value of this attribute was constrained to a
         *   range of -2.5°C to 2.5°C.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.10
         */
        localTemperatureCalibration?: number;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "CoolingAndOccupancy".
     */
    export interface CoolingAndOccupancyAttributes {
        /**
         * Indicates the cooling mode setpoint when the room is unoccupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less than
         * MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is less than (UnoccupiedHeatingSetpoint + MinSetpointDeadBand), the
         * value of UnoccupiedHeatingSetpoint shall be adjusted to (UnoccupiedCoolingSetpoint - MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall NOT be used.
         *
         * If a client changes the value of this attribute, the server supports the PRES and OCC features, and the
         * Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle attribute shall be
         * set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.13
         */
        unoccupiedCoolingSetpoint: number;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "HeatingAndOccupancy".
     */
    export interface HeatingAndOccupancyAttributes {
        /**
         * Indicates the heating mode setpoint when the room is unoccupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less than
         * MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is greater than (UnoccupiedCoolingSetpoint - MinSetpointDeadBand),
         * the value of UnoccupiedCoolingSetpoint shall be adjusted to (UnoccupiedHeatingSetpoint +
         * MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall NOT be used.
         *
         * If a client changes the value of this attribute, the server supports the PRES and OCC features, and the
         * Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle attribute shall be
         * set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.14
         */
        unoccupiedHeatingSetpoint: number;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "AutoMode".
     */
    export interface AutoModeAttributes {
        /**
         * On devices which support the AUTO feature, this attribute shall indicate the minimum difference between the
         * Heat Setpoint and the Cool Setpoint.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * > [!NOTE]
         *
         * > NOTE: Prior to revision 8 of this cluster specification the value of this attribute was constrained to a
         *   range of 0°C to 2.5°C.
         *
         * > [!NOTE]
         *
         * > NOTE: For backwards compatibility, this attribute is optionally writeable. However any writes to this
         *   attribute shall be silently ignored.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.19
         */
        minSetpointDeadBand: number;

        /**
         * Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum but can
         * only be Off, Cool or Heat. This attribute is intended to provide additional information when the thermostat's
         * system mode is in auto mode.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.23
         */
        thermostatRunningMode?: ThermostatRunningMode;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "EventsAndAutoMode".
     */
    export interface EventsAndAutoModeAttributes {
        /**
         * Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum but can
         * only be Off, Cool or Heat. This attribute is intended to provide additional information when the thermostat's
         * system mode is in auto mode.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.23
         */
        thermostatRunningMode: ThermostatRunningMode;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "Presets".
     */
    export interface PresetsAttributes {
        /**
         * Indicates the supported PresetScenarioEnum values, limits on how many presets can be created for each
         * PresetScenarioEnum, and whether or not a thermostat can transition automatically to a given scenario.
         *
         * The list shall contain at least one entry. The list shall NOT be larger than the number of supported
         * PresetScenarioEnum values (maximum 7). The list shall NOT contain any PresetTypeStruct entries with duplicate
         * PresetScenarioEnum values.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.42
         */
        presetTypes: PresetType[];

        /**
         * Indicates the maximum number of entries supported by the Presets attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.44
         */
        numberOfPresets: number;

        /**
         * Indicates the PresetHandle of the active preset. If this attribute is null, then there is no active preset.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.48
         */
        activePresetHandle: Bytes | null;

        /**
         * This attribute shall contain the current list of configured presets.
         *
         * On receipt of a write request:
         *
         *   1. If the PresetHandle field is null, the PresetStruct shall be treated as an added preset, and the device
         *      shall create a new unique value for the PresetHandle field.
         *
         *   1. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. If the PresetHandle field is not null, the PresetStruct shall be treated as a modification of an
         *      existing preset.
         *
         *   1. If the value of the PresetHandle field does not match any of the existing presets, a response with the
         *      status code NOT_FOUND shall be returned.
         *
         *   2. If the value of the PresetHandle field is duplicated on multiple presets in the updated list, a response
         *      with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   3. If the BuiltIn field is true, and the PresetStruct in the current value with a matching PresetHandle
         *      field has a BuiltIn field set to false, a response with the status code CONSTRAINT_ERROR shall be
         *      returned.
         *
         *   4. If the BuiltIn field is false, and the PresetStruct in the current value with a matching PresetHandle
         *      field has a BuiltIn field set to true, a response with the status code CONSTRAINT_ERROR shall be
         *      returned.
         *
         *   3. If the specified PresetScenarioEnum value does not exist in PresetTypes, a response with the status code
         *      CONSTRAINT_ERROR shall be returned.
         *
         *   4. If the Name is set, but the associated PresetTypeStruct does not have the SupportsNames bit set, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   5. If appending the received PresetStruct to the pending list of Presets would cause the total number of
         *      pending presets to exceed the value of the NumberOfPresets attribute, a response with the status code
         *      RESOURCE_EXHAUSTED shall be returned.
         *
         *   6. If appending the received PresetStruct to the pending list of Presets would cause the total number of
         *      pending presets whose PresetScenario field matches the appended preset's PresetScenario field to exceed
         *      the value of the NumberOfPresets field on the PresetTypeStruct whose PresetScenario matches the appended
         *      preset's PresetScenario field, a response with the status code RESOURCE_EXHAUSTED shall be returned.
         *
         *   7. Otherwise, the write shall be pended until receipt of a commit request, and the status code SUCCESS
         *      shall be returned.
         *
         *   1. If the BuiltIn field is null:
         *
         *   1. If there is a PresetStruct in the current value with a matching PresetHandle field, the BuiltIn field on
         *      the pending PresetStruct shall be set to the value of the BuiltIn on the matching PresetStruct.
         *
         *   2. Otherwise, the BuiltIn field on the pending PresetStruct shall be set to false.
         *
         * On an attempt to commit, the status of this attribute shall be determined as follows:
         *
         *   1. For all existing presets:
         *
         *   1. If, after applying all pending changes, the updated value of the Presets attribute would not contain a
         *      PresetStruct with a matching PresetHandle field, indicating the removal of the PresetStruct, the server
         *      shall check for invalid removal of the PresetStruct:
         *
         *   1. If the BuiltIn field is true on the removed PresetStruct, the attribute status shall be
         *      CONSTRAINT_ERROR.
         *
         *   2. If the MSCH feature is supported and the removed PresetHandle would be referenced by any PresetHandle on
         *      any ScheduleTransitionStruct on any ScheduleStruct in the updated value of the Schedules attribute, the
         *      attribute status shall be INVALID_IN_STATE.
         *
         *   3. If the removed PresetHandle is equal to the value of the ActivePresetHandle attribute, the attribute
         *      status shall be INVALID_IN_STATE.
         *
         *   2. If the attribute status has not yet been determined:
         *
         *   1. The attribute status shall be SUCCESS.
         *
         *   2. For all existing presets:
         *
         *   1. If, after applying all pending changes, the updated value of the Presets attribute would not contain a
         *      PresetStruct with a matching PresetHandle field, indicating the removal of the PresetStruct, the server
         *      shall ensure that the preset being removed is unused, as follows:
         *
         *   1. If the PresetHandle field of the removed preset is equal to the value of the PresetHandle field of the
         *      CurrentThermostatSuggestion attribute's value, the CurrentThermostatSuggestion attribute shall be set to
         *      null.
         *
         *   2. If the PresetHandle field of the removed preset is equal to the value of the PresetHandle field of one
         *      or more of the entries in the ThermostatSuggestions attribute, the server shall delete any such entries
         *      from the ThermostatSuggestions attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.50
         */
        presets: Preset[];
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "MatterScheduleConfiguration".
     */
    export interface MatterScheduleConfigurationAttributes {
        /**
         * Indicates the supported SystemMode values for Schedules, limits on how many schedules can be created for each
         * SystemMode value, and whether or not a given SystemMode value supports transitions to Presets, target
         * setpoints, or both.
         *
         * The list shall contain at least one entry. The list shall NOT be larger than the number of supported schedule
         * SystemMode values (maximum 3, since the data type only allows Auto, Heat and Cool). The list shall NOT
         * contain any ScheduleTypeStruct entries with duplicate SystemModeEnum values.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.43
         */
        scheduleTypes: ScheduleType[];

        /**
         * Indicates the maximum number of entries supported by the Schedules attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.45
         */
        numberOfSchedules: number;

        /**
         * Indicates the maximum number of transitions per Schedules attribute entry.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.46
         */
        numberOfScheduleTransitions: number;

        /**
         * Indicates the maximum number of transitions per day of the week supported by each Schedules attribute entry.
         * If this value is null, there is no limit on the number of transitions per day.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.47
         */
        numberOfScheduleTransitionPerDay: number | null;

        /**
         * Indicates the ScheduleHandle of the active schedule. A null value in this attribute indicates that there is
         * no active schedule.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.49
         */
        activeScheduleHandle: Bytes | null;

        /**
         * This attribute shall contain a list of ScheduleStructs.
         *
         * On receipt of a write request:
         *
         *   1. For all schedules in the write request:
         *
         *   1. If the ScheduleHandle field is null, the ScheduleStruct shall be treated as an added schedule, and the
         *      device shall create a new unique value for the ScheduleHandle field.
         *
         *   1. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. Otherwise, if the ScheduleHandle field is not null, the ScheduleStruct shall be treated as a
         *      modification of an existing schedule.
         *
         *   1. If the value of the ScheduleHandle field does not match any of the existing schedules, a response with
         *      the status code NOT_FOUND shall be returned.
         *
         *   2. If the BuiltIn field is true, and the ScheduleStruct in the current value with a matching ScheduleHandle
         *      field has a BuiltIn field set to false, a response with the status code CONSTRAINT_ERROR shall be
         *      returned.
         *
         *   3. If the BuiltIn field is false, and the ScheduleStruct in the current value with a matching
         *      ScheduleHandle field has a BuiltIn field set to true, a response with the status code CONSTRAINT_ERROR
         *      shall be returned.
         *
         *   3. If the specified SystemMode does not exist in ScheduleTypes, a response with the status code
         *      CONSTRAINT_ERROR shall be returned.
         *
         *   4. If the number of transitions exceeds the NumberOfScheduleTransitions value, a response with the status
         *      code RESOURCE_EXHAUSTED shall be returned.
         *
         *   5. If the value of the NumberOfScheduleTransitionPerDay attribute is not null, and the number of
         *      transitions on any single day of the week exceeds the NumberOfScheduleTransitionPerDay value, a response
         *      with the status code RESOURCE_EXHAUSTED shall be returned.
         *
         *   6. If the PresetHandle field is present, but the associated ScheduleTypeStruct does not have the
         *      SupportsPresets bit set, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   7. If the PresetHandle field is present, but after applying all pending changes, the Presets attribute
         *      would not contain a PresetStruct whose PresetHandle field matches the value of the PresetHandle field, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   8. If the Name is set, but the associated ScheduleTypeStruct does not have the SupportsNames bit set, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   9. For all transitions in all schedules in the write request:
         *
         *   1. If the PresetHandle field is present, but the ScheduleTypeStruct matching the value of the SystemMode
         *      field on the encompassing ScheduleStruct does not have the SupportsPresets bit set, a response with the
         *      status code CONSTRAINT_ERROR shall be returned.
         *
         *   10. If the PresetHandle field is present, but after applying all pending changes, the Presets attribute
         *       would not contain a PresetStruct whose PresetHandle field matches the value of the PresetHandle field,
         *       a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   1. If the SystemMode field is present, but the ScheduleTypeStruct matching the value of the SystemMode
         *      field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a response with
         *      the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. If the SystemMode field is has a value of SystemModeOff, but the ScheduleTypeStruct matching the value
         *      of the SystemMode field on the encompassing ScheduleStruct does not have the SupportsOff bit set, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   11. If the HeatingSetpoint field is present, but the ScheduleTypeStruct matching the value of the
         *       SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a
         *       response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   12. If the CoolingSetpoint field is present, but the ScheduleTypeStruct matching the value of the
         *       SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a
         *       response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. If appending the received ScheduleStruct to the pending list of Schedules would cause the total number
         *      of pending schedules to exceed the value of the NumberOfSchedules attribute, a response with the status
         *      code RESOURCE_EXHAUSTED shall be returned.
         *
         *   3. If appending the received ScheduleStruct to the pending list of Schedules would cause the total number
         *      of pending schedules whose SystemMode field matches the appended schedule's SystemMode field to exceed
         *      the value of the NumberOfSchedules field on the ScheduleTypeStruct whose SystemMode field matches the
         *      appended schedule's SystemMode field, a response with the status code RESOURCE_EXHAUSTED shall be
         *      returned.
         *
         *   4. Otherwise, the write shall be pended until receipt of a commit request, and the attribute status shall
         *      be SUCCESS.
         *
         *   1. If the BuiltIn field is null:
         *
         *   1. If there is a ScheduleStruct in the current value with a matching ScheduleHandle field, the BuiltIn
         *      field on the pending ScheduleStruct shall be set to the value of the BuiltIn on the matching
         *      ScheduleStruct.
         *
         *   2. Otherwise, the BuiltIn field on the pending ScheduleStruct shall be set to false.
         *
         * On an attempt to commit, the status of this attribute shall be determined as follows:
         *
         *   1. For all existing schedules:
         *
         *   1. If, after applying all pending changes, the updated value of the Schedules attribute would not contain a
         *      ScheduleStruct with a matching ScheduleHandle field, indicating the removal of the ScheduleStruct, the
         *      server shall check for invalid removal of the ScheduleStruct:
         *
         *   1. If the BuiltIn field is true on the removed ScheduleStruct, the attribute status shall be
         *      CONSTRAINT_ERROR.
         *
         *   2. If the removed ScheduleHandle is equal to the value of the ActiveScheduleHandle attribute, the attribute
         *      status shall be INVALID_IN_STATE.
         *
         *   2. Otherwise, the attribute status shall be SUCCESS.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.51
         */
        schedules: Schedule[];
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "ThermostatSuggestions".
     */
    export interface ThermostatSuggestionsAttributes {
        /**
         * Indicates the maximum number of entries supported by the ThermostatSuggestions attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.53
         */
        maxThermostatSuggestions: number;

        /**
         * Indicates an unordered set of thermostat suggestions.
         *
         * The suggested value shall be a PresetHandle that shall match the PresetHandle of one of the entries in the
         * Presets attribute.
         *
         * The Thermostat may use this information to ensure user comfort while also prioritizing other factors (e.g.
         * energy savings, cost, and so on). Entries with effective times in the future may be used for pre-cool or
         * pre-heat decisions.
         *
         * See Section 4.3.7, "Re-evaluation of Current Thermostat Suggestion" for what to do if this attribute's value
         * changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.54
         */
        thermostatSuggestions: ThermostatSuggestion[];

        /**
         * Indicates an entry in the entries, which identifies the current thermostat suggestion.
         *
         * A value of null shall indicate that there is no current thermostat suggestion. When this attribute's value
         * changes to a null value, the server may decide to set the ActivePresetHandle attribute to a value of its
         * choice, based on schedules, occupancy sensors, etc.
         *
         * When the server is "following the suggestion" that means that the server shall ensure that the value of the
         * ActivePresetHandle attribute matches the value of this attribute.
         *
         * When there is a current thermostat suggestion and the server is unable to follow the suggestion or the server
         * is unable to choose a current thermostat suggestion due to conflicting suggestions, it shall set the
         * ThermostatSuggestionNotFollowingReason attribute to a non-null value as described in the definition of the
         * ThermostatSuggestionNotFollowingReason attribute. Otherwise, the server shall follow the suggestion and set
         * the ThermostatSuggestionNotFollowingReason attribute to null.
         *
         * Whenever the state of the server changes such that it might need to start or stop following the suggestion,
         * the server shall re-evaluate whether it is doing so and update the ActivePresetHandle and
         * ThermostatSuggestionNotFollowingReason attributes as needed.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.55
         */
        currentThermostatSuggestion: ThermostatSuggestion | null;

        /**
         * Indicates the reasons the Thermostat is unable to follow suggestions.
         *
         * When the server is unable to follow the suggestion, it shall set the appropriate bits in the value of the
         * ThermostatSuggestionNotFollowingReason attribute to indicate the reasons due to which the suggestion is not
         * being followed. The value of the ThermostatSuggestionNotFollowingReason attribute shall be 0 (all bits
         * cleared) if there are no bits defined in ThermostatSuggestionNotFollowingReasonBitmap that represent the
         * reasons the suggestion is not being followed.
         *
         * If the CurrentThermostatSuggestion attribute is null, this attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.56
         */
        thermostatSuggestionNotFollowingReason: ThermostatSuggestionNotFollowingReason | null;
    }

    /**
     * Attributes that may appear in {@link Thermostat}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current Calculated Local Temperature, when available.
         *
         *   - If the LTNE feature is not supported:
         *
         *   - If the LocalTemperatureCalibration is invalid or currently unavailable, the attribute shall report null.
         *
         *   - If the LocalTemperatureCalibration is valid, the attribute shall report that value.
         *
         *   - Otherwise, if the LTNE feature is supported, there is no feedback externally available for the
         *     LocalTemperatureCalibration. In that case, the LocalTemperature attribute shall always report null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.2
         */
        localTemperature: number | null;

        /**
         * Indicates the overall operating environment of the thermostat, and thus the possible system modes that the
         * thermostat can operate in.
         *
         * If an attempt is made to write to this attribute, the server shall silently ignore the write and the value of
         * this attribute shall remain unchanged. This behavior is in place for backwards compatibility with existing
         * thermostats.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.21
         */
        controlSequenceOfOperation: ControlSequenceOfOperation;

        /**
         * Indicates the current operating mode of the thermostat. Its value shall be limited by the
         * ControlSequenceOfOperation attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.22
         */
        systemMode: SystemMode;

        /**
         * Indicates the outdoor temperature, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.3
         */
        outdoorTemperature: number | null;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        piCoolingDemand: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        piHeatingDemand: any;

        /**
         * Indicates the HVAC system type controlled by the thermostat. If the thermostat uses physical DIP switches to
         * set these parameters, this information shall be available read-only from the DIP switches. If these
         * parameters are set via software, there shall be read/write access in order to provide remote programming
         * capability.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.9
         * @deprecated
         */
        hvacSystemTypeConfiguration: any;

        /**
         * Indicates when the local temperature, outdoor temperature and occupancy are being sensed by remote networked
         * sensors, rather than internal sensors.
         *
         * If the LTNE feature is present in the server, the LocalTemperature RemoteSensing bit value shall always
         * report a value of 0.
         *
         * If the LocalTemperature RemoteSensing bit is written with a value of 1 when the LTNE feature is present, the
         * write shall fail and the server shall report a CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.20
         */
        remoteSensing: RemoteSensing;

        /**
         * Indicates the temperature hold status on the thermostat. If hold status is on, the thermostat SHOULD maintain
         * the temperature setpoint for the current mode until a system mode change. If hold status is off, the
         * thermostat SHOULD follow the setpoint transitions specified by its internal scheduling program. If the
         * thermostat supports setpoint hold for a specific duration, it SHOULD also implement the
         * TemperatureSetpointHoldDuration attribute.
         *
         * If the server supports a setpoint hold for a specific duration, it SHOULD also implement the
         * SetpointHoldExpiryTimestamp attribute.
         *
         * If this attribute is updated to SetpointHoldOn and the TemperatureSetpointHoldDuration has a non-null value
         * and the SetpointHoldExpiryTimestamp is supported, the server shall update the SetpointHoldExpiryTimestamp
         * with a value of current UTC timestamp, in seconds, plus the value in TemperatureSetpointHoldDuration
         * multiplied by 60.
         *
         * If this attribute is updated to SetpointHoldOff and the SetpointHoldExpiryTimestamp is supported, the server
         * shall set the SetpointHoldExpiryTimestamp to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.27
         */
        temperatureSetpointHold: TemperatureSetpointHold;

        /**
         * Indicates the period in minutes for which a setpoint hold is active. Thermostats that support hold for a
         * specified duration SHOULD implement this attribute. The null value indicates the field is unused. All other
         * values are reserved.
         *
         * If this attribute is updated to a non-null value and the TemperatureSetpointHold is set to SetpointHoldOn and
         * the SetpointHoldExpiryTimestamp is supported, the server shall update SetpointHoldExpiryTimestamp with a
         * value of current UTC timestamp, in seconds, plus the new value of this attribute multiplied by 60.
         *
         * If this attribute is set to null and the SetpointHoldExpiryTimestamp is supported, the server shall set the
         * SetpointHoldExpiryTimestamp to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.28
         */
        temperatureSetpointHoldDuration: number | null;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        thermostatProgrammingOperationMode: any;

        /**
         * Indicates the current relay state of the heat, cool, and fan relays.
         *
         * Unimplemented outputs shall be treated as if they were Off.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.29
         */
        thermostatRunningState: RelayState;

        /**
         * Indicates the source of the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint (i.e., who or
         * what determined the current setpoint).
         *
         * This attribute enables service providers to determine whether changes to setpoints were initiated due to
         * occupant comfort, scheduled programming or some other source (e.g., electric utility or other service
         * provider). Because automation services may initiate frequent setpoint changes, this attribute clearly
         * differentiates the source of setpoint changes made at the thermostat.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.30
         */
        setpointChangeSource: SetpointChangeSource;

        /**
         * Indicates the delta between the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint and the
         * previous active setpoint. This attribute is meant to accompany the SetpointChangeSource attribute; devices
         * implementing SetpointChangeAmount SHOULD also implement SetpointChangeSource.
         *
         * The null value indicates that the previous setpoint was unknown.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.31
         */
        setpointChangeAmount: number | null;

        /**
         * Indicates the time in UTC at which the SetpointChangeAmount attribute change was recorded.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.32
         */
        setpointChangeSourceTimestamp: number;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        occupiedSetback: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        occupiedSetbackMin: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        occupiedSetbackMax: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        unoccupiedSetback: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        unoccupiedSetbackMin: any;

        /**
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11
         * @deprecated
         */
        unoccupiedSetbackMax: any;

        /**
         * Indicates the delta between the Calculated Local Temperature and the OccupiedHeatingSetpoint or
         * UnoccupiedHeatingSetpoint attributes at which the Thermostat server will operate in emergency heat mode.
         *
         * If the difference between the Calculated Local Temperature and OccupiedCoolingSetpoint or
         * UnoccupiedCoolingSetpoint is greater than or equal to the EmergencyHeatDelta and the Thermostat server's
         * SystemMode attribute is in a heating-related mode, then the Thermostat server shall immediately switch to the
         * SystemMode attribute value that provides the highest stage of heating (e.g., emergency heat) and continue
         * operating in that running state until the OccupiedHeatingSetpoint value is reached. For example:
         *
         *   - Calculated Local Temperature = 10.0°C
         *
         *   - OccupiedHeatingSetpoint = 16.0°C
         *
         *   - EmergencyHeatDelta = 2.0°C
         *
         * => OccupiedHeatingSetpoint - Calculated Local Temperature ≥? EmergencyHeatDelta
         *
         *   - => 16°C - 10°C ≥? 2°C
         *
         * => TRUE >>> Thermostat server changes its SystemMode to operate in 2^nd stage or emergency heat mode
         *
         * The purpose of this attribute is to provide Thermostat clients the ability to configure rapid heating when a
         * setpoint is of a specified amount greater than the measured temperature. This allows the heated space to be
         * quickly heated to the desired level set by the user.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.33
         */
        emergencyHeatDelta: number;

        /**
         * Indicates the type of Mini Split ACTypeEnum of Mini Split AC is defined depending on how Cooling and Heating
         * condition is achieved by Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.34
         */
        acType: AcType;

        /**
         * Indicates capacity of Mini Split AC in terms of the format defined by the ACCapacityFormat attribute
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.35
         */
        acCapacity: number;

        /**
         * Indicates type of refrigerant used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.36
         */
        acRefrigerantType: AcRefrigerantType;

        /**
         * Indicates the type of compressor used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.37
         */
        acCompressorType: AcCompressorType;

        /**
         * Indicates the type of errors encountered within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.38
         */
        acErrorCode: AcErrorCode;

        /**
         * Indicates the position of Louver on the AC.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.39
         */
        acLouverPosition: AcLouverPosition;

        /**
         * Indicates the temperature of the AC coil, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.40
         */
        acCoilTemperature: number | null;

        /**
         * Indicates the format for the ACCapacity attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.41
         */
        acCapacityFormat: AcCapacityFormat;

        /**
         * If there is a known time when the TemperatureSetpointHold shall be cleared, this attribute shall contain the
         * timestamp in UTC indicating when that will happen. If there is no such known time, this attribute shall be
         * null.
         *
         * If the TemperatureSetpointHold is set to SetpointHoldOn and the TemperatureSetpointHoldDuration is set to
         * null, this attribute shall be set to null indicating there is a hold on the Thermostat without a duration.
         *
         * If the TemperatureSetpointHold is set to SetpointHoldOff, this attribute shall be set to null indicating
         * there is no hold on the Thermostat.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.52
         */
        setpointHoldExpiryTimestamp: number | null;

        /**
         * Indicates whether the heated/cooled space is occupied or not, as measured locally or remotely (over the
         * network).
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.4
         */
        occupancy: Occupancy;

        /**
         * Indicates the heating mode setpoint when the room is occupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less than
         * MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is greater than (OccupiedCoolingSetpoint - MinSetpointDeadBand), the
         * value of OccupiedCoolingSetpoint shall be adjusted to (OccupiedHeatingSetpoint + MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall be used as the heating mode setpoint.
         *
         * If a client changes the value of this attribute, the server supports the PRES feature, and the server either
         * does not support the OCC feature or the Occupied bit is set on the Occupancy attribute, the value of the
         * ActivePresetHandle attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.12
         */
        occupiedHeatingSetpoint: number;

        /**
         * Indicates the absolute minimum level that the heating setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.5
         */
        absMinHeatSetpointLimit: number;

        /**
         * Indicates the absolute maximum level that the heating setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.6
         */
        absMaxHeatSetpointLimit: number;

        /**
         * Indicates the minimum level that the heating setpoint may be set to.
         *
         * This attribute, and the following three attributes, allow the user to define setpoint limits more
         * constrictive than the manufacturer imposed ones. Limiting users (e.g., in a commercial building) to such
         * setpoint limits can help conserve power.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.15
         */
        minHeatSetpointLimit: number;

        /**
         * Indicates the maximum level that the heating setpoint may be set to.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.16
         */
        maxHeatSetpointLimit: number;

        /**
         * Indicates the cooling mode setpoint when the room is occupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less than
         * MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is less than (OccupiedHeatingSetpoint + MinSetpointDeadBand), the
         * value of OccupiedHeatingSetpoint shall be adjusted to (OccupiedCoolingSetpoint - MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall be used as the cooling mode setpoint.
         *
         * If a client changes the value of this attribute, the server supports the PRES feature, and the server either
         * does not support the OCC feature or the Occupied bit is set on the Occupancy attribute, the value of the
         * ActivePresetHandle attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.11
         */
        occupiedCoolingSetpoint: number;

        /**
         * Indicates the absolute minimum level that the cooling setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.7
         */
        absMinCoolSetpointLimit: number;

        /**
         * Indicates the absolute maximum level that the cooling setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.8
         */
        absMaxCoolSetpointLimit: number;

        /**
         * Indicates the minimum level that the cooling setpoint may be set to.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.17
         */
        minCoolSetpointLimit: number;

        /**
         * Indicates the maximum level that the cooling setpoint may be set to.
         *
         * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
         * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit this
         * attribute to be set to the desired value. If an attempt is made to set this attribute to a value which is not
         * consistent with the constraints and cannot be resolved by modifying setpoints then a response with the status
         * code CONSTRAINT_ERROR shall be returned.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.18
         */
        maxCoolSetpointLimit: number;

        /**
         * Indicates the offset the Thermostat server shall make to the measured temperature (locally or remotely) to
         * adjust the Calculated Local Temperature prior to using, displaying or reporting it.
         *
         * The purpose of this attribute is to adjust the calibration of the Thermostat server per the user's
         * preferences (e.g., to match if there are multiple servers displaying different values for the same HVAC area)
         * or compensate for variability amongst temperature sensors.
         *
         * If a Thermostat client attempts to write LocalTemperatureCalibration attribute to an unsupported value (e.g.,
         * out of the range supported by the Thermostat server), the Thermostat server shall respond with a status of
         * SUCCESS and set the value of LocalTemperatureCalibration to the upper or lower limit reached.
         *
         * > [!NOTE]
         *
         * > NOTE: Prior to revision 8 of this cluster specification the value of this attribute was constrained to a
         *   range of -2.5°C to 2.5°C.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.10
         */
        localTemperatureCalibration: number;

        /**
         * Indicates the cooling mode setpoint when the room is unoccupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less than
         * MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is less than (UnoccupiedHeatingSetpoint + MinSetpointDeadBand), the
         * value of UnoccupiedHeatingSetpoint shall be adjusted to (UnoccupiedCoolingSetpoint - MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall NOT be used.
         *
         * If a client changes the value of this attribute, the server supports the PRES and OCC features, and the
         * Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle attribute shall be
         * set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.13
         */
        unoccupiedCoolingSetpoint: number;

        /**
         * Indicates the heating mode setpoint when the room is unoccupied.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less than
         * MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If this attribute is set to a value that is greater than (UnoccupiedCoolingSetpoint - MinSetpointDeadBand),
         * the value of UnoccupiedCoolingSetpoint shall be adjusted to (UnoccupiedHeatingSetpoint +
         * MinSetpointDeadBand).
         *
         * If the occupancy status of the room is unknown, this attribute shall NOT be used.
         *
         * If a client changes the value of this attribute, the server supports the PRES and OCC features, and the
         * Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle attribute shall be
         * set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.14
         */
        unoccupiedHeatingSetpoint: number;

        /**
         * On devices which support the AUTO feature, this attribute shall indicate the minimum difference between the
         * Heat Setpoint and the Cool Setpoint.
         *
         * Refer to Setpoint Limits for constraints.
         *
         * > [!NOTE]
         *
         * > NOTE: Prior to revision 8 of this cluster specification the value of this attribute was constrained to a
         *   range of 0°C to 2.5°C.
         *
         * > [!NOTE]
         *
         * > NOTE: For backwards compatibility, this attribute is optionally writeable. However any writes to this
         *   attribute shall be silently ignored.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.19
         */
        minSetpointDeadBand: number;

        /**
         * Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum but can
         * only be Off, Cool or Heat. This attribute is intended to provide additional information when the thermostat's
         * system mode is in auto mode.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.23
         */
        thermostatRunningMode: ThermostatRunningMode;

        /**
         * Indicates the supported PresetScenarioEnum values, limits on how many presets can be created for each
         * PresetScenarioEnum, and whether or not a thermostat can transition automatically to a given scenario.
         *
         * The list shall contain at least one entry. The list shall NOT be larger than the number of supported
         * PresetScenarioEnum values (maximum 7). The list shall NOT contain any PresetTypeStruct entries with duplicate
         * PresetScenarioEnum values.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.42
         */
        presetTypes: PresetType[];

        /**
         * Indicates the maximum number of entries supported by the Presets attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.44
         */
        numberOfPresets: number;

        /**
         * Indicates the PresetHandle of the active preset. If this attribute is null, then there is no active preset.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.48
         */
        activePresetHandle: Bytes | null;

        /**
         * This attribute shall contain the current list of configured presets.
         *
         * On receipt of a write request:
         *
         *   1. If the PresetHandle field is null, the PresetStruct shall be treated as an added preset, and the device
         *      shall create a new unique value for the PresetHandle field.
         *
         *   1. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. If the PresetHandle field is not null, the PresetStruct shall be treated as a modification of an
         *      existing preset.
         *
         *   1. If the value of the PresetHandle field does not match any of the existing presets, a response with the
         *      status code NOT_FOUND shall be returned.
         *
         *   2. If the value of the PresetHandle field is duplicated on multiple presets in the updated list, a response
         *      with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   3. If the BuiltIn field is true, and the PresetStruct in the current value with a matching PresetHandle
         *      field has a BuiltIn field set to false, a response with the status code CONSTRAINT_ERROR shall be
         *      returned.
         *
         *   4. If the BuiltIn field is false, and the PresetStruct in the current value with a matching PresetHandle
         *      field has a BuiltIn field set to true, a response with the status code CONSTRAINT_ERROR shall be
         *      returned.
         *
         *   3. If the specified PresetScenarioEnum value does not exist in PresetTypes, a response with the status code
         *      CONSTRAINT_ERROR shall be returned.
         *
         *   4. If the Name is set, but the associated PresetTypeStruct does not have the SupportsNames bit set, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   5. If appending the received PresetStruct to the pending list of Presets would cause the total number of
         *      pending presets to exceed the value of the NumberOfPresets attribute, a response with the status code
         *      RESOURCE_EXHAUSTED shall be returned.
         *
         *   6. If appending the received PresetStruct to the pending list of Presets would cause the total number of
         *      pending presets whose PresetScenario field matches the appended preset's PresetScenario field to exceed
         *      the value of the NumberOfPresets field on the PresetTypeStruct whose PresetScenario matches the appended
         *      preset's PresetScenario field, a response with the status code RESOURCE_EXHAUSTED shall be returned.
         *
         *   7. Otherwise, the write shall be pended until receipt of a commit request, and the status code SUCCESS
         *      shall be returned.
         *
         *   1. If the BuiltIn field is null:
         *
         *   1. If there is a PresetStruct in the current value with a matching PresetHandle field, the BuiltIn field on
         *      the pending PresetStruct shall be set to the value of the BuiltIn on the matching PresetStruct.
         *
         *   2. Otherwise, the BuiltIn field on the pending PresetStruct shall be set to false.
         *
         * On an attempt to commit, the status of this attribute shall be determined as follows:
         *
         *   1. For all existing presets:
         *
         *   1. If, after applying all pending changes, the updated value of the Presets attribute would not contain a
         *      PresetStruct with a matching PresetHandle field, indicating the removal of the PresetStruct, the server
         *      shall check for invalid removal of the PresetStruct:
         *
         *   1. If the BuiltIn field is true on the removed PresetStruct, the attribute status shall be
         *      CONSTRAINT_ERROR.
         *
         *   2. If the MSCH feature is supported and the removed PresetHandle would be referenced by any PresetHandle on
         *      any ScheduleTransitionStruct on any ScheduleStruct in the updated value of the Schedules attribute, the
         *      attribute status shall be INVALID_IN_STATE.
         *
         *   3. If the removed PresetHandle is equal to the value of the ActivePresetHandle attribute, the attribute
         *      status shall be INVALID_IN_STATE.
         *
         *   2. If the attribute status has not yet been determined:
         *
         *   1. The attribute status shall be SUCCESS.
         *
         *   2. For all existing presets:
         *
         *   1. If, after applying all pending changes, the updated value of the Presets attribute would not contain a
         *      PresetStruct with a matching PresetHandle field, indicating the removal of the PresetStruct, the server
         *      shall ensure that the preset being removed is unused, as follows:
         *
         *   1. If the PresetHandle field of the removed preset is equal to the value of the PresetHandle field of the
         *      CurrentThermostatSuggestion attribute's value, the CurrentThermostatSuggestion attribute shall be set to
         *      null.
         *
         *   2. If the PresetHandle field of the removed preset is equal to the value of the PresetHandle field of one
         *      or more of the entries in the ThermostatSuggestions attribute, the server shall delete any such entries
         *      from the ThermostatSuggestions attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.50
         */
        presets: Preset[];

        /**
         * Indicates the supported SystemMode values for Schedules, limits on how many schedules can be created for each
         * SystemMode value, and whether or not a given SystemMode value supports transitions to Presets, target
         * setpoints, or both.
         *
         * The list shall contain at least one entry. The list shall NOT be larger than the number of supported schedule
         * SystemMode values (maximum 3, since the data type only allows Auto, Heat and Cool). The list shall NOT
         * contain any ScheduleTypeStruct entries with duplicate SystemModeEnum values.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.43
         */
        scheduleTypes: ScheduleType[];

        /**
         * Indicates the maximum number of entries supported by the Schedules attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.45
         */
        numberOfSchedules: number;

        /**
         * Indicates the maximum number of transitions per Schedules attribute entry.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.46
         */
        numberOfScheduleTransitions: number;

        /**
         * Indicates the maximum number of transitions per day of the week supported by each Schedules attribute entry.
         * If this value is null, there is no limit on the number of transitions per day.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.47
         */
        numberOfScheduleTransitionPerDay: number | null;

        /**
         * Indicates the ScheduleHandle of the active schedule. A null value in this attribute indicates that there is
         * no active schedule.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.49
         */
        activeScheduleHandle: Bytes | null;

        /**
         * This attribute shall contain a list of ScheduleStructs.
         *
         * On receipt of a write request:
         *
         *   1. For all schedules in the write request:
         *
         *   1. If the ScheduleHandle field is null, the ScheduleStruct shall be treated as an added schedule, and the
         *      device shall create a new unique value for the ScheduleHandle field.
         *
         *   1. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. Otherwise, if the ScheduleHandle field is not null, the ScheduleStruct shall be treated as a
         *      modification of an existing schedule.
         *
         *   1. If the value of the ScheduleHandle field does not match any of the existing schedules, a response with
         *      the status code NOT_FOUND shall be returned.
         *
         *   2. If the BuiltIn field is true, and the ScheduleStruct in the current value with a matching ScheduleHandle
         *      field has a BuiltIn field set to false, a response with the status code CONSTRAINT_ERROR shall be
         *      returned.
         *
         *   3. If the BuiltIn field is false, and the ScheduleStruct in the current value with a matching
         *      ScheduleHandle field has a BuiltIn field set to true, a response with the status code CONSTRAINT_ERROR
         *      shall be returned.
         *
         *   3. If the specified SystemMode does not exist in ScheduleTypes, a response with the status code
         *      CONSTRAINT_ERROR shall be returned.
         *
         *   4. If the number of transitions exceeds the NumberOfScheduleTransitions value, a response with the status
         *      code RESOURCE_EXHAUSTED shall be returned.
         *
         *   5. If the value of the NumberOfScheduleTransitionPerDay attribute is not null, and the number of
         *      transitions on any single day of the week exceeds the NumberOfScheduleTransitionPerDay value, a response
         *      with the status code RESOURCE_EXHAUSTED shall be returned.
         *
         *   6. If the PresetHandle field is present, but the associated ScheduleTypeStruct does not have the
         *      SupportsPresets bit set, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   7. If the PresetHandle field is present, but after applying all pending changes, the Presets attribute
         *      would not contain a PresetStruct whose PresetHandle field matches the value of the PresetHandle field, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   8. If the Name is set, but the associated ScheduleTypeStruct does not have the SupportsNames bit set, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   9. For all transitions in all schedules in the write request:
         *
         *   1. If the PresetHandle field is present, but the ScheduleTypeStruct matching the value of the SystemMode
         *      field on the encompassing ScheduleStruct does not have the SupportsPresets bit set, a response with the
         *      status code CONSTRAINT_ERROR shall be returned.
         *
         *   10. If the PresetHandle field is present, but after applying all pending changes, the Presets attribute
         *       would not contain a PresetStruct whose PresetHandle field matches the value of the PresetHandle field,
         *       a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   1. If the SystemMode field is present, but the ScheduleTypeStruct matching the value of the SystemMode
         *      field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a response with
         *      the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. If the SystemMode field is has a value of SystemModeOff, but the ScheduleTypeStruct matching the value
         *      of the SystemMode field on the encompassing ScheduleStruct does not have the SupportsOff bit set, a
         *      response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   11. If the HeatingSetpoint field is present, but the ScheduleTypeStruct matching the value of the
         *       SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a
         *       response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   12. If the CoolingSetpoint field is present, but the ScheduleTypeStruct matching the value of the
         *       SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a
         *       response with the status code CONSTRAINT_ERROR shall be returned.
         *
         *   2. If appending the received ScheduleStruct to the pending list of Schedules would cause the total number
         *      of pending schedules to exceed the value of the NumberOfSchedules attribute, a response with the status
         *      code RESOURCE_EXHAUSTED shall be returned.
         *
         *   3. If appending the received ScheduleStruct to the pending list of Schedules would cause the total number
         *      of pending schedules whose SystemMode field matches the appended schedule's SystemMode field to exceed
         *      the value of the NumberOfSchedules field on the ScheduleTypeStruct whose SystemMode field matches the
         *      appended schedule's SystemMode field, a response with the status code RESOURCE_EXHAUSTED shall be
         *      returned.
         *
         *   4. Otherwise, the write shall be pended until receipt of a commit request, and the attribute status shall
         *      be SUCCESS.
         *
         *   1. If the BuiltIn field is null:
         *
         *   1. If there is a ScheduleStruct in the current value with a matching ScheduleHandle field, the BuiltIn
         *      field on the pending ScheduleStruct shall be set to the value of the BuiltIn on the matching
         *      ScheduleStruct.
         *
         *   2. Otherwise, the BuiltIn field on the pending ScheduleStruct shall be set to false.
         *
         * On an attempt to commit, the status of this attribute shall be determined as follows:
         *
         *   1. For all existing schedules:
         *
         *   1. If, after applying all pending changes, the updated value of the Schedules attribute would not contain a
         *      ScheduleStruct with a matching ScheduleHandle field, indicating the removal of the ScheduleStruct, the
         *      server shall check for invalid removal of the ScheduleStruct:
         *
         *   1. If the BuiltIn field is true on the removed ScheduleStruct, the attribute status shall be
         *      CONSTRAINT_ERROR.
         *
         *   2. If the removed ScheduleHandle is equal to the value of the ActiveScheduleHandle attribute, the attribute
         *      status shall be INVALID_IN_STATE.
         *
         *   2. Otherwise, the attribute status shall be SUCCESS.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.51
         */
        schedules: Schedule[];

        /**
         * Indicates the maximum number of entries supported by the ThermostatSuggestions attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.53
         */
        maxThermostatSuggestions: number;

        /**
         * Indicates an unordered set of thermostat suggestions.
         *
         * The suggested value shall be a PresetHandle that shall match the PresetHandle of one of the entries in the
         * Presets attribute.
         *
         * The Thermostat may use this information to ensure user comfort while also prioritizing other factors (e.g.
         * energy savings, cost, and so on). Entries with effective times in the future may be used for pre-cool or
         * pre-heat decisions.
         *
         * See Section 4.3.7, "Re-evaluation of Current Thermostat Suggestion" for what to do if this attribute's value
         * changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.54
         */
        thermostatSuggestions: ThermostatSuggestion[];

        /**
         * Indicates an entry in the entries, which identifies the current thermostat suggestion.
         *
         * A value of null shall indicate that there is no current thermostat suggestion. When this attribute's value
         * changes to a null value, the server may decide to set the ActivePresetHandle attribute to a value of its
         * choice, based on schedules, occupancy sensors, etc.
         *
         * When the server is "following the suggestion" that means that the server shall ensure that the value of the
         * ActivePresetHandle attribute matches the value of this attribute.
         *
         * When there is a current thermostat suggestion and the server is unable to follow the suggestion or the server
         * is unable to choose a current thermostat suggestion due to conflicting suggestions, it shall set the
         * ThermostatSuggestionNotFollowingReason attribute to a non-null value as described in the definition of the
         * ThermostatSuggestionNotFollowingReason attribute. Otherwise, the server shall follow the suggestion and set
         * the ThermostatSuggestionNotFollowingReason attribute to null.
         *
         * Whenever the state of the server changes such that it might need to start or stop following the suggestion,
         * the server shall re-evaluate whether it is doing so and update the ActivePresetHandle and
         * ThermostatSuggestionNotFollowingReason attributes as needed.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.55
         */
        currentThermostatSuggestion: ThermostatSuggestion | null;

        /**
         * Indicates the reasons the Thermostat is unable to follow suggestions.
         *
         * When the server is unable to follow the suggestion, it shall set the appropriate bits in the value of the
         * ThermostatSuggestionNotFollowingReason attribute to indicate the reasons due to which the suggestion is not
         * being followed. The value of the ThermostatSuggestionNotFollowingReason attribute shall be 0 (all bits
         * cleared) if there are no bits defined in ThermostatSuggestionNotFollowingReasonBitmap that represent the
         * reasons the suggestion is not being followed.
         *
         * If the CurrentThermostatSuggestion attribute is null, this attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.11.56
         */
        thermostatSuggestionNotFollowingReason: ThermostatSuggestionNotFollowingReason | null;
    }

    /**
     * {@link Thermostat} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command will raise or lower the setpoint based on the provided values.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.1
         */
        setpointRaiseLower(request: SetpointRaiseLowerRequest): MaybePromise;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "Presets".
     */
    export interface PresetsCommands {
        /**
         * This command will set the active preset to the provided preset handle.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.3
         */
        setActivePresetRequest(request: SetActivePresetRequest): MaybePromise;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "MatterScheduleConfiguration".
     */
    export interface MatterScheduleConfigurationCommands {
        /**
         * This command will set the active schedule to the provided schedule handle.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.2
         */
        setActiveScheduleRequest(request: SetActiveScheduleRequest): MaybePromise;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "ThermostatSuggestions".
     */
    export interface ThermostatSuggestionsCommands {
        /**
         * This command will add a new suggestion based on the specified values.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.4
         */
        addThermostatSuggestion(request: AddThermostatSuggestionRequest): MaybePromise<AddThermostatSuggestionResponse>;

        /**
         * This command will remove the specified suggestion.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.6
         */
        removeThermostatSuggestion(request: RemoveThermostatSuggestionRequest): MaybePromise;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "PresetsOrMatterScheduleConfiguration".
     */
    export interface PresetsOrMatterScheduleConfigurationCommands {
        atomicRequest(request: AtomicRequest): MaybePromise<AtomicResponse>;
    }

    /**
     * Commands that may appear in {@link Thermostat}.
     */
    export interface Commands extends
        BaseCommands,
        PresetsCommands,
        MatterScheduleConfigurationCommands,
        ThermostatSuggestionsCommands,
        PresetsOrMatterScheduleConfigurationCommands
    {}

    /**
     * {@link Thermostat} supports these elements if it supports feature "EventsAndAutoMode".
     */
    export interface EventsAndAutoModeEvents {
        /**
         * This event shall be generated when the ThermostatRunningMode attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.5
         */
        runningModeChange: RunningModeChangeEvent;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "Events".
     */
    export interface EventsEvents {
        /**
         * This event shall be generated when the SystemMode attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.1
         */
        systemModeChange: SystemModeChangeEvent;

        /**
         * This event shall be generated when the value of any of the OccupiedHeatingSetpoint,
         * UnoccupiedHeatingSetpoint, OccupiedCoolingSetpoint, or UnoccupiedCoolingSetpoint attributes is changed.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4
         */
        setpointChange: SetpointChangeEvent;

        /**
         * This event shall be generated when the ThermostatRunningState attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.6
         */
        runningStateChange: RunningStateChangeEvent;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "EventsNotLocalTemperatureNotExposed".
     */
    export interface EventsNotLocalTemperatureNotExposedEvents {
        /**
         * This event shall be generated when the LocalTemperature attribute changes significantly.
         *
         * Significant changes are:
         *
         *   - Changes from null to not null, or from not null to null.
         *
         *   - Changes from one not-null value to another not-null value that are sufficiently large, as determined by
         *     the server.
         *
         * LocalTemperatureChange events shall NOT be generated more often than once every 60 seconds.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.2
         */
        localTemperatureChange: LocalTemperatureChangeEvent;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "EventsAndOccupancy".
     */
    export interface EventsAndOccupancyEvents {
        /**
         * This event shall be generated when the Occupancy attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.3
         */
        occupancyChange: OccupancyChangeEvent;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "EventsAndMatterScheduleConfiguration".
     */
    export interface EventsAndMatterScheduleConfigurationEvents {
        /**
         * This event shall be generated when the ActiveScheduleHandle attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.8
         */
        activeScheduleChange: ActiveScheduleChangeEvent;
    }

    /**
     * {@link Thermostat} supports these elements if it supports feature "EventsAndPresets".
     */
    export interface EventsAndPresetsEvents {
        /**
         * This event shall be generated when the ActivePresetHandle attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.7
         */
        activePresetChange: ActivePresetChangeEvent;
    }

    /**
     * Events that may appear in {@link Thermostat}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the ThermostatRunningMode attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.5
         */
        runningModeChange: RunningModeChangeEvent;

        /**
         * This event shall be generated when the SystemMode attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.1
         */
        systemModeChange: SystemModeChangeEvent;

        /**
         * This event shall be generated when the value of any of the OccupiedHeatingSetpoint,
         * UnoccupiedHeatingSetpoint, OccupiedCoolingSetpoint, or UnoccupiedCoolingSetpoint attributes is changed.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4
         */
        setpointChange: SetpointChangeEvent;

        /**
         * This event shall be generated when the ThermostatRunningState attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.6
         */
        runningStateChange: RunningStateChangeEvent;

        /**
         * This event shall be generated when the LocalTemperature attribute changes significantly.
         *
         * Significant changes are:
         *
         *   - Changes from null to not null, or from not null to null.
         *
         *   - Changes from one not-null value to another not-null value that are sufficiently large, as determined by
         *     the server.
         *
         * LocalTemperatureChange events shall NOT be generated more often than once every 60 seconds.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.2
         */
        localTemperatureChange: LocalTemperatureChangeEvent;

        /**
         * This event shall be generated when the Occupancy attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.3
         */
        occupancyChange: OccupancyChangeEvent;

        /**
         * This event shall be generated when the ActiveScheduleHandle attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.8
         */
        activeScheduleChange: ActiveScheduleChangeEvent;

        /**
         * This event shall be generated when the ActivePresetHandle attribute changes.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.7
         */
        activePresetChange: ActivePresetChangeEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { occupancy: true }, attributes: OccupancyAttributes },
        { flags: { heating: true }, attributes: HeatingAttributes },
        { flags: { cooling: true }, attributes: CoolingAttributes },
        { flags: { localTemperatureNotExposed: false }, attributes: NotLocalTemperatureNotExposedAttributes },
        { flags: { cooling: true, occupancy: true }, attributes: CoolingAndOccupancyAttributes },
        { flags: { heating: true, occupancy: true }, attributes: HeatingAndOccupancyAttributes },
        { flags: { autoMode: true }, attributes: AutoModeAttributes },
        {
            flags: { events: true, autoMode: true },
            attributes: EventsAndAutoModeAttributes,
            events: EventsAndAutoModeEvents
        },
        { flags: { presets: true }, attributes: PresetsAttributes, commands: PresetsCommands },
        {
            flags: { matterScheduleConfiguration: true },
            attributes: MatterScheduleConfigurationAttributes,
            commands: MatterScheduleConfigurationCommands
        },
        {
            flags: { thermostatSuggestions: true },
            attributes: ThermostatSuggestionsAttributes,
            commands: ThermostatSuggestionsCommands
        },
        { flags: { events: true }, events: EventsEvents },
        {
            flags: { events: true, localTemperatureNotExposed: false },
            events: EventsNotLocalTemperatureNotExposedEvents
        },
        { flags: { events: true, occupancy: true }, events: EventsAndOccupancyEvents },
        {
            flags: { events: true, matterScheduleConfiguration: true },
            events: EventsAndMatterScheduleConfigurationEvents
        },
        { flags: { events: true, presets: true }, events: EventsAndPresetsEvents },
        { flags: { presets: true }, commands: PresetsOrMatterScheduleConfigurationCommands },
        { flags: { matterScheduleConfiguration: true }, commands: PresetsOrMatterScheduleConfigurationCommands }
    ];

    export type Features = "Heating" | "Cooling" | "Occupancy" | "Setback" | "AutoMode" | "LocalTemperatureNotExposed" | "MatterScheduleConfiguration" | "Presets" | "Events" | "ThermostatSuggestions";

    /**
     * These are optional features supported by ThermostatCluster.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.4
     */
    export enum Feature {
        /**
         * Heating (HEAT)
         *
         * Thermostat is capable of managing a heating device
         */
        Heating = "Heating",

        /**
         * Cooling (COOL)
         *
         * Thermostat is capable of managing a cooling device
         */
        Cooling = "Cooling",

        /**
         * Occupancy (OCC)
         *
         * Supports Occupied and Unoccupied setpoints
         */
        Occupancy = "Occupancy",

        /**
         * Setback (SB)
         */
        Setback = "Setback",

        /**
         * AutoMode (AUTO)
         *
         * Supports a System Mode of Auto
         */
        AutoMode = "AutoMode",

        /**
         * LocalTemperatureNotExposed (LTNE)
         *
         * This feature indicates that the Calculated Local Temperature used internally is unavailable to report
         * externally, for example due to the temperature control being done by a separate subsystem which does not
         * offer a view into the currently measured temperature, but allows setpoints to be provided.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.4.1
         */
        LocalTemperatureNotExposed = "LocalTemperatureNotExposed",

        /**
         * MatterScheduleConfiguration (MSCH)
         *
         * This feature indicates that the thermostat is capable of schedules. If this feature is supported, the
         * thermostat shall support a mechanism to do time synchronization.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.4.2
         */
        MatterScheduleConfiguration = "MatterScheduleConfiguration",

        /**
         * Presets (PRES)
         *
         * Thermostat supports setpoint presets
         */
        Presets = "Presets",

        /**
         * Events (TEVT)
         *
         * Thermostat supports events
         */
        Events = "Events",

        /**
         * ThermostatSuggestions (TSUGGEST)
         *
         * This feature indicates that the thermostat can process suggestions. If this feature is supported, the
         * thermostat shall support a mechanism to do time synchronization.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.4.3
         */
        ThermostatSuggestions = "ThermostatSuggestions"
    }

    /**
     * > [!NOTE]
     *
     * > NOTE: A thermostat indicating it supports CoolingAndHeating (or CoolingAndHeatingWithReheat) SHOULD be able to
     *   request heating or cooling on demand and will usually support the Auto SystemMode.
     *
     * Systems which support cooling or heating, requiring external intervention to change modes or where the whole
     * building must be in the same mode, SHOULD report CoolingOnly or HeatingOnly based on the current capability.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.16
     */
    export enum ControlSequenceOfOperation {
        /**
         * Heat and Emergency are not possible
         */
        CoolingOnly = 0,

        /**
         * Heat and Emergency are not possible
         */
        CoolingWithReheat = 1,

        /**
         * Cool and precooling (see Terms) are not possible
         */
        HeatingOnly = 2,

        /**
         * Cool and precooling are not possible
         */
        HeatingWithReheat = 3,

        /**
         * All modes are possible
         */
        CoolingAndHeating = 4,

        /**
         * All modes are possible
         */
        CoolingAndHeatingWithReheat = 5
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.20
     */
    export enum SystemMode {
        /**
         * The Thermostat does not generate demand for Cooling or Heating
         */
        Off = 0,

        /**
         * Demand is generated for either Cooling or Heating, as required
         */
        Auto = 1,

        /**
         * Demand is only generated for Cooling
         */
        Cool = 3,

        /**
         * Demand is only generated for Heating
         */
        Heat = 4,

        /**
         * 2^nd stage heating is in use to achieve desired temperature
         */
        EmergencyHeat = 5,

        /**
         * (see Terms)
         */
        Precooling = 6,

        FanOnly = 7,
        Dry = 8,
        Sleep = 9
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.5
     */
    export class RemoteSensing {
        constructor(values?: Partial<RemoteSensing> | number);

        /**
         * Calculated Local Temperature is derived from a remote node
         */
        localTemperature?: boolean;

        /**
         * OutdoorTemperature is derived from a remote node
         */
        outdoorTemperature?: boolean;

        /**
         * Occupancy is derived from a remote node
         */
        occupancy?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.22
     */
    export enum TemperatureSetpointHold {
        /**
         * Follow scheduling program
         */
        SetpointHoldOff = 0,

        /**
         * Maintain current setpoint, regardless of schedule transitions
         */
        SetpointHoldOn = 1
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.4
     */
    export class RelayState {
        constructor(values?: Partial<RelayState> | number);

        /**
         * Heat Stage On
         */
        heat?: boolean;

        /**
         * Cool Stage On
         */
        cool?: boolean;

        /**
         * Fan Stage On
         */
        fan?: boolean;

        /**
         * Heat 2^nd Stage On
         */
        heatStage2?: boolean;

        /**
         * Cool 2^nd Stage On
         */
        coolStage2?: boolean;

        /**
         * Fan 2^nd Stage On
         */
        fanStage2?: boolean;

        /**
         * Fan 3^rd Stage On
         */
        fanStage3?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.18
     */
    export enum SetpointChangeSource {
        /**
         * Manual, user-initiated setpoint change via the thermostat
         */
        Manual = 0,

        /**
         * Schedule/internal programming-initiated setpoint change
         */
        Schedule = 1,

        /**
         * Externally-initiated setpoint change (e.g., DRLC cluster command, attribute write)
         */
        External = 2
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.14
     */
    export enum AcType {
        /**
         * Unknown AC Type
         */
        Unknown = 0,

        /**
         * Cooling and Fixed Speed
         */
        CoolingFixed = 1,

        /**
         * Heat Pump and Fixed Speed
         */
        HeatPumpFixed = 2,

        /**
         * Cooling and Inverter
         */
        CoolingInverter = 3,

        /**
         * Heat Pump and Inverter
         */
        HeatPumpInverter = 4
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.13
     */
    export enum AcRefrigerantType {
        /**
         * Unknown Refrigerant Type
         */
        Unknown = 0,

        /**
         * R22 Refrigerant
         */
        R22 = 1,

        /**
         * R410a Refrigerant
         */
        R410A = 2,

        /**
         * R407c Refrigerant
         */
        R407C = 3
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.11
     */
    export enum AcCompressorType {
        /**
         * Unknown compressor type
         */
        Unknown = 0,

        /**
         * Max working ambient 43 °C
         */
        T1 = 1,

        /**
         * Max working ambient 35 °C
         */
        T2 = 2,

        /**
         * Max working ambient 52 °C
         */
        T3 = 3
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.1
     */
    export class AcErrorCode {
        constructor(values?: Partial<AcErrorCode> | number);

        /**
         * Compressor Failure or Refrigerant Leakage
         */
        compressorFail?: boolean;

        /**
         * Room Temperature Sensor Failure
         */
        roomSensorFail?: boolean;

        /**
         * Outdoor Temperature Sensor Failure
         */
        outdoorSensorFail?: boolean;

        /**
         * Indoor Coil Temperature Sensor Failure
         */
        coilSensorFail?: boolean;

        /**
         * Fan Failure
         */
        fanFail?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.12
     */
    export enum AcLouverPosition {
        /**
         * Fully Closed
         */
        Closed = 1,

        /**
         * Fully Open
         */
        Open = 2,

        /**
         * Quarter Open
         */
        Quarter = 3,

        /**
         * Half Open
         */
        Half = 4,

        /**
         * Three Quarters Open
         */
        ThreeQuarters = 5
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.10
     */
    export enum AcCapacityFormat {
        /**
         * British Thermal Unit per Hour
         */
        BtUh = 0
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.2
     */
    export class Occupancy {
        constructor(values?: Partial<Occupancy> | number);

        /**
         * Indicates the occupancy state
         *
         * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
         * unoccupied state.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.2.1
         */
        occupied?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.21
     */
    export enum ThermostatRunningMode {
        /**
         * The Thermostat does not generate demand for Cooling or Heating
         */
        Off = 0,

        /**
         * Demand is only generated for Cooling
         */
        Cool = 3,

        /**
         * Demand is only generated for Heating
         */
        Heat = 4
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.24
     */
    export class PresetType {
        constructor(values?: Partial<PresetType>);

        /**
         * This field shall specify a PresetScenarioEnum value supported by this thermostat.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.24.1
         */
        presetScenario: PresetScenario;

        /**
         * This field shall specify a limit for the number of presets for this PresetScenarioEnum.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.24.2
         */
        numberOfPresets: number;

        /**
         * This field shall specify a bitmap of features for this PresetTypeStruct.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.24.3
         */
        presetTypeFeatures: PresetTypeFeatures;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23
     */
    export class Preset {
        constructor(values?: Partial<Preset>);

        /**
         * This field shall indicate a device generated identifier for this preset. It shall be unique on the device,
         * and shall NOT be reused after the associated preset has been deleted.
         *
         * This field shall only be null when the encompassing PresetStruct is appended to the Presets attribute for the
         * purpose of creating a new Preset. Refer to Presets for the creation of Preset handles.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23.1
         */
        presetHandle: Bytes | null;

        /**
         * This field shall indicate the associated PresetScenarioEnum value for this preset.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23.2
         */
        presetScenario: PresetScenario;

        /**
         * This field shall indicate a name provided by a user. The null value shall indicate no name.
         *
         * Within each subset of presets sharing the same PresetScenario field value, there shall NOT be any presets
         * with the same value, including null as a value, in the Name field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23.3
         */
        name?: string | null;

        /**
         * This field shall indicate the cooling setpoint for the preset. Refer to Setpoint Limits for value
         * constraints.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23.4
         */
        coolingSetpoint?: number;

        /**
         * This field shall indicate the heating setpoint for the preset. Refer to Setpoint Limits for value
         * constraints.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23.5
         */
        heatingSetpoint?: number;

        /**
         * This field shall indicate whether the preset is marked as "built-in", meaning that it can be modified, but it
         * cannot be deleted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.23.6
         */
        builtIn: boolean | null;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.28
     */
    export class ScheduleType {
        constructor(values?: Partial<ScheduleType>);

        /**
         * This field shall specify a SystemModeEnum supported by this thermostat for Schedules. The only valid values
         * for this field shall be Auto, Heat, and Cool.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.28.1
         */
        systemMode: SystemMode;

        /**
         * This field shall specify a limit for the number of Schedules for this SystemMode.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.28.2
         */
        numberOfSchedules: number;

        /**
         * This field shall specify a bitmap of features for this schedule entry. At least one of SupportsPresets and
         * SupportsSetpoints shall be set.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.28.3
         */
        scheduleTypeFeatures: ScheduleTypeFeatures;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26
     */
    export class Schedule {
        constructor(values?: Partial<Schedule>);

        /**
         * This field shall indicate a device generated identifier for this schedule. It shall be unique on the device,
         * and shall NOT be reused after the associated schedule has been deleted.
         *
         * This field shall only be null when the encompassing ScheduleStruct is appended to the Schedules attribute for
         * the purpose of creating a new Schedule. Refer to Schedules for the creation of Schedule handles.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26.1
         */
        scheduleHandle: Bytes | null;

        /**
         * This field shall specify the default thermostat system mode for transitions in this schedule. The only valid
         * values for this field shall be Auto, Heat, and Cool.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26.2
         */
        systemMode: SystemMode;

        /**
         * This field shall specify a name for the ScheduleStruct.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26.3
         */
        name?: string;

        /**
         * This field shall indicate the default PresetHandle value for transitions in this schedule.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26.4
         */
        presetHandle?: Bytes;

        /**
         * This field shall specify a list of transitions for the schedule.
         *
         * This field shall NOT contain more than one ScheduleStruct with the same TransitionTime field and overlapping
         * DayOfWeek fields; i.e. there shall be no duplicate transitions.
         *
         * If the NumberOfScheduleTransitionPerDay attribute is not null, then for each bit in ScheduleDayOfWeekBitmap,
         * the number of transitions with that bit set in DayOfWeek shall NOT be greater than the value of the
         * NumberOfScheduleTransitionPerDay attribute.
         *
         * For the purposes of determining which ScheduleStruct in this list is currently active, the current time shall
         * be the number of minutes past midnight in the display value of the current time, not the actual number of
         * minutes that have elapsed since midnight. On days which transition into or out of daylight saving time,
         * certain values may repeat or not occur during the transition period.
         *
         * A ScheduleTransitionStruct in this list shall be active if the current day of the week matches its DayOfWeek
         * field and the current time is greater than or equal to the TransitionTime, but less than the TransitionTime
         * on any other ScheduleTransitionStruct in the Transitions field whose DayOfWeek field also matches the current
         * day of the week.
         *
         * If the current time is less than every ScheduleTransitionStruct whose DayOfWeek field also matches the
         * current day of the week, the server shall attempt the same process to identify the active
         * ScheduleTransitionStruct for the day preceding the previously attempted day of the week, repeating until an
         * active ScheduleTransitionStruct is found or the attempted day is the current day of the week again. If no
         * active ScheduleTransitionStruct is found, then the active ScheduleTransitionStruct shall be the
         * ScheduleTransitionStruct with the largest TransitionTime field from the set of ScheduleTransitionStructs
         * whose DayOfWeek field matches the current day of the week.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26.5
         */
        transitions: ScheduleTransition[];

        /**
         * This field shall indicate whether the schedule is marked as "built-in", meaning that it can be modified, but
         * it cannot be deleted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.26.6
         */
        builtIn: boolean | null;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.29
     */
    export class ThermostatSuggestion {
        constructor(values?: Partial<ThermostatSuggestion>);

        /**
         * This field shall have a generated identifier that identifies a distinct entry of type
         * ThermostatSuggestionStruct.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.29.1
         */
        uniqueId: number;

        /**
         * This field shall indicate the PresetHandle of the PresetStruct that represents the thermostat suggestion
         * value.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.29.2
         */
        presetHandle: Bytes;

        /**
         * This field shall indicate the UTC timestamp at which the suggestion shall take effect.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.29.3
         */
        effectiveTime: number;

        /**
         * This field shall indicate the UTC timestamp at which the suggestion shall expire.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.29.4
         */
        expirationTime: number;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.9
     */
    export class ThermostatSuggestionNotFollowingReason {
        constructor(values?: Partial<ThermostatSuggestionNotFollowingReason> | number);

        /**
         * Thermostat is responding to a Demand Response event
         */
        demandResponseEvent?: boolean;

        /**
         * Thermostat has an ongoing setpoint hold
         */
        ongoingHold?: boolean;

        /**
         * Thermostat is following a schedule
         */
        schedule?: boolean;

        /**
         * Thermostat is following the occupancy signal
         */
        occupancy?: boolean;

        /**
         * Thermostat is set to Vacation mode
         */
        vacationMode?: boolean;

        /**
         * Thermostat is following a Time Of Use based cost savings plan
         */
        timeOfUseCostSavings?: boolean;

        /**
         * Thermostat is precooling or preheating based on an energy forecast signal
         */
        preCoolingOrPreHeating?: boolean;

        /**
         * Thermostat has conflicting suggestions and is unable to choose one
         */
        conflictingSuggestions?: boolean;
    }

    /**
     * This command will raise or lower the setpoint based on the provided values.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.1
     */
    export class SetpointRaiseLowerRequest {
        constructor(values?: Partial<SetpointRaiseLowerRequest>);

        /**
         * The field shall specify which setpoints are to be adjusted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.1.1
         */
        mode: SetpointRaiseLowerMode;

        /**
         * This field shall indicate the amount (possibly negative) that should be added to the setpoint(s), in steps of
         * 0.1°C.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.1.2
         */
        amount: number;
    }

    /**
     * This command will set the active preset to the provided preset handle.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.3
     */
    export class SetActivePresetRequest {
        constructor(values?: Partial<SetActivePresetRequest>);

        /**
         * This field shall specify the value of the PresetHandle field on the PresetStruct to be made active. If the
         * field is set to null, that indicates there should be no active preset.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.3.1
         */
        presetHandle: Bytes | null;
    }

    /**
     * This command will set the active schedule to the provided schedule handle.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.2
     */
    export class SetActiveScheduleRequest {
        constructor(values?: Partial<SetActiveScheduleRequest>);

        /**
         * This field shall specify the value of the ScheduleHandle field on the ScheduleStruct to be made active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.2.1
         */
        scheduleHandle: Bytes;
    }

    /**
     * This command will add a new suggestion based on the specified values.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.4
     */
    export class AddThermostatSuggestionRequest {
        constructor(values?: Partial<AddThermostatSuggestionRequest>);

        /**
         * This field shall specify the value of the thermostat suggestion.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.4.1
         */
        presetHandle: Bytes;

        /**
         * This field shall indicate the timestamp in UTC at which the thermostat suggestion shall become available. If
         * this field is set to null, that means the thermostat suggestion shall become available immediately.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.4.2
         */
        effectiveTime: number | null;

        /**
         * This field shall indicate the duration in minutes after which the thermostat suggestion provided by this
         * command shall expire.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.4.3
         */
        expirationInMinutes: number;
    }

    /**
     * This command is sent in response to the AddThermostatSuggestion command.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.5
     */
    export class AddThermostatSuggestionResponse {
        constructor(values?: Partial<AddThermostatSuggestionResponse>);

        /**
         * This field shall contain the value in the UniqueID field of the entry that was added to the
         * ThermostatSuggestions attribute via the AddThermostatSuggestion command for which this response shall be
         * sent.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.5.1
         */
        uniqueId: number;
    }

    /**
     * This command will remove the specified suggestion.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.6
     */
    export class RemoveThermostatSuggestionRequest {
        constructor(values?: Partial<RemoveThermostatSuggestionRequest>);

        /**
         * This field shall contain a unique identifier for an entry in the ThermostatSuggestions attribute that shall
         * be removed.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.12.6.1
         */
        uniqueId: number;
    }

    export class AtomicRequest {
        constructor(values?: Partial<AtomicRequest>);
        requestType: RequestType;
        attributeRequests: AttributeId[];
        timeout?: number;
    }

    export class AtomicResponse {
        constructor(values?: Partial<AtomicResponse>);
        statusCode: Status;
        attributeStatus: Entry[];
        timeout?: number;
    }

    /**
     * This event shall be generated when the ThermostatRunningMode attribute changes.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.5
     */
    export class RunningModeChangeEvent {
        constructor(values?: Partial<RunningModeChangeEvent>);

        /**
         * This field shall indicate the previous value of the ThermostatRunningMode attribute. If the previous value is
         * unavailable, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.5.1
         */
        previousRunningMode?: ThermostatRunningMode;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * ThermostatRunningMode attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.5.2
         */
        currentRunningMode: ThermostatRunningMode;
    }

    /**
     * This event shall be generated when the SystemMode attribute changes.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.1
     */
    export class SystemModeChangeEvent {
        constructor(values?: Partial<SystemModeChangeEvent>);

        /**
         * This field shall indicate the previous value of the SystemMode attribute. If the previous value is
         * unavailable, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.1.1
         */
        previousSystemMode?: SystemMode;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * SystemMode attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.1.2
         */
        currentSystemMode: SystemMode;
    }

    /**
     * This event shall be generated when the value of any of the OccupiedHeatingSetpoint, UnoccupiedHeatingSetpoint,
     * OccupiedCoolingSetpoint, or UnoccupiedCoolingSetpoint attributes is changed.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4
     */
    export class SetpointChangeEvent {
        constructor(values?: Partial<SetpointChangeEvent>);

        /**
         * This field shall indicate the system mode associated with the changed attribute. If the changed attribute is
         * OccupiedHeatingSetpoint or UnoccupiedHeatingSetpoint, the value of this field shall be Heat. If the changed
         * attribute is OccupiedCoolingSetpoint or UnoccupiedCoolingSetpoint, the value of this field shall be Cool.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4.1
         */
        systemMode: SystemMode;

        /**
         * This field shall indicate the occupancy associated with the changed attribute. If the changed attribute is
         * OccupiedHeatingSetpoint or OccupiedCoolingSetpoint, the value of this field shall be 1. If the changed
         * attribute is UnoccupiedHeatingSetpoint or UnoccupiedCoolingSetpoint, the value of this field shall be 0.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4.2
         */
        occupancy?: Occupancy;

        /**
         * This field shall indicate the previous value of the changed attribute. If the previous value is unavailable,
         * this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4.3
         */
        previousSetpoint?: number;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * changed attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.4.4
         */
        currentSetpoint: number;
    }

    /**
     * This event shall be generated when the ThermostatRunningState attribute changes.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.6
     */
    export class RunningStateChangeEvent {
        constructor(values?: Partial<RunningStateChangeEvent>);

        /**
         * This field shall indicate the previous value of the ThermostatRunningState attribute. If the previous value
         * is unavailable, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.6.1
         */
        previousRunningState?: RelayState;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * ThermostatRunningState attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.6.2
         */
        currentRunningState: RelayState;
    }

    /**
     * This event shall be generated when the LocalTemperature attribute changes significantly.
     *
     * Significant changes are:
     *
     *   - Changes from null to not null, or from not null to null.
     *
     *   - Changes from one not-null value to another not-null value that are sufficiently large, as determined by the
     *     server.
     *
     * LocalTemperatureChange events shall NOT be generated more often than once every 60 seconds.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.2
     */
    export class LocalTemperatureChangeEvent {
        constructor(values?: Partial<LocalTemperatureChangeEvent>);

        /**
         * This field shall indicate the current value of the LocalTemperature attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.2.1
         */
        currentLocalTemperature: number | null;
    }

    /**
     * This event shall be generated when the Occupancy attribute changes.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.3
     */
    export class OccupancyChangeEvent {
        constructor(values?: Partial<OccupancyChangeEvent>);

        /**
         * This field shall indicate the previous value of the Occupancy attribute. If the previous value is
         * unavailable, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.3.1
         */
        previousOccupancy?: Occupancy;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * Occupancy attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.3.2
         */
        currentOccupancy: Occupancy;
    }

    /**
     * This event shall be generated when the ActiveScheduleHandle attribute changes.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.8
     */
    export class ActiveScheduleChangeEvent {
        constructor(values?: Partial<ActiveScheduleChangeEvent>);

        /**
         * This field shall indicate the previous value of the ActiveScheduleHandle attribute. If the previous value is
         * unavailable, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.8.1
         */
        previousScheduleHandle?: Bytes | null;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * ActiveScheduleHandle attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.8.2
         */
        currentScheduleHandle: Bytes | null;
    }

    /**
     * This event shall be generated when the ActivePresetHandle attribute changes.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.7
     */
    export class ActivePresetChangeEvent {
        constructor(values?: Partial<ActivePresetChangeEvent>);

        /**
         * This field shall indicate the previous value of the ActivePresetHandle attribute. If the previous value is
         * unavailable, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.7.1
         */
        previousPresetHandle?: Bytes | null;

        /**
         * This field shall indicate the current (after the change that caused the event to be generated) value of the
         * ActivePresetHandle attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.13.7.2
         */
        currentPresetHandle: Bytes | null;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.3
     */
    export class PresetTypeFeatures {
        constructor(values?: Partial<PresetTypeFeatures> | number);

        /**
         * Preset may be automatically activated by the thermostat
         */
        automatic?: boolean;

        /**
         * Preset supports user-provided names
         */
        supportsNames?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.6
     */
    export class ScheduleTypeFeatures {
        constructor(values?: Partial<ScheduleTypeFeatures> | number);

        /**
         * Supports presets
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports specifying presets on ScheduleTransitionStructs
         * contained in its Transitions field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.6.1
         */
        supportsPresets?: boolean;

        /**
         * Supports setpoints
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports specifying setpoints on ScheduleTransitionStructs
         * contained in its Transitions field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.6.2
         */
        supportsSetpoints?: boolean;

        /**
         * Supports user-provided names
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports setting the value of the Name field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.6.3
         */
        supportsNames?: boolean;

        /**
         * Supports transitioning to SystemModeOff
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports setting its SystemMode field to Off.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.6.4
         */
        supportsOff?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.7
     */
    export class ScheduleDayOfWeek {
        constructor(values?: Partial<ScheduleDayOfWeek> | number);

        /**
         * Sunday
         */
        sunday?: boolean;

        /**
         * Monday
         */
        monday?: boolean;

        /**
         * Tuesday
         */
        tuesday?: boolean;

        /**
         * Wednesday
         */
        wednesday?: boolean;

        /**
         * Thursday
         */
        thursday?: boolean;

        /**
         * Friday
         */
        friday?: boolean;

        /**
         * Saturday
         */
        saturday?: boolean;

        /**
         * Away or Vacation
         */
        away?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.8
     */
    export class ScheduleMode {
        constructor(values?: Partial<ScheduleMode> | number);

        /**
         * Adjust Heat Setpoint
         */
        heatSetpointPresent?: boolean;

        /**
         * Adjust Cool Setpoint
         */
        coolSetpointPresent?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.15
     */
    export enum SetpointRaiseLowerMode {
        /**
         * Adjust Heat Setpoint
         */
        Heat = 0,

        /**
         * Adjust Cool Setpoint
         */
        Cool = 1,

        /**
         * Adjust Heat Setpoint and Cool Setpoint
         */
        Both = 2
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17
     */
    export enum PresetScenario {
        /**
         * The thermostat-controlled area is occupied
         *
         * This value shall indicate the preset for periods when the thermostat's temperature-controlled area is
         * occupied. It is intended for thermostats that can automatically determine occupancy.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.2
         */
        Occupied = 1,

        /**
         * The thermostat-controlled area is unoccupied
         *
         * This value shall indicate the preset for periods when the thermostat's temperature-controlled area is
         * unoccupied. It is intended for thermostats that can automatically determine occupancy.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.3
         */
        Unoccupied = 2,

        /**
         * Users are likely to be sleeping
         *
         * This value shall indicate the preset for periods when users are likely to be asleep.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.4
         */
        Sleep = 3,

        /**
         * Users are likely to be waking up
         *
         * This value shall indicate the preset for periods when users are likely to be waking up.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.5
         */
        Wake = 4,

        /**
         * Users are on vacation
         *
         * This value shall indicate the preset for periods when users are on vacation, or otherwise out-of-home for
         * extended periods of time.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.6
         */
        Vacation = 5,

        /**
         * Users are likely to be going to sleep
         *
         * This value shall indicate the preset for periods when users are likely to be going to sleep.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.7
         */
        GoingToSleep = 6,

        /**
         * Custom presets
         *
         * This value shall indicate a free-form preset; when set, the Name field on PresetStruct shall NOT be null.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.17.8
         */
        UserDefined = 254
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.19
     */
    export enum StartOfWeek {
        Sunday = 0,
        Monday = 1,
        Tuesday = 2,
        Wednesday = 3,
        Thursday = 4,
        Friday = 5,
        Saturday = 6
    }

    /**
     * This represents a single transition in a Thermostat schedule
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.25
     */
    export class WeeklyScheduleTransition {
        constructor(values?: Partial<WeeklyScheduleTransition>);

        /**
         * This field shall represent the start time of the schedule transition during the associated day. The time will
         * be represented by a 16 bits unsigned integer to designate the minutes since midnight. For example, 6am will
         * be represented by 360 minutes since midnight and 11:30pm will be represented by 1410 minutes since midnight.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.25.1
         */
        transitionTime: number;

        /**
         * This field shall represent the heat setpoint to be applied at this associated transition start time.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.25.2
         */
        heatSetpoint: number | null;

        /**
         * This field shall represent the cool setpoint to be applied at this associated transition start time.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.25.3
         */
        coolSetpoint: number | null;
    }

    /**
     * This struct provides a time of day and a set of days of the week for a state transition within a schedule. The
     * thermostat shall use the following order of precedence for determining a new setpoint at the time of transition:
     *
     *   1. If the PresetHandle field is provided, then the setpoint for the PresetStruct in the Presets attribute with
     *      that identifier shall be used
     *
     *   2. If either the HeatingSetpoint or CoolingSetpoint is provided, then it shall be used
     *
     *   1. If the SystemMode field is provided, the HeatingSetpoint and CoolingSetpoint fields shall be interpreted
     *      using the SystemMode field
     *
     *   2. If the SystemMode field is not provided, the HeatingSetpoint and CoolingSetpoint fields shall be interpreted
     *      using the SystemMode field on the parent ScheduleStruct
     *
     *   3. If neither the PresetHandle field or any Setpoint field is provided, then the PresetHandle field on the
     *      parent ScheduleStruct shall be used to determine the active PresetStruct
     *
     *   4. If the PresetHandle is not indicated and no setpoint is provided for the current SystemMode, the server
     *      shall use a default value for the current SystemMode.
     *
     * If the setpoint was derived from a preset, then the ActivePresetHandle shall be set to the PresetHandle of that
     * preset.
     *
     * If a CoolingSetpoint was used to determine the cooling setpoint:
     *
     *   - If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy attribute, then the
     *     UnoccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint
     *
     *   - Otherwise, the OccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint
     *
     * If a HeatingSetpoint was used to determine the heating setpoint:
     *
     *   - If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy attribute, then the
     *     UnoccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint
     *
     *   - Otherwise, the OccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint
     *
     * The ScheduleTransitionStruct shall be invalid if all the following are true:
     *
     *   - The HeatingSetpoint field is not provided
     *
     *   - The PresetHandle field is not provided
     *
     *   - The PresetHandle field on the encompassing ScheduleStruct is not provided
     *
     *   - The SystemMode field is provided and has the value Heat or Auto, or the SystemMode field on the parent
     *     ScheduleStruct has the value Heat or Auto
     *
     * The ScheduleTransitionStruct shall be invalid if all the following are true:
     *
     *   - The CoolingSetpoint field is not provided
     *
     *   - The PresetHandle field is not provided
     *
     *   - The PresetHandle field on the encompassing ScheduleStruct is not provided
     *
     *   - The SystemMode field is provided and has the value Cool or Auto, or the SystemMode field on the parent
     *     ScheduleStruct has the value Cool or Auto
     *
     * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27
     */
    export class ScheduleTransition {
        constructor(values?: Partial<ScheduleTransition>);

        /**
         * This field shall specify a bitmask of days of the week that the transition applies to. The Vacation bit shall
         * NOT be set; vacation schedules shall be set via the vacation preset.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27.1
         */
        dayOfWeek: ScheduleDayOfWeek;

        /**
         * This shall specify the time of day at which the transition becomes active, in terms of minutes within the day
         * representing the wall clock, where 0 is 00:00:00, 1 is 00:01:00 and 1439 is 23:59:00.
         *
         * Handling of transitions during the changeover of Daylight Saving Time is implementation-dependent.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27.2
         */
        transitionTime: number;

        /**
         * This field shall specify the preset used at the TransitionTime. If this field is provided, then the
         * SystemMode, CoolingSetpoint and HeatingSetpoint fields shall NOT be provided.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27.3
         */
        presetHandle?: Bytes;

        /**
         * This shall specify the default mode to which the thermostat will switch for this transition, overriding the
         * default for the schedule. The only valid values for this field shall be Auto, Heat, Cool and Off. This field
         * shall only be included when the required system mode differs from the schedule's default SystemMode.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27.4
         */
        systemMode?: SystemMode;

        /**
         * This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field shall
         * NOT be included. Refer to Setpoint Limits for value constraints.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27.5
         */
        coolingSetpoint?: number;

        /**
         * This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field shall
         * NOT be included. Refer to Setpoint Limits for value constraints.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 4.3.10.27.6
         */
        heatingSetpoint?: number;
    }

    export enum RequestType {
        BeginWrite = 0,
        CommitWrite = 1,
        RollbackWrite = 2
    }
    export class Entry {
        constructor(values?: Partial<Entry>);
        attributeId: AttributeId;
        statusCode: Status;
    }

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
     * @deprecated Use {@link Thermostat}.
     */
    export const Cluster: ClusterType.WithCompat<typeof Thermostat, Thermostat>;

    /**
     * @deprecated Use {@link Thermostat}.
     */
    export const Complete: typeof Thermostat;

    export const Typing: Thermostat;
}

/**
 * @deprecated Use {@link Thermostat}.
 */
export declare const ThermostatCluster: typeof Thermostat;

export interface Thermostat extends ClusterTyping {
    Attributes: Thermostat.Attributes;
    Commands: Thermostat.Commands;
    Events: Thermostat.Events;
    Features: Thermostat.Features;
    Components: Thermostat.Components;
}
