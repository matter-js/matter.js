/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { OnOffClient as BaseOnOffClient } from "../behaviors/on-off/OnOffClient.js";
import {
    PumpConfigurationAndControlClient as BasePumpConfigurationAndControlClient
} from "../behaviors/pump-configuration-and-control/PumpConfigurationAndControlClient.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import { GroupsClient as BaseGroupsClient } from "../behaviors/groups/GroupsClient.js";
import { LevelControlClient as BaseLevelControlClient } from "../behaviors/level-control/LevelControlClient.js";
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import {
    TemperatureMeasurementClient as BaseTemperatureMeasurementClient
} from "../behaviors/temperature-measurement/TemperatureMeasurementClient.js";
import {
    PressureMeasurementClient as BasePressureMeasurementClient
} from "../behaviors/pressure-measurement/PressureMeasurementClient.js";
import { FlowMeasurementClient as BaseFlowMeasurementClient } from "../behaviors/flow-measurement/FlowMeasurementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Pump Controller device is capable of configuring and controlling a Pump device.
 *
 * @see {@link MatterSpecification.v151.Device} § 6.5
 */
export interface PumpControllerDevice extends Identity<typeof PumpControllerDeviceDefinition> {}

export namespace PumpControllerRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffClient} for convenience.
     */
    export const OnOffClient = BaseOnOffClient;

    /**
     * The PumpConfigurationAndControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link PumpConfigurationAndControlClient} for convenience.
     */
    export const PumpConfigurationAndControlClient = BasePumpConfigurationAndControlClient;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyClient} for convenience.
     */
    export const IdentifyClient = BaseIdentifyClient;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsClient} for convenience.
     */
    export const GroupsClient = BaseGroupsClient;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlClient} for convenience.
     */
    export const LevelControlClient = BaseLevelControlClient;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementClient} for convenience.
     */
    export const ScenesManagementClient = BaseScenesManagementClient;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementClient} for convenience.
     */
    export const TemperatureMeasurementClient = BaseTemperatureMeasurementClient;

    /**
     * The PressureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PressureMeasurementClient} for convenience.
     */
    export const PressureMeasurementClient = BasePressureMeasurementClient;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementClient} for convenience.
     */
    export const FlowMeasurementClient = BaseFlowMeasurementClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { OnOff: OnOffClient, PumpConfigurationAndControl: PumpConfigurationAndControlClient },

        optional: {
            Identify: IdentifyClient,
            Groups: GroupsClient,
            LevelControl: LevelControlClient,
            ScenesManagement: ScenesManagementClient,
            TemperatureMeasurement: TemperatureMeasurementClient,
            PressureMeasurement: PressureMeasurementClient,
            FlowMeasurement: FlowMeasurementClient
        }
    };
}

export const PumpControllerDeviceDefinition = MutableEndpoint({
    name: "PumpController",
    deviceType: 0x304,
    deviceRevision: 4,
    requirements: PumpControllerRequirements,
    behaviors: SupportedBehaviors(PumpControllerRequirements.server.mandatory.Identify)
});

Object.freeze(PumpControllerDeviceDefinition);
export const PumpControllerDevice: PumpControllerDevice = PumpControllerDeviceDefinition;
