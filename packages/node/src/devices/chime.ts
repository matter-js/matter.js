/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ChimeServer as BaseChimeServer } from "../behaviors/chime/ChimeServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Chime device is a device which can play from a range of pre installed sounds and is typically used with a Doorbell,
 * Audio Doorbell, or Video Doorbell.
 *
 * ### Device Type Requirements
 *
 * A chime may expose elements of its functionality through additional device types on different endpoints. All devices
 * used in compositions shall adhere to the disambiguation requirements of the System Model. Other device types, not
 * explicitly listed in the table, may also be included in device compositions but are not considered part of the core
 * functionality of the device.
 *
 * Chimes having sound actuators may compose a child endpoint with Speaker device type to specifically allow control of
 * the volume or mute/unmute state of sound generation.
 *
 * When a Speaker device is composed under a chime, the following treatment applies:
 *
 *   - While different mechanisms could generate the sound, with more or less fidelity, the requirement is that the
 *     standard definition for muting and sound level control of the Speaker device type shall apply. This holds even if
 *     the sound generator does not actually employ a real "speaker" element (such as tuned bars being struck), whose
 *     actuation shall be gated by the On/Off Cluster on the Speaker endpoint.
 *
 *   - Other clusters in the Speaker device type would also apply with the requisite data dependencies against the
 *     functionality of sound output.
 *
 *   - Other modalities of chime actuation, such as visual/light feedback SHOULD NOT be impacted by the state of the
 *     clusters in the Speaker endpoint, which are reserved for sound feedback.
 *
 *     > [!NOTE]
 *
 *     > NOTE: The Chime device type also includes the Chime server cluster, which has an Enabled attribute. This
 *       attribute completely disables the Chime, which also means that any visual indicators would also be disabled,
 *       and also acts as a form of global muting. For example, if the On/Off cluster of the child Speaker device is set
 *       to from On (not muted) to Off (muted) and the Chime cluster's Enabled attribute is already set to true, the
 *       Enabled attribute would not change state. Similarly the Chime cluster's Enabled attribute changing would not
 *       change the child Speaker's On/Off cluster via data dependency if there are other modalities to allow a user to
 *       determine Chime actuation (e.g. visual indicators).
 *
 * @see {@link MatterSpecification.v16.Device} § 16.7
 */
export interface ChimeDevice extends Identity<typeof ChimeDeviceDefinition> {}

export namespace ChimeRequirements {
    /**
     * The Chime cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChimeServer} for convenience.
     */
    export const ChimeServer = BaseChimeServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Chime: ChimeServer }, optional: { Identify: IdentifyServer } };
}

export const ChimeDeviceDefinition = MutableEndpoint({
    name: "Chime",
    deviceType: 0x146,
    deviceRevision: 2,
    requirements: ChimeRequirements,
    behaviors: SupportedBehaviors(ChimeRequirements.server.mandatory.Chime)
});

Object.freeze(ChimeDeviceDefinition);
export const ChimeDevice: ChimeDevice = ChimeDeviceDefinition;
