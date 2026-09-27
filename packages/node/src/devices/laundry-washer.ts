/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    OperationalStateServer as BaseOperationalStateServer
} from "../behaviors/operational-state/OperationalStateServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import {
    LaundryWasherModeServer as BaseLaundryWasherModeServer
} from "../behaviors/laundry-washer-mode/LaundryWasherModeServer.js";
import {
    LaundryWasherControlsServer as BaseLaundryWasherControlsServer
} from "../behaviors/laundry-washer-controls/LaundryWasherControlsServer.js";
import {
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Laundry Washer represents a device that is capable of laundering consumer items. Any laundry washer product may
 * utilize this device type.
 *
 * A Laundry Washer shall be composed of at least one endpoint with the Laundry Washer device type.
 *
 * ### Cluster Restrictions
 *
 * #### Temperature Control Cluster (Server) Clarifications
 *
 * Given that different markets have different customary methods of providing temperature settings (e.g. North America
 * often prefers levels, whereas many other markets provide temperatures in °C), it is recommended that when the
 * Temperature Control cluster is present, the TemperatureLevel or TemperatureNumber feature of that cluster is chosen
 * to follow the most widely applied convention for the market where the product is sold.
 *
 * #### On/Off Cluster (Server) Clarifications
 *
 * As indicated in the Element Requirements section below, the DF (Dead Front) feature is required for the On/Off
 * cluster in this device type. See the "DeadFrontBehavior feature" section in the On/Off cluster description for
 * detailed requirements. The "dead front" state is linked to the OnOff attribute in the On/Off cluster having the value
 * False. Thus, the Off command of the On/Off cluster shall move the device into the "dead front" state, the On command
 * of the On/Off cluster shall bring the device out of the "dead front" state, and the device shall adhere with the
 * associated requirements on subscription handling and event reporting.
 *
 * #### Best Effort Attribute Values in "Dead Front" State
 *
 * When in "dead front", should the operational values of the cluster attributes not be available or accessible, the
 * following are the recommended best effort values for per cluster attributes when responding to a new subscription
 * request or a read request. Attributes not listed have no change in their defined or expected values.
 *
 * @see {@link MatterSpecification.v16.Device} § 13.1
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
     * The OnOff cluster is optional per the Matter specification.
     *
     * This version of {@link OnOffServer} is specialized per the specification.
     */
    export const OnOffServer = BaseOnOffServer.with("DeadFrontBehavior");

    /**
     * The LaundryWasherMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LaundryWasherModeServer} for convenience.
     */
    export const LaundryWasherModeServer = BaseLaundryWasherModeServer;

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
            OnOff: OnOffServer,
            LaundryWasherMode: LaundryWasherModeServer,
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

Object.freeze(LaundryWasherDeviceDefinition);
export const LaundryWasherDevice: LaundryWasherDevice = LaundryWasherDeviceDefinition;
