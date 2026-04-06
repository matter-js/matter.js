/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "ClosureControl", pics: "CLCTRL", xref: "cluster§5.4",
        details: "This cluster provides an interface for controlling a Closure.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§5.4.5",

                children: [
                    {
                        tag: "field", name: "PS", xref: "cluster§5.4.5.1",
                        details: "This feature shall indicate that the closure can be set to discrete positions, including at minimum " +
                            "the FullyOpen and FullyClosed positions."
                    },
                    {
                        tag: "field", name: "LT", xref: "cluster§5.4.5.2",
                        details: "This feature shall indicate that the closure can be latched and unlatched. When latched, the feature " +
                            "secures an axis, preventing associated actuators from moving components along that axis."
                    },

                    {
                        tag: "field", name: "IS", xref: "cluster§5.4.5.3",
                        details: "This feature shall indicate that the closure is capable of changing its position or state " +
                            "instantaneously. As a result, the Speed feature is not applicable, and the Stop command is not " +
                            "usable. In such closures, the OverallCurrentState attribute shall immediately follow the " +
                            "OverallTargetState attribute. The state transition diagram remains applicable, however, transitions " +
                            "involving the Stop state shall be omitted."
                    },

                    {
                        tag: "field", name: "SP", xref: "cluster§5.4.5.4",
                        details: "This feature shall indicate that the closure supports configurable speed during motion toward a " +
                            "target position. The feature uses the values in ThreeLevelAutoEnum to set the supported speed " +
                            "levels."
                    },

                    {
                        tag: "field", name: "VT", xref: "cluster§5.4.5.5",
                        details: "This feature shall indicate that the closure can be set to a designated Ventilation position (e.g., " +
                            "partially open)."
                    },
                    {
                        tag: "field", name: "PD", xref: "cluster§5.4.5.6",
                        details: "This feature shall indicate that the closure can be set to a dedicated Pedestrian position. The " +
                            "Pedestrian position provides a clear walkway through the closure."
                    },
                    {
                        tag: "field", name: "CL", xref: "cluster§5.4.5.7",
                        details: "This feature shall indicate the capability to trigger a calibration procedure. The calibration can " +
                            "either be fully automated, or require manual steps not described in this specification."
                    },

                    {
                        tag: "field", name: "PT", xref: "cluster§5.4.5.8",
                        details: "This feature shall indicate that the closure is capable of activating a form of protection, such as " +
                            "protection against wind. A protection is manufacturer-specific, and it could be a simple software " +
                            "limitation, or a mechanical system deployed by the closure."
                    },

                    {
                        tag: "field", name: "MO", xref: "cluster§5.4.5.9",
                        details: "This feature shall indicate that the closure can be operated manually by a user, such as to open a " +
                            "window."
                    }
                ]
            },

            {
                tag: "attribute", name: "CountdownTime", xref: "cluster§5.4.7.1",

                details: "Indicates the estimated time left before the operation is completed, in seconds." +
                    "\n" +
                    "A value of 0 (zero) means that the operation has completed." +
                    "\n" +
                    "A value of null indicates that there is no time currently defined until operation completion. This " +
                    "may happen because the completion time is unknown." +
                    "\n" +
                    "Changes to this attribute shall only be marked as reportable in the following cases:" +
                    "\n" +
                    "  - If the tracked operation has changed due to a change in the MainState attribute, or" +
                    "\n" +
                    "  - When it changes from 0 to any other value and vice versa, or" +
                    "\n" +
                    "  - When it changes from null to any other value and vice versa, or" +
                    "\n" +
                    "  - When it increases, or" +
                    "\n" +
                    "  - When there is any increase or decrease in the estimated time remaining that was due to " +
                    "progressing insight of the server's control logic." +
                    "\n" +
                    "Changes to this attribute merely due to the normal passage of time with no other dynamic change of " +
                    "closure state shall NOT be reported." +
                    "\n" +
                    "As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the " +
                    "reporting of this attribute in order to keep track of the remaining duration."
            },

            {
                tag: "attribute", name: "MainState", xref: "cluster§5.4.7.2",

                details: "Indicates the current operational state of the closure associated with the server." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> NOTE: The MainState diagram is provided exclusively for informational purposes only and is an " +
                    "exemplary design of the internals of a closure implementation to help illustrate the aspects of " +
                    "function that are considered by the cluster's normative text."
            },

            {
                tag: "attribute", name: "CurrentErrorList", xref: "cluster§5.4.7.3",
                details: "Indicates the currently active errors." +
                    "\n" +
                    "An empty list shall indicate that there are no active errors." +
                    "\n" +
                    "There shall NOT be duplicate values of ClosureErrorEnum within the CurrentErrorList."
            },

            {
                tag: "attribute", name: "OverallCurrentState", xref: "cluster§5.4.7.4",

                details: "Indicates the current Position, Latch and/or Speed states, whichever are applicable according to the " +
                    "feature flags set." +
                    "\n" +
                    "Null, if the state is unknown. Examples could be, but are not limited to:" +
                    "\n" +
                    "  - The state of Position/Latch is not known yet because the closure is not calibrated." +
                    "\n" +
                    "  - The product has lost its Position/Latch state after manual motion during a shutdown." +
                    "\n" +
                    "The values of the different fields within the structure of this attribute depend on:" +
                    "\n" +
                    "  - The effects of MoveTo commands." +
                    "\n" +
                    "  - The effects of SetTarget and Step commands in a Closure Dimension Cluster associated with this " +
                    "cluster, as described in Section 5.4.4, \"Association Between Closure Control and Closure " +
                    "Dimension Clusters\"." +
                    "\n" +
                    "  - The Stop command."
            },

            {
                tag: "attribute", name: "OverallTargetState", xref: "cluster§5.4.7.5",
                details: "Indicates the TargetPosition, TargetLatch and/or TargetSpeed values, whichever are applicable " +
                    "according to the feature flags set." +
                    "\n" +
                    "Null, if the state is unknown. For example after a reboot."
            },

            {
                tag: "attribute", name: "LatchControlModes", xref: "cluster§5.4.7.6",
                details: "This attribute shall specify whether the latch mechanism can be latched or unlatched remotely."
            },

            {
                tag: "event", name: "OperationalError", xref: "cluster§5.4.9.1",
                details: "This event shall be generated when a reportable error condition is detected. A closure that " +
                    "generates this event shall also set the MainState attribute to Error, indicating an error condition." +
                    "\n" +
                    "This event shall contain the following fields:"
            },

            {
                tag: "event", name: "MovementCompleted", xref: "cluster§5.4.9.2",
                details: "This event, if supported, shall be generated when the overall operation ends, either successfully or " +
                    "otherwise. For example, the event is sent upon the completion of a movement operation in a blind."
            },

            {
                tag: "event", name: "EngageStateChanged", xref: "cluster§5.4.9.3",

                details: "This event, if supported, shall be generated when the MainStateEnum attribute changes state to and " +
                    "from disengaged, indicating if the actuator is Engaged or Disengaged." +
                    "\n" +
                    "This event shall contain the following fields:" +
                    "\n" +
                    "  - True, when the actuator is in a Engaged state, actuator movements possible." +
                    "\n" +
                    "  - False, when the actuator is in a Disengaged state, preventing any actuator movements."
            },

            {
                tag: "event", name: "SecureStateChanged", xref: "cluster§5.4.9.4",

                details: "This event, if supported, shall be generated when the SecureState field in the OverallCurrentState " +
                    "attribute changes. It is used to indicate whether a closure is securing a space against possible " +
                    "unauthorized entry." +
                    "\n" +
                    "This event shall contain the following fields:" +
                    "\n" +
                    "  - True, when the closure is in a secure state, e.g. unauthorized/undetectable access is not " +
                    "possible." +
                    "\n" +
                    "  - False, when the closure is in an insecure state, e.g. unauthorized/undetectable access is " +
                    "possible."
            },

            {
                tag: "command", name: "Stop", xref: "cluster§5.4.8.1",

                details: "On receipt of this command, the closure shall stop its movement as fast as the closure is able too." +
                    "\n" +
                    "If the server's MainState attribute has one of the following values:" +
                    "\n" +
                    "  - Moving" +
                    "\n" +
                    "  - WaitingForMotion" +
                    "\n" +
                    "  - Calibrating" +
                    "\n" +
                    "then any motions shall be stopped and the MainState attribute shall be set to Stopped." +
                    "\n" +
                    "A status code of SUCCESS shall always be returned, regardless of the value of the MainState " +
                    "attribute when this command is received."
            },

            {
                tag: "command", name: "MoveTo", xref: "cluster§5.4.8.2",

                details: "On receipt of this command, the closure shall operate to update its position, latch state and/or " +
                    "motion speed." +
                    "\n" +
                    "The rationale behind defining the conformance as being purely optional in the table above is to " +
                    "ensure that commands containing one or more fields related to unsupported features are still " +
                    "accepted, rather than being rejected outright. For example, if a simple client, which is not able to " +
                    "determine the capabilities of the server, invokes a command that includes both position and speed, a " +
                    "server that does not support the speed feature would simply ignore the speed field while still " +
                    "adjusting its position as requested.",

                children: [
                    {
                        tag: "field", name: "Position", xref: "cluster§5.4.8.2.1",

                        details: "This field shall indicate the position where the closure is moving to, as defined in the " +
                            "TargetPositionEnum." +
                            "\n" +
                            "If the field is present but its value is not within constraints, then:" +
                            "\n" +
                            "  - If the Positioning (PS) feature is not supported, the value of this field shall be ignored." +
                            "\n" +
                            "  - If the Positioning (PS) feature is supported, a status code of CONSTRAINT_ERROR shall be " +
                            "returned." +
                            "\n" +
                            "If the Positioning (PS) feature is supported and the Position field is not present, the closure " +
                            "shall use the value of the Position field in the OverallTargetState attribute as the fallback. If " +
                            "the Position field in the OverallTargetState attribute is NULL, the position is unknown and the " +
                            "fallback is not applicable; in this case the field shall be ignored and the closure shall NOT change " +
                            "its position."
                    },

                    {
                        tag: "field", name: "Latch", xref: "cluster§5.4.8.2.2",

                        details: "This field shall indicate the desired latching state of the closure, as defined in the " +
                            "OverallCurrentStateStruct Latch Field." +
                            "\n" +
                            "If the field is present but its value is not within constraints, then:" +
                            "\n" +
                            "  - If the MotionLatching (LT) feature is not supported, the value of this field shall be ignored." +
                            "\n" +
                            "  - If the MotionLatching (LT) feature is supported, a status code of CONSTRAINT_ERROR shall be " +
                            "returned." +
                            "\n" +
                            "If the MotionLatching (LT) feature is supported and the Latch field is not present, the closure " +
                            "shall use the value of the Latch field in the OverallTargetState attribute as the fallback. If the " +
                            "Latch field in the OverallTargetState attribute is NULL, the latch state is unknown and the fallback " +
                            "is not applicable, in this case, the field shall be ignored and the closure shall NOT change its " +
                            "latch state." +
                            "\n" +
                            "If the closure supports the MotionLatching (LT) feature, it shall either fulfill the latch request " +
                            "and update OverallTargetState.Latch or, if the \"LatchControlModes\" attribute specifies that manual " +
                            "intervention is required to latch - respond with INVALID_IN_STATE and remain in its current state."
                    },

                    {
                        tag: "field", name: "Speed", xref: "cluster§5.4.8.2.3",

                        details: "This field shall indicate a desired overall speed of motion, as defined in the ThreeLevelAutoEnum." +
                            "\n" +
                            "If the field is present but its value is not within constraints, then:" +
                            "\n" +
                            "  - If the Speed(SP) feature is not supported, the value of this field shall be ignored." +
                            "\n" +
                            "  - If the Speed(SP) feature is supported, a status code of CONSTRAINT_ERROR shall be returned." +
                            "\n" +
                            "If the closure supports the Speed(SP) feature, it shall set the Speed field of the " +
                            "OverallCurrentState attribute to the new speed."
                    }
                ]
            },

            {
                tag: "command", name: "Calibrate", xref: "cluster§5.4.8.3",
                details: "This command is used to trigger a calibration of the closure."
            },

            {
                tag: "datatype", name: "CurrentPositionEnum", xref: "cluster§5.4.6.1",

                children: [
                    { tag: "field", name: "FullyClosed", description: "Fully closed state" },
                    { tag: "field", name: "FullyOpened", description: "Fully opened state" },
                    {
                        tag: "field", name: "PartiallyOpened",
                        description: "Partially opened state (closure is not fully opened or fully closed)"
                    },
                    { tag: "field", name: "OpenedForPedestrian", description: "Closure is in the Pedestrian position" },
                    { tag: "field", name: "OpenedForVentilation", description: "Closure is in the Ventilation position" },

                    {
                        tag: "field", name: "OpenedAtSignature", description: "Closure is in its \"Signature position\"",
                        xref: "cluster§5.4.6.1.1",

                        details: "The Signature allows a pre-recorded manufacturer- or installer-defined position to be reached." +
                            "\n" +
                            "This Signature position depends on the closure type. Some examples include:" +
                            "\n" +
                            "  - Gate, Garage Door -> Pedestrian and pets, or one leaf only." +
                            "\n" +
                            "  - Venetian Blind -> Lowered down with flat slats." +
                            "\n" +
                            "  - Door -> Position to open for a person or someone in a wheelchair." +
                            "\n" +
                            "  - Window -> Position to 10% for tilt position." +
                            "\n" +
                            "  - Roller Shutter -> Closed with maximum gap between the slats." +
                            "\n" +
                            "  - By default the Signature position may apply the same outcome as PartiallyOpened." +
                            "\n" +
                            "If no such separately defined position exists on the closure, the Signature value shall have the " +
                            "same position meaning as FullyOpened."
                    }
                ]
            },

            {
                tag: "datatype", name: "TargetPositionEnum", xref: "cluster§5.4.6.2",

                children: [
                    { tag: "field", name: "MoveToFullyClosed", description: "Move to a fully closed state" },
                    { tag: "field", name: "MoveToFullyOpen", description: "Move to a fully open state" },
                    { tag: "field", name: "MoveToPedestrianPosition", description: "Move to the Pedestrian position" },
                    { tag: "field", name: "MoveToVentilationPosition", description: "Move to the Ventilation position" },
                    { tag: "field", name: "MoveToSignaturePosition", description: "Move to the Signature position" }
                ]
            },

            {
                tag: "datatype", name: "MainStateEnum", xref: "cluster§5.4.6.3",

                children: [
                    { tag: "field", name: "Stopped", description: "Closure is stopped" },
                    { tag: "field", name: "Moving", description: "Closure is actively moving" },
                    {
                        tag: "field", name: "WaitingForMotion",
                        description: "Closure is waiting before a motion (e.g. pre-heat, pre-check)"
                    },
                    { tag: "field", name: "Error", description: "Closure is in an error state" },
                    {
                        tag: "field", name: "Calibrating",
                        description: "Closure is currently calibrating its Opened and Closed limits to determine effective physical range"
                    },
                    {
                        tag: "field", name: "Protected",
                        description: "Some protective measures are activated to prevent damage to the closure. Commands MAY be rejected."
                    },
                    {
                        tag: "field", name: "Disengaged",
                        description: "Closure has a disengaged element preventing any actuator movements"
                    },
                    {
                        tag: "field", name: "SetupRequired",
                        description: "Movement commands are ignored since the closure is not operational and requires further setup and/or calibration"
                    }
                ]
            },

            {
                tag: "datatype", name: "ClosureErrorEnum", xref: "cluster§5.4.6.4",

                details: "The following ranges are reserved for general and manufacturer specified closure errors." +
                    "\n" +
                    "The manufacturer-specific error definitions shall NOT duplicate the general error definitions. Such " +
                    "manufacturer-specific error definitions shall be scoped in the context of the Vendor ID present in " +
                    "the Basic Information cluster." +
                    "\n" +
                    "The general closure error values are defined in the table below.",

                children: [
                    {
                        tag: "field", name: "PhysicallyBlocked",
                        description: "An obstacle is blocking the closure movement"
                    },
                    {
                        tag: "field", name: "BlockedBySensor",
                        description: "The closure is unsafe to move, as determined by a sensor (e.g. photoelectric sensor) before attempting movement"
                    },
                    {
                        tag: "field", name: "TemperatureLimited",
                        description: "A warning raised by the closure that indicates an over-temperature, e.g. due to excessive drive or stall current"
                    },
                    {
                        tag: "field", name: "MaintenanceRequired",
                        description: "Some malfunctions that are not easily recoverable are detected, or urgent servicing is needed"
                    },
                    {
                        tag: "field", name: "InternalInterference",
                        description: "An internal element is prohibiting motion, e.g. an integrated door within a bigger garage door is open and prevents motion"
                    }
                ]
            },

            {
                tag: "datatype", name: "OverallCurrentStateStruct", xref: "cluster§5.4.6.5",

                children: [
                    {
                        tag: "field", name: "Position", xref: "cluster§5.4.6.5.1",

                        details: "This field shall indicate the current Position state of the closure, as defined in the " +
                            "CurrentPositionEnum." +
                            "\n" +
                            "When the Positioning (PS) feature flag is set, the rules for setting the value of the Position field " +
                            "are:" +
                            "\n" +
                            "  - If the closure doesn't know accurately its current state the value null shall be used." +
                            "\n" +
                            "  - Otherwise, the most appropriate supported value shall be used." +
                            "\n" +
                            "Clients which only consider the binary opened/closed states of a closure SHOULD consider the closure " +
                            "to be closed if the value of this field is FullyClosed. Otherwise those clients SHOULD consider the " +
                            "closure opened (non-closed)."
                    },

                    {
                        tag: "field", name: "Latch", xref: "cluster§5.4.6.5.2",

                        details: "This field shall indicate the current latching state of the closure." +
                            "\n" +
                            "When the MotionLatching (LT) feature flag is set, the rules for setting the value of the Latch field " +
                            "are:" +
                            "\n" +
                            "  - If the closure doesn't know its current state, the value shall be null." +
                            "\n" +
                            "  - Else, if the closure is partially latched or not latched, the value shall be false." +
                            "\n" +
                            "  - Otherwise, if the closure is fully latched, the value shall be true." +
                            "\n" +
                            "    > [!NOTE]" +
                            "\n" +
                            "    > NOTE: Some products exposing the MotionLatching (LT) feature might not be able to drive an " +
                            "actuator to achieve a latched state. Such products are built with springs or similar " +
                            "mechanisms to unlatch but require the user to latch manually."
                    },

                    {
                        tag: "field", name: "Speed", xref: "cluster§5.4.6.5.3",

                        details: "This field shall indicate the current speed of the closure, as defined in the ThreeLevelAutoEnum." +
                            "\n" +
                            "When the Speed (SP) feature flag is set, the rules for setting the value of the Speed field are:" +
                            "\n" +
                            "If the closure's MainState attribute is currently either in WaitingForMotion or Moving state, the " +
                            "closure's most accurate current overall speed shall be used. Otherwise, the value used shall be the " +
                            "most appropriate default supported speed value."
                    },

                    {
                        tag: "field", name: "SecureState", xref: "cluster§5.4.6.5.4",

                        details: "This field shall indicate the current secure state of the closure." +
                            "\n" +
                            "A secure state requires the closure to meet all of the following conditions defined by the " +
                            "OverallCurrentState Struct based on feature support:" +
                            "\n" +
                            "  - If the Positioning feature is supported, then the Position field of OverallCurrentState is " +
                            "FullyClosed." +
                            "\n" +
                            "  - If the MotionLatching feature is supported, then the Latch field of OverallCurrentState is True." +
                            "\n" +
                            "The rules for setting the value of the SecureState field shall be:" +
                            "\n" +
                            "  - True if the closure meets the required conditions for a secure state, preventing unauthorized or " +
                            "undetectable access." +
                            "\n" +
                            "  - False if the closure does not meet these conditions and unauthorized or undetectable access is " +
                            "possible." +
                            "\n" +
                            "  - null if the closure's current secure state is unknown." +
                            "\n" +
                            "This field provides no additional details regarding mechanical properties of the closure mechanism. " +
                            "It is intended only as supplementary information and not as a replacement for a comprehensive " +
                            "security system. It is primarily useful for closures on the outer shell of objects, such as garage " +
                            "doors, windows, or doors."
                    }
                ]
            },

            {
                tag: "datatype", name: "OverallTargetStateStruct", xref: "cluster§5.4.6.6",

                children: [
                    {
                        tag: "field", name: "Position", xref: "cluster§5.4.6.6.1",
                        details: "This field shall indicate the target position that the closure is moving to. It shall be null if " +
                            "there is no target position."
                    },
                    {
                        tag: "field", name: "Latch", xref: "cluster§5.4.6.6.2",
                        details: "This field shall indicate the desired latching state of the closure. It shall be null if there is no " +
                            "desired latching state."
                    },

                    {
                        tag: "field", name: "Speed", xref: "cluster§5.4.6.6.3",
                        details: "This field shall indicate the desired speed at which the closure should perform the movement toward " +
                            "the target position. If no speed value has yet been set, the server shall select and set one of the " +
                            "speed values defined in the ThreeLevelAutoEnum."
                    }
                ]
            },

            {
                tag: "datatype", name: "LatchControlModesBitmap", xref: "cluster§5.4.6.7",

                children: [
                    {
                        tag: "field", name: "RemoteLatching", description: "Remote latching capability",
                        xref: "cluster§5.4.6.7.1",
                        details: "This bit shall indicate whether the latch supports remote latching or not:" +
                            "\n" +
                            "  - 0 = the latch can only be latched through manual, physical operation." +
                            "\n" +
                            "  - 1 = the latch can be latched via remote control (e.g., electronic or remote actuation)."
                    },

                    {
                        tag: "field", name: "RemoteUnlatching", description: "Remote unlatching capability",
                        xref: "cluster§5.4.6.7.2",
                        details: "This bit shall indicate whether the latch supports remote unlatching or not:" +
                            "\n" +
                            "  - 0 = the latch can only be unlatched through manual, physical operation." +
                            "\n" +
                            "  - 1 = the latch can be unlatched via remote control (e.g., electronic or remote actuation)."
                    }
                ]
            }
        ]
    }
);
