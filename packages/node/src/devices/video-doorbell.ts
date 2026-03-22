/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Video Doorbell device is a composite device which combines a camera and a switch to provide a doorbell with Video
 * and Audio streaming.
 *
 * @see {@link MatterSpecification.v142.Device} § 16.3
 */
export interface VideoDoorbellDevice extends Identity<typeof VideoDoorbellDeviceDefinition> {}

export namespace VideoDoorbellRequirements {
    /**
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        mandatory: {
            /**
             * The Camera device type is required per the Matter specification.
             */
            Camera: { deviceType: 0x142 },

            /**
             * The Doorbell device type is required per the Matter specification.
             */
            Doorbell: { deviceType: 0x148 }
        }
    };
}

export const VideoDoorbellDeviceDefinition = MutableEndpoint({
    name: "VideoDoorbell",
    deviceType: 0x143,
    deviceRevision: 1,
    requirements: VideoDoorbellRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(VideoDoorbellDeviceDefinition);
export const VideoDoorbellDevice: VideoDoorbellDevice = VideoDoorbellDeviceDefinition;
