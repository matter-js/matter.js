/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "AmbientContextSensing", pics: "ACS", xref: "cluster§2.16",
    details: "This server cluster provides an interface to ambient context sensing functionality." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: Support for this cluster is provisional.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.16.5",

            children: [
                { tag: "field", name: "HA", details: "Supports various human actions and activities classification" },
                { tag: "field", name: "OC", details: "Supports object counting" },
                { tag: "field", name: "OI", details: "Supports object identification" },
                { tag: "field", name: "AUD", details: "Supports sound identification" },
                { tag: "field", name: "PRED", details: "Supports predicting various human actions and activities." }
            ]
        },

        {
            tag: "attribute", name: "HumanActivityDetected", xref: "cluster§2.16.7.1",
            details: "Indicates the human activity detection in Boolean data. The detected human activity type can be " +
                "found from the AmbientContextType attribute."
        },
        {
            tag: "attribute", name: "ObjectIdentified", xref: "cluster§2.16.7.2",
            details: "Indicates the occurrence of object identification in Boolean data. The detail object identification " +
                "can be found from the AmbientContextType attribute."
        },
        {
            tag: "attribute", name: "AudioContextDetected", xref: "cluster§2.16.7.3",
            details: "Indicates the ambient audio context detection in Boolean data. The detected audio context type can " +
                "be found from the AmbientContextType attribute."
        },

        {
            tag: "attribute", name: "AmbientContextType", xref: "cluster§2.16.7.4",
            details: "Indicates the details for the currently observed and detected ambient context. This attribute " +
                "supports multiple simultaneous ambient context detections. The attribute expression rule is provided " +
                "in the MultipleAmbientSensingDetection section. The total number of simultaneous ambient context " +
                "detections is limited by the SimultaneousDetectionLimit attribute."
        },

        {
            tag: "attribute", name: "AmbientContextTypeSupported", xref: "cluster§2.16.7.5",
            details: "Indicates the list of ambient context detection types supported by the server. Each supported " +
                "ambient context detection type element shall be of a type supported in the AmbientContextFeatureMap " +
                "and shall indicate a supported ambient context detection SemanticTagStruct from one of the following " +
                "namespaces: Identified Human Activity Namespace, Identified Object Namespace, Identified Sound " +
                "Namespace in the StandardNamespaces."
        },

        {
            tag: "attribute", name: "ObjectCountReached", xref: "cluster§2.16.7.6",
            details: "Indicates whether the number of an object being counted is greater or equal to the threshold " +
                "specified by the ObjectCountThreshold. The counting object shall be limited to one identified object " +
                "type and identified by the Identified Object namespace tag ID from presented in the " +
                "AmbientContextTypeSupported attribute."
        },

        {
            tag: "attribute", name: "ObjectCountConfig", xref: "cluster§2.16.7.7",
            details: "Indicates configuration parameters to support an object counting feature. The attribute specifies " +
                "the object to be detected and counted and the counting threshold value for the object counting " +
                "purpose."
        },

        {
            tag: "attribute", name: "ObjectCount", xref: "cluster§2.16.7.8",
            details: "Indicates the number of objects detected in the area covered by the sensor. ObjectCount shall be " +
                "exposed only when ObjectCountReached is true."
        },

        {
            tag: "attribute", name: "SimultaneousDetectionLimit", xref: "cluster§2.16.7.9",

            details: "Indicates the maximum number of simultaneous multiple ambient context detections supported by the " +
                "server. If an additional detection event causes the total number of simultaneous detection events to " +
                "exceed a SimultaneousDetectionLimit, the oldest ambient sensing detection event shall be removed and " +
                "the latest detection shall be added. The same type of ambient context sensing event occurred " +
                "consecutively within the HoldTime duration shall not increase the total number of simultaneous " +
                "detection events. If a simultaneous detection feature is not supported, then the value shall be set " +
                "to 1."
        },

        {
            tag: "attribute", name: "HoldTime", xref: "cluster§2.16.7.10",

            details: "Indicates the time duration of True state, in seconds, before the sensor changes its sensing " +
                "detection state from True to False after the last detection. Low values of HoldTime SHOULD be " +
                "avoided since they could lead to generating overly frequent data reports on subscriptions. This is " +
                "equivalent to the HoldTime attribute of the OccupancySensing cluster attribute. For further " +
                "information, refer to the HoldTime attribute description of the Occupancy Sensing Cluster. The " +
                "HoldTime shall be applied to each ambient context detection occurrence individually. A more detail " +
                "HoldTime implementation example over multiple simultaneous ambient context detections can be found " +
                "in theMultipleAmbientSensingDetection section."
        },

        {
            tag: "attribute", name: "HoldTimeLimits", xref: "cluster§2.16.7.11",
            details: "Indicates the server's limits, and default value, for the HoldTime attribute. This is equivalent to " +
                "the HoldTimeLimits attribute of the Occupancy Sensing Cluster attribute. For further information, " +
                "refer to the HoldTimeLimits attribute description of the Occupancy Sensing Cluster."
        },

        {
            tag: "attribute", name: "PredictedActivity", xref: "cluster§2.16.7.12",
            details: "Indicates the server's prediction of upcoming changes to the monitored area's ambient context." +
                "\n" +
                "The value of the StartTimestamp field on each PredictedActivityStruct in this list other than the " +
                "first shall be greater than the value of the EndTimestamp field on the previous " +
                "PredictedActivityStruct in this list."
        },

        {
            tag: "event", name: "AmbientContextDetectStarted", xref: "cluster§2.16.8.1",
            details: "This event shall be generated when a new different ambient context detection is added to " +
                "AmbientContextType.",

            children: [
                {
                    tag: "field", name: "AmbientContextDetected", xref: "cluster§2.16.8.1.1",
                    details: "This field shall indicate the detail ambient context information that triggers this event reporting. " +
                        "The detail ambient context information shall be presented by the namespace ID and semantic tag ID " +
                        "available from Identified Human Activity Namespace, Identified Object Namespace, Identified Sound " +
                        "Namespace in the StandardNamespaces. For object counting feature, the AmbientContextDetected field " +
                        "represents the object being counted."
                },

                {
                    tag: "field", name: "ObjectCountReached", xref: "cluster§2.16.8.1.2",
                    details: "This field shall indicate an ObjectCountReached attribute value when the event reporting is " +
                        "triggered by the object counting threshold detection."
                },
                {
                    tag: "field", name: "ObjectCount", xref: "cluster§2.16.8.1.3",
                    details: "This field shall indicate the number of objects detected in the area covered by the sensor when " +
                        "ObjectCountReached attribute is changed to True."
                }
            ]
        },

        {
            tag: "event", name: "AmbientContextDetectEnded", xref: "cluster§2.16.8.2",

            details: "This event shall be generated when the ambient context detection that generated the " +
                "AmbientContextDetectStarted event is removed from AmbientContextType. This end event doesn't " +
                "necessary reflect the end of the actual event progression. For example, both " +
                "AmbientContextDetectStarted and AmbientContextDetectEnded events are used to inform the \"sleeping\" " +
                "event occurrence where AmbientContextDetectEnded event doesn't necessarily indicate the actual end " +
                "of \"sleeping\" action.",

            children: [{
                tag: "field", name: "EventStartTime", xref: "cluster§2.16.8.2.1",
                details: "This field shall indicate the system time stamp or the epoch time stamp when the corresponding " +
                    "AmbientContextDetectStarted Event was generated."
            }]
        },

        {
            tag: "datatype", name: "HoldTimeLimitsStruct", xref: "cluster§2.16.6.1",
            details: "This structure provides information on the server's supported values for the HoldTime attribute.",

            children: [
                {
                    tag: "field", name: "HoldTimeMin", xref: "cluster§2.16.6.1.1",
                    details: "This field shall specify the minimum value supported by the server for the HoldTime attribute, in " +
                        "seconds."
                },

                {
                    tag: "field", name: "HoldTimeMax", xref: "cluster§2.16.6.1.2",
                    details: "This field shall specify the maximum value supported by the server for the HoldTime attribute, in " +
                        "seconds. This field also specifies the maximum duration time that is allowed to be continuously in " +
                        "triggered detection state."
                },

                {
                    tag: "field", name: "HoldTimeDefault", xref: "cluster§2.16.6.1.3",
                    details: "This field shall specify the (manufacturer-determined) default value of the server's HoldTime " +
                        "attribute, in seconds. This is the value that a client who wants to reset the settings to a valid " +
                        "default SHOULD use."
                }
            ]
        },

        {
            tag: "datatype", name: "AmbientContextTypeStruct", xref: "cluster§2.16.6.2",
            details: "This structure provides information on the server's supported values for the Ambient Context type " +
                "attribute.",

            children: [{
                tag: "field", name: "AmbientContextSensed", xref: "cluster§2.16.6.2.1",

                details: "This field specifies the detail ambient context information related to the Boolean detection " +
                    "attributes, HumanActivityDetected, ObjectIdentified, and AudioContextDetected. The detail ambient " +
                    "context information shall be presented by the namespace ID and semantic tag ID of the " +
                    "SemanticTagStruct available from Identified Human Activity Namespace, Identified Object Namespace, " +
                    "Identified Sound Namespace in the StandardNamespaces. When AmbientContextSensed field contains more " +
                    "than one data element, it shall indicate a combined ambient context event instead of unrelated " +
                    "independent ambient context events. For an example, if a joint event exposure of \"Child Fall\" is " +
                    "intended, then the AmbientContextType attribute can be exposed as" +
                    "\n" +
                    "where AmbientContextSensed field contains the SemanticTag data list of \"Child\" tag ID (=2) from " +
                    "IdentifiedObject namespace (=0x4B) and \"Fall\" tag ID (=1) from IdentifiedHumanActivity namespace " +
                    "(=0x49). However, if two independent events exposure is intended, then the AmbientContextType " +
                    "attribute can be exposed as" +
                    "\n" +
                    "where AmbientContextSensed field contains only one individual ambient sensing context. In order to " +
                    "avoid confusion arising from many possible joint permutations, AmbientContextSensed field shall NOT " +
                    "include more than 2 ambient context events."
            }]
        },

        {
            tag: "datatype", name: "ObjectCountConfigStruct", xref: "cluster§2.16.6.3",
            details: "This structure provides information on the server's supported values for the ObjectCountConfig " +
                "attribute.",

            children: [
                {
                    tag: "field", name: "CountingObject", xref: "cluster§2.16.6.3.1",
                    details: "This field shall indicate an object to be detected and counted. If the MfgCode field, in " +
                        "CountingObject, is NULL, it shall be specified by ObjectIdentified namespace ID and its tag number " +
                        "available from the AmbientContextTypeSupported attribute."
                },

                {
                    tag: "field", name: "ObjectCountThreshold", xref: "cluster§2.16.6.3.2",
                    details: "This field shall indicate the minimum number of detected objects to render the true Boolean state of " +
                        "CountThresholdReached attribute."
                }
            ]
        },

        {
            tag: "datatype", name: "PredictedActivityStruct", xref: "cluster§2.16.6.4",
            details: "This data structure provides information on future predicted activities.",

            children: [
                {
                    tag: "field", name: "StartTimestamp", xref: "cluster§2.16.6.4.1",
                    details: "This field shall indicate the predicted start time for the predicted activity."
                },
                {
                    tag: "field", name: "EndTimestamp", xref: "cluster§2.16.6.4.2",
                    details: "This field shall indicate the predicted end time for the predicted activity."
                },
                {
                    tag: "field", name: "AmbientContextType", xref: "cluster§2.16.6.4.3",
                    details: "This field shall indicate the predicted state of the AmbientContextType attribute for the specified " +
                        "time period."
                },
                {
                    tag: "field", name: "CrowdDetected", xref: "cluster§2.16.6.4.4",
                    details: "This field shall indicate the predicted state of the CrowdDetected attribute for the specified time " +
                        "period."
                },
                {
                    tag: "field", name: "CrowdCount", xref: "cluster§2.16.6.4.5",
                    details: "This field shall indicate the predicted value of the CrowdCount attribute for the specified time " +
                        "period."
                },

                {
                    tag: "field", name: "Confidence", xref: "cluster§2.16.6.4.6",
                    details: "This field shall indicate confidence level for the predicted activity state." +
                        "\n" +
                        "A value of 100% shall indicate a complete certainty of the predicted occupancy state, while a 0% " +
                        "value shall indicate no certainty. The algorithm to calculate the likelihood of a predicted " +
                        "occupancy state is not specified and is considered manufacturer specific."
                }
            ]
        }
    ]
});
