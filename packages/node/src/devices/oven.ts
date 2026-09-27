/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An oven represents a device that contains one or more cabinets, and optionally a single cooktop, that are all capable
 * of heating food. Examples of consumer products implementing this device type include ovens, wall ovens, convection
 * ovens, etc.
 *
 * ### Oven Architecture
 *
 * An oven is always defined via endpoint composition. See Section 13.9.6, "Device Type Requirements" for more details.
 *
 * An example of an oven with two cabinets (one above the other) and a cooktop (with two cook surfaces) is illustrated
 * below.
 *
 * ### Device Type Requirements
 *
 * An Oven shall be composed of at least one endpoint with Temperature Controlled Cabinet device type. There may be more
 * endpoints with other device types existing in the Oven. Note that any instance of the TemperatureControl cluster on
 * an endpoint is scoped to the device type on that endpoint, and not the whole node.
 *
 * If the Oven contains more than one instance of a Temperature Controlled Cabinet, those instances shall include a
 * semantic tag in the TagList attribute of the Descriptor cluster to disambiguate the cabinet, e.g., "Top" or "Bottom".
 * Such a semantic tag shall be from the defined Common Position namespaces.
 *
 * Regional restrictions and safety regulations may dictate which aspects of a Temperature Controlled Cabinet may be
 * remotely accessible. In such cases, clusters exposed by an instance of a Temperature Controlled Cabinet may have
 * limitations on what commands are supported or what attributes are mutable.
 *
 * @see {@link MatterSpecification.v16.Device} § 13.9
 */
export interface OvenDevice extends Identity<typeof OvenDeviceDefinition> {}

export namespace OvenRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { Identify: IdentifyServer } };
}

export const OvenDeviceDefinition = MutableEndpoint({
    name: "Oven",
    deviceType: 0x7b,
    deviceRevision: 2,
    requirements: OvenRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(OvenDeviceDefinition);
export const OvenDevice: OvenDevice = OvenDeviceDefinition;
