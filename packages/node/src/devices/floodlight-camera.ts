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
 * ### Device Type Requirements
 *
 * A Floodlight Camera is composed of other device types listed in this table subject to the conformance column of the
 * table. All devices used in compositions shall adhere to the disambiguation and superset requirements of the System
 * Model. Specifically, please note that the On/Off Light, as listed, is a Superset Device Type as defined by the System
 * Model (see Superset Device Types in MatterCore), and so the rules defined in that section apply to the use of On/Off
 * Light as a superset when composed in this device type. Additional device types not listed in this table may also be
 * included in device compositions.
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
