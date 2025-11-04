/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { SwitchServer as BaseSwitchServer } from "../behaviors/switch/SwitchServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance for the Generic Switch device type.
 *
 * GenericSwitchDevice requires Switch cluster but Switch is not added by default because you must select the features
 * your device supports. You can add manually using GenericSwitchDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 6.6
 */
export interface GenericSwitchDevice extends Identity<typeof GenericSwitchDeviceDefinition> {}

export namespace GenericSwitchRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Switch cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link SwitchServer} for convenience.
     */
    export const SwitchServer = BaseSwitchServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer, Switch: SwitchServer } };
}

export const GenericSwitchDeviceDefinition = MutableEndpoint({
    name: "GenericSwitch",
    deviceType: 0xf,
    deviceRevision: 3,
    requirements: GenericSwitchRequirements,
    behaviors: SupportedBehaviors(GenericSwitchRequirements.server.mandatory.Identify)
});

Object.freeze(GenericSwitchDeviceDefinition);
export const GenericSwitchDevice: GenericSwitchDevice = GenericSwitchDeviceDefinition;
