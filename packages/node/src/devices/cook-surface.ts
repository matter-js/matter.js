/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import {
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Cook Surface device type represents a heating object on a cooktop or other similar device. It shall only be used
 * when composed as part of another device type.
 *
 * ### Cluster Restrictions
 *
 * #### On/Off Cluster (Server) Clarifications
 *
 * The OffOnly feature is required for the On/Off cluster in this device type due to safety requirements.
 *
 * ### Element Requirements
 *
 * Whenever the Temperature Control cluster is included on a Cook Surface, the Temperature Control cluster shall use the
 * TemperatureLevel feature rather than the TemperatureNumber feature. This is because users are usually in the loop for
 * controlling the temperature of the food being cooked within a heated cooking utensil. For example, while the surface
 * temperature of a cooktop may be significantly above 100°C, an open pot of water will never exceed the boiling point
 * of water as all excess energy transmitted is spent on the water's phase change to steam and the liquid within the pot
 * reaches an equilibrium temperature.
 *
 * @see {@link MatterSpecification.v16.Device} § 13.7
 */
export interface CookSurfaceDevice extends Identity<typeof CookSurfaceDeviceDefinition> {}

export namespace CookSurfaceRequirements {
    /**
     * The OnOff cluster is optional per the Matter specification.
     *
     * This version of {@link OnOffServer} is specialized per the specification.
     */
    export const OnOffServer = BaseOnOffServer.with("OffOnly");

    /**
     * The TemperatureControl cluster is optional per the Matter specification.
     *
     * This version of {@link TemperatureControlServer} is specialized per the specification.
     */
    export const TemperatureControlServer = BaseTemperatureControlServer.with("TemperatureLevel");

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        optional: {
            OnOff: OnOffServer,
            TemperatureControl: TemperatureControlServer,
            TemperatureMeasurement: TemperatureMeasurementServer
        }
    };
}

export const CookSurfaceDeviceDefinition = MutableEndpoint({
    name: "CookSurface",
    deviceType: 0x77,
    deviceRevision: 2,
    requirements: CookSurfaceRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(CookSurfaceDeviceDefinition);
export const CookSurfaceDevice: CookSurfaceDevice = CookSurfaceDeviceDefinition;
