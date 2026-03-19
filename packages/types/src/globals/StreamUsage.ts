/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * This data type provides an enumeration of the different usages of streams supported by the camera. This
 * categorization indicates the use-case of a specific stream and thus factors into its priority in terms of resource
 * allocation by the camera. For example, a Recording stream may be given higher priority than a LiveView stream to
 * maintain a higher quality in terms of resolution, bitrate, etc.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.1
 */
export enum StreamUsage {
    /**
     * Internal video stream.
     *
     * Stream is used for internal purposes, e.g., robotic vacuum using camera for navigation. While the primary
     * use-case for a stream of this usage-type is for an internal purpose, it may be re-used for other camera
     * functions, e.g., LiveView. However, this stream shall not be modified.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.1.1
     */
    Internal = 0,

    /**
     * Stream for recording clips.
     *
     * Stream is used for clip upload and archival.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.1.2
     */
    Recording = 1,

    /**
     * Stream for analysis and entity detection.
     *
     * Stream is used for automated audio/video analysis without archival.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.1.3
     */
    Analysis = 2,

    /**
     * Stream for liveview.
     *
     * Stream is used for live watching through client devices.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.1.4
     */
    LiveView = 3
}
