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
 * @see {@link MatterSpecification.v16.Device} § 16.2
 */
export interface FloodlightCameraDevice extends Identity<typeof FloodlightCameraDeviceDefinition> {}

export namespace FloodlightCameraRequirements {
    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        mandatory: {
            OnOffLight: { deviceType: 0x100, constraint: "min 1" },
            Camera: { deviceType: 0x142, constraint: "1" }
        }
    };
}

export const FloodlightCameraDeviceDefinition = MutableEndpoint({
    name: "FloodlightCamera",
    deviceType: 0x144,
    deviceRevision: 1,
    behaviors: SupportedBehaviors()
});

Object.freeze(FloodlightCameraDeviceDefinition);
export const FloodlightCameraDevice: FloodlightCameraDevice = FloodlightCameraDeviceDefinition;
