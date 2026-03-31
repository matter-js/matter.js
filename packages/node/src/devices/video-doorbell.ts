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
 * @see {@link MatterSpecification.v151.Device} § 16.3
 */
export interface VideoDoorbellDevice extends Identity<typeof VideoDoorbellDeviceDefinition> {}

export namespace VideoDoorbellRequirements {}

export const VideoDoorbellDeviceDefinition = MutableEndpoint({
    name: "VideoDoorbell",
    deviceType: 0x143,
    deviceRevision: 1,
    behaviors: SupportedBehaviors()
});

Object.freeze(VideoDoorbellDeviceDefinition);
export const VideoDoorbellDevice: VideoDoorbellDevice = VideoDoorbellDeviceDefinition;
