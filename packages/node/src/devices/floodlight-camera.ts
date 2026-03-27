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
 * A Floodlight Camera device is a composite device which combines a camera and a light, primarily used in security use
 * cases.
 *
 * @see {@link MatterSpecification.v142.Device} § 16.2
 */
export interface FloodlightCameraDevice extends Identity<typeof FloodlightCameraDeviceDefinition> {}

export namespace FloodlightCameraRequirements {}

export const FloodlightCameraDeviceDefinition = MutableEndpoint({
    name: "FloodlightCamera",
    deviceType: 0x144,
    deviceRevision: 1,
    behaviors: SupportedBehaviors()
});

Object.freeze(FloodlightCameraDeviceDefinition);
export const FloodlightCameraDevice: FloodlightCameraDevice = FloodlightCameraDeviceDefinition;
