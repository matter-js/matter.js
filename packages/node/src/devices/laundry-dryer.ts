/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    OperationalStateServer as BaseOperationalStateServer
} from "../behaviors/operational-state/OperationalStateServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    LaundryWasherModeServer as BaseLaundryWasherModeServer
} from "../behaviors/laundry-washer-mode/LaundryWasherModeServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import {
    LaundryDryerControlsServer as BaseLaundryDryerControlsServer
} from "../behaviors/laundry-dryer-controls/LaundryDryerControlsServer.js";
import {
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Laundry Dryer represents a device that is capable of drying laundry items.
 *
 * @see {@link MatterSpecification.v142.Device} § 13.6
 */
export interface LaundryDryerDevice extends Identity<typeof LaundryDryerDeviceDefinition> {}

export namespace LaundryDryerRequirements {
    /**
     * The OperationalState cluster is required by the Matter specification.
     *
     * This version of {@link OperationalStateServer} is specialized per the specification.
     */
    export const OperationalStateServer = BaseOperationalStateServer
        .alter({ events: { operationCompletion: { optional: false } } });

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The LaundryWasherMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LaundryWasherModeServer} for convenience.
     */
    export const LaundryWasherModeServer = BaseLaundryWasherModeServer;

    /**
     * The OnOff cluster is optional per the Matter specification.
     *
     * This version of {@link OnOffServer} is specialized per the specification.
     */
    export const OnOffServer = BaseOnOffServer.with("DeadFrontBehavior");

    /**
     * The LaundryDryerControls cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LaundryDryerControlsServer} for convenience.
     */
    export const LaundryDryerControlsServer = BaseLaundryDryerControlsServer;

    /**
     * The TemperatureControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureControlServer} for convenience.
     */
    export const TemperatureControlServer = BaseTemperatureControlServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { OperationalState: OperationalStateServer },

        optional: {
            Identify: IdentifyServer,
            LaundryWasherMode: LaundryWasherModeServer,
            OnOff: OnOffServer,
            LaundryDryerControls: LaundryDryerControlsServer,
            TemperatureControl: TemperatureControlServer
        }
    };
}

export const LaundryDryerDeviceDefinition = MutableEndpoint({
    name: "LaundryDryer",
    deviceType: 0x7c,
    deviceRevision: 2,
    requirements: LaundryDryerRequirements,
    behaviors: SupportedBehaviors(LaundryDryerRequirements.server.mandatory.OperationalState)
});

Object.freeze(LaundryDryerDeviceDefinition);
export const LaundryDryerDevice: LaundryDryerDevice = LaundryDryerDeviceDefinition;
