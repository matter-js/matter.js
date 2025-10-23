/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "PumpConfigurationAndControl", classification: "application", pics: "PCC",
        xref: "cluster§4.2",

        details: "The Pump Configuration and Control cluster provides an interface for the setup and control of pump " +
            "devices, and the automatic reporting of pump status information. Note that control of pump speed is " +
            "not included – speed is controlled by the On/Off and Level Control clusters." +
            "\n" +
            "### Pump controller Pump" +
            "\n" +
            "C Pump configuration and control S C Level control S" +
            "\n" +
            "### C On/Off S" +
            "\n" +
            "C = Client S = Server" +
            "\n" +
            "Note: Device names are examples for illustration purposes only",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§4.2.4",

                children: [
                    { tag: "field", name: "PRSCONST", details: "Supports operating in constant pressure mode" },
                    { tag: "field", name: "PRSCOMP", details: "Supports operating in compensated pressure mode" },
                    { tag: "field", name: "FLW", details: "Supports operating in constant flow mode" },
                    { tag: "field", name: "SPD", details: "Supports operating in constant speed mode" },
                    { tag: "field", name: "TEMP", details: "Supports operating in constant temperature mode" },
                    { tag: "field", name: "AUTO", details: "Supports operating in automatic mode" },
                    { tag: "field", name: "LOCAL", details: "Supports operating using local settings" }
                ]
            },

            {
                tag: "attribute", name: "MaxPressure", xref: "cluster§4.2.7.1",
                details: "This attribute specifies the maximum pressure the pump can achieve. It is a physical limit, and does " +
                    "not apply to any specific control mode or operation mode." +
                    "\n" +
                    "Valid range is -3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxSpeed", xref: "cluster§4.2.7.2",
                details: "This attribute specifies the maximum speed the pump can achieve. It is a physical limit, and does " +
                    "not apply to any specific control mode or operation mode." +
                    "\n" +
                    "Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxFlow", xref: "cluster§4.2.7.3",
                details: "This attribute specifies the maximum flow the pump can achieve. It is a physical limit, and does not " +
                    "apply to any specific control mode or operation mode." +
                    "\n" +
                    "Valid range is 0 m/h to 6,553.4 m/h (steps of 0.1 m/h). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MinConstPressure", xref: "cluster§4.2.7.4",
                details: "This attribute specifies the minimum pressure the pump can achieve when it is working with the " +
                    "ControlMode attribute set to ConstantPressure." +
                    "\n" +
                    "Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxConstPressure", xref: "cluster§4.2.7.5",
                details: "This attribute specifies the maximum pressure the pump can achieve when it is working with the " +
                    "ControlMode attribute set to ConstantPressure." +
                    "\n" +
                    "Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MinCompPressure", xref: "cluster§4.2.7.6",
                details: "This attribute specifies the minimum compensated pressure the pump can achieve when it is working " +
                    "with the ControlMode attribute set to ProportionalPressure." +
                    "\n" +
                    "Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxCompPressure", xref: "cluster§4.2.7.7",
                details: "This attribute specifies the maximum compensated pressure the pump can achieve when it is working " +
                    "with the ControlMode attribute set to ProportionalPressure." +
                    "\n" +
                    "Valid range is –3,276.7 kPa to 3,276.7 kPa (steps of 0.1 kPa). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MinConstSpeed", xref: "cluster§4.2.7.8",
                details: "This attribute specifies the minimum speed the pump can achieve when it is working with the Con " +
                    "trolMode attribute set to ConstantSpeed." +
                    "\n" +
                    "Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxConstSpeed", xref: "cluster§4.2.7.9",
                details: "This attribute specifies the maximum speed the pump can achieve when it is working with the " +
                    "ControlMode attribute set to ConstantSpeed." +
                    "\n" +
                    "Valid range is 0 to 65,534 RPM (steps of 1 RPM). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MinConstFlow", xref: "cluster§4.2.7.10",
                details: "This attribute specifies the minimum flow the pump can achieve when it is working with the " +
                    "ControlMode attribute set to ConstantFlow." +
                    "\n" +
                    "Valid range is 0 m/h to 6,553.4 m/h (steps of 0.1 m/h). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxConstFlow", xref: "cluster§4.2.7.11",
                details: "This attribute specifies the maximum flow the pump can achieve when it is working with the " +
                    "ControlMode attribute set to ConstantFlow." +
                    "\n" +
                    "Valid range is 0 m/h to 6,553.4 m/h (steps of 0.1 m/h). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MinConstTemp", xref: "cluster§4.2.7.12",
                details: "This attribute specifies the minimum temperature the pump can maintain in the system when it is " +
                    "working with the ControlMode attribute set to ConstantTemperature." +
                    "\n" +
                    "Valid range is –273.15 °C to 327.67 °C (steps of 0.01 °C). Null if the value is invalid."
            },

            {
                tag: "attribute", name: "MaxConstTemp", xref: "cluster§4.2.7.13",

                details: "This attribute specifies the maximum temperature the pump can maintain in the system when it is " +
                    "working with the ControlMode attribute set to ConstantTemperature." +
                    "\n" +
                    "MaxConstTemp shall be greater than or equal to MinConstTemp Valid range is –273.15 °C to 327.67 °C " +
                    "(steps of 0.01 °C)." +
                    "\n" +
                    "Null if the value is invalid."
            },

            {
                tag: "attribute", name: "PumpStatus", xref: "cluster§4.2.7.14",
                details: "This attribute specifies the activity status of the pump functions as listed in PumpStatusBitmap. " +
                    "Where a pump controller function is active, the corresponding bit shall be set to 1. Where a pump " +
                    "controller function is not active, the corresponding bit shall be set to 0."
            },

            {
                tag: "attribute", name: "EffectiveOperationMode", xref: "cluster§4.2.7.15",

                details: "This attribute specifies current effective operation mode of the pump as defined in " +
                    "OperationModeEnum." +
                    "\n" +
                    "The value of the EffectiveOperationMode attribute is the same as the OperationMode attribute, unless " +
                    "one of the following points are true:" +
                    "\n" +
                    "  • The pump is physically set to run with the local settings" +
                    "\n" +
                    "  • The LocalOverride bit in the PumpStatus attribute is set," +
                    "\n" +
                    "See OperationMode Attribute and ControlMode Attribute for a detailed description of the operation " +
                    "and control of the pump."
            },

            {
                tag: "attribute", name: "EffectiveControlMode", xref: "cluster§4.2.7.16",

                details: "This attribute specifies the current effective control mode of the pump as defined in " +
                    "ControlModeEnum." +
                    "\n" +
                    "This attribute contains the control mode that currently applies to the pump. It will have the value " +
                    "of the ControlMode attribute, unless one of the following points are true:" +
                    "\n" +
                    "  • The ControlMode attribute is set to Automatic. In this case, the value of the " +
                    "    EffectiveControlMode shall match the behavior of the pump." +
                    "\n" +
                    "  • A remote sensor is used as the sensor for regulation of the pump. In this case, " +
                    "    EffectiveControlMode will display ConstantPressure, ConstantFlow or ConstantTemperature if the " +
                    "    remote sensor is a pressure sensor, a flow sensor or a temperature sensor respectively, " +
                    "    regardless of the value of the ControlMode attribute." +
                    "\n" +
                    "In case the ControlMode attribute is not included on the device and no remote sensors are connected, " +
                    "the value of the EffectiveControlMode shall match the vendor-specific behavior of the pump." +
                    "\n" +
                    "See OperationMode Attribute and ControlMode Attribute for detailed a description of the operation " +
                    "and control of the pump."
            },

            {
                tag: "attribute", name: "Capacity", xref: "cluster§4.2.7.17",

                details: "This attribute specifies the actual capacity of the pump as a percentage of the effective maximum " +
                    "setpoint value. It is updated dynamically as the speed of the pump changes." +
                    "\n" +
                    "If the value is not available (the measurement or estimation of the speed is done in the pump), this " +
                    "attribute will indicate the null value." +
                    "\n" +
                    "Valid range is 0 % to 163.835% (0.005 % granularity). Although this attribute is a signed value, " +
                    "values of capacity less than zero have no physical meaning."
            },

            {
                tag: "attribute", name: "Speed", xref: "cluster§4.2.7.18",

                details: "This attribute specifies the actual speed of the pump measured in RPM. It is updated dynamically as " +
                    "the speed of the pump changes." +
                    "\n" +
                    "If the value is not available (the measurement or estimation of the speed is done in the pump), this " +
                    "attribute will indicate the null value." +
                    "\n" +
                    "Valid range is 0 to 65,534 RPM."
            },

            {
                tag: "attribute", name: "LifetimeRunningHours", xref: "cluster§4.2.7.19",

                details: "This attribute specifies the accumulated number of hours that the pump has been powered and the " +
                    "motor has been running. It is updated dynamically as it increases. It is preserved over power cycles " +
                    "of the pump. If LifeTimeRunningHours rises above maximum value it “rolls over” and starts at 0 " +
                    "(zero)." +
                    "\n" +
                    "This attribute is writeable, in order to allow setting to an appropriate value after maintenance. If " +
                    "the value is not available, this attribute will indicate the null value." +
                    "\n" +
                    "Valid range is 0 to 16,777,214 hrs."
            },

            {
                tag: "attribute", name: "Power", xref: "cluster§4.2.7.20",

                details: "This attribute specifies the actual power consumption of the pump in Watts. The value of this " +
                    "attribute is updated dynamically as the power consumption of the pump changes." +
                    "\n" +
                    "This attribute is read only. If the value is not available (the measurement of power consumption is " +
                    "not done in the pump), this attribute will indicate the null value." +
                    "\n" +
                    "Valid range is 0 to 16,777,214 Watts."
            },

            {
                tag: "attribute", name: "LifetimeEnergyConsumed", xref: "cluster§4.2.7.21",

                details: "This attribute specifies the accumulated energy consumption of the pump through the entire lifetime " +
                    "of the pump in kWh. The value of the LifetimeEnergyConsumed attribute is updated dynamically as the " +
                    "energy consumption of the pump increases. If LifetimeEnergyConsumed rises above maximum value it " +
                    "“rolls over” and starts at 0 (zero)." +
                    "\n" +
                    "This attribute is writeable, in order to allow setting to an appropriate value after maintenance. " +
                    "Valid range is 0 kWh to 4,294,967,294 kWh." +
                    "\n" +
                    "Null if the value is unknown."
            },

            {
                tag: "attribute", name: "OperationMode", xref: "cluster§4.2.7.22",

                details: "This attribute specifies the operation mode of the pump as defined in OperationModeEnum." +
                    "\n" +
                    "The actual operating mode of the pump is a result of the setting of the attributes OperationMode, " +
                    "ControlMode and the optional connection of a remote sensor. The operation and control is prioritized " +
                    "as shown in the scheme below:" +
                    "\n" +
                    "### Priority Scheme of Pump Operation and Control" +
                    "\n" +
                    "If this attribute is Maximum, Minimum or Local, the OperationMode attribute decides how the pump is " +
                    "operated." +
                    "\n" +
                    "If this attribute is Normal and a remote sensor is connected to the pump, the type of the remote " +
                    "sensor decides the control mode of the pump. A connected remote pressure sensor will make the pump " +
                    "run in control mode Constant pressure and vice versa for flow and temperature type sensors. This is " +
                    "regardless of the setting of the ControlMode attribute." +
                    "\n" +
                    "If this attribute is Normal and no remote sensor is connected, the control mode of the pump is " +
                    "decided by the ControlMode attribute." +
                    "\n" +
                    "OperationMode may be changed at any time, even when the pump is running. The behavior of the pump at " +
                    "the point of changing the value of this attribute is vendor-specific." +
                    "\n" +
                    "In the case a device does not support a specific operation mode, the write interaction to this " +
                    "attribute with an unsupported operation mode value shall be ignored and a response containing the " +
                    "status of CONSTRAINT_ERROR shall be returned."
            },

            {
                tag: "attribute", name: "ControlMode", xref: "cluster§4.2.7.23",

                details: "This attribute specifies the control mode of the pump as defined in ControlModeEnum." +
                    "\n" +
                    "See OperationMode Attribute for a detailed description of the operation and control of the pump." +
                    "\n" +
                    "ControlMode may be changed at any time, even when the pump is running. The behavior of the pump at " +
                    "the point of changing is vendor-specific." +
                    "\n" +
                    "In the case a device does not support a specific control mode, the write interaction to this " +
                    "attribute with an unsupported control mode value shall be ignored and a response containing the " +
                    "status of CONSTRAINT_ERROR shall be returned."
            },

            { tag: "attribute", name: "AlarmMask", xref: "cluster§4.2.7" },
            { tag: "event", name: "SupplyVoltageLow", xref: "cluster§4.2.8" },
            { tag: "event", name: "SupplyVoltageHigh", xref: "cluster§4.2.8" },
            { tag: "event", name: "PowerMissingPhase", xref: "cluster§4.2.8" },
            { tag: "event", name: "SystemPressureLow", xref: "cluster§4.2.8" },
            { tag: "event", name: "SystemPressureHigh", xref: "cluster§4.2.8" },
            { tag: "event", name: "DryRunning", xref: "cluster§4.2.8" },
            { tag: "event", name: "MotorTemperatureHigh", xref: "cluster§4.2.8" },
            { tag: "event", name: "PumpMotorFatalFailure", xref: "cluster§4.2.8" },
            { tag: "event", name: "ElectronicTemperatureHigh", xref: "cluster§4.2.8" },
            { tag: "event", name: "PumpBlocked", xref: "cluster§4.2.8" },
            { tag: "event", name: "SensorFailure", xref: "cluster§4.2.8" },
            { tag: "event", name: "ElectronicNonFatalFailure", xref: "cluster§4.2.8" },
            { tag: "event", name: "ElectronicFatalFailure", xref: "cluster§4.2.8" },
            { tag: "event", name: "GeneralFault", xref: "cluster§4.2.8" },
            { tag: "event", name: "Leakage", xref: "cluster§4.2.8" },
            { tag: "event", name: "AirDetection", xref: "cluster§4.2.8" },
            { tag: "event", name: "TurbineOperation", xref: "cluster§4.2.8" },

            {
                tag: "datatype", name: "PumpStatusBitmap", xref: "cluster§4.2.6.1",

                children: [
                    {
                        tag: "field", name: "DeviceFault",
                        description: "A fault related to the system or pump device is detected.", xref: "cluster§4.2.6.1.1",
                        details: "If this bit is set, it may correspond to an event in the range 2-16, see Events."
                    },
                    {
                        tag: "field", name: "SupplyFault",
                        description: "A fault related to the supply to the pump is detected.", xref: "cluster§4.2.6.1.2",
                        details: "If this bit is set, it may correspond to an event in the range 0-1 or 13, see Events."
                    },
                    { tag: "field", name: "SpeedLow", description: "Setpoint is too low to achieve." },
                    { tag: "field", name: "SpeedHigh", description: "Setpoint is too high to achieve." },

                    {
                        tag: "field", name: "LocalOverride",
                        description: "Device control is overridden by hardware, such as an external STOP button or via a local HMI.",
                        xref: "cluster§4.2.6.1.3",
                        details: "While this bit is set, the EffectiveOperationMode is adjusted to Local. Any request changing " +
                            "OperationMode shall generate a FAILURE error status until LocalOverride is cleared on the physical " +
                            "device. When LocalOverride is cleared, the device shall return to the operation mode set in " +
                            "OperationMode."
                    },

                    { tag: "field", name: "Running", description: "Pump is currently running" },

                    {
                        tag: "field", name: "RemotePressure",
                        description: "A remote pressure sensor is used as the sensor for the regulation of the pump.",
                        xref: "cluster§4.2.6.1.4",
                        details: "If this bit is set, EffectiveControlMode is ConstantPressure and the setpoint for the pump is " +
                            "interpreted as a percentage of the range of the remote sensor ([MinMeasuredValue – " +
                            "MaxMeasuredValue])."
                    },

                    {
                        tag: "field", name: "RemoteFlow",
                        description: "A remote flow sensor is used as the sensor for the regulation of the pump.",
                        xref: "cluster§4.2.6.1.5",
                        details: "If this bit is set, EffectiveControlMode is ConstantFlow, and the setpoint for the pump is " +
                            "interpreted as a percentage of the range of the remote sensor ([MinMeasuredValue – " +
                            "MaxMeasuredValue])."
                    },

                    {
                        tag: "field", name: "RemoteTemperature",
                        description: "A remote temperature sensor is used as the sensor for the regulation of the pump.",
                        xref: "cluster§4.2.6.1.6",
                        details: "If this bit is set, EffectiveControlMode is ConstantTemperature, and the setpoint for the pump is " +
                            "interpreted as a percentage of the range of the remote sensor ([MinMeasuredValue – " +
                            "MaxMeasuredValue])"
                    }
                ]
            },

            {
                tag: "datatype", name: "OperationModeEnum", xref: "cluster§4.2.6.2",

                children: [
                    {
                        tag: "field", name: "Normal",
                        description: "The pump is controlled by a setpoint, as defined by a connected remote sensor or by the ControlMode attribute.",
                        xref: "cluster§4.2.6.2.1",
                        details: "If the pump is running in this operation mode the setpoint is an internal variable which may be " +
                            "controlled between 0% and 100%, e.g., by means of the Level Control cluster"
                    },

                    {
                        tag: "field", name: "Minimum",
                        description: "This value sets the pump to run at the minimum possible speed it can without being stopped."
                    },
                    {
                        tag: "field", name: "Maximum",
                        description: "This value sets the pump to run at its maximum possible speed."
                    },
                    {
                        tag: "field", name: "Local",
                        description: "This value sets the pump to run with the local settings of the pump, regardless of what these are."
                    }
                ]
            },

            {
                tag: "datatype", name: "ControlModeEnum", xref: "cluster§4.2.6.3",

                children: [
                    {
                        tag: "field", name: "ConstantSpeed", description: "The pump is running at a constant speed.",
                        xref: "cluster§4.2.6.3.1",
                        details: "The setpoint is interpreted as a percentage of the range derived from the [MinConstSpeed – " +
                            "MaxConstSpeed] attributes."
                    },

                    {
                        tag: "field", name: "ConstantPressure",
                        description: "The pump will regulate its speed to maintain a constant differential pressure over its flanges.",
                        xref: "cluster§4.2.6.3.2",
                        details: "The setpoint is interpreted as a percentage of the range of the sensor used for this control mode. " +
                            "In case of the internal pressure sensor, this will be the range derived from the [MinConstPressure – " +
                            "MaxConstPressure] attributes. In case of a remote pressure sensor, this will be the range derived " +
                            "from the [MinMeasuredValue – MaxMeasuredValue] attributes of the remote pressure sensor."
                    },

                    {
                        tag: "field", name: "ProportionalPressure",
                        description: "The pump will regulate its speed to maintain a constant differential pressure over its flanges.",
                        xref: "cluster§4.2.6.3.3",
                        details: "The setpoint is interpreted as a percentage of the range derived of the [MinCompPressure – Max " +
                            "CompPressure] attributes. The internal setpoint will be lowered (compensated) dependent on the flow " +
                            "in the pump (lower flow ⇒ lower internal setpoint)."
                    },

                    {
                        tag: "field", name: "ConstantFlow",
                        description: "The pump will regulate its speed to maintain a constant flow through the pump.",
                        xref: "cluster§4.2.6.3.4",
                        details: "The setpoint is interpreted as a percentage of the range of the sensor used for this control mode. " +
                            "In case of the internal flow sensor, this will be the range derived from the [MinConstFlow – " +
                            "MaxConstFlow] attributes. In case of a remote flow sensor, this will be the range derived from the " +
                            "[MinMeasuredValue – MaxMeasuredValue] attributes of the remote flow sensor."
                    },

                    {
                        tag: "field", name: "ConstantTemperature",
                        description: "The pump will regulate its speed to maintain a constant temperature.",
                        xref: "cluster§4.2.6.3.5",
                        details: "The setpoint is interpreted as a percentage of the range of the sensor used for this control mode. " +
                            "In case of the internal temperature sensor, this will be the range derived from the [MinConstTemp – " +
                            "MaxConstTemp] attributes. In case of a remote temperature sensor, this will be the range derived " +
                            "from the [MinMeasuredValue – MaxMeasuredValue] attributes of the remote temperature sensor."
                    },

                    {
                        tag: "field", name: "Automatic",
                        description: "The operation of the pump is automatically optimized to provide the most suitable performance with respect to comfort and energy savings.",
                        xref: "cluster§4.2.6.3.6",
                        details: "This behavior is manufacturer defined. The pump can be stopped by setting the setpoint of the level " +
                            "control cluster to 0, or by using the On/Off cluster. If the pump is started (at any setpoint), the " +
                            "speed of the pump is entirely determined by the pump."
                    }
                ]
            }
        ]
    }
);
