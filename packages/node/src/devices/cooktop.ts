/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A cooktop is a cooking surface that heats food either by transferring currents from an electromagnetic field located
 * below the glass surface directly to the magnetic induction cookware placed above or through traditional gas or
 * electric burners.
 *
 * ### Device Type Requirements
 *
 * A Cooktop shall be composed of zero or more endpoints with the Cook Surface device type as defined by the conformance
 * below.
 *
 * A cooktop falls under strict regulatory control in some regions. One of these restrictions for non-induction cooktops
 * is that the only remote commands available are to turn off the entire device or read out the temperature setting.
 * This one scenario for allowed remote operation is specifically to address the use case of a device that is left on
 * after a user leaves the home. The individual cooking surfaces cannot be shut off. This leads to a model of a cooktop
 * that has 0 controllable cooking surfaces. For example, the requirements that exist for a gas cooktop would result in
 * zero Cook Surface instances being exposed.
 *
 * If the Cooktop contains more than one instance of a Cook Surface, those instances shall include a semantic tag in the
 * TagList attribute of the Descriptor cluster to disambiguate the cook surface, e.g., "front", "left", or "back". Such
 * a semantic tag shall be from the Common namespaces.
 *
 * ### Cluster Restrictions
 *
 * #### On/Off Cluster (Server) Clarifications
 *
 * The OffOnly feature is required for the On/Off cluster in this device type due to safety requirements.
 *
 * @see {@link MatterSpecification.v16.Device} § 13.8
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

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = { optional: { CookSurface: { deviceType: 0x77, constraint: "min 1" } } };
}

export const CooktopDeviceDefinition = MutableEndpoint({
    name: "Cooktop",
    deviceType: 0x78,
    deviceRevision: 1,
    requirements: CooktopRequirements,
    behaviors: SupportedBehaviors(CooktopRequirements.server.mandatory.OnOff)
});

Object.freeze(CooktopDeviceDefinition);
export const CooktopDevice: CooktopDevice = CooktopDeviceDefinition;
