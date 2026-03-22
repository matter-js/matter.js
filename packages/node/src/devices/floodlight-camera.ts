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

export namespace FloodlightCameraRequirements {
    /**
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        mandatory: {
            /**
             * The OnOffLight device type is required per the Matter specification.
             */
            OnOffLight: { deviceType: 0x100 },

            /**
             * The Camera device type is required per the Matter specification.
             */
            Camera: { deviceType: 0x142 }
        }
    };
}

export const FloodlightCameraDeviceDefinition = MutableEndpoint({
    name: "FloodlightCamera",
    deviceType: 0x144,
    deviceRevision: 1,
    requirements: FloodlightCameraRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(FloodlightCameraDeviceDefinition);
export const FloodlightCameraDevice: FloodlightCameraDevice = FloodlightCameraDeviceDefinition;
