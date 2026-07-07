/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import {
    PumpConfigurationAndControlServer as BasePumpConfigurationAndControlServer
} from "../behaviors/pump-configuration-and-control/PumpConfigurationAndControlServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import { LevelControlServer as BaseLevelControlServer } from "../behaviors/level-control/LevelControlServer.js";
import {
    ScenesManagementServer as BaseScenesManagementServer
} from "../behaviors/scenes-management/ScenesManagementServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import {
    PressureMeasurementServer as BasePressureMeasurementServer
} from "../behaviors/pressure-measurement/PressureMeasurementServer.js";
import { FlowMeasurementServer as BaseFlowMeasurementServer } from "../behaviors/flow-measurement/FlowMeasurementServer.js";
import {
    TemperatureMeasurementClient as BaseTemperatureMeasurementClient
} from "../behaviors/temperature-measurement/TemperatureMeasurementClient.js";
import {
    PressureMeasurementClient as BasePressureMeasurementClient
} from "../behaviors/pressure-measurement/PressureMeasurementClient.js";
import { FlowMeasurementClient as BaseFlowMeasurementClient } from "../behaviors/flow-measurement/FlowMeasurementClient.js";
import {
    OccupancySensingClient as BaseOccupancySensingClient
} from "../behaviors/occupancy-sensing/OccupancySensingClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Pump device is a pump that may have variable speed. It may have optional built-in sensors and a regulation
 * mechanism. It is typically used for pumping fluids like water.
 *
 * PumpDevice requires PumpConfigurationAndControl cluster but PumpConfigurationAndControl is not added by default
 * because you must select the features your device supports. You can add manually using PumpDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 5.5
 */
export interface PumpDevice extends Identity<typeof PumpDeviceDefinition> {}

export namespace PumpRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffServer} for convenience.
     */
    export const OnOffServer = BaseOnOffServer;

    /**
     * The PumpConfigurationAndControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link PumpConfigurationAndControlServer} for convenience.
     */
    export const PumpConfigurationAndControlServer = BasePumpConfigurationAndControlServer;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlServer} for convenience.
     */
    export const LevelControlServer = BaseLevelControlServer;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementServer} for convenience.
     */
    export const ScenesManagementServer = BaseScenesManagementServer;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * The PressureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PressureMeasurementServer} for convenience.
     */
    export const PressureMeasurementServer = BasePressureMeasurementServer;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementServer} for convenience.
     */
    export const FlowMeasurementServer = BaseFlowMeasurementServer;

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
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingClient} for convenience.
     */
    export const OccupancySensingClient = BaseOccupancySensingClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            Identify: IdentifyServer,
            OnOff: OnOffServer,
            PumpConfigurationAndControl: PumpConfigurationAndControlServer
        },

        optional: {
            Groups: GroupsServer,
            LevelControl: LevelControlServer,
            ScenesManagement: ScenesManagementServer,
            TemperatureMeasurement: TemperatureMeasurementServer,
            PressureMeasurement: PressureMeasurementServer,
            FlowMeasurement: FlowMeasurementServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        optional: {
            TemperatureMeasurement: TemperatureMeasurementClient,
            PressureMeasurement: PressureMeasurementClient,
            FlowMeasurement: FlowMeasurementClient,
            OccupancySensing: OccupancySensingClient
        },

        mandatory: {}
    };
}

export const PumpDeviceDefinition = MutableEndpoint({
    name: "Pump",
    deviceType: 0x303,
    deviceRevision: 3,
    requirements: PumpRequirements,
    behaviors: SupportedBehaviors(PumpRequirements.server.mandatory.Identify, PumpRequirements.server.mandatory.OnOff)
});

Object.freeze(PumpDeviceDefinition);
export const PumpDevice: PumpDevice = PumpDeviceDefinition;
