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
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import { DishwasherModeServer as BaseDishwasherModeServer } from "../behaviors/dishwasher-mode/DishwasherModeServer.js";
import { DishwasherAlarmServer as BaseDishwasherAlarmServer } from "../behaviors/dishwasher-alarm/DishwasherAlarmServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A dishwasher is a device that is generally installed in residential homes and is capable of washing dishes, cutlery,
 * and other items associate with food preparation and consumption. The device can be permanently installed or portable
 * and can have variety of filling and draining methods.
 *
 * ### Cluster Requirements
 *
 * > [!NOTE]
 *
 * > NOTE: A dishwasher cycle is a combination of a mode (if supported) and a temperature (if supported). The
 *   operational state cluster is then used to start the cycle once these selections have been made via the client.
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
 * @see {@link MatterSpecification.v16.Device} § 13.5
 */
export interface DishwasherDevice extends Identity<typeof DishwasherDeviceDefinition> {}

export namespace DishwasherRequirements {
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
     * The TemperatureControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureControlServer} for convenience.
     */
    export const TemperatureControlServer = BaseTemperatureControlServer;

    /**
     * The DishwasherMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link DishwasherModeServer} for convenience.
     */
    export const DishwasherModeServer = BaseDishwasherModeServer;

    /**
     * The DishwasherAlarm cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link DishwasherAlarmServer} for convenience.
     */
    export const DishwasherAlarmServer = BaseDishwasherAlarmServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { OperationalState: OperationalStateServer },

        optional: {
            Identify: IdentifyServer,
            OnOff: OnOffServer,
            TemperatureControl: TemperatureControlServer,
            DishwasherMode: DishwasherModeServer,
            DishwasherAlarm: DishwasherAlarmServer
        }
    };
}

export const DishwasherDeviceDefinition = MutableEndpoint({
    name: "Dishwasher",
    deviceType: 0x75,
    deviceRevision: 2,
    requirements: DishwasherRequirements,
    behaviors: SupportedBehaviors(DishwasherRequirements.server.mandatory.OperationalState)
});

Object.freeze(DishwasherDeviceDefinition);
export const DishwasherDevice: DishwasherDevice = DishwasherDeviceDefinition;
