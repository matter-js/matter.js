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
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import {
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import { DishwasherModeServer as BaseDishwasherModeServer } from "../behaviors/dishwasher-mode/DishwasherModeServer.js";
import { DishwasherAlarmServer as BaseDishwasherAlarmServer } from "../behaviors/dishwasher-alarm/DishwasherAlarmServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A dishwasher is a device that is generally installed in residential homes and is capable of washing dishes, cutlery,
 * and other items associate with food preparation and consumption. The device can be permanently installed or portable
 * and can have variety of filling and draining methods.
 *
 * @see {@link MatterSpecification.v141.Device} § 13.5
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

export const DishwasherDevice: DishwasherDevice = DishwasherDeviceDefinition;
