/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * > [!NOTE]
 *
 * > This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature flags provide
 *   the sensor modality (or modalities) for later cluster revisions. See Backward Compatibility section.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.3
 */
export enum OccupancySensorType {
    /**
     * Indicates a passive infrared sensor.
     */
    Pir = 0,

    /**
     * Indicates a ultrasonic sensor.
     */
    Ultrasonic = 1,

    /**
     * Indicates a passive infrared and ultrasonic sensor.
     */
    PirAndUltrasonic = 2,

    /**
     * Indicates a physical contact sensor.
     */
    PhysicalContact = 3
}
