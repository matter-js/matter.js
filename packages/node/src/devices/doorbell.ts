/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { SwitchServer as BaseSwitchServer } from "../behaviors/switch/SwitchServer.js";
import { ChimeBehavior as BaseChimeBehavior } from "../behaviors/chime/ChimeBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Doorbell device is a switch which when pressed usually causes a Chime to activate.
 *
 * DoorbellDevice requires Switch cluster but Switch is not added by default because you must select the features your
 * device supports. You can add manually using DoorbellDevice.with().
 *
 * @see {@link MatterSpecification.v151.Device} § 16.9
 */
export interface DoorbellDevice extends Identity<typeof DoorbellDeviceDefinition> {}

export namespace DoorbellRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Switch cluster is required by the Matter specification.
     *
     * This version of {@link SwitchServer} is specialized per the specification.
     */
    export const SwitchServer = BaseSwitchServer.with("MomentarySwitch");

    /**
     * The Chime cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChimeBehavior} for convenience.
     */
    export const ChimeBehavior = BaseChimeBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer, Switch: SwitchServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { mandatory: { Chime: ChimeBehavior } };
}

export const DoorbellDeviceDefinition = MutableEndpoint({
    name: "Doorbell",
    deviceType: 0x148,
    deviceRevision: 2,
    requirements: DoorbellRequirements,
    behaviors: SupportedBehaviors(DoorbellRequirements.server.mandatory.Identify)
});

Object.freeze(DoorbellDeviceDefinition);
export const DoorbellDevice: DoorbellDevice = DoorbellDeviceDefinition;
