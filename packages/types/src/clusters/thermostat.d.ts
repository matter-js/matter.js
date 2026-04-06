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
 * @see {@link MatterSpecification.v151.Cluster} § 4.3
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
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 10;

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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.2
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.21
         */
        controlSequenceOfOperation: ControlSequenceOfOperation;

        /**
         * Indicates the current operating mode of the thermostat. Its value shall be limited by the
         * ControlSequenceOfOperation attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.22
         */
        systemMode: SystemMode;

        /**
         * Indicates the outdoor temperature, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.3
         */
        outdoorTemperature?: number | null;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        piCoolingDemand?: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        piHeatingDemand?: any;

        /**
         * Indicates the HVAC system type controlled by the thermostat. If the thermostat uses physical DIP switches to
         * set these parameters, this information shall be available read-only from the DIP switches. If these
         * parameters are set via software, there shall be read/write access in order to provide remote programming
         * capability.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.9
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.20
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.27
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.28
         */
        temperatureSetpointHoldDuration?: number | null;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        thermostatProgrammingOperationMode?: any;

        /**
         * Indicates the current relay state of the heat, cool, and fan relays.
         *
         * Unimplemented outputs shall be treated as if they were Off.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.29
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.30
         */
        setpointChangeSource?: SetpointChangeSource;

        /**
         * Indicates the delta between the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint and the
         * previous active setpoint. This attribute is meant to accompany the SetpointChangeSource attribute; devices
         * implementing SetpointChangeAmount SHOULD also implement SetpointChangeSource.
         *
         * The null value indicates that the previous setpoint was unknown.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.31
         */
        setpointChangeAmount?: number | null;

        /**
         * Indicates the time in UTC at which the SetpointChangeAmount attribute change was recorded.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.32
         */
        setpointChangeSourceTimestamp?: number;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        occupiedSetback?: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        occupiedSetbackMin?: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        occupiedSetbackMax?: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        unoccupiedSetback?: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        unoccupiedSetbackMin?: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.33
         */
        emergencyHeatDelta?: number;

        /**
         * Indicates the type of Mini Split ACTypeEnum of Mini Split AC is defined depending on how Cooling and Heating
         * condition is achieved by Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.34
         */
        acType?: AcType;

        /**
         * Indicates capacity of Mini Split AC in terms of the format defined by the ACCapacityFormat attribute
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.35
         */
        acCapacity?: number;

        /**
         * Indicates type of refrigerant used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.36
         */
        acRefrigerantType?: AcRefrigerantType;

        /**
         * Indicates the type of compressor used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.37
         */
        acCompressorType?: AcCompressorType;

        /**
         * Indicates the type of errors encountered within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.38
         */
        acErrorCode?: AcErrorCode;

        /**
         * Indicates the position of Louver on the AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.39
         */
        acLouverPosition?: AcLouverPosition;

        /**
         * Indicates the temperature of the AC coil, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.40
         */
        acCoilTemperature?: number | null;

        /**
         * Indicates the format for the ACCapacity attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.41
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.52
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.4
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.12
         */
        occupiedHeatingSetpoint: number;

        /**
         * Indicates the absolute minimum level that the heating setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.5
         */
        absMinHeatSetpointLimit?: number;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.15
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.16
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.11
         */
        occupiedCoolingSetpoint: number;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         */
        absMinCoolSetpointLimit?: number;

        /**
         * Indicates the absolute maximum level that the cooling setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.8
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.17
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.18
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.10
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.13
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.14
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.19
         */
        minSetpointDeadBand: number;

        /**
         * Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum but can
         * only be Off, Cool or Heat. This attribute is intended to provide additional information when the thermostat's
         * system mode is in auto mode.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.23
         */
        thermostatRunningMode?: ThermostatRunningMode;
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.42
         */
        presetTypes: PresetType[];

        /**
         * Indicates the maximum number of entries supported by the Presets attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.44
         */
        numberOfPresets: number;

        /**
         * Indicates the PresetHandle of the active preset. If this attribute is null, then there is no active preset.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.48
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
         *   2. Otherwise, the attribute status shall be SUCCESS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.50
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.43
         */
        scheduleTypes: ScheduleType[];

        /**
         * Indicates the maximum number of entries supported by the Schedules attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.45
         */
        numberOfSchedules: number;

        /**
         * Indicates the maximum number of transitions per Schedules attribute entry.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.46
         */
        numberOfScheduleTransitions: number;

        /**
         * Indicates the maximum number of transitions per day of the week supported by each Schedules attribute entry.
         * If this value is null, there is no limit on the number of transitions per day.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.47
         */
        numberOfScheduleTransitionPerDay: number | null;

        /**
         * Indicates the ScheduleHandle of the active schedule. A null value in this attribute indicates that there is
         * no active schedule.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.49
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.51
         */
        schedules: Schedule[];
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.2
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.21
         */
        controlSequenceOfOperation: ControlSequenceOfOperation;

        /**
         * Indicates the current operating mode of the thermostat. Its value shall be limited by the
         * ControlSequenceOfOperation attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.22
         */
        systemMode: SystemMode;

        /**
         * Indicates the outdoor temperature, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.3
         */
        outdoorTemperature: number | null;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        piCoolingDemand: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        piHeatingDemand: any;

        /**
         * Indicates the HVAC system type controlled by the thermostat. If the thermostat uses physical DIP switches to
         * set these parameters, this information shall be available read-only from the DIP switches. If these
         * parameters are set via software, there shall be read/write access in order to provide remote programming
         * capability.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.9
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.20
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.27
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.28
         */
        temperatureSetpointHoldDuration: number | null;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        thermostatProgrammingOperationMode: any;

        /**
         * Indicates the current relay state of the heat, cool, and fan relays.
         *
         * Unimplemented outputs shall be treated as if they were Off.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.29
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.30
         */
        setpointChangeSource: SetpointChangeSource;

        /**
         * Indicates the delta between the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint and the
         * previous active setpoint. This attribute is meant to accompany the SetpointChangeSource attribute; devices
         * implementing SetpointChangeAmount SHOULD also implement SetpointChangeSource.
         *
         * The null value indicates that the previous setpoint was unknown.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.31
         */
        setpointChangeAmount: number | null;

        /**
         * Indicates the time in UTC at which the SetpointChangeAmount attribute change was recorded.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.32
         */
        setpointChangeSourceTimestamp: number;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        occupiedSetback: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        occupiedSetbackMin: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        occupiedSetbackMax: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        unoccupiedSetback: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         * @deprecated
         */
        unoccupiedSetbackMin: any;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.33
         */
        emergencyHeatDelta: number;

        /**
         * Indicates the type of Mini Split ACTypeEnum of Mini Split AC is defined depending on how Cooling and Heating
         * condition is achieved by Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.34
         */
        acType: AcType;

        /**
         * Indicates capacity of Mini Split AC in terms of the format defined by the ACCapacityFormat attribute
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.35
         */
        acCapacity: number;

        /**
         * Indicates type of refrigerant used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.36
         */
        acRefrigerantType: AcRefrigerantType;

        /**
         * Indicates the type of compressor used within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.37
         */
        acCompressorType: AcCompressorType;

        /**
         * Indicates the type of errors encountered within the Mini Split AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.38
         */
        acErrorCode: AcErrorCode;

        /**
         * Indicates the position of Louver on the AC.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.39
         */
        acLouverPosition: AcLouverPosition;

        /**
         * Indicates the temperature of the AC coil, as measured locally or remotely (over the network).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.40
         */
        acCoilTemperature: number | null;

        /**
         * Indicates the format for the ACCapacity attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.41
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.52
         */
        setpointHoldExpiryTimestamp: number | null;

        /**
         * Indicates whether the heated/cooled space is occupied or not, as measured locally or remotely (over the
         * network).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.4
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.12
         */
        occupiedHeatingSetpoint: number;

        /**
         * Indicates the absolute minimum level that the heating setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.5
         */
        absMinHeatSetpointLimit: number;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.15
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.16
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.11
         */
        occupiedCoolingSetpoint: number;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9
         */
        absMinCoolSetpointLimit: number;

        /**
         * Indicates the absolute maximum level that the cooling setpoint may be set to. This is a limitation imposed by
         * the manufacturer.
         *
         * Refer to Setpoint Limits for constraints
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.8
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.17
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.18
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.10
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.13
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.14
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.19
         */
        minSetpointDeadBand: number;

        /**
         * Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum but can
         * only be Off, Cool or Heat. This attribute is intended to provide additional information when the thermostat's
         * system mode is in auto mode.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.23
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.42
         */
        presetTypes: PresetType[];

        /**
         * Indicates the maximum number of entries supported by the Presets attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.44
         */
        numberOfPresets: number;

        /**
         * Indicates the PresetHandle of the active preset. If this attribute is null, then there is no active preset.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.48
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
         *   2. Otherwise, the attribute status shall be SUCCESS.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.50
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.43
         */
        scheduleTypes: ScheduleType[];

        /**
         * Indicates the maximum number of entries supported by the Schedules attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.45
         */
        numberOfSchedules: number;

        /**
         * Indicates the maximum number of transitions per Schedules attribute entry.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.46
         */
        numberOfScheduleTransitions: number;

        /**
         * Indicates the maximum number of transitions per day of the week supported by each Schedules attribute entry.
         * If this value is null, there is no limit on the number of transitions per day.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.47
         */
        numberOfScheduleTransitionPerDay: number | null;

        /**
         * Indicates the ScheduleHandle of the active schedule. A null value in this attribute indicates that there is
         * no active schedule.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.49
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.9.51
         */
        schedules: Schedule[];
    }

    /**
     * {@link Thermostat} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command will raise or lower the setpoint based on the provided values.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.1
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.3
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.2
         */
        setActiveScheduleRequest(request: SetActiveScheduleRequest): MaybePromise;
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
        PresetsOrMatterScheduleConfigurationCommands
    {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { occupancy: true }, attributes: OccupancyAttributes },
        { flags: { heating: true }, attributes: HeatingAttributes },
        { flags: { cooling: true }, attributes: CoolingAttributes },
        { flags: { localTemperatureNotExposed: false }, attributes: NotLocalTemperatureNotExposedAttributes },
        { flags: { cooling: true, occupancy: true }, attributes: CoolingAndOccupancyAttributes },
        { flags: { heating: true, occupancy: true }, attributes: HeatingAndOccupancyAttributes },
        { flags: { autoMode: true }, attributes: AutoModeAttributes },
        { flags: { presets: true }, attributes: PresetsAttributes, commands: PresetsCommands },
        {
            flags: { matterScheduleConfiguration: true },
            attributes: MatterScheduleConfigurationAttributes,
            commands: MatterScheduleConfigurationCommands
        },
        { flags: { presets: true }, commands: PresetsOrMatterScheduleConfigurationCommands },
        { flags: { matterScheduleConfiguration: true }, commands: PresetsOrMatterScheduleConfigurationCommands }
    ];

    export type Features = "Heating" | "Cooling" | "Occupancy" | "Setback" | "AutoMode" | "LocalTemperatureNotExposed" | "MatterScheduleConfiguration" | "Presets";

    /**
     * These are optional features supported by ThermostatCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.4
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.4.1
         */
        LocalTemperatureNotExposed = "LocalTemperatureNotExposed",

        /**
         * MatterScheduleConfiguration (MSCH)
         *
         * This feature indicates that the thermostat is capable of schedules. If this feature is supported, the
         * thermostat shall support a mechanism to do time synchronization.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.4.2
         */
        MatterScheduleConfiguration = "MatterScheduleConfiguration",

        /**
         * Presets (PRES)
         *
         * Thermostat supports setpoint presets
         */
        Presets = "Presets"
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.15
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.19
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.5
     */
    export declare class RemoteSensing {
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
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.21
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.4
     */
    export declare class RelayState {
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
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.17
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.13
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.12
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.10
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.1
     */
    export declare class AcErrorCode {
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
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.11
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.9
     */
    export enum AcCapacityFormat {
        /**
         * British Thermal Unit per Hour
         */
        BtUh = 0
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.2
     */
    export declare class Occupancy {
        constructor(values?: Partial<Occupancy> | number);

        /**
         * Indicates the occupancy state
         *
         * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
         * unoccupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.2.1
         */
        occupied?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.20
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.23
     */
    export declare class PresetType {
        constructor(values?: Partial<PresetType>);

        /**
         * This field shall specify a PresetScenarioEnum value supported by this thermostat.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.23.1
         */
        presetScenario: PresetScenario;

        /**
         * This field shall specify a limit for the number of presets for this PresetScenarioEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.23.2
         */
        numberOfPresets: number;

        /**
         * This field shall specify a bitmap of features for this PresetTypeStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.23.3
         */
        presetTypeFeatures: PresetTypeFeatures;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22
     */
    export declare class Preset {
        constructor(values?: Partial<Preset>);

        /**
         * This field shall indicate a device generated identifier for this preset. It shall be unique on the device,
         * and shall NOT be reused after the associated preset has been deleted.
         *
         * This field shall only be null when the encompassing PresetStruct is appended to the Presets attribute for the
         * purpose of creating a new Preset. Refer to Presets for the creation of Preset handles.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22.1
         */
        presetHandle: Bytes | null;

        /**
         * This field shall indicate the associated PresetScenarioEnum value for this preset.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22.2
         */
        presetScenario: PresetScenario;

        /**
         * This field shall indicate a name provided by a user. The null value shall indicate no name.
         *
         * Within each subset of presets sharing the same PresetScenario field value, there shall NOT be any presets
         * with the same value, including null as a value, in the Name field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22.3
         */
        name?: string | null;

        /**
         * This field shall indicate the cooling setpoint for the preset. Refer to Setpoint Limits for value
         * constraints.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22.4
         */
        coolingSetpoint?: number;

        /**
         * This field shall indicate the heating setpoint for the preset. Refer to Setpoint Limits for value
         * constraints.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22.5
         */
        heatingSetpoint?: number;

        /**
         * This field shall indicate whether the preset is marked as "built-in", meaning that it can be modified, but it
         * cannot be deleted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.22.6
         */
        builtIn: boolean | null;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.27
     */
    export declare class ScheduleType {
        constructor(values?: Partial<ScheduleType>);

        /**
         * This field shall specify a SystemModeEnum supported by this thermostat for Schedules. The only valid values
         * for this field shall be Auto, Heat, and Cool.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.27.1
         */
        systemMode: SystemMode;

        /**
         * This field shall specify a limit for the number of Schedules for this SystemMode.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.27.2
         */
        numberOfSchedules: number;

        /**
         * This field shall specify a bitmap of features for this schedule entry. At least one of SupportsPresets and
         * SupportsSetpoints shall be set.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.27.3
         */
        scheduleTypeFeatures: ScheduleTypeFeatures;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25
     */
    export declare class Schedule {
        constructor(values?: Partial<Schedule>);

        /**
         * This field shall indicate a device generated identifier for this schedule. It shall be unique on the device,
         * and shall NOT be reused after the associated schedule has been deleted.
         *
         * This field shall only be null when the encompassing ScheduleStruct is appended to the Schedules attribute for
         * the purpose of creating a new Schedule. Refer to Schedules for the creation of Schedule handles.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25.1
         */
        scheduleHandle: Bytes | null;

        /**
         * This field shall specify the default thermostat system mode for transitions in this schedule. The only valid
         * values for this field shall be Auto, Heat, and Cool.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25.2
         */
        systemMode: SystemMode;

        /**
         * This field shall specify a name for the ScheduleStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25.3
         */
        name?: string;

        /**
         * This field shall indicate the default PresetHandle value for transitions in this schedule.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25.4
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
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25.5
         */
        transitions: ScheduleTransition[];

        /**
         * This field shall indicate whether the schedule is marked as "built-in", meaning that it can be modified, but
         * it cannot be deleted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.25.6
         */
        builtIn: boolean | null;
    };

    /**
     * This command will raise or lower the setpoint based on the provided values.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.1
     */
    export declare class SetpointRaiseLowerRequest {
        constructor(values?: Partial<SetpointRaiseLowerRequest>);

        /**
         * The field shall specify which setpoints are to be adjusted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.1.1
         */
        mode: SetpointRaiseLowerMode;

        /**
         * This field shall indicate the amount (possibly negative) that should be added to the setpoint(s), in steps of
         * 0.1°C.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.1.2
         */
        amount: number;
    };

    /**
     * This command will set the active preset to the provided preset handle.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.3
     */
    export declare class SetActivePresetRequest {
        constructor(values?: Partial<SetActivePresetRequest>);

        /**
         * This field shall specify the value of the PresetHandle field on the PresetStruct to be made active. If the
         * field is set to null, that indicates there should be no active preset.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.3.1
         */
        presetHandle: Bytes | null;
    };

    /**
     * This command will set the active schedule to the provided schedule handle.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.2
     */
    export declare class SetActiveScheduleRequest {
        constructor(values?: Partial<SetActiveScheduleRequest>);

        /**
         * This field shall specify the value of the ScheduleHandle field on the ScheduleStruct to be made active.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.10.2.1
         */
        scheduleHandle: Bytes;
    };

    export declare class AtomicRequest {
        constructor(values?: Partial<AtomicRequest>);
        requestType: RequestType;
        attributeRequests: AttributeId[];
        timeout?: number;
    };

    export declare class AtomicResponse {
        constructor(values?: Partial<AtomicResponse>);
        statusCode: Status;
        attributeStatus: Entry[];
        timeout?: number;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.3
     */
    export declare class PresetTypeFeatures {
        constructor(values?: Partial<PresetTypeFeatures> | number);

        /**
         * Preset may be automatically activated by the thermostat
         */
        automatic?: boolean;

        /**
         * Preset supports user-provided names
         */
        supportsNames?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.6
     */
    export declare class ScheduleTypeFeatures {
        constructor(values?: Partial<ScheduleTypeFeatures> | number);

        /**
         * Supports presets
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports specifying presets on ScheduleTransitionStructs
         * contained in its Transitions field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.6.1
         */
        supportsPresets?: boolean;

        /**
         * Supports setpoints
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports specifying setpoints on ScheduleTransitionStructs
         * contained in its Transitions field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.6.2
         */
        supportsSetpoints?: boolean;

        /**
         * Supports user-provided names
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports setting the value of the Name field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.6.3
         */
        supportsNames?: boolean;

        /**
         * Supports transitioning to SystemModeOff
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports setting its SystemMode field to Off.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.6.4
         */
        supportsOff?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.7
     */
    export declare class ScheduleDayOfWeek {
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
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.8
     */
    export declare class ScheduleMode {
        constructor(values?: Partial<ScheduleMode> | number);

        /**
         * Adjust Heat Setpoint
         */
        heatSetpointPresent?: boolean;

        /**
         * Adjust Cool Setpoint
         */
        coolSetpointPresent?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.14
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16
     */
    export enum PresetScenario {
        /**
         * The thermostat-controlled area is occupied
         *
         * This value shall indicate the preset for periods when the thermostat's temperature-controlled area is
         * occupied. It is intended for thermostats that can automatically determine occupancy.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.2
         */
        Occupied = 1,

        /**
         * The thermostat-controlled area is unoccupied
         *
         * This value shall indicate the preset for periods when the thermostat's temperature-controlled area is
         * unoccupied. It is intended for thermostats that can automatically determine occupancy.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.3
         */
        Unoccupied = 2,

        /**
         * Users are likely to be sleeping
         *
         * This value shall indicate the preset for periods when users are likely to be asleep.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.4
         */
        Sleep = 3,

        /**
         * Users are likely to be waking up
         *
         * This value shall indicate the preset for periods when users are likely to be waking up.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.5
         */
        Wake = 4,

        /**
         * Users are on vacation
         *
         * This value shall indicate the preset for periods when users are on vacation, or otherwise out-of-home for
         * extended periods of time.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.6
         */
        Vacation = 5,

        /**
         * Users are likely to be going to sleep
         *
         * This value shall indicate the preset for periods when users are likely to be going to sleep.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.7
         */
        GoingToSleep = 6,

        /**
         * Custom presets
         *
         * This value shall indicate a free-form preset; when set, the Name field on PresetStruct shall NOT be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.16.8
         */
        UserDefined = 254
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.18
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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.24
     */
    export declare class WeeklyScheduleTransition {
        constructor(values?: Partial<WeeklyScheduleTransition>);

        /**
         * This field shall represent the start time of the schedule transition during the associated day. The time will
         * be represented by a 16 bits unsigned integer to designate the minutes since midnight. For example, 6am will
         * be represented by 360 minutes since midnight and 11:30pm will be represented by 1410 minutes since midnight.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.24.1
         */
        transitionTime: number;

        /**
         * This field shall represent the heat setpoint to be applied at this associated transition start time.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.24.2
         */
        heatSetpoint: number | null;

        /**
         * This field shall represent the cool setpoint to be applied at this associated transition start time.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.24.3
         */
        coolSetpoint: number | null;
    };

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
     * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26
     */
    export declare class ScheduleTransition {
        constructor(values?: Partial<ScheduleTransition>);

        /**
         * This field shall specify a bitmask of days of the week that the transition applies to. The Vacation bit shall
         * NOT be set; vacation schedules shall be set via the vacation preset.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26.1
         */
        dayOfWeek: ScheduleDayOfWeek;

        /**
         * This shall specify the time of day at which the transition becomes active, in terms of minutes within the day
         * representing the wall clock, where 0 is 00:00:00, 1 is 00:01:00 and 1439 is 23:59:00.
         *
         * Handling of transitions during the changeover of Daylight Saving Time is implementation-dependent.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26.2
         */
        transitionTime: number;

        /**
         * This field shall specify the preset used at the TransitionTime. If this field is provided, then the
         * SystemMode, CoolingSetpoint and HeatingSetpoint fields shall NOT be provided.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26.3
         */
        presetHandle?: Bytes;

        /**
         * This shall specify the default mode to which the thermostat will switch for this transition, overriding the
         * default for the schedule. The only valid values for this field shall be Auto, Heat, Cool and Off. This field
         * shall only be included when the required system mode differs from the schedule's default SystemMode.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26.4
         */
        systemMode?: SystemMode;

        /**
         * This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field shall
         * NOT be included. Refer to Setpoint Limits for value constraints.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26.5
         */
        coolingSetpoint?: number;

        /**
         * This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field shall
         * NOT be included. Refer to Setpoint Limits for value constraints.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 4.3.8.26.6
         */
        heatingSetpoint?: number;
    };

    export enum RequestType {
        BeginWrite = 0,
        CommitWrite = 1,
        RollbackWrite = 2
    }
    export declare class Entry {
        constructor(values?: Partial<Entry>);
        attributeId: AttributeId;
        statusCode: Status;
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
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link Thermostat}.
     */
    export const Cluster: typeof Thermostat;

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
    Features: Thermostat.Features;
    Components: Thermostat.Components;
}
