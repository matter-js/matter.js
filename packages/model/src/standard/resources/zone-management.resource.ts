/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ZoneManagement", pics: "ZONEMGMT", xref: "cluster§2.14",

    details: "This cluster provides an interface to manage regions of interest, or Zones, which can be either " +
        "manufacturer or user defined." +
        "\n" +
        "This cluster also defines a Trigger, which is a set of conditions and timing that apply to a Zone " +
        "and allow for events to be generated or the triggering state to be used by other clusters such as " +
        "Push AV Stream Transport Cluster.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.14.4",

            children: [
                {
                    tag: "field", name: "TWODCART", xref: "cluster§2.14.4.1",

                    details: "When this feature is supported, Zones based on a 2 Dimensional Cartesian plane may be defined and " +
                        "shall be represented by a TwoDCartesianZoneStruct. Within a TwoDCartesianZoneStruct the bounding of " +
                        "the zone shall be a polygon defined by a list of vertices comprising X (horizontal) and Y (vertical) " +
                        "coordinates, with each vertex defining the point where adjacent edges meet and an implicit " +
                        "connection between the last and first vertices in the list." +
                        "\n" +
                        "The origin (0,0) shall be located at the top left of the Cartesian plane, with positive X and Y " +
                        "values moving right and down across the Cartesian plane respectively."
                },

                {
                    tag: "field", name: "PERZONESENS", xref: "cluster§2.14.4.2",
                    details: "When this feature is supported, the ZoneTriggerControlStruct shall be used for specifying a zone " +
                        "specific value for the sensitivity of that zone to trigger events. If not supported, only the " +
                        "Sensitivity Attribute shall be used."
                },

                {
                    tag: "field", name: "USERDEFINED", xref: "cluster§2.14.4.3",
                    details: "When this feature is supported, the device allows for creating and managing user defined zones via " +
                        "commands."
                },
                {
                    tag: "field", name: "FOCUSZONES", xref: "cluster§2.14.4.4",
                    details: "When this feature is supported, the device allows for creating and managing user defined Focus Value " +
                        "zones via commands."
                }
            ]
        },

        {
            tag: "attribute", name: "MaxUserDefinedZones", xref: "cluster§2.14.6.1",
            details: "This attribute shall specify the maximum number of user-defined zones that can be supported by the " +
                "Node. This value is manufacturer-defined."
        },

        {
            tag: "attribute", name: "MaxZones", xref: "cluster§2.14.6.2",
            details: "This attribute shall specify the maximum number of zones allowed to created. This value shall be the " +
                "sum of the number of predefined Mfg Zones, and MaxUserDefinedZones, if supported. This value is " +
                "manufacturer-defined."
        },

        {
            tag: "attribute", name: "Zones", xref: "cluster§2.14.6.3",
            details: "This attribute shall specify all currently defined zones as a list of ZoneInformationStruct. Use the " +
                "commands from this cluster to add, update or remove entries."
        },

        {
            tag: "attribute", name: "Triggers", xref: "cluster§2.14.6.4",
            details: "This attribute shall specify all currently defined triggers controlling the generation of " +
                "ZoneTriggered and ZoneStopped events and shall be a list of ZoneTriggerControlStruct. To add an " +
                "entry use CreateOrUpdateTrigger. To remove an entry use RemoveTrigger."
        },

        {
            tag: "attribute", name: "SensitivityMax", xref: "cluster§2.14.6.5",

            details: "This attribute shall specify the hardware specific value for the number of supported sensitivity " +
                "levels. This value is manufacturer defined. If the PerZoneSensitivity feature is supported, the " +
                "value of this attribute determines valid values for the Sensitivity field in " +
                "ZoneTriggerControlStruct; if the PerZoneSensitivity feature is not supported, the value of this " +
                "attribute determines valid values for the Sensitivity Attribute. Implementations require two to ten " +
                "levels of sensitivity control in order to ensure that there is some user-level customization of the " +
                "Trigger."
        },

        {
            tag: "attribute", name: "Sensitivity", xref: "cluster§2.14.6.6",
            details: "This attribute shall specify the sensitivity of the underlying zone triggering detection mechanism " +
                "if the PerZoneSensitivity features is not supported. The higher the value the more sensitive the " +
                "detection. The actual meaning of the values is implementation specific."
        },

        {
            tag: "attribute", name: "TwoDCartesianMax", xref: "cluster§2.14.6.7",
            details: "This attribute shall specify the maximum X and Y points that are allowed for TwoD Cartesian Zones. " +
                "If this cluster is on the same endpoint as Camera AV Stream Management Cluster, these values shall " +
                "be equal to the value of SensorWidth - 1 and SensorHeight - 1 from the VideoSensorParams attribute."
        },

        {
            tag: "event", name: "ZoneTriggered", xref: "cluster§2.14.8.1",
            details: "This event shall be generated when a Zone is first triggered.",

            children: [
                {
                    tag: "field", name: "Zone", xref: "cluster§2.14.8.1.1",
                    details: "This field shall contain the ZoneID of the Zone that triggered."
                },
                {
                    tag: "field", name: "Reason", xref: "cluster§2.14.8.1.2",
                    details: "This field shall indicate why the zone was triggered."
                }
            ]
        },

        {
            tag: "event", name: "ZoneStopped", xref: "cluster§2.14.8.2",
            details: "This event shall be generated when either the TriggerDetectedDuration value is exceeded by the " +
                "TimeSinceInitialTrigger value or the MaxDuration value is exceeded by the TimeSinceInitialTrigger " +
                "value, as described in Section 2.14.5.9, \"ZoneTriggerControlStruct\".",

            children: [
                {
                    tag: "field", name: "Zone", xref: "cluster§2.14.8.2.1",
                    details: "This field shall contain the ZoneID of the Zone that stopped."
                },
                {
                    tag: "field", name: "Reason", xref: "cluster§2.14.8.2.2",
                    details: "This field shall indicate why the zone stopped triggering."
                }
            ]
        },

        {
            tag: "command", name: "CreateTwoDCartesianZone", xref: "cluster§2.14.7.1",
            details: "This command shall create and store a TwoD Cartesian Zone.",
            children: [{
                tag: "field", name: "Zone", xref: "cluster§2.14.7.1.1",
                details: "The Zone field shall be a TwoDCartesianZoneStruct representing all information required to define " +
                    "the TwoD Cartesian Zone."
            }]
        },

        {
            tag: "command", name: "CreateTwoDCartesianZoneResponse", xref: "cluster§2.14.7.2",
            details: "This command shall be generated in response to a CreateTwoDCartesianZone command.",
            children: [{
                tag: "field", name: "ZoneId", xref: "cluster§2.14.7.2.1",
                details: "The ZoneID field shall be an unsigned 16 bit integer representing the unique ZoneID."
            }]
        },

        {
            tag: "command", name: "UpdateTwoDCartesianZone", xref: "cluster§2.14.7.3",
            details: "The UpdateTwoDCartesianZone shall update a stored TwoD Cartesian Zone.",

            children: [
                {
                    tag: "field", name: "ZoneId", xref: "cluster§2.14.7.3.1",
                    details: "The ZoneID field shall be a ZoneID of the Zone to be updated."
                },
                {
                    tag: "field", name: "Zone", xref: "cluster§2.14.7.3.2",
                    details: "The Zone field shall be a TwoDCartesianZoneStruct representing updated Zone information."
                }
            ]
        },

        {
            tag: "command", name: "RemoveZone", xref: "cluster§2.14.7.4",
            details: "This command shall remove the user-defined Zone indicated by ZoneID.",
            children: [{
                tag: "field", name: "ZoneId", xref: "cluster§2.14.7.4.1",
                details: "The ZoneID field shall be a ZoneID of the Zone to be removed."
            }]
        },

        {
            tag: "command", name: "CreateOrUpdateTrigger", xref: "cluster§2.14.7.5",
            details: "This command is used to create or update a Trigger for the specified motion Zone.",
            children: [{
                tag: "field", name: "Trigger", xref: "cluster§2.14.7.5.1",
                details: "This field shall be a ZoneTriggerControlStruct representing all information required to define the " +
                    "Trigger conditions."
            }]
        },

        {
            tag: "command", name: "RemoveTrigger", xref: "cluster§2.14.7.6",
            details: "This command shall remove the Trigger for the provided ZoneID.",
            children: [{
                tag: "field", name: "ZoneId", xref: "cluster§2.14.7.6.1",
                details: "The ZoneID field shall be a ZoneID of the Zone Trigger to be removed."
            }]
        },

        {
            tag: "datatype", name: "ZoneTypeEnum", xref: "cluster§2.14.5.1",
            children: [{ tag: "field", name: "TwoDcartZone", description: "Indicates a Two Dimensional Cartesian Zone" }]
        },

        {
            tag: "datatype", name: "ZoneUseEnum", xref: "cluster§2.14.5.2",
            details: "This data type is derived from enum8, and is used to indicate intended Zone usage.",

            children: [
                {
                    tag: "field", name: "Motion", description: "Indicates Zone is intended to detect Motion",
                    xref: "cluster§2.14.5.2.1",
                    details: "This value indicates the Zone is intended to be used for motion detection"
                },

                {
                    tag: "field", name: "Privacy", description: "Indicates Zone is intended to protect privacy",
                    xref: "cluster§2.14.5.2.2",
                    details: "This value indicates the Zone is intended to be used for privacy blocking. All pixels within Privacy " +
                        "Zones shall be replaced with black."
                },

                {
                    tag: "field", name: "Focus", description: "Indicates Zone provides a focus area",
                    xref: "cluster§2.14.5.2.3",
                    details: "This value indicates the Zone is intended to be a focal point for quality or analysis. " +
                        "Implementations may increase encoding quality within this type of Zone at the expense of other " +
                        "areas."
                }
            ]
        },

        {
            tag: "datatype", name: "ZoneSourceEnum", xref: "cluster§2.14.5.3",

            children: [
                {
                    tag: "field", name: "Mfg", description: "Indicates a Manufacturer defined Zone.",
                    xref: "cluster§2.14.5.3.1",
                    details: "This value indicates the Zone is built-in and provided by the manufacturer of the device. Zones of " +
                        "this type can't be created or modified using commands in this cluster."
                },

                {
                    tag: "field", name: "User", description: "Indicates a User defined Zone.",
                    xref: "cluster§2.14.5.3.2",
                    details: "This value indicates the Zone was defined and created by a user. Zones of this type can be created, " +
                        "modified or deleted using commands in this cluster."
                }
            ]
        },

        {
            tag: "datatype", name: "ZoneEventTriggeredReasonEnum", xref: "cluster§2.14.5.4",
            children: [{ tag: "field", name: "Motion", description: "Zone event triggered because motion is detected" }]
        },

        {
            tag: "datatype", name: "ZoneEventStoppedReasonEnum", xref: "cluster§2.14.5.5",

            children: [
                {
                    tag: "field", name: "ActionStopped",
                    description: "Indicates that whatever triggered the Zone event has stopped being detected."
                },
                {
                    tag: "field", name: "Timeout",
                    description: "Indicates that the max duration for detecting triggering activity has been reached."
                }
            ]
        },

        {
            tag: "datatype", name: "TwoDCartesianVertexStruct", xref: "cluster§2.14.5.6",
            details: "This struct is used to encode a point on the 2 Dimensional Cartesian Plane for the TwoDCartesianZone " +
                "feature.",

            children: [
                {
                    tag: "field", name: "X", xref: "cluster§2.14.5.6.1",
                    details: "This field shall represent the position of the vertex along the horizontal (x) axis."
                },
                {
                    tag: "field", name: "Y", xref: "cluster§2.14.5.6.2",
                    details: "This field shall represent the position of the vertex along the vertical (y) axis."
                }
            ]
        },

        {
            tag: "datatype", name: "TwoDCartesianZoneStruct", xref: "cluster§2.14.5.7",
            details: "This struct is used to encode all information needed to define a TwoDCartesianZone.",

            children: [
                {
                    tag: "field", name: "Name", xref: "cluster§2.14.5.7.1",
                    details: "The Name field shall be a string representing the name of the Zone. This is not guaranteed to be " +
                        "unique."
                },
                {
                    tag: "field", name: "Use", xref: "cluster§2.14.5.7.2",
                    details: "The Use field shall be a Zone Use Enum representing the purpose of the Zone."
                },

                {
                    tag: "field", name: "Vertices", xref: "cluster§2.14.5.7.3",
                    details: "The Vertices field shall be a list of vertices of type TwoDCartesianVertexStruct. These vertices " +
                        "define a simple polygon on the TwoD Cartesian plane, which represents the bounds of the TwoD " +
                        "Cartesian Zone with an implicit connection between the last and first list items."
                },

                {
                    tag: "field", name: "Color", xref: "cluster§2.14.5.7.4",

                    details: "This field shall indicate the color, in RGB or RGBA, used for attaching a color to the Zone " +
                        "definition and is a purely informational value to help in uniformly presenting Zones in User " +
                        "Interfaces and may be ignored. The value shall conform to the 6-digit or 8-digit format defined for " +
                        "CSS sRGB hexadecimal color notation. If a 6-digit format is used, then the alpha component shall " +
                        "assume the value of 0 meaning fully transparent interior." +
                        "\n" +
                        "Examples:" +
                        "\n" +
                        "  - #00FFFF for R=0x00, G=0xFF, B=0xFF, A absent - For a light-blue zone with full transparency." +
                        "\n" +
                        "  - #00FFFF80 for R=0x00, G=0xFF, B=0xFF, A=0x80 - For a light-blue zone with partial interior " +
                        "transparency." +
                        "\n" +
                        "  - #000000FF for R=0x00, G=0x00, B=0x00, A=0xFF - For a Privacy type zone that is black and fully " +
                        "opaque interior."
                }
            ]
        },

        {
            tag: "datatype", name: "ZoneInformationStruct", xref: "cluster§2.14.5.8",
            details: "This struct is used to encode basic information about a Zone without containing the specifics of how " +
                "the zone is defined.",

            children: [
                {
                    tag: "field", name: "ZoneId", xref: "cluster§2.14.5.8.1",
                    details: "This field shall indicate the unique ZoneID of the Zone."
                },
                {
                    tag: "field", name: "ZoneType", xref: "cluster§2.14.5.8.2",
                    details: "This field shall indicate the zone type which defines the Zone."
                },
                {
                    tag: "field", name: "ZoneSource", xref: "cluster§2.14.5.8.3",
                    details: "This field shall indicate the source of the Zone."
                },
                {
                    tag: "field", name: "TwoDCartesianZone", xref: "cluster§2.14.5.8.4",
                    details: "This field shall indicate the detailed information for the TwoDCartesianZone."
                }
            ]
        },

        {
            tag: "datatype", name: "ZoneTriggerControlStruct", xref: "cluster§2.14.5.9",

            details: "This struct is used to encode a set of values for controlling the generation of ZoneTriggered and " +
                "ZoneStopped events from the Node." +
                "\n" +
                "Zone events can be triggered due to many underlying reasons, such as a motion sensor on the device, " +
                "and this is intended to be manufacturer-specific. When a triggering activity is initially detected, " +
                "the Node shall generate a ZoneTriggered event." +
                "\n" +
                "This places the Node in a triggered state, at which point the Node shall internally track two " +
                "values." +
                "\n" +
                "### TimeSinceInitialTrigger" +
                "\n" +
                ": The time in seconds since the initial triggering activity." +
                "\n" +
                "### TriggerDetectedDuration" +
                "\n" +
                ": Initially set to the InitialDuration value." +
                "\n" +
                "If the TriggerDetectedDuration value is exceeded by the TimeSinceInitialTrigger, the Node shall " +
                "generate a ZoneStopped event with the reason parameter set to ActionStopped." +
                "\n" +
                "However, if additional triggering actions are detected during this period, the Node shall increase " +
                "the TriggerDetectedDuration value by the AugmentationDuration value. This process can occur " +
                "repeatedly but after the first increase of TriggerDetectedDuration the Node shall NOT increase the " +
                "TriggerDetectedDuration value unless the previous TriggerDetectedDuration has been exceeded by the " +
                "TimeSinceInitialTrigger." +
                "\n" +
                "If the TimeSinceInitialTrigger value exceeds the MaxDuration value, the Node shall generate a " +
                "ZoneStopped with the reason parameter set to Timeout." +
                "\n" +
                "Once a ZoneStopped event has been generated, the Node shall stop detecting the triggering activity " +
                "for the period of the BlindDuration value.",

            children: [
                {
                    tag: "field", name: "ZoneId", xref: "cluster§2.14.5.9.1",
                    details: "This field shall indicate the unique ZoneID of the Zone this Trigger applies to."
                },
                {
                    tag: "field", name: "InitialDuration", xref: "cluster§2.14.5.9.2",
                    details: "This field shall indicate the initial duration in seconds after triggering activity is first " +
                        "detected before the Node could generate a ZoneStopped event."
                },
                {
                    tag: "field", name: "AugmentationDuration", xref: "cluster§2.14.5.9.3",
                    details: "This field shall indicate the duration in seconds that the TriggerDetectedDuration value is to be " +
                        "extended by if the triggering activity is still detected during this period."
                },
                {
                    tag: "field", name: "MaxDuration", xref: "cluster§2.14.5.9.4",
                    details: "This field shall indicate the maximum duration in seconds after the initial triggering activity " +
                        "detection that additional triggering activity will be detected."
                },
                {
                    tag: "field", name: "BlindDuration", xref: "cluster§2.14.5.9.5",
                    details: "This field shall indicate the duration in seconds after a ZoneStopped event is generated that the " +
                        "Node shall NOT generate any ZoneTriggered events."
                },

                {
                    tag: "field", name: "Sensitivity", xref: "cluster§2.14.5.9.6",
                    details: "This field shall indicate the per-zone sensitivity of the underlying zone triggering detection " +
                        "mechanism. The higher the value, the more sensitive the detection. The actual meaning of the values " +
                        "is implementation-specific."
                }
            ]
        },

        {
            tag: "datatype", name: "ZoneID", xref: "cluster§2.14.5.10",

            details: "It represents a defined Zone. This value starts at 0 and monotonically increases by 1 with each new " +
                "Zone provisioned by the Node or permanently created by the device maker. A value incremented past " +
                "65534 shall wrap to 0. The Node shall verify that the incremented ID does not match any other ID. If " +
                "such a match is found, the ID shall be incremented until a unique ID is found." +
                "\n" +
                "A Node shall only store a single Zone for a particular ZoneID and that ID shall NOT change over the " +
                "lifetime of the Zone."
        }
    ]
});
