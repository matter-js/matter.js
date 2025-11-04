/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyEvseServer as BaseEnergyEvseServer } from "../behaviors/energy-evse/EnergyEvseServer.js";
import { EnergyEvseModeServer as BaseEnergyEvseModeServer } from "../behaviors/energy-evse-mode/EnergyEvseModeServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * An EVSE (Electric Vehicle Supply Equipment) is a device that allows an EV (Electric Vehicle) to be connected to the
 * mains electricity supply to allow it to be charged (or discharged in case of Vehicle to Grid / Vehicle to Home
 * applications).
 *
 * @see {@link MatterSpecification.v142.Device} § 14.1
 */
export interface EnergyEvseDevice extends Identity<typeof EnergyEvseDeviceDefinition> {}

export namespace EnergyEvseRequirements {
    /**
     * The EnergyEvse cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link EnergyEvseServer} for convenience.
     */
    export const EnergyEvseServer = BaseEnergyEvseServer;

    /**
     * The EnergyEvseMode cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link EnergyEvseModeServer} for convenience.
     */
    export const EnergyEvseModeServer = BaseEnergyEvseModeServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

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
        mandatory: { EnergyEvse: EnergyEvseServer, EnergyEvseMode: EnergyEvseModeServer },
        optional: { Identify: IdentifyServer, TemperatureMeasurement: TemperatureMeasurementServer }
    };
}

export const EnergyEvseDeviceDefinition = MutableEndpoint({
    name: "EnergyEvse",
    deviceType: 0x50c,
    deviceRevision: 2,
    requirements: EnergyEvseRequirements,
    behaviors: SupportedBehaviors(
        EnergyEvseRequirements.server.mandatory.EnergyEvse,
        EnergyEvseRequirements.server.mandatory.EnergyEvseMode
    )
});

Object.freeze(EnergyEvseDeviceDefinition);
export const EnergyEvseDevice: EnergyEvseDevice = EnergyEvseDeviceDefinition;
