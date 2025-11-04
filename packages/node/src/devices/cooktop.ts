/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A cooktop is a cooking surface that heats food either by transferring currents from an electromagnetic field located
 * below the glass surface directly to the magnetic induction cookware placed above or through traditional gas or
 * electric burners.
 *
 * @see {@link MatterSpecification.v142.Device} § 13.8
 */
export interface CooktopDevice extends Identity<typeof CooktopDeviceDefinition> {}

export namespace CooktopRequirements {
    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * This version of {@link OnOffServer} is specialized per the specification.
     */
    export const OnOffServer = BaseOnOffServer.with("OffOnly");

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { OnOff: OnOffServer }, optional: { Identify: IdentifyServer } };
}

export const CooktopDeviceDefinition = MutableEndpoint({
    name: "Cooktop",
    deviceType: 0x78,
    deviceRevision: 1,
    requirements: CooktopRequirements,
    behaviors: SupportedBehaviors(CooktopRequirements.server.mandatory.OnOff)
});

export const CooktopDevice: CooktopDevice = CooktopDeviceDefinition;
