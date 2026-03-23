/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { PumpConfigurationAndControl as PumpConfigurationAndControlModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the PumpConfigurationAndControl cluster.
 */
export declare namespace PumpConfigurationAndControl {
    /**
     * {@link PumpConfigurationAndControl} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute specifies the maximum pressure the pump can achieve. It is a physical limit, and does not
             * apply to any specific control mode or operation mode.
             *
             * Valid range is -3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.1
             */
            readonly maxPressure: number | null;

            /**
             * This attribute specifies the maximum speed the pump can achieve. It is a physical limit, and does not
             * apply to any specific control mode or operation mode.
             *
             * Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.2
             */
            readonly maxSpeed: number | null;

            /**
             * This attribute specifies the maximum flow the pump can achieve. It is a physical limit, and does not
             * apply to any specific control mode or operation mode.
             *
             * Valid range is 0 m^3/h to 6,553.4 m^3/h (steps of 0.1 m^3/h). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.3
             */
            readonly maxFlow: number | null;

            /**
             * This attribute specifies current effective operation mode of the pump as defined in OperationModeEnum.
             *
             * The value of the EffectiveOperationMode attribute is the same as the OperationMode attribute, unless one
             * of the following points are true:
             *
             *   - The pump is physically set to run with the local settings
             *
             *   - The LocalOverride bit in the PumpStatus attribute is set,
             *
             * See OperationMode Attribute and ControlMode Attribute for a detailed description of the operation and
             * control of the pump.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.15
             */
            readonly effectiveOperationMode: OperationMode;

            /**
             * This attribute specifies the current effective control mode of the pump as defined in ControlModeEnum.
             *
             * This attribute contains the control mode that currently applies to the pump. It will have the value of
             * the ControlMode attribute, unless one of the following points are true:
             *
             *   - The ControlMode attribute is set to Automatic. In this case, the value of the EffectiveControlMode
             *     shall match the behavior of the pump.
             *
             *   - A remote sensor is used as the sensor for regulation of the pump. In this case, EffectiveControlMode
             *     will display ConstantPressure, ConstantFlow or ConstantTemperature if the remote sensor is a pressure
             *     sensor, a flow sensor or a temperature sensor respectively, regardless of the value of the
             *     ControlMode attribute.
             *
             * In case the ControlMode attribute is not included on the device and no remote sensors are connected, the
             * value of the EffectiveControlMode shall match the vendor-specific behavior of the pump.
             *
             * See OperationMode Attribute and ControlMode Attribute for detailed a description of the operation and
             * control of the pump.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.16
             */
            readonly effectiveControlMode: ControlMode;

            /**
             * This attribute specifies the actual capacity of the pump as a percentage of the effective maximum
             * setpoint value. It is updated dynamically as the speed of the pump changes.
             *
             * If the value is not available (the measurement or estimation of the speed is done in the pump), this
             * attribute will indicate the null value.
             *
             * Valid range is 0 % to 163.835% (0.005 % granularity). Although this attribute is a signed value, values
             * of capacity less than zero have no physical meaning.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.17
             */
            readonly capacity: number | null;

            /**
             * This attribute specifies the operation mode of the pump as defined in OperationModeEnum.
             *
             * The actual operating mode of the pump is a result of the setting of the attributes OperationMode,
             * ControlMode and the optional connection of a remote sensor. The operation and control is prioritized as
             * shown in the scheme below:
             *
             * If this attribute is Maximum, Minimum or Local, the OperationMode attribute decides how the pump is
             * operated.
             *
             * If this attribute is Normal and a remote sensor is connected to the pump, the type of the remote sensor
             * decides the control mode of the pump. A connected remote pressure sensor will make the pump run in
             * control mode Constant pressure and vice versa for flow and temperature type sensors. This is regardless
             * of the setting of the ControlMode attribute.
             *
             * If this attribute is Normal and no remote sensor is connected, the control mode of the pump is decided by
             * the ControlMode attribute.
             *
             * OperationMode may be changed at any time, even when the pump is running. The behavior of the pump at the
             * point of changing the value of this attribute is vendor-specific.
             *
             * In the case a device does not support a specific operation mode, the write interaction to this attribute
             * with an unsupported operation mode value shall be ignored and a response containing the status of
             * CONSTRAINT_ERROR shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.22
             */
            operationMode: OperationMode;

            /**
             * This attribute specifies the activity status of the pump functions as listed in PumpStatusBitmap. Where a
             * pump controller function is active, the corresponding bit shall be set to 1. Where a pump controller
             * function is not active, the corresponding bit shall be set to 0.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.14
             */
            readonly pumpStatus?: PumpStatus;

            /**
             * This attribute specifies the actual speed of the pump measured in RPM. It is updated dynamically as the
             * speed of the pump changes.
             *
             * If the value is not available (the measurement or estimation of the speed is done in the pump), this
             * attribute will indicate the null value.
             *
             * Valid range is 0 to 65,534 RPM.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.18
             */
            readonly speed?: number | null;

            /**
             * This attribute specifies the accumulated number of hours that the pump has been powered and the motor has
             * been running. It is updated dynamically as it increases. It is preserved over power cycles of the pump.
             * If LifeTimeRunningHours rises above maximum value it “rolls over” and starts at 0 (zero).
             *
             * This attribute is writeable, in order to allow setting to an appropriate value after maintenance. If the
             * value is not available, this attribute will indicate the null value.
             *
             * Valid range is 0 to 16,777,214 hrs.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.19
             */
            lifetimeRunningHours?: number | null;

            /**
             * This attribute specifies the actual power consumption of the pump in Watts. The value of this attribute
             * is updated dynamically as the power consumption of the pump changes.
             *
             * This attribute is read only. If the value is not available (the measurement of power consumption is not
             * done in the pump), this attribute will indicate the null value.
             *
             * Valid range is 0 to 16,777,214 Watts.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.20
             */
            readonly power?: number | null;

            /**
             * This attribute specifies the accumulated energy consumption of the pump through the entire lifetime of
             * the pump in kWh. The value of the LifetimeEnergyConsumed attribute is updated dynamically as the energy
             * consumption of the pump increases. If LifetimeEnergyConsumed rises above maximum value it “rolls over”
             * and starts at 0 (zero).
             *
             * This attribute is writeable, in order to allow setting to an appropriate value after maintenance.
             *
             * Valid range is 0 kWh to 4,294,967,294 kWh. Null if the value is unknown.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.21
             */
            lifetimeEnergyConsumed?: number | null;

            /**
             * This attribute specifies the control mode of the pump as defined in ControlModeEnum.
             *
             * See OperationMode Attribute for a detailed description of the operation and control of the pump.
             *
             * ControlMode may be changed at any time, even when the pump is running. The behavior of the pump at the
             * point of changing is vendor-specific.
             *
             * In the case a device does not support a specific control mode, the write interaction to this attribute
             * with an unsupported control mode value shall be ignored and a response containing the status of
             * CONSTRAINT_ERROR shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.23
             */
            controlMode?: ControlMode;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7
             * @deprecated
             */
            alarmMask?: number;
        }

        export interface Events {
            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            supplyVoltageLow?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            supplyVoltageHigh?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            powerMissingPhase?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            systemPressureLow?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            systemPressureHigh?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            dryRunning?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            motorTemperatureHigh?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            pumpMotorFatalFailure?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            electronicTemperatureHigh?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            pumpBlocked?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            sensorFailure?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            electronicNonFatalFailure?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            electronicFatalFailure?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            generalFault?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            leakage?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            airDetection?: void;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.8
             */
            turbineOperation?: void;
        }
    }

    /**
     * {@link PumpConfigurationAndControl} supports these elements if it supports feature "ConstantPressure".
     */
    export namespace ConstantPressureComponent {
        export interface Attributes {
            /**
             * This attribute specifies the minimum pressure the pump can achieve when it is working with the
             * ControlMode attribute set to ConstantPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.4
             */
            readonly minConstPressure: number | null;

            /**
             * This attribute specifies the maximum pressure the pump can achieve when it is working with the
             * ControlMode attribute set to ConstantPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.5
             */
            readonly maxConstPressure: number | null;
        }
    }

    /**
     * {@link PumpConfigurationAndControl} supports these elements if it supports feature "Automatic".
     */
    export namespace AutomaticComponent {
        export interface Attributes {
            /**
             * This attribute specifies the minimum pressure the pump can achieve when it is working with the
             * ControlMode attribute set to ConstantPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.4
             */
            readonly minConstPressure?: number | null;

            /**
             * This attribute specifies the maximum pressure the pump can achieve when it is working with the
             * ControlMode attribute set to ConstantPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.5
             */
            readonly maxConstPressure?: number | null;

            /**
             * This attribute specifies the minimum compensated pressure the pump can achieve when it is working with
             * the ControlMode attribute set to ProportionalPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.6
             */
            readonly minCompPressure?: number | null;

            /**
             * This attribute specifies the maximum compensated pressure the pump can achieve when it is working with
             * the ControlMode attribute set to ProportionalPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.7
             */
            readonly maxCompPressure?: number | null;

            /**
             * This attribute specifies the minimum speed the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantSpeed.
             *
             * Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.8
             */
            readonly minConstSpeed?: number | null;

            /**
             * This attribute specifies the maximum speed the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantSpeed.
             *
             * Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.9
             */
            readonly maxConstSpeed?: number | null;

            /**
             * This attribute specifies the minimum flow the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantFlow.
             *
             * Valid range is 0 m^3/h to 6,553.4 m^3/h (steps of 0.1 m^3/h). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.10
             */
            readonly minConstFlow?: number | null;

            /**
             * This attribute specifies the maximum flow the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantFlow.
             *
             * Valid range is 0 m^3/h to 6,553.4 m^3/h (steps of 0.1 m^3/h). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.11
             */
            readonly maxConstFlow?: number | null;

            /**
             * This attribute specifies the minimum temperature the pump can maintain in the system when it is working
             * with the ControlMode attribute set to ConstantTemperature.
             *
             * Valid range is –273.15 °C to 327.67 °C (steps of 0.01 °C). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.12
             */
            readonly minConstTemp?: number | null;

            /**
             * This attribute specifies the maximum temperature the pump can maintain in the system when it is working
             * with the ControlMode attribute set to ConstantTemperature.
             *
             * MaxConstTemp shall be greater than or equal to MinConstTemp Valid range is –273.15 °C to 327.67 °C (steps
             * of 0.01 °C). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.13
             */
            readonly maxConstTemp?: number | null;
        }
    }

    /**
     * {@link PumpConfigurationAndControl} supports these elements if it supports feature "CompensatedPressure".
     */
    export namespace CompensatedPressureComponent {
        export interface Attributes {
            /**
             * This attribute specifies the minimum compensated pressure the pump can achieve when it is working with
             * the ControlMode attribute set to ProportionalPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.6
             */
            readonly minCompPressure: number | null;

            /**
             * This attribute specifies the maximum compensated pressure the pump can achieve when it is working with
             * the ControlMode attribute set to ProportionalPressure.
             *
             * Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.7
             */
            readonly maxCompPressure: number | null;
        }
    }

    /**
     * {@link PumpConfigurationAndControl} supports these elements if it supports feature "ConstantSpeed".
     */
    export namespace ConstantSpeedComponent {
        export interface Attributes {
            /**
             * This attribute specifies the minimum speed the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantSpeed.
             *
             * Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.8
             */
            readonly minConstSpeed: number | null;

            /**
             * This attribute specifies the maximum speed the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantSpeed.
             *
             * Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.9
             */
            readonly maxConstSpeed: number | null;
        }
    }

    /**
     * {@link PumpConfigurationAndControl} supports these elements if it supports feature "ConstantFlow".
     */
    export namespace ConstantFlowComponent {
        export interface Attributes {
            /**
             * This attribute specifies the minimum flow the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantFlow.
             *
             * Valid range is 0 m^3/h to 6,553.4 m^3/h (steps of 0.1 m^3/h). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.10
             */
            readonly minConstFlow: number | null;

            /**
             * This attribute specifies the maximum flow the pump can achieve when it is working with the ControlMode
             * attribute set to ConstantFlow.
             *
             * Valid range is 0 m^3/h to 6,553.4 m^3/h (steps of 0.1 m^3/h). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.11
             */
            readonly maxConstFlow: number | null;
        }
    }

    /**
     * {@link PumpConfigurationAndControl} supports these elements if it supports feature "ConstantTemperature".
     */
    export namespace ConstantTemperatureComponent {
        export interface Attributes {
            /**
             * This attribute specifies the minimum temperature the pump can maintain in the system when it is working
             * with the ControlMode attribute set to ConstantTemperature.
             *
             * Valid range is –273.15 °C to 327.67 °C (steps of 0.01 °C). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.12
             */
            readonly minConstTemp: number | null;

            /**
             * This attribute specifies the maximum temperature the pump can maintain in the system when it is working
             * with the ControlMode attribute set to ConstantTemperature.
             *
             * MaxConstTemp shall be greater than or equal to MinConstTemp Valid range is –273.15 °C to 327.67 °C (steps
             * of 0.01 °C). Null if the value is invalid.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.2.7.13
             */
            readonly maxConstTemp: number | null;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<ConstantPressureComponent.Attributes>, Partial<AutomaticComponent.Attributes>, Partial<CompensatedPressureComponent.Attributes>, Partial<ConstantSpeedComponent.Attributes>, Partial<ConstantFlowComponent.Attributes>, Partial<ConstantTemperatureComponent.Attributes> {}
    export interface Events extends Base.Events {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        { flags: { constantPressure: true }, attributes: ConstantPressureComponent.Attributes },
        { flags: { automatic: true }, attributes: AutomaticComponent.Attributes },
        { flags: { compensatedPressure: true }, attributes: CompensatedPressureComponent.Attributes },
        { flags: { constantSpeed: true }, attributes: ConstantSpeedComponent.Attributes },
        { flags: { constantFlow: true }, attributes: ConstantFlowComponent.Attributes },
        { flags: { constantTemperature: true }, attributes: ConstantTemperatureComponent.Attributes }
    ];

    export type Features = "ConstantPressure" | "CompensatedPressure" | "ConstantFlow" | "ConstantSpeed" | "ConstantTemperature" | "Automatic" | "LocalOperation";

    /**
     * These are optional features supported by PumpConfigurationAndControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.2.4
     */
    export enum Feature {
        /**
         * ConstantPressure (PRSCONST)
         *
         * Supports operating in constant pressure mode
         */
        ConstantPressure = "ConstantPressure",

        /**
         * CompensatedPressure (PRSCOMP)
         *
         * Supports operating in compensated pressure mode
         */
        CompensatedPressure = "CompensatedPressure",

        /**
         * ConstantFlow (FLW)
         *
         * Supports operating in constant flow mode
         */
        ConstantFlow = "ConstantFlow",

        /**
         * ConstantSpeed (SPD)
         *
         * Supports operating in constant speed mode
         */
        ConstantSpeed = "ConstantSpeed",

        /**
         * ConstantTemperature (TEMP)
         *
         * Supports operating in constant temperature mode
         */
        ConstantTemperature = "ConstantTemperature",

        /**
         * Automatic (AUTO)
         *
         * Supports operating in automatic mode
         */
        Automatic = "Automatic",

        /**
         * LocalOperation (LOCAL)
         *
         * Supports operating using local settings
         */
        LocalOperation = "LocalOperation"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.2
     */
    export enum OperationMode {
        /**
         * The pump is controlled by a setpoint, as defined by a connected remote sensor or by the ControlMode
         * attribute.
         *
         * If the pump is running in this operation mode the setpoint is an internal variable which may be controlled
         * between 0% and 100%, e.g., by means of the Level Control cluster
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.2.1
         */
        Normal = 0,

        /**
         * This value sets the pump to run at the minimum possible speed it can without being stopped.
         */
        Minimum = 1,

        /**
         * This value sets the pump to run at its maximum possible speed.
         */
        Maximum = 2,

        /**
         * This value sets the pump to run with the local settings of the pump, regardless of what these are.
         */
        Local = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3
     */
    export enum ControlMode {
        /**
         * The pump is running at a constant speed.
         *
         * The setpoint is interpreted as a percentage of the range derived from the [MinConstSpeed – MaxConstSpeed]
         * attributes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3.1
         */
        ConstantSpeed = 0,

        /**
         * The pump will regulate its speed to maintain a constant differential pressure over its flanges.
         *
         * The setpoint is interpreted as a percentage of the range of the sensor used for this control mode. In case of
         * the internal pressure sensor, this will be the range derived from the [MinConstPressure – MaxConstPressure]
         * attributes. In case of a remote pressure sensor, this will be the range derived from the [MinMeasuredValue –
         * MaxMeasuredValue] attributes of the remote pressure sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3.2
         */
        ConstantPressure = 1,

        /**
         * The pump will regulate its speed to maintain a constant differential pressure over its flanges.
         *
         * The setpoint is interpreted as a percentage of the range derived of the [MinCompPressure – MaxCompPressure]
         * attributes. The internal setpoint will be lowered (compensated) dependent on the flow in the pump (lower flow
         * ⇒ lower internal setpoint).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3.3
         */
        ProportionalPressure = 2,

        /**
         * The pump will regulate its speed to maintain a constant flow through the pump.
         *
         * The setpoint is interpreted as a percentage of the range of the sensor used for this control mode. In case of
         * the internal flow sensor, this will be the range derived from the [MinConstFlow – MaxConstFlow] attributes.
         * In case of a remote flow sensor, this will be the range derived from the [MinMeasuredValue –
         * MaxMeasuredValue] attributes of the remote flow sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3.4
         */
        ConstantFlow = 3,

        /**
         * The pump will regulate its speed to maintain a constant temperature.
         *
         * The setpoint is interpreted as a percentage of the range of the sensor used for this control mode. In case of
         * the internal temperature sensor, this will be the range derived from the [MinConstTemp – MaxConstTemp]
         * attributes. In case of a remote temperature sensor, this will be the range derived from the [MinMeasuredValue
         * – MaxMeasuredValue] attributes of the remote temperature sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3.5
         */
        ConstantTemperature = 5,

        /**
         * The operation of the pump is automatically optimized to provide the most suitable performance with respect to
         * comfort and energy savings.
         *
         * This behavior is manufacturer defined. The pump can be stopped by setting the setpoint of the level control
         * cluster to 0, or by using the On/Off cluster. If the pump is started (at any setpoint), the speed of the pump
         * is entirely determined by the pump.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.3.6
         */
        Automatic = 7
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1
     */
    export interface PumpStatus {
        /**
         * A fault related to the system or pump device is detected.
         *
         * If this bit is set, it may correspond to an event in the range 2-16, see Events.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1.1
         */
        deviceFault?: boolean;

        /**
         * A fault related to the supply to the pump is detected.
         *
         * If this bit is set, it may correspond to an event in the range 0-1 or 13, see Events.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1.2
         */
        supplyFault?: boolean;

        /**
         * Setpoint is too low to achieve.
         */
        speedLow?: boolean;

        /**
         * Setpoint is too high to achieve.
         */
        speedHigh?: boolean;

        /**
         * Device control is overridden by hardware, such as an external STOP button or via a local HMI.
         *
         * While this bit is set, the EffectiveOperationMode is adjusted to Local. Any request changing OperationMode
         * shall generate a FAILURE error status until LocalOverride is cleared on the physical device. When
         * LocalOverride is cleared, the device shall return to the operation mode set in OperationMode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1.3
         */
        localOverride?: boolean;

        /**
         * Pump is currently running
         */
        running?: boolean;

        /**
         * A remote pressure sensor is used as the sensor for the regulation of the pump.
         *
         * If this bit is set, EffectiveControlMode is ConstantPressure and the setpoint for the pump is interpreted as
         * a percentage of the range of the remote sensor ([MinMeasuredValue – MaxMeasuredValue]).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1.4
         */
        remotePressure?: boolean;

        /**
         * A remote flow sensor is used as the sensor for the regulation of the pump.
         *
         * If this bit is set, EffectiveControlMode is ConstantFlow, and the setpoint for the pump is interpreted as a
         * percentage of the range of the remote sensor ([MinMeasuredValue – MaxMeasuredValue]).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1.5
         */
        remoteFlow?: boolean;

        /**
         * A remote temperature sensor is used as the sensor for the regulation of the pump.
         *
         * If this bit is set, EffectiveControlMode is ConstantTemperature, and the setpoint for the pump is interpreted
         * as a percentage of the range of the remote sensor ([MinMeasuredValue – MaxMeasuredValue])
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.2.6.1.6
         */
        remoteTemperature?: boolean;
    }

    export const id: ClusterId;
    export const name: "PumpConfigurationAndControl";
    export const revision: 4;
    export const schema: typeof PumpConfigurationAndControlModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export const events: EventObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof PumpConfigurationAndControl;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `PumpConfigurationAndControl` instead of
     * `PumpConfigurationAndControl.Complete`)
     */
    export const Complete: typeof PumpConfigurationAndControl;

    export const Typing: PumpConfigurationAndControl;
}

export declare const PumpConfigurationAndControlCluster: typeof PumpConfigurationAndControl;
export interface PumpConfigurationAndControl extends ClusterTyping { Attributes: PumpConfigurationAndControl.Attributes; Events: PumpConfigurationAndControl.Events; Features: PumpConfigurationAndControl.Features; Components: PumpConfigurationAndControl.Components }
