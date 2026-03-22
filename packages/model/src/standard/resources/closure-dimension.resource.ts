/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "ClosureDimension", pics: "CLDIM", xref: "cluster§5.5",

        details: "This cluster provides an interface for controlling a single degree of freedom (also referred to as a " +
            "\"dimension\" or an \"axis\" below) of a composed closure. This could be a degree of freedom in a 6-axis " +
            "framework for the overall closure or a panel in the closure, or some other degree of freedom." +
            "\n" +
            "An instance of this cluster may represent position along a single axis, as specified by the " +
            "FeatureMap, which can be one of:" +
            "\n" +
            "  - Translation : panel translates along one axis" +
            "\n" +
            "  - Rotation : panel rotates around an axis of rotation" +
            "\n" +
            "  - Modulation : panel modifies its aspect to modulate a flow" +
            "\n" +
            "This cluster may also be used to latch or anchor a panel in a position, if the panel supports that.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§5.5.5",

                children: [
                    {
                        tag: "field", name: "PS", xref: "cluster§5.5.5.1",

                        details: "This feature shall indicate support for position percentage over the range of 0.00% to 100.00%, with " +
                            "a resolution of 0.01%." +
                            "\n" +
                            "> [!NOTE]" +
                            "\n" +
                            "> In most of the products 0.00% = fully opened and 100.00% = fully closed but this is not always the " +
                            "  case. For example, if the Modulation feature is supported and the ModulationType is " +
                            "SlatsOrientation or StripesAlignment, the panel can be fully closed at 0.00% and 100.00%, and be " +
                            "fully opened at 50.00%."
                    },

                    {
                        tag: "field", name: "LT", xref: "cluster§5.5.5.2",
                        details: "This feature shall indicate that the closure can be latched and unlatched. An axis with the " +
                            "MotionLatching feature has capabilities that will prevent actuators from moving along parts of that " +
                            "axis if the dimension is latched."
                    },

                    {
                        tag: "field", name: "UT", xref: "cluster§5.5.5.3",
                        details: "This feature shall indicate additional information about the closure dimension’s possible range of " +
                            "movement."
                    },
                    {
                        tag: "field", name: "LM", xref: "cluster§5.5.5.4",
                        details: "This feature shall indicate that the closure dimension supports degradation of its functioning. " +
                            "Reachable Position range may be limited compared to full scope of a nominal behavior."
                    },

                    {
                        tag: "field", name: "SP", xref: "cluster§5.5.5.5",

                        details: "This feature shall indicate that the closure dimension can be driven at different speed levels: Low, " +
                            "Medium, and High. Please refer to Section 5.4.5.4, “Speed Feature” for more details." +
                            "\n" +
                            "> [!NOTE]" +
                            "\n" +
                            "> The server might not support three different speed values. The manufacturer shall select speed " +
                            "values linked to Low, Medium and High such that Low <= Medium <= High."
                    },

                    {
                        tag: "field", name: "TR", xref: "cluster§5.5.5.6",
                        details: "This feature shall indicate that the panel can move along a single axis. The possible directions " +
                            "include downward, upward, leftward, rightward, forward, and backward. The Translation feature is " +
                            "used to control the position of the panel along the specified axis."
                    },

                    {
                        tag: "field", name: "RO", xref: "cluster§5.5.5.7",
                        details: "This feature shall indicate that the panel can rotate around a single axis. The possible axes " +
                            "include left, right, top, bottom, centered vertical, and centered horizontal. The Rotation feature " +
                            "is used to control the orientation of the panel around the specified axis."
                    },

                    {
                        tag: "field", name: "MD", xref: "cluster§5.5.5.8",
                        details: "This feature shall indicate that the panel can modify its aspect to control a particular flow, such " +
                            "as light, air, or privacy. The possible modulation types include slats orientation, slats openwork, " +
                            "stripes alignment, opacity, and ventilation. The Modulation feature is used to adjust the panel’s " +
                            "properties to achieve the desired effect."
                    }
                ]
            },

            {
                tag: "attribute", name: "CurrentState", xref: "cluster§5.5.7.1",

                details: "Indicates the current Position, Latching and/or Speed, based on the feature flags set." +
                    "\n" +
                    "A value of null shall indicate that:" +
                    "\n" +
                    "  - The position and latching state are both not known yet because the closure is not calibrated, or" +
                    "\n" +
                    "  - The product has lost its position and latching state after manual motion during a shutdown." +
                    "\n" +
                    "Changes to this attribute shall only be marked as reportable in the following cases:" +
                    "\n" +
                    "  - When the attribute changes from null to any other value and vice versa, or" +
                    "\n" +
                    "  - When the Position changes from null to any other value and vice versa, or" +
                    "\n" +
                    "  - At most once every 5 seconds when the Position changes from one non-null value to another " +
                    "non-null value, or" +
                    "\n" +
                    "  - When TargetState.Position is reached, or" +
                    "\n" +
                    "  - When CurrentState.Speed changes, or" +
                    "\n" +
                    "  - When CurrentState.Latch changes." +
                    "\n" +
                    "The value of the different fields within the structure of this attribute depends on:" +
                    "\n" +
                    "  - The last SetTarget or Step commands." +
                    "\n" +
                    "  - The impact of a MoveTo command received on the Closure Control Cluster instance associated with " +
                    "this cluster, if such a Closure Control instance exists, as described in Section 5.5.4, " +
                    "“Association Between Closure Control and Closure Dimension Clusters”."
            },

            {
                tag: "attribute", name: "TargetState", xref: "cluster§5.5.7.2",

                details: "Indicates the target Position, Latching and/or Speed, based on the feature flags set." +
                    "\n" +
                    "A value of null shall indicate that the TargetState fields are unknown (typically after a reboot, no " +
                    "target has been yet requested)." +
                    "\n" +
                    "Each field shall be present only when its corresponding feature is supported. If the feature is not " +
                    "supported the field shall NOT be present." +
                    "\n" +
                    "The value of TargetState.Position shall be set to a value that is an integer multiple of the " +
                    "Resolution attribute." +
                    "\n" +
                    "The value of the different fields within the structure of this attribute depends on:" +
                    "\n" +
                    "  - The last SetTarget or Step commands." +
                    "\n" +
                    "  - The impact of a MoveTo command received on the Closure Control Cluster instance associated with " +
                    "this cluster, if such a Closure Control instance exists, as described in Section 5.5.4, " +
                    "“Association Between Closure Control and Closure Dimension Clusters”."
            },

            {
                tag: "attribute", name: "Resolution", xref: "cluster§5.5.7.3",

                details: "Indicates the minimal acceptable change to the Position field of the TargetState and CurrentState " +
                    "attributes." +
                    "\n" +
                    "Resolution should not be confused with an accuracy, such as Current = Target +/- Accuracy. This " +
                    "cluster does not provide accuracy." +
                    "\n" +
                    "Resolution gives a collection of valid Current position points over a linear ruler." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> A resolution of 100% means that the associated dimension cannot be placed in an intermediate " +
                    "position - its position is binary."
            },

            {
                tag: "attribute", name: "StepValue", xref: "cluster§5.5.7.4",

                details: "Indicates the size of a single step, expressed in percent100ths. When the Step command is used, each " +
                    "step changes the position by this amount. The value of this attribute shall be an integer multiple " +
                    "of the Resolution attribute." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> The StepValue should be large enough to cause a visible change in the closure’s position when a " +
                    "Step command is invoked."
            },

            {
                tag: "attribute", name: "Unit", xref: "cluster§5.5.7.5",
                details: "Indicates the unit related to the Position."
            },

            {
                tag: "attribute", name: "UnitRange", xref: "cluster§5.5.7.6",
                details: "Indicates the minimum and the maximum values expressed by Position following the unit indicated by " +
                    "\"Unit\"." +
                    "\n" +
                    "The value of this attribute may be null if the product has not been set up."
            },

            {
                tag: "attribute", name: "LimitRange", xref: "cluster§5.5.7.7",
                details: "Indicates the range of possible values for the Position field in the CurrentState attribute." +
                    "\n" +
                    "This range may evolve dynamically." +
                    "\n" +
                    "LimitRange.Min and LimitRange.Max shall be equal to an integer multiple of the Resolution attribute."
            },

            {
                tag: "attribute", name: "TranslationDirection", xref: "cluster§5.5.7.8",
                details: "Indicates the direction of the translation." +
                    "\n" +
                    "A properly configured closure dimension SHOULD reflect as best as possible the translation as seen " +
                    "by the user. This attribute is not supposed to change once the installation is finalized."
            },

            {
                tag: "attribute", name: "RotationAxis", xref: "cluster§5.5.7.9",
                details: "Indicates the axis of the rotation." +
                    "\n" +
                    "A properly configured closure dimension SHOULD reflect as best as possible the rotation axis as " +
                    "perceived by the user. This attribute is not supposed to change once the installation is finalized."
            },

            {
                tag: "attribute", name: "Overflow", xref: "cluster§5.5.7.10",

                details: "Indicates the overflow related to Rotation(RO)." +
                    "\n" +
                    "A closure that rotates following an axis (with Rotation(RO) feature declared in FeatureMap), could " +
                    "overflow Inside and/or Outside. If the axis is centered, one part goes Outside and the other part " +
                    "goes Inside. In this case, this attribute shall use Top/Bottom/Left/Right Inside or " +
                    "Top/Bottom/Left/Right Outside enumerated value."
            },

            {
                tag: "attribute", name: "ModulationType", xref: "cluster§5.5.7.11",
                details: "Indicates the modulation type related to Modulation(MD)." +
                    "\n" +
                    "The server SHOULD reflect, as best as possible, the modulation type as perceived by the user. This " +
                    "attribute is not supposed to change once the installation is finalized."
            },

            {
                tag: "attribute", name: "LatchControlModes", xref: "cluster§5.5.7.12",
                details: "This attribute shall specify whether the latch mechanism can be latched or unlatched remotely."
            },

            {
                tag: "command", name: "SetTarget", xref: "cluster§5.5.8.1",

                details: "This command is used to move a dimension of the closure to a target position." +
                    "\n" +
                    "The rationale behind defining the conformance as being purely optional in the table above is to " +
                    "ensure that commands containing one or more fields related to unsupported features are still " +
                    "accepted, rather than being rejected outright. For example, if a simple client, which is not able to " +
                    "determine the capabilities of the server, invokes a command that includes both position and speed, a " +
                    "server that does not support the speed feature would simply ignore the speed field while still " +
                    "adjusting its position as requested.",

                children: [
                    {
                        tag: "field", name: "Position", xref: "cluster§5.5.8.1.1",

                        details: "This field shall indicate the position where the closure is moving to." +
                            "\n" +
                            "If the field is present but its value is not within constraints, then:" +
                            "\n" +
                            "  - If the Positioning (PS) feature is not supported, the value of this field shall be ignored." +
                            "\n" +
                            "  - If the Positioning (PS) feature is supported, a status code of CONSTRAINT_ERROR shall be " +
                            "returned." +
                            "\n" +
                            "If the Positioning (PS) feature is supported and the Position field is not present, the closure " +
                            "shall use the value of the Position field in the TargetState attribute as the fallback. If the " +
                            "Position field in the TargetState attribute is NULL, the position is unknown and the fallback is not " +
                            "applicable, in this case the field shall be ignored and the closure shall NOT change its position." +
                            "\n" +
                            "When the closure supports the Positioning(PS) feature:" +
                            "\n" +
                            "If a new position value is requested, the closure shall set the Position field of the TargetState " +
                            "attribute to the nearest valid position (an integer multiple of the Resolution attribute), whether " +
                            "by rounding the requested value or using it directly if already valid, and then initiate the motion " +
                            "procedure."
                    },

                    {
                        tag: "field", name: "Latch", xref: "cluster§5.5.8.1.2",

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
                            "shall use the value of the Latch field in the TargetState attribute as the fallback. If the Latch " +
                            "field in the TargetState attribute is NULL, the latch state is unknown and the fallback is not " +
                            "applicable, in this case, the field shall be ignored and the closure shall NOT change its latch " +
                            "state." +
                            "\n" +
                            "If the server supports the MotionLatching (LT) feature, it shall either fulfill the latch request " +
                            "and update TargetState.Latch, or - if the \"LatchControlModes\" attribute specifies that manual " +
                            "intervention is required to latch - respond with INVALID_IN_STATE and remain in its current state."
                    },

                    {
                        tag: "field", name: "Speed", xref: "cluster§5.5.8.1.3",

                        details: "This field shall indicate a desired overall speed of motion, as defined in the ThreeLevelAutoEnum." +
                            "\n" +
                            "If the field is present but its value is not within constraints, then:" +
                            "\n" +
                            "  - If the Speed(SP) feature is not supported, the value of this field shall be ignored." +
                            "\n" +
                            "  - If the Speed(SP) feature is supported, a status code of CONSTRAINT_ERROR shall be returned." +
                            "\n" +
                            "If the Speed (SP) feature is supported, the TargetState.Speed attribute shall be updated with the " +
                            "value of the Speed field." +
                            "\n" +
                            "A closure dimension SHOULD attempt to follow the indicated Speed value as closely as possible (meant " +
                            "to override its default speed)." +
                            "\n" +
                            "If a SetTarget command is sent with only the Speed field:" +
                            "\n" +
                            "  - It SHOULD adjust the speed of the ongoing motion of the closure (i.e., allow speed change on the " +
                            "fly)." +
                            "\n" +
                            "    > [!NOTE]" +
                            "\n" +
                            "    > The internal default speed shall not be affected by this command field. The priorities and " +
                            "cross capabilities to achieve, skip or ignore Position + Latch + Speed combinations are " +
                            "product/manufacturer specific. If the Limitation feature is supported, the closure will " +
                            "automatically offset the TargetState.Position value to fit within LimitRange.Min and " +
                            "LimitRange.Max."
                    }
                ]
            },

            {
                tag: "command", name: "Step", xref: "cluster§5.5.8.2",
                details: "This command is used to move a dimension of the closure to a target position by a number of steps.",

                children: [
                    {
                        tag: "field", name: "Direction", xref: "cluster§5.5.8.2.1",
                        details: "This field shall indicate whether the Position field of the TargetState attribute must be:" +
                            "\n" +
                            "  - Increased toward 100.00%." +
                            "\n" +
                            "  - Decreased toward 0.00%."
                    },

                    {
                        tag: "field", name: "NumberOfSteps", xref: "cluster§5.5.8.2.2",
                        details: "This field shall indicate the number of steps by which the position should be changed. The size of " +
                            "one step, expressed in percent100ths, is determined by the \"StepValue\" attribute."
                    },
                    {
                        tag: "field", name: "Speed", xref: "cluster§5.5.8.2.3",
                        details: "This field shall indicate the desired speed of motion."
                    }
                ]
            },

            {
                tag: "datatype", name: "TranslationDirectionEnum", xref: "cluster§5.5.6.1",
                details: "### Legend: Open Closed",

                children: [
                    { tag: "field", name: "Downward", description: "Downward translation" },
                    { tag: "field", name: "Upward", description: "Upward translation" },
                    { tag: "field", name: "VerticalMask", description: "Vertical mask translation" },
                    { tag: "field", name: "VerticalSymmetry", description: "Vertical symmetry translation" },
                    { tag: "field", name: "Leftward", description: "Leftward translation" },
                    { tag: "field", name: "Rightward", description: "Rightward translation" },
                    { tag: "field", name: "HorizontalMask", description: "Horizontal mask translation" },
                    { tag: "field", name: "HorizontalSymmetry", description: "Horizontal symmetry translation" },
                    { tag: "field", name: "Forward", description: "Forward translation" },
                    { tag: "field", name: "Backward", description: "Backward translation" },
                    { tag: "field", name: "DepthMask", description: "Depth mask translation" },
                    { tag: "field", name: "DepthSymmetry", description: "Depth symmetry translation" }
                ]
            },

            {
                tag: "datatype", name: "RotationAxisEnum", xref: "cluster§5.5.6.2",
                details: "### Legend: Open Closed",

                children: [
                    {
                        tag: "field", name: "Left",
                        description: "The panel rotates around a vertical axis located on the left side of the panel"
                    },
                    {
                        tag: "field", name: "CenteredVertical",
                        description: "The panel rotates around a vertical axis located in the center of the panel"
                    },
                    {
                        tag: "field", name: "LeftAndRight",
                        description: "The panels rotates around vertical axes located on the left and right sides of the panel"
                    },
                    {
                        tag: "field", name: "Right",
                        description: "The panel rotates around a vertical axis located on the right side of the panel"
                    },
                    {
                        tag: "field", name: "Top",
                        description: "The panel rotates around a horizontal axis located on the top of the panel"
                    },
                    {
                        tag: "field", name: "CenteredHorizontal",
                        description: "The panel rotates around a horizontal axis located in the center of the panel"
                    },
                    {
                        tag: "field", name: "TopAndBottom",
                        description: "The panels rotates around horizontal axes located on the top and bottom of the panel"
                    },
                    {
                        tag: "field", name: "Bottom",
                        description: "The panel rotates around a horizontal axis located on the bottom of the panel"
                    },
                    {
                        tag: "field", name: "LeftBarrier",
                        description: "The barrier tilts around an axis located at the left end of the barrier"
                    },
                    {
                        tag: "field", name: "LeftAndRightBarriers",
                        description: "The dual barriers tilt around axes located at each side of the composite barrier"
                    },
                    {
                        tag: "field", name: "RightBarrier",
                        description: "The barrier tilts around an axis located at the right end of the barrier"
                    }
                ]
            },

            {
                tag: "datatype", name: "OverflowEnum", xref: "cluster§5.5.6.3",

                children: [
                    { tag: "field", name: "NoOverflow", description: "No overflow" },
                    { tag: "field", name: "Inside", description: "Inside overflow" },
                    { tag: "field", name: "Outside", description: "Outside overflow" },
                    { tag: "field", name: "TopInside", description: "Top inside overflow" },
                    { tag: "field", name: "TopOutside", description: "Top outside overflow" },
                    { tag: "field", name: "BottomInside", description: "Bottom inside overflow" },
                    { tag: "field", name: "BottomOutside", description: "Bottom outside overflow" },
                    { tag: "field", name: "LeftInside", description: "Left inside overflow" },
                    { tag: "field", name: "LeftOutside", description: "Left outside overflow" },
                    { tag: "field", name: "RightInside", description: "Right inside overflow" },
                    { tag: "field", name: "RightOutside", description: "Right outside overflow" }
                ]
            },

            {
                tag: "datatype", name: "ModulationTypeEnum", xref: "cluster§5.5.6.4",

                children: [
                    { tag: "field", name: "SlatsOrientation", description: "Orientation of the slats" },
                    { tag: "field", name: "SlatsOpenwork", description: "Aperture of the slats" },
                    { tag: "field", name: "StripesAlignment", description: "Alignment of blind stripes (Zebra)" },
                    { tag: "field", name: "Opacity", description: "Opacity of a surface" },
                    { tag: "field", name: "Ventilation", description: "Ventilation control" }
                ]
            },

            {
                tag: "datatype", name: "ClosureUnitEnum", xref: "cluster§5.5.6.5",
                children: [
                    { tag: "field", name: "Millimeter", description: "Millimeter used as unit" },
                    { tag: "field", name: "Degree", description: "Degree used as unit" }
                ]
            },

            {
                tag: "datatype", name: "StepDirectionEnum", xref: "cluster§5.5.6.6",
                details: "This data type is derived from enum8 and used for the Step command to indicate the direction of the " +
                    "steps.",
                children: [
                    { tag: "field", name: "Decrease", description: "Decrease towards 0.00%" },
                    { tag: "field", name: "Increase", description: "Increase towards 100.00%" }
                ]
            },

            { tag: "datatype", name: "RangePercent100thsStruct", xref: "cluster§5.5.6.7" },
            { tag: "datatype", name: "UnitRangeStruct", xref: "cluster§5.5.6.8" },

            {
                tag: "datatype", name: "DimensionStateStruct", xref: "cluster§5.5.6.9",

                children: [
                    {
                        tag: "field", name: "Position", xref: "cluster§5.5.6.9.1",
                        details: "This field shall indicate the position of the closure, expressed as a percentage from 0.00% to " +
                            "100.00%." +
                            "\n" +
                            "A null value indicates that the position is not known or is not set."
                    },

                    {
                        tag: "field", name: "Latch", xref: "cluster§5.5.6.9.2",
                        details: "This field shall indicate the latching state of the closure, as defined in the " +
                            "OverallCurrentStateStruct Latch Field." +
                            "\n" +
                            "A null value indicates that the latch is not known or is not set."
                    },

                    {
                        tag: "field", name: "Speed", xref: "cluster§5.5.6.9.3",
                        details: "This field shall indicate the current speed of the closure, as defined in the ThreeLevelAutoEnum." +
                            "\n" +
                            "If no speed value has yet been set, the server shall select and set one of the speed values defined " +
                            "in the ThreeLevelAutoEnum."
                    }
                ]
            },

            {
                tag: "datatype", name: "LatchControlModesBitmap", xref: "cluster§5.5.6.10",

                children: [
                    {
                        tag: "field", name: "RemoteLatching", description: "Remote latching capability",
                        xref: "cluster§5.5.6.10.1",
                        details: "This bit shall indicate whether the latch supports remote latching or not:" +
                            "\n" +
                            "  - 0 = the latch can only be latched through manual, physical operation." +
                            "\n" +
                            "  - 1 = the latch can be latched via remote control (e.g., electronic or remote actuation)."
                    },

                    {
                        tag: "field", name: "RemoteUnlatching", description: "Remote unlatching capability",
                        xref: "cluster§5.5.6.10.2",
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
