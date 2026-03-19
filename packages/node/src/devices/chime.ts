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
 * A Chime device is a device which can play from a range of pre installed sounds and is usually paired with a doorbell.
 *
 * @see {@link MatterSpecification.v142.Device} § 16.7
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
    deviceRevision: 1,
    requirements: ChimeRequirements,
    behaviors: SupportedBehaviors(ChimeRequirements.server.mandatory.Chime)
});

Object.freeze(ChimeDeviceDefinition);
export const ChimeDevice: ChimeDevice = ChimeDeviceDefinition;
