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
                { tag: "field", name: "PRED", details: "Supports predicting various human actions and activities" }
            ]
        },

        {
            tag: "attribute", name: "HumanActivityDetected", xref: "cluster§2.16.7.1",
            details: "Indicates the human activity detection state. The detected human activity type can be found from the " +
                "AmbientContextType attribute."
        },
        {
            tag: "attribute", name: "ObjectIdentified", xref: "cluster§2.16.7.2",
            details: "Indicates the occurrence of object identification state. The identified object information can be " +
                "found from the AmbientContextType attribute."
        },
        {
            tag: "attribute", name: "AudioContextDetected", xref: "cluster§2.16.7.3",
            details: "Indicates the ambient audio context detection state. The detected audio context type can be found " +
                "from the AmbientContextType attribute."
        },

        {
            tag: "attribute", name: "AmbientContextType", xref: "cluster§2.16.7.4",
            details: "Indicates the details for the currently observed and detected ambient context." +
                "\n" +
                "This attribute supports multiple simultaneous ambient context detections. The attribute expression " +
                "rule is defined in the MultipleAmbientSensingDetection section. The total number of simultaneous " +
                "ambient context detections is constrained by the SimultaneousDetectionLimit attribute."
        },

        {
            tag: "attribute", name: "AmbientContextTypeSupported", xref: "cluster§2.16.7.5",
            details: "Indicates the list of ambient context detection types supported by the server. Each supported " +
                "ambient context detection type element shall correspond to a feature type supported in the " +
                "AmbientContextFeatureMap and shall be represented by a SemanticTagStruct from one of the following " +
                "StandardNamespaces: Identified Human Activity Namespace, Identified Object Namespace, or Identified " +
                "Sound Namespace."
        },

        {
            tag: "attribute", name: "ObjectCountThresholdReached", xref: "cluster§2.16.7.6",
            details: "Indicates whether the number count of the specified object is greater or equal to the threshold " +
                "specified by the ObjectCountThreshold. The object being counted shall be limited to one identified " +
                "object type and shall be identified by the tag ID from the Identified Object namespace, as presented " +
                "in the AmbientContextTypeSupported attribute."
        },

        {
            tag: "attribute", name: "ObjectCountConfig", xref: "cluster§2.16.7.7",
            details: "This attribute shall specify the configuration parameters required to support an object counting " +
                "feature, including the identification of the object to be detected and counted, as well as the " +
                "counting threshold value for the ObjectCountThresholdReached detection."
        },

        {
            tag: "attribute", name: "ObjectCount", xref: "cluster§2.16.7.8",
            details: "This optional attribute shall indicate the number of objects detected in the area covered by the " +
                "sensor. ObjectCount shall be exposed only when the ObjectCountThresholdReached attribute is true."
        },

        {
            tag: "attribute", name: "SimultaneousDetectionLimit", xref: "cluster§2.16.7.9",

            details: "Indicates the maximum number of simultaneous multiple ambient context detections supported by the " +
                "server. If an additional detection event causes the total number of simultaneous detection events to " +
                "exceed a SimultaneousDetectionLimit, the oldest ambient sensing detection event shall be removed and " +
                "the latest detection shall be added. The consecutive recurrence of the same ambient context sensing " +
                "event within the HoldTime duration shall not increase the total number of simultaneous detection " +
                "events. If simultaneous detection is not supported, then the value shall be set to 1."
        },

        {
            tag: "attribute", name: "HoldTime", xref: "cluster§2.16.7.10",

            details: "Indicates the time duration (in seconds) of True state before transitioning its sensing detection " +
                "state from True to False after the last detection. Low HoldTime value SHOULD be avoided to prevent " +
                "excessive data reporting for subscription. This attribute is equivalent to the HoldTime attribute of " +
                "the OccupancySensing cluster. For further information, refer to the HoldTime attribute description " +
                "of the Occupancy Sensing Cluster. The HoldTime shall be applied individually to each ambient context " +
                "detection occurrence individually. A more detailed HoldTime implementation example for multiple " +
                "simultaneous ambient context detections can be found in theMultipleAmbientSensingDetection section."
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
            details: "This event shall be generated when a new ambient context detection is added to the " +
                "AmbientContextType attribute.",

            children: [
                {
                    tag: "field", name: "AmbientContextDetected", xref: "cluster§2.16.8.1.1",
                    details: "This field shall indicate the detail ambient context information that triggers this event reporting. " +
                        "The detail ambient context information shall be represented by the namespace ID and semantic tag ID " +
                        "available from Identified Human Activity, Identified Object, and Identified Sound namespaces in the " +
                        "StandardNamespaces. For the object counting feature, the AmbientContextDetected field shall " +
                        "represent the object being counted."
                },

                {
                    tag: "field", name: "ObjectCountThresholdReached", xref: "cluster§2.16.8.1.2",
                    details: "This field shall indicate an ObjectCountThresholdReached attribute value when the event reporting is " +
                        "triggered by the object counting threshold detection."
                },
                {
                    tag: "field", name: "ObjectCount", xref: "cluster§2.16.8.1.3",
                    details: "This field shall indicate the number of objects detected in the area covered by the sensor when " +
                        "ObjectCountThresholdReached attribute is changed to True."
                }
            ]
        },

        {
            tag: "event", name: "AmbientContextDetectEnded", xref: "cluster§2.16.8.2",

            details: "This event shall be generated when the ambient context previously reported by an " +
                "AmbientContextDetectStarted event is removed from the AmbientContextType attribute. This termination " +
                "event doesn't necessarily reflect or coincide with the end of the actual event progression. For " +
                "example, while both AmbientContextDetectStarted and AmbientContextDetectEnded events are used to " +
                "inform the \"sleeping\" event occurrence, the AmbientContextDetectEnded event doesn't necessarily " +
                "indicate the actual end of \"sleeping\" action. The AmbientContextDetectStarted event start time " +
                "information is provided to facilitate the mapping of the matching the AmbientContextDetectStarted " +
                "event and the AmbientContextDetectEnded event for event logging purpose. If a server is " +
                "time-synchronized or capable of supporting both the POSIX time stamp and the system time stamp, a " +
                "server shall provide the EventStartTimePos data field instead of the EventStartTimeSys data field.",

            children: [{
                tag: "field", name: "EventStartTimePos", xref: "cluster§2.16.8.2.1",
                details: "This field shall indicate the POSIX time stamp when the corresponding AmbientContextDetectStarted " +
                    "Event was generated."
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

                details: "This field specifies the detail ambient context information associated with the Boolean detection " +
                    "attributes, HumanActivityDetected, ObjectIdentified, and AudioContextDetected. The detail ambient " +
                    "context information shall be represented by the namespace ID and semantic tag ID of the " +
                    "SemanticTagStruct available from Identified Human Activity, Identified Object, and Identified Sound " +
                    "namespaces in the StandardNamespaces. When AmbientContextSensed field contains multiple data " +
                    "elements, it shall indicate a single combined ambient context event rather than unrelated " +
                    "independent ambient context events. For an example, if a joint event exposure of \"Child Fall\" is " +
                    "intended, then the AmbientContextType attribute can be exposed as follows:" +
                    "\n" +
                    "where AmbientContextSensed field contains the SemanticTag data list of \"Child\" tag ID (=2) from " +
                    "IdentifiedObject namespace (=0x4B) and \"Fall\" tag ID (=1) from IdentifiedHumanActivity namespace " +
                    "(=0x49). However, if two independent events exposure is intended, then the AmbientContextType " +
                    "attribute can be exposed as follows:" +
                    "\n" +
                    "where each AmbientContextSensed field contains only one individual ambient sensing context. In order " +
                    "to prevent confusion arising from excessive joint permutations, AmbientContextSensed field shall NOT " +
                    "include more than two ambient context events."
            }]
        },

        {
            tag: "datatype", name: "ObjectCountConfigStruct", xref: "cluster§2.16.6.3",
            details: "This structure provides information on the server's supported values for the ObjectCountConfig " +
                "attribute.",

            children: [
                {
                    tag: "field", name: "CountingObject", xref: "cluster§2.16.6.3.1",
                    details: "This field shall indicate the object to be detected and counted. If the MfgCode field in " +
                        "CountingObject is NULL, the object shall be specified by ObjectIdentified namespace ID and its tag " +
                        "ID available from the AmbientContextTypeSupported attribute."
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
