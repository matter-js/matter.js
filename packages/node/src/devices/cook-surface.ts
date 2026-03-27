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
 * @see {@link MatterSpecification.v142.Device} § 13.7
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
        },
        mandatory: {}
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
