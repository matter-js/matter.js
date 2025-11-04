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
    LaundryWasherControlsServer as BaseLaundryWasherControlsServer
} from "../behaviors/laundry-washer-controls/LaundryWasherControlsServer.js";
import {
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Laundry Washer represents a device that is capable of laundering consumer items. Any laundry washer product may
 * utilize this device type.
 *
 * A Laundry Washer shall be composed of at least one endpoint with the Laundry Washer device type.
 *
 * @see {@link MatterSpecification.v142.Device} § 13.1
 */
export interface LaundryWasherDevice extends Identity<typeof LaundryWasherDeviceDefinition> {}

export namespace LaundryWasherRequirements {
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
     * The LaundryWasherControls cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LaundryWasherControlsServer} for convenience.
     */
    export const LaundryWasherControlsServer = BaseLaundryWasherControlsServer;

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
            LaundryWasherControls: LaundryWasherControlsServer,
            TemperatureControl: TemperatureControlServer
        }
    };
}

export const LaundryWasherDeviceDefinition = MutableEndpoint({
    name: "LaundryWasher",
    deviceType: 0x73,
    deviceRevision: 2,
    requirements: LaundryWasherRequirements,
    behaviors: SupportedBehaviors(LaundryWasherRequirements.server.mandatory.OperationalState)
});

export const LaundryWasherDevice: LaundryWasherDevice = LaundryWasherDeviceDefinition;
