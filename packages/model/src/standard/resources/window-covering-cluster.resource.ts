/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "WindowCovering", pics: "WNCV", xref: "cluster§5.3",
        details: "The window covering cluster provides an interface for controlling and adjusting automatic window " +
            "coverings such as drapery motors, automatic shades, curtains and blinds.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§5.3.4",

                children: [
                    {
                        tag: "field", name: "LF", xref: "cluster§5.3.4.1",
                        details: "The Lift feature applies to window coverings that lift up and down (e.g. for a roller shade, Up and " +
                            "Down is lift Open and Close) or slide left to right (e.g. for a sliding curtain, Left and Right is " +
                            "lift Open and Close)."
                    },

                    {
                        tag: "field", name: "TL", xref: "cluster§5.3.4.2",
                        details: "The Tilt feature applies to window coverings with vertical or horizontal strips."
                    },
                    { tag: "field", name: "PA_LF", details: "Position aware lift control is supported." },

                    {
                        tag: "field", name: "ABS", xref: "cluster§5.3.4.4",

                        details: "The percentage attributes shall indicate the position as a percentage between the " +
                            "InstalledOpenLimits and InstalledClosedLimits attributes of the window covering starting at the open " +
                            "(0.00%)." +
                            "\n" +
                            "As a general rule, absolute positioning (in centimeters or tenth of a degrees) SHOULD NOT be " +
                            "supported for new implementations."
                    },

                    { tag: "field", name: "PA_TL", details: "Position aware tilt control is supported." }
                ]
            },

            {
                tag: "attribute", name: "Type", xref: "cluster§5.3.6.1",

                details: "This attribute shall identify the type of window covering." +
                    "\n" +
                    "If the window covering supports the LF feature and not the TL feature, the following types shall be " +
                    "used as the constraint for this attribute:" +
                    "\n" +
                    "If the window covering supports the TL feature and not the LF feature, the following types shall be " +
                    "used as the constraint for this attribute:" +
                    "\n" +
                    "If the window covering supports both the LF and TL features, the following types are allowed to be " +
                    "used:"
            },

            {
                tag: "attribute", name: "PhysicalClosedLimitLift", xref: "cluster§5.3.6.2",
                details: "Indicates the maximum possible encoder position possible (Unit cm, centimeters) to position the " +
                    "height of the window covering lift."
            },
            {
                tag: "attribute", name: "PhysicalClosedLimitTilt", xref: "cluster§5.3.6.3",
                details: "Indicates the maximum possible encoder position possible (Unit 0.1°, tenths of a degree) to position " +
                    "the angle of the window covering tilt."
            },
            {
                tag: "attribute", name: "CurrentPositionLift", xref: "cluster§5.3.6.4",
                details: "Indicates the actual lift position (Unit cm, centimeters) of the window covering from the fully-open " +
                    "position."
            },
            {
                tag: "attribute", name: "CurrentPositionTilt", xref: "cluster§5.3.6.5",
                details: "Indicates the actual tilt position (Unit 0.1°, tenths of a degree) of the window covering from the " +
                    "fully-open position."
            },
            {
                tag: "attribute", name: "NumberOfActuationsLift", xref: "cluster§5.3.6.6",
                details: "Indicates the total number of lift/slide actuations applied to the window covering since the device " +
                    "was installed."
            },
            {
                tag: "attribute", name: "NumberOfActuationsTilt", xref: "cluster§5.3.6.7",
                details: "Indicates the total number of tilt actuations applied to the window covering since the device was " +
                    "installed."
            },

            {
                tag: "attribute", name: "ConfigStatus", xref: "cluster§5.3.6.8",
                details: "This attribute specifies the configuration and status information of the window covering." +
                    "\n" +
                    "To change settings, devices shall write to the Mode attribute. The behavior causing the setting or " +
                    "clearing of each bit is vendor specific."
            },

            {
                tag: "attribute", name: "CurrentPositionLiftPercentage", xref: "cluster§5.3.6.11",
                details: "Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute " +
                    "is equal to CurrentPositionLiftPercent100ths attribute divided by 100."
            },
            {
                tag: "attribute", name: "CurrentPositionTiltPercentage", xref: "cluster§5.3.6.12",
                details: "Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute " +
                    "is equal to CurrentPositionTiltPercent100ths attribute divided by 100."
            },
            {
                tag: "attribute", name: "OperationalStatus", xref: "cluster§5.3.6.15",
                details: "Indicates the currently ongoing operations and applies to all type of devices."
            },
            {
                tag: "attribute", name: "TargetPositionLiftPercent100ths", xref: "cluster§5.3.6.13",
                details: "Indicates the position where the window covering lift will go or is moving to as a percentage (Unit " +
                    "0.01%)."
            },
            {
                tag: "attribute", name: "TargetPositionTiltPercent100ths", xref: "cluster§5.3.6.14",
                details: "Indicates the position where the window covering tilt will go or is moving to as a percentage (Unit " +
                    "0.01%)."
            },

            {
                tag: "attribute", name: "EndProductType", xref: "cluster§5.3.6.16",

                details: "This attribute SHOULD provide more detail about the product type than can be determined from the " +
                    "main category indicated by the Type attribute." +
                    "\n" +
                    "If the window covering supports the LF feature and not the TL feature, the following types shall be " +
                    "used as the constraint for this attribute:" +
                    "\n" +
                    "If the window covering supports the TL feature and not the LF feature, the following types shall be " +
                    "used as the constraint for this attribute:" +
                    "\n" +
                    "If the window covering supports both the LF and TL features, the following types are allowed to be " +
                    "used:" +
                    "\n" +
                    "The table below helps to match the EndProductType attribute with the Type attribute."
            },

            {
                tag: "attribute", name: "CurrentPositionLiftPercent100ths", xref: "cluster§5.3.6.9",
                details: "Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals " +
                    "100.00%."
            },
            {
                tag: "attribute", name: "CurrentPositionTiltPercent100ths", xref: "cluster§5.3.6.10",
                details: "Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals " +
                    "100.00%."
            },
            {
                tag: "attribute", name: "InstalledOpenLimitLift", xref: "cluster§5.3.6.17",
                details: "Indicates the open limit for lifting the window covering whether position (in centimeters) is " +
                    "encoded or timed."
            },
            {
                tag: "attribute", name: "InstalledClosedLimitLift", xref: "cluster§5.3.6.18",
                details: "Indicates the closed limit for lifting the window covering whether position (in centimeters) is " +
                    "encoded or timed."
            },
            {
                tag: "attribute", name: "InstalledOpenLimitTilt", xref: "cluster§5.3.6.19",
                details: "Indicates the open limit for tilting the window covering whether position (in tenth of a degree) is " +
                    "encoded or timed."
            },
            {
                tag: "attribute", name: "InstalledClosedLimitTilt", xref: "cluster§5.3.6.20",
                details: "Indicates the closed limit for tilting the window covering whether position (in tenth of a degree) " +
                    "is encoded or timed."
            },
            { tag: "attribute", name: "VelocityLift", xref: "cluster§5.3.6" },
            { tag: "attribute", name: "AccelerationTimeLift", xref: "cluster§5.3.6" },
            { tag: "attribute", name: "DecelerationTimeLift", xref: "cluster§5.3.6" },

            {
                tag: "attribute", name: "Mode", xref: "cluster§5.3.6.21",

                details: "The Mode attribute allows configuration of the window covering, such as: reversing the motor " +
                    "direction, placing the window covering into calibration mode, placing the motor into maintenance " +
                    "mode, disabling the network, and disabling status LEDs." +
                    "\n" +
                    "In the case a device does not support or implement a specific mode, e.g. the device has a specific " +
                    "installation method and reversal is not relevant or the device does not include a maintenance mode, " +
                    "any write interaction to the Mode attribute, with an unsupported mode bit or any out of bounds bits " +
                    "set, must be ignored and a response containing the status of CONSTRAINT_ERROR will be returned."
            },

            { tag: "attribute", name: "IntermediateSetpointsLift", xref: "cluster§5.3.6" },
            { tag: "attribute", name: "IntermediateSetpointsTilt", xref: "cluster§5.3.6" },

            {
                tag: "attribute", name: "SafetyStatus", xref: "cluster§5.3.6.22",
                details: "The SafetyStatus attribute reflects the state of the safety sensors and the common issues preventing " +
                    "movements. By default for nominal operation all flags are cleared (0). A device might support none, " +
                    "one or several bit flags from this attribute (all optional)."
            },

            {
                tag: "command", name: "UpOrOpen", xref: "cluster§5.3.7.1",

                details: "Upon receipt of this command, the window covering will adjust its position so the physical " +
                    "lift/slide and tilt is at the maximum open/up position. This will happen as fast as possible. The " +
                    "server attributes shall be updated as follows:" +
                    "\n" +
                    "if the PositionAware feature is supported:" +
                    "\n" +
                    "  • TargetPositionLiftPercent100ths attribute shall be set to 0.00%." +
                    "\n" +
                    "  • TargetPositionTiltPercent100ths attribute shall be set to 0.00%." +
                    "\n" +
                    "The server positioning attributes will follow the movements, once the movement has successfully " +
                    "finished, the server attributes shall be updated as follows:" +
                    "\n" +
                    "if the PositionAware feature is supported:" +
                    "\n" +
                    "  • CurrentPositionLiftPercent100ths attribute shall be 0.00%." +
                    "\n" +
                    "  • CurrentPositionLiftPercentage attribute shall be 0%." +
                    "\n" +
                    "  • CurrentPositionTiltPercent100ths attribute shall be 0.00%." +
                    "\n" +
                    "  • CurrentPositionTiltPercentage attribute shall be 0%." +
                    "\n" +
                    "if the AbsolutePosition feature is supported:" +
                    "\n" +
                    "  • CurrentPositionLift attribute shall be equal to the InstalledOpenLimitLift attribute." +
                    "\n" +
                    "  • CurrentPositionTilt attribute shall be equal to the InstalledOpenLimitTilt attribute."
            },

            {
                tag: "command", name: "DownOrClose", xref: "cluster§5.3.7.2",

                details: "Upon receipt of this command, the window covering will adjust its position so the physical " +
                    "lift/slide and tilt is at the maximum closed/down position. This will happen as fast as possible. " +
                    "The server attributes supported shall be updated as follows:" +
                    "\n" +
                    "if the PositionAware feature is supported:" +
                    "\n" +
                    "  • TargetPositionLiftPercent100ths attribute shall be set to 100.00%." +
                    "\n" +
                    "  • TargetPositionTiltPercent100ths attribute shall be set to 100.00%." +
                    "\n" +
                    "The server positioning attributes will follow the movements, once the movement has successfully " +
                    "finished, the server attributes shall be updated as follows:" +
                    "\n" +
                    "if the PositionAware feature is supported:" +
                    "\n" +
                    "  • CurrentPositionLiftPercent100ths attribute shall be 100.00%." +
                    "\n" +
                    "  • CurrentPositionLiftPercentage attribute shall be 100%." +
                    "\n" +
                    "  • CurrentPositionTiltPercent100ths attribute shall be 100.00%." +
                    "\n" +
                    "  • CurrentPositionTiltPercentage attribute shall be 100%." +
                    "\n" +
                    "if the AbsolutePosition feature is supported:" +
                    "\n" +
                    "  • CurrentPositionLift attribute shall be equal to the InstalledClosedLimitLift attribute." +
                    "\n" +
                    "  • CurrentPositionTilt attribute shall be equal to the InstalledClosedLimitTilt attribute."
            },

            {
                tag: "command", name: "StopMotion", xref: "cluster§5.3.7.3",

                details: "Upon receipt of this command, the window covering will stop any adjusting to the physical tilt and " +
                    "lift/slide that is currently occurring. The server attributes supported shall be updated as follows:" +
                    "\n" +
                    "  • TargetPositionLiftPercent100ths attribute will be set to CurrentPositionLiftPercent100ths " +
                    "    attribute value." +
                    "\n" +
                    "  • TargetPositionTiltPercent100ths attribute will be set to CurrentPositionTiltPercent100ths " +
                    "    attribute value."
            },

            {
                tag: "command", name: "GoToLiftValue", xref: "cluster§5.3.7.4",
                details: "This command is used to set the target lift position of the window covering to the value specified " +
                    "in the command.",
                children: [{
                    tag: "field", name: "LiftValue", xref: "cluster§5.3.7.4.1",
                    details: "This field shall specify the requested physical lift/slide position in unit cm (centimeters)."
                }]
            },

            {
                tag: "command", name: "GoToLiftPercentage", xref: "cluster§5.3.7.5",

                details: "This command is used to set the target lift position of the window covering to the percentage value " +
                    "specified in the command." +
                    "\n" +
                    "Upon receipt of this command, the server will adjust the window covering to the lift/slide " +
                    "percentage specified in the payload of this command." +
                    "\n" +
                    "If the command includes LiftPercent100thsValue, then TargetPositionLiftPercent100ths attribute shall " +
                    "be set to LiftPercent100thsValue. Otherwise the TargetPositionLiftPercent100ths attribute shall be " +
                    "set to LiftPercentageValue * 100." +
                    "\n" +
                    "If a client includes LiftPercent100thsValue in the command, the LiftPercentageValue shall be set to " +
                    "LiftPercent100thsValue / 100, so a legacy server which only supports LiftPercentageValue (not " +
                    "LiftPercent100thsValue) has a value to set the target position." +
                    "\n" +
                    "If the server does not support the PositionAware feature, then a zero percentage shall be treated as " +
                    "a UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the " +
                    "device is only a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND " +
                    "status SHOULD be returned."
            },

            {
                tag: "command", name: "GoToTiltValue", xref: "cluster§5.3.7.6",
                details: "This command is used to set the target tilt position of the window covering to the value specified " +
                    "in the command.",
                children: [{
                    tag: "field", name: "TiltValue", xref: "cluster§5.3.7.6.1",
                    details: "This field shall specify the requested physical tilt position in unit 0.1° (tenth of a degrees)."
                }]
            },

            {
                tag: "command", name: "GoToTiltPercentage", xref: "cluster§5.3.7.7",

                details: "This command is used to set the target tilt position of the window covering to the percentage value " +
                    "specified in the command." +
                    "\n" +
                    "Upon receipt of this command, the server will adjust the window covering to the tilt percentage " +
                    "specified in the payload of this command." +
                    "\n" +
                    "If the command includes TiltPercent100thsValue, then TargetPositionTiltPercent100ths attribute shall " +
                    "be set to TiltPercent100thsValue. Otherwise the TargetPositionTiltPercent100ths attribute shall be " +
                    "set to TiltPercentageValue * 100." +
                    "\n" +
                    "If a client includes TiltPercent100thsValue in the command, the TiltPercentageValue shall be set to " +
                    "TiltPercent100thsValue / 100, so a legacy server which only supports TiltPercentageValue (not " +
                    "TiltPercent100thsValue) has a value to set the target position." +
                    "\n" +
                    "If the server does not support the PositionAware feature, then a zero percentage shall be treated as " +
                    "a UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the " +
                    "device is only a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND " +
                    "status SHOULD be returned."
            },

            {
                tag: "datatype", name: "ConfigStatusBitmap", xref: "cluster§5.3.5.1",

                children: [
                    {
                        tag: "field", name: "Operational", description: "Device is operational.", xref: "cluster§5.3.5.1.1",
                        details: "This bit shall indicate whether the window covering is operational for regular use:" +
                            "\n" +
                            "  • 0 = Not Operational" +
                            "\n" +
                            "  • 1 = Operational"
                    },

                    {
                        tag: "field", name: "LiftMovementReversed", description: "The lift movement is reversed.",
                        xref: "cluster§5.3.5.1.2",
                        details: "This bit shall indicate whether the lift movement is reversed:" +
                            "\n" +
                            "  • 0 = Lift movement is normal" +
                            "\n" +
                            "  • 1 = Lift movement is reversed"
                    },

                    {
                        tag: "field", name: "LiftPositionAware",
                        description: "Supports the PositionAwareLift feature (PA_LF).", xref: "cluster§5.3.5.1.3",
                        details: "This bit shall indicate whether the window covering supports the PositionAwareLift feature:" +
                            "\n" +
                            "  • 0 = Lift control is not position aware" +
                            "\n" +
                            "  • 1 = Lift control is position aware (PA_LF)"
                    },

                    {
                        tag: "field", name: "TiltPositionAware",
                        description: "Supports the PositionAwareTilt feature (PA_TL).", xref: "cluster§5.3.5.1.4",
                        details: "This bit shall indicate whether the window covering supports the PositionAwareTilt feature:" +
                            "\n" +
                            "  • 0 = Tilt control is not position aware" +
                            "\n" +
                            "  • 1 = Tilt control is position aware (PA_TL)"
                    },

                    {
                        tag: "field", name: "LiftEncoderControlled", description: "Uses an encoder for lift.",
                        xref: "cluster§5.3.5.1.5",

                        details: "This bit shall indicate whether a position aware controlled window covering is employing an encoder " +
                            "for positioning the height of the window covering:" +
                            "\n" +
                            "  • 0 = Timer Controlled" +
                            "\n" +
                            "  • 1 = Encoder Controlled"
                    },

                    {
                        tag: "field", name: "TiltEncoderControlled", description: "Uses an encoder for tilt.",
                        xref: "cluster§5.3.5.1.6",

                        details: "This bit shall indicate whether a position aware controlled window covering is employing an encoder " +
                            "for tilting the window covering:" +
                            "\n" +
                            "  • 0 = Timer Controlled" +
                            "\n" +
                            "  • 1 = Encoder Controlled"
                    }
                ]
            },

            {
                tag: "datatype", name: "ModeBitmap", xref: "cluster§5.3.5.2",

                children: [
                    {
                        tag: "field", name: "MotorDirectionReversed", description: "Reverse the lift direction.",
                        xref: "cluster§5.3.5.2.1",
                        details: "This bit shall control the motor direction:" +
                            "\n" +
                            "  • 0 = Lift movement is normal" +
                            "\n" +
                            "  • 1 = Lift movement is reversed"
                    },

                    {
                        tag: "field", name: "CalibrationMode", description: "Perform a calibration.",
                        xref: "cluster§5.3.5.2.2",
                        details: "This bit shall set the window covering into calibration mode:" +
                            "\n" +
                            "  • 0 = Normal mode" +
                            "\n" +
                            "  • 1 = Calibration mode"
                    },

                    {
                        tag: "field", name: "MaintenanceMode", description: "Freeze all motions for maintenance.",
                        xref: "cluster§5.3.5.2.3",
                        details: "This bit shall set the window covering into maintenance mode:" +
                            "\n" +
                            "  • 0 = Normal mode" +
                            "\n" +
                            "  • 1 = Maintenance mode"
                    },

                    {
                        tag: "field", name: "LedFeedback", description: "Control the LEDs feedback.",
                        xref: "cluster§5.3.5.2.4",
                        details: "This bit shall control feedback LEDs:" +
                            "\n" +
                            "  • 0 = LEDs are off" +
                            "\n" +
                            "  • 1 = LEDs will display feedback"
                    }
                ]
            },

            {
                tag: "datatype", name: "OperationalStatusBitmap", xref: "cluster§5.3.5.3",

                details: "The OperationalStatusBitmap is using several internal operational state fields (composed of 2 bits) " +
                    "following this definition:" +
                    "\n" +
                    "  • 00b = Currently not moving" +
                    "\n" +
                    "  • 01b = Currently opening (e.g. moving from closed to open)." +
                    "\n" +
                    "  • 10b = Currently closing (e.g. moving from open to closed)." +
                    "\n" +
                    "  • 11b = Reserved",

                children: [
                    {
                        tag: "field", name: "Global", description: "Global operational state.", xref: "cluster§5.3.5.3.1",
                        details: "These bits shall indicate in which direction the covering is currently moving or if it has stopped. " +
                            "Global operational state shall always reflect the overall motion of the device."
                    },
                    {
                        tag: "field", name: "Lift", description: "Lift operational state.", xref: "cluster§5.3.5.3.2",
                        details: "These bits shall indicate in which direction the covering’s lift is currently moving or if it has " +
                            "stopped."
                    },
                    {
                        tag: "field", name: "Tilt", description: "Tilt operational state.", xref: "cluster§5.3.5.3.3",
                        details: "These bits shall indicate in which direction the covering’s tilt is currently moving or if it has " +
                            "stopped."
                    }
                ]
            },

            {
                tag: "datatype", name: "SafetyStatusBitmap", xref: "cluster§5.3.5.4",

                children: [
                    {
                        tag: "field", name: "RemoteLockout",
                        description: "Movement commands are ignored (locked out). e.g. not granted authorization, outside some time/date range."
                    },
                    {
                        tag: "field", name: "TamperDetection",
                        description: "Tampering detected on sensors or any other safety equipment. Ex: a device has been forcedly moved without its actuator(s)."
                    },
                    {
                        tag: "field", name: "FailedCommunication",
                        description: "Communication failure to sensors or other safety equipment."
                    },
                    {
                        tag: "field", name: "PositionFailure",
                        description: "Device has failed to reach the desired position. e.g. with position aware device, time expired before TargetPosition is reached."
                    },
                    {
                        tag: "field", name: "ThermalProtection",
                        description: "Motor(s) and/or electric circuit thermal protection activated."
                    },
                    { tag: "field", name: "ObstacleDetected", description: "An obstacle is preventing actuator movement." },
                    {
                        tag: "field", name: "Power",
                        description: "Device has power related issue or limitation e.g. device is running w/ the help of a backup battery or power might not be fully available at the moment."
                    },
                    {
                        tag: "field", name: "StopInput",
                        description: "Local safety sensor (not a direct obstacle) is preventing movements (e.g. Safety EU Standard EN60335)."
                    },
                    {
                        tag: "field", name: "MotorJammed",
                        description: "Mechanical problem related to the motor(s) detected."
                    },
                    { tag: "field", name: "HardwareFailure", description: "PCB, fuse and other electrics problems." },
                    {
                        tag: "field", name: "ManualOperation",
                        description: "Actuator is manually operated and is preventing actuator movement (e.g. actuator is disengaged/decoupled)."
                    },
                    { tag: "field", name: "Protection", description: "Protection is activated." }
                ]
            },

            {
                tag: "datatype", name: "TypeEnum", xref: "cluster§5.3.5.5",

                children: [
                    { tag: "field", name: "Rollershade", description: "RollerShade" },
                    { tag: "field", name: "Rollershade2Motor", description: "RollerShade - 2 Motor" },
                    { tag: "field", name: "RollershadeExterior", description: "RollerShade - Exterior" },
                    { tag: "field", name: "RollershadeExterior2Motor", description: "RollerShade - Exterior - 2 Motor" },
                    { tag: "field", name: "Drapery", description: "Drapery (curtain)" },
                    { tag: "field", name: "Awning", description: "Awning" },
                    { tag: "field", name: "Shutter", description: "Shutter" },
                    { tag: "field", name: "TiltBlindTiltOnly", description: "Tilt Blind - Tilt Only" },
                    { tag: "field", name: "TiltBlindLift", description: "Tilt Blind - Lift & Tilt" },
                    { tag: "field", name: "ProjectorScreen", description: "Projector Screen" },
                    { tag: "field", name: "Unknown", description: "Unknown" }
                ]
            },

            {
                tag: "datatype", name: "EndProductTypeEnum", xref: "cluster§5.3.5.6",

                children: [
                    { tag: "field", name: "RollerShade", description: "Simple Roller Shade" },
                    { tag: "field", name: "RomanShade", description: "Roman Shade" },
                    { tag: "field", name: "BalloonShade", description: "Balloon Shade" },
                    { tag: "field", name: "WovenWood", description: "Woven Wood" },
                    { tag: "field", name: "PleatedShade", description: "Pleated Shade" },
                    { tag: "field", name: "CellularShade", description: "Cellular Shade" },
                    { tag: "field", name: "LayeredShade", description: "Layered Shade" },
                    { tag: "field", name: "LayeredShade2D", description: "Layered Shade 2D" },
                    { tag: "field", name: "SheerShade", description: "Sheer Shade" },
                    { tag: "field", name: "TiltOnlyInteriorBlind", description: "Tilt Only Interior Blind" },
                    { tag: "field", name: "InteriorBlind", description: "Interior Blind" },
                    { tag: "field", name: "VerticalBlindStripCurtain", description: "Vertical Blind, Strip Curtain" },
                    { tag: "field", name: "InteriorVenetianBlind", description: "Interior Venetian Blind" },
                    { tag: "field", name: "ExteriorVenetianBlind", description: "Exterior Venetian Blind" },
                    { tag: "field", name: "LateralLeftCurtain", description: "Lateral Left Curtain" },
                    { tag: "field", name: "LateralRightCurtain", description: "Lateral Right Curtain" },
                    { tag: "field", name: "CentralCurtain", description: "Central Curtain" },
                    { tag: "field", name: "RollerShutter", description: "Roller Shutter" },
                    { tag: "field", name: "ExteriorVerticalScreen", description: "Exterior Vertical Screen" },
                    { tag: "field", name: "AwningTerracePatio", description: "Awning Terrace (Patio)" },
                    { tag: "field", name: "AwningVerticalScreen", description: "Awning Vertical Screen" },
                    { tag: "field", name: "TiltOnlyPergola", description: "Tilt Only Pergola" },
                    { tag: "field", name: "SwingingShutter", description: "Swinging Shutter" },
                    { tag: "field", name: "SlidingShutter", description: "Sliding Shutter" },
                    { tag: "field", name: "Unknown", description: "Unknown" }
                ]
            },

            {
                tag: "datatype", name: "MovementStatus",
                details: "Values for OperationalStatus attribute fields.",
                children: [
                    { tag: "field", name: "Stopped", details: "Covering is not moving" },
                    { tag: "field", name: "Opening", details: "Covering is moving from closed to open" },
                    { tag: "field", name: "Closing", details: "Covering is moving from open to closed" }
                ]
            }
        ]
    }
);
