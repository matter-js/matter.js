/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { ModeSelect } from "./mode-select.js";

/**
 * Definitions for the AmbientContextSensing cluster.
 *
 * This server cluster provides an interface to ambient context sensing functionality.
 *
 * > [!NOTE]
 *
 * > NOTE: Support for this cluster is provisional.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 2.16
 */
export declare namespace AmbientContextSensing {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0431;

    /**
     * Textual cluster identifier.
     */
    export const name: "AmbientContextSensing";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v16.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the AmbientContextSensing cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link AmbientContextSensing} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the maximum number of simultaneous multiple ambient context detections supported by the server. If
         * an additional detection event causes the total number of simultaneous detection events to exceed a
         * SimultaneousDetectionLimit, the oldest ambient sensing detection event shall be removed and the latest
         * detection shall be added. The consecutive recurrence of the same ambient context sensing event within the
         * HoldTime duration shall not increase the total number of simultaneous detection events. If simultaneous
         * detection is not supported, then the value shall be set to 1.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.9
         */
        simultaneousDetectionLimit: number;

        /**
         * Indicates the time duration (in seconds) of True state before transitioning its sensing detection state from
         * True to False after the last detection. Low HoldTime value SHOULD be avoided to prevent excessive data
         * reporting for subscription. This attribute is equivalent to the HoldTime attribute of the OccupancySensing
         * cluster. For further information, refer to the HoldTime attribute description of the Occupancy Sensing
         * Cluster. The HoldTime shall be applied individually to each ambient context detection occurrence
         * individually. A more detailed HoldTime implementation example for multiple simultaneous ambient context
         * detections can be found in theMultipleAmbientSensingDetection section.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.10
         */
        holdTime: number;

        /**
         * Indicates the server's limits, and default value, for the HoldTime attribute. This is equivalent to the
         * HoldTimeLimits attribute of the Occupancy Sensing Cluster attribute. For further information, refer to the
         * HoldTimeLimits attribute description of the Occupancy Sensing Cluster.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.11
         */
        holdTimeLimits: HoldTimeLimits;
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature "HumanActivity".
     */
    export interface HumanActivityAttributes {
        /**
         * Indicates the human activity detection state. The detected human activity type can be found from the
         * AmbientContextType attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.1
         */
        humanActivityDetected: boolean;
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature "ObjectIdentification".
     */
    export interface ObjectIdentificationAttributes {
        /**
         * Indicates the occurrence of object identification state. The identified object information can be found from
         * the AmbientContextType attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.2
         */
        objectIdentified: boolean;
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature "SoundIdentification".
     */
    export interface SoundIdentificationAttributes {
        /**
         * Indicates the ambient audio context detection state. The detected audio context type can be found from the
         * AmbientContextType attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.3
         */
        audioContextDetected: boolean;
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature
     * "HumanActivityOrObjectIdentificationOrSoundIdentification".
     */
    export interface HumanActivityOrObjectIdentificationOrSoundIdentificationAttributes {
        /**
         * Indicates the details for the currently observed and detected ambient context.
         *
         * This attribute supports multiple simultaneous ambient context detections. The attribute expression rule is
         * defined in the MultipleAmbientSensingDetection section. The total number of simultaneous ambient context
         * detections is constrained by the SimultaneousDetectionLimit attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.4
         */
        ambientContextType: AmbientContextType[];

        /**
         * Indicates the list of ambient context detection types supported by the server. Each supported ambient context
         * detection type element shall correspond to a feature type supported in the AmbientContextFeatureMap and shall
         * be represented by a SemanticTagStruct from one of the following StandardNamespaces: Identified Human Activity
         * Namespace, Identified Object Namespace, or Identified Sound Namespace.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.5
         */
        ambientContextTypeSupported: ModeSelect.SemanticTag[];
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature
     * "ObjectCountingAndObjectIdentification".
     */
    export interface ObjectCountingAndObjectIdentificationAttributes {
        /**
         * Indicates whether the number count of the specified object is greater or equal to the threshold specified by
         * the ObjectCountThreshold. The object being counted shall be limited to one identified object type and shall
         * be identified by the tag ID from the Identified Object namespace, as presented in the
         * AmbientContextTypeSupported attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.6
         */
        objectCountThresholdReached: boolean;

        /**
         * This attribute shall specify the configuration parameters required to support an object counting feature,
         * including the identification of the object to be detected and counted, as well as the counting threshold
         * value for the ObjectCountThresholdReached detection.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.7
         */
        objectCountConfig: ObjectCountConfig;

        /**
         * This optional attribute shall indicate the number of objects detected in the area covered by the sensor.
         * ObjectCount shall be exposed only when the ObjectCountThresholdReached attribute is true.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.8
         */
        objectCount?: number;
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature "PredictedActivity".
     */
    export interface PredictedActivityAttributes {
        /**
         * Indicates the server's prediction of upcoming changes to the monitored area's ambient context.
         *
         * The value of the StartTimestamp field on each PredictedActivityStruct in this list other than the first shall
         * be greater than the value of the EndTimestamp field on the previous PredictedActivityStruct in this list.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.12
         */
        predictedActivity: PredictedActivity[];
    }

    /**
     * Attributes that may appear in {@link AmbientContextSensing}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the maximum number of simultaneous multiple ambient context detections supported by the server. If
         * an additional detection event causes the total number of simultaneous detection events to exceed a
         * SimultaneousDetectionLimit, the oldest ambient sensing detection event shall be removed and the latest
         * detection shall be added. The consecutive recurrence of the same ambient context sensing event within the
         * HoldTime duration shall not increase the total number of simultaneous detection events. If simultaneous
         * detection is not supported, then the value shall be set to 1.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.9
         */
        simultaneousDetectionLimit: number;

        /**
         * Indicates the time duration (in seconds) of True state before transitioning its sensing detection state from
         * True to False after the last detection. Low HoldTime value SHOULD be avoided to prevent excessive data
         * reporting for subscription. This attribute is equivalent to the HoldTime attribute of the OccupancySensing
         * cluster. For further information, refer to the HoldTime attribute description of the Occupancy Sensing
         * Cluster. The HoldTime shall be applied individually to each ambient context detection occurrence
         * individually. A more detailed HoldTime implementation example for multiple simultaneous ambient context
         * detections can be found in theMultipleAmbientSensingDetection section.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.10
         */
        holdTime: number;

        /**
         * Indicates the server's limits, and default value, for the HoldTime attribute. This is equivalent to the
         * HoldTimeLimits attribute of the Occupancy Sensing Cluster attribute. For further information, refer to the
         * HoldTimeLimits attribute description of the Occupancy Sensing Cluster.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.11
         */
        holdTimeLimits: HoldTimeLimits;

        /**
         * Indicates the human activity detection state. The detected human activity type can be found from the
         * AmbientContextType attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.1
         */
        humanActivityDetected: boolean;

        /**
         * Indicates the occurrence of object identification state. The identified object information can be found from
         * the AmbientContextType attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.2
         */
        objectIdentified: boolean;

        /**
         * Indicates the ambient audio context detection state. The detected audio context type can be found from the
         * AmbientContextType attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.3
         */
        audioContextDetected: boolean;

        /**
         * Indicates the details for the currently observed and detected ambient context.
         *
         * This attribute supports multiple simultaneous ambient context detections. The attribute expression rule is
         * defined in the MultipleAmbientSensingDetection section. The total number of simultaneous ambient context
         * detections is constrained by the SimultaneousDetectionLimit attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.4
         */
        ambientContextType: AmbientContextType[];

        /**
         * Indicates the list of ambient context detection types supported by the server. Each supported ambient context
         * detection type element shall correspond to a feature type supported in the AmbientContextFeatureMap and shall
         * be represented by a SemanticTagStruct from one of the following StandardNamespaces: Identified Human Activity
         * Namespace, Identified Object Namespace, or Identified Sound Namespace.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.5
         */
        ambientContextTypeSupported: ModeSelect.SemanticTag[];

        /**
         * Indicates whether the number count of the specified object is greater or equal to the threshold specified by
         * the ObjectCountThreshold. The object being counted shall be limited to one identified object type and shall
         * be identified by the tag ID from the Identified Object namespace, as presented in the
         * AmbientContextTypeSupported attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.6
         */
        objectCountThresholdReached: boolean;

        /**
         * This attribute shall specify the configuration parameters required to support an object counting feature,
         * including the identification of the object to be detected and counted, as well as the counting threshold
         * value for the ObjectCountThresholdReached detection.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.7
         */
        objectCountConfig: ObjectCountConfig;

        /**
         * This optional attribute shall indicate the number of objects detected in the area covered by the sensor.
         * ObjectCount shall be exposed only when the ObjectCountThresholdReached attribute is true.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.8
         */
        objectCount: number;

        /**
         * Indicates the server's prediction of upcoming changes to the monitored area's ambient context.
         *
         * The value of the StartTimestamp field on each PredictedActivityStruct in this list other than the first shall
         * be greater than the value of the EndTimestamp field on the previous PredictedActivityStruct in this list.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.7.12
         */
        predictedActivity: PredictedActivity[];
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature
     * "HumanActivityOrObjectIdentificationOrSoundIdentification".
     */
    export interface HumanActivityOrObjectIdentificationOrSoundIdentificationEvents {
        /**
         * This event shall be generated when a new ambient context detection is added to the AmbientContextType
         * attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1
         */
        ambientContextDetectStarted: AmbientContextDetectStartedEvent;

        /**
         * This event shall be generated when the ambient context previously reported by an AmbientContextDetectStarted
         * event is removed from the AmbientContextType attribute. This termination event doesn't necessarily reflect or
         * coincide with the end of the actual event progression. For example, while both AmbientContextDetectStarted
         * and AmbientContextDetectEnded events are used to inform the "sleeping" event occurrence, the
         * AmbientContextDetectEnded event doesn't necessarily indicate the actual end of "sleeping" action. The
         * AmbientContextDetectStarted event start time information is provided to facilitate the mapping of the
         * matching the AmbientContextDetectStarted event and the AmbientContextDetectEnded event for event logging
         * purpose. If a server is time-synchronized or capable of supporting both the POSIX time stamp and the system
         * time stamp, a server shall provide the EventStartTimePos data field instead of the EventStartTimeSys data
         * field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.2
         */
        ambientContextDetectEnded: AmbientContextDetectEndedEvent;
    }

    /**
     * {@link AmbientContextSensing} supports these elements if it supports feature
     * "ObjectCountingAndObjectIdentification".
     */
    export interface ObjectCountingAndObjectIdentificationEvents {
        /**
         * This event shall be generated when a new ambient context detection is added to the AmbientContextType
         * attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1
         */
        ambientContextDetectStarted: AmbientContextDetectStartedEvent;

        /**
         * This event shall be generated when the ambient context previously reported by an AmbientContextDetectStarted
         * event is removed from the AmbientContextType attribute. This termination event doesn't necessarily reflect or
         * coincide with the end of the actual event progression. For example, while both AmbientContextDetectStarted
         * and AmbientContextDetectEnded events are used to inform the "sleeping" event occurrence, the
         * AmbientContextDetectEnded event doesn't necessarily indicate the actual end of "sleeping" action. The
         * AmbientContextDetectStarted event start time information is provided to facilitate the mapping of the
         * matching the AmbientContextDetectStarted event and the AmbientContextDetectEnded event for event logging
         * purpose. If a server is time-synchronized or capable of supporting both the POSIX time stamp and the system
         * time stamp, a server shall provide the EventStartTimePos data field instead of the EventStartTimeSys data
         * field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.2
         */
        ambientContextDetectEnded: AmbientContextDetectEndedEvent;
    }

    /**
     * Events that may appear in {@link AmbientContextSensing}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when a new ambient context detection is added to the AmbientContextType
         * attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1
         */
        ambientContextDetectStarted: AmbientContextDetectStartedEvent;

        /**
         * This event shall be generated when the ambient context previously reported by an AmbientContextDetectStarted
         * event is removed from the AmbientContextType attribute. This termination event doesn't necessarily reflect or
         * coincide with the end of the actual event progression. For example, while both AmbientContextDetectStarted
         * and AmbientContextDetectEnded events are used to inform the "sleeping" event occurrence, the
         * AmbientContextDetectEnded event doesn't necessarily indicate the actual end of "sleeping" action. The
         * AmbientContextDetectStarted event start time information is provided to facilitate the mapping of the
         * matching the AmbientContextDetectStarted event and the AmbientContextDetectEnded event for event logging
         * purpose. If a server is time-synchronized or capable of supporting both the POSIX time stamp and the system
         * time stamp, a server shall provide the EventStartTimePos data field instead of the EventStartTimeSys data
         * field.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.2
         */
        ambientContextDetectEnded: AmbientContextDetectEndedEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { humanActivity: true }, attributes: HumanActivityAttributes },
        { flags: { objectIdentification: true }, attributes: ObjectIdentificationAttributes },
        { flags: { soundIdentification: true }, attributes: SoundIdentificationAttributes },
        {
            flags: { humanActivity: true },
            attributes: HumanActivityOrObjectIdentificationOrSoundIdentificationAttributes,
            events: HumanActivityOrObjectIdentificationOrSoundIdentificationEvents
        },
        {
            flags: { objectIdentification: true },
            attributes: HumanActivityOrObjectIdentificationOrSoundIdentificationAttributes,
            events: HumanActivityOrObjectIdentificationOrSoundIdentificationEvents
        },
        {
            flags: { soundIdentification: true },
            attributes: HumanActivityOrObjectIdentificationOrSoundIdentificationAttributes,
            events: HumanActivityOrObjectIdentificationOrSoundIdentificationEvents
        },
        {
            flags: { objectCounting: true, objectIdentification: true },
            attributes: ObjectCountingAndObjectIdentificationAttributes,
            events: ObjectCountingAndObjectIdentificationEvents
        },
        { flags: { predictedActivity: true }, attributes: PredictedActivityAttributes }
    ];

    export type Features = "HumanActivity" | "ObjectCounting" | "ObjectIdentification" | "SoundIdentification" | "PredictedActivity";

    /**
     * These are optional features supported by AmbientContextSensingCluster.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.5
     */
    export enum Feature {
        /**
         * HumanActivity (HA)
         *
         * Supports various human actions and activities classification
         */
        HumanActivity = "HumanActivity",

        /**
         * ObjectCounting (OC)
         *
         * Supports object counting
         */
        ObjectCounting = "ObjectCounting",

        /**
         * ObjectIdentification (OI)
         *
         * Supports object identification
         */
        ObjectIdentification = "ObjectIdentification",

        /**
         * SoundIdentification (AUD)
         *
         * Supports sound identification
         */
        SoundIdentification = "SoundIdentification",

        /**
         * PredictedActivity (PRED)
         *
         * Supports predicting various human actions and activities
         */
        PredictedActivity = "PredictedActivity"
    }

    /**
     * This structure provides information on the server's supported values for the HoldTime attribute.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.1
     */
    export class HoldTimeLimits {
        constructor(values?: Partial<HoldTimeLimits>);

        /**
         * This field shall specify the minimum value supported by the server for the HoldTime attribute, in seconds.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.1.1
         */
        holdTimeMin?: number;

        /**
         * This field shall specify the maximum value supported by the server for the HoldTime attribute, in seconds.
         * This field also specifies the maximum duration time that is allowed to be continuously in triggered detection
         * state.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.1.2
         */
        holdTimeMax?: number;

        /**
         * This field shall specify the (manufacturer-determined) default value of the server's HoldTime attribute, in
         * seconds. This is the value that a client who wants to reset the settings to a valid default SHOULD use.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.1.3
         */
        holdTimeDefault?: number;
    }

    /**
     * This structure provides information on the server's supported values for the Ambient Context type attribute.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.2
     */
    export class AmbientContextType {
        constructor(values?: Partial<AmbientContextType>);

        /**
         * This field specifies the detail ambient context information associated with the Boolean detection attributes,
         * HumanActivityDetected, ObjectIdentified, and AudioContextDetected. The detail ambient context information
         * shall be represented by the namespace ID and semantic tag ID of the SemanticTagStruct available from
         * Identified Human Activity, Identified Object, and Identified Sound namespaces in the StandardNamespaces. When
         * AmbientContextSensed field contains multiple data elements, it shall indicate a single combined ambient
         * context event rather than unrelated independent ambient context events. For an example, if a joint event
         * exposure of "Child Fall" is intended, then the AmbientContextType attribute can be exposed as follows:
         *
         * where AmbientContextSensed field contains the SemanticTag data list of "Child" tag ID (=2) from
         * IdentifiedObject namespace (=0x4B) and "Fall" tag ID (=1) from IdentifiedHumanActivity namespace (=0x49).
         * However, if two independent events exposure is intended, then the AmbientContextType attribute can be exposed
         * as follows:
         *
         * where each AmbientContextSensed field contains only one individual ambient sensing context. In order to
         * prevent confusion arising from excessive joint permutations, AmbientContextSensed field shall NOT include
         * more than two ambient context events.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.2.1
         */
        ambientContextSensed?: ModeSelect.SemanticTag[];
    }

    /**
     * This structure provides information on the server's supported values for the ObjectCountConfig attribute.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.3
     */
    export class ObjectCountConfig {
        constructor(values?: Partial<ObjectCountConfig>);

        /**
         * This field shall indicate the object to be detected and counted. If the MfgCode field in CountingObject is
         * NULL, the object shall be specified by ObjectIdentified namespace ID and its tag ID available from the
         * AmbientContextTypeSupported attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.3.1
         */
        countingObject?: ModeSelect.SemanticTag;

        /**
         * This field shall indicate the minimum number of detected objects to render the true Boolean state of
         * CountThresholdReached attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.3.2
         */
        objectCountThreshold?: number;
    }

    /**
     * This data structure provides information on future predicted activities.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4
     */
    export class PredictedActivity {
        constructor(values?: Partial<PredictedActivity>);

        /**
         * This field shall indicate the predicted start time for the predicted activity.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4.1
         */
        startTimestamp?: number;

        /**
         * This field shall indicate the predicted end time for the predicted activity.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4.2
         */
        endTimestamp?: number;

        /**
         * This field shall indicate the predicted state of the AmbientContextType attribute for the specified time
         * period.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4.3
         */
        ambientContextType?: ModeSelect.SemanticTag[];

        /**
         * This field shall indicate the predicted state of the CrowdDetected attribute for the specified time period.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4.4
         */
        crowdDetected?: boolean;

        /**
         * This field shall indicate the predicted value of the CrowdCount attribute for the specified time period.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4.5
         */
        crowdCount?: number;

        /**
         * This field shall indicate confidence level for the predicted activity state.
         *
         * A value of 100% shall indicate a complete certainty of the predicted occupancy state, while a 0% value shall
         * indicate no certainty. The algorithm to calculate the likelihood of a predicted occupancy state is not
         * specified and is considered manufacturer specific.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.6.4.6
         */
        confidence?: number;
    }

    /**
     * This event shall be generated when a new ambient context detection is added to the AmbientContextType attribute.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1
     */
    export class AmbientContextDetectStartedEvent {
        constructor(values?: Partial<AmbientContextDetectStartedEvent>);

        /**
         * This field shall indicate the detail ambient context information that triggers this event reporting. The
         * detail ambient context information shall be represented by the namespace ID and semantic tag ID available
         * from Identified Human Activity, Identified Object, and Identified Sound namespaces in the StandardNamespaces.
         * For the object counting feature, the AmbientContextDetected field shall represent the object being counted.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1.1
         */
        ambientContextDetected?: AmbientContextType;

        /**
         * This field shall indicate an ObjectCountThresholdReached attribute value when the event reporting is
         * triggered by the object counting threshold detection.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1.2
         */
        objectCountThresholdReached?: boolean;

        /**
         * This field shall indicate the number of objects detected in the area covered by the sensor when
         * ObjectCountThresholdReached attribute is changed to True.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.1.3
         */
        objectCount?: number;
    }

    /**
     * This event shall be generated when the ambient context previously reported by an AmbientContextDetectStarted
     * event is removed from the AmbientContextType attribute. This termination event doesn't necessarily reflect or
     * coincide with the end of the actual event progression. For example, while both AmbientContextDetectStarted and
     * AmbientContextDetectEnded events are used to inform the "sleeping" event occurrence, the
     * AmbientContextDetectEnded event doesn't necessarily indicate the actual end of "sleeping" action. The
     * AmbientContextDetectStarted event start time information is provided to facilitate the mapping of the matching
     * the AmbientContextDetectStarted event and the AmbientContextDetectEnded event for event logging purpose. If a
     * server is time-synchronized or capable of supporting both the POSIX time stamp and the system time stamp, a
     * server shall provide the EventStartTimePos data field instead of the EventStartTimeSys data field.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.2
     */
    export class AmbientContextDetectEndedEvent {
        constructor(values?: Partial<AmbientContextDetectEndedEvent>);

        /**
         * This field shall indicate the POSIX time stamp when the corresponding AmbientContextDetectStarted Event was
         * generated.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.16.8.2.1
         */
        eventStartTimePos?: number | bigint;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link AmbientContextSensing}.
     */
    export const Cluster: ClusterType.WithCompat<typeof AmbientContextSensing, AmbientContextSensing>;

    /**
     * @deprecated Use {@link AmbientContextSensing}.
     */
    export const Complete: typeof AmbientContextSensing;

    export const Typing: AmbientContextSensing;
}

/**
 * @deprecated Use {@link AmbientContextSensing}.
 */
export declare const AmbientContextSensingCluster: typeof AmbientContextSensing;

export interface AmbientContextSensing extends ClusterTyping {
    Attributes: AmbientContextSensing.Attributes;
    Events: AmbientContextSensing.Events;
    Features: AmbientContextSensing.Features;
    Components: AmbientContextSensing.Components;
}
