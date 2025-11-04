/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import {
    PumpConfigurationAndControlServer as BasePumpConfigurationAndControlServer
} from "../behaviors/pump-configuration-and-control/PumpConfigurationAndControlServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { LevelControlServer as BaseLevelControlServer } from "../behaviors/level-control/LevelControlServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
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
    TemperatureMeasurementBehavior as BaseTemperatureMeasurementBehavior
} from "../behaviors/temperature-measurement/TemperatureMeasurementBehavior.js";
import {
    PressureMeasurementBehavior as BasePressureMeasurementBehavior
} from "../behaviors/pressure-measurement/PressureMeasurementBehavior.js";
import {
    FlowMeasurementBehavior as BaseFlowMeasurementBehavior
} from "../behaviors/flow-measurement/FlowMeasurementBehavior.js";
import {
    OccupancySensingBehavior as BaseOccupancySensingBehavior
} from "../behaviors/occupancy-sensing/OccupancySensingBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Pump device is a pump that may have variable speed. It may have optional built-in sensors and a regulation
 * mechanism. It is typically used for pumping fluids like water.
 *
 * PumpDevice requires PumpConfigurationAndControl cluster but PumpConfigurationAndControl is not added by default
 * because you must select the features your device supports. You can add manually using PumpDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 5.5
 */
export interface PumpDevice extends Identity<typeof PumpDeviceDefinition> {}

export namespace PumpRequirements {
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
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlServer} for convenience.
     */
    export const LevelControlServer = BaseLevelControlServer;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

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
     * We provide this alias to the default implementation {@link TemperatureMeasurementBehavior} for convenience.
     */
    export const TemperatureMeasurementBehavior = BaseTemperatureMeasurementBehavior;

    /**
     * The PressureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PressureMeasurementBehavior} for convenience.
     */
    export const PressureMeasurementBehavior = BasePressureMeasurementBehavior;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementBehavior} for convenience.
     */
    export const FlowMeasurementBehavior = BaseFlowMeasurementBehavior;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingBehavior} for convenience.
     */
    export const OccupancySensingBehavior = BaseOccupancySensingBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            OnOff: OnOffServer,
            PumpConfigurationAndControl: PumpConfigurationAndControlServer,
            Identify: IdentifyServer
        },

        optional: {
            LevelControl: LevelControlServer,
            Groups: GroupsServer,
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
            TemperatureMeasurement: TemperatureMeasurementBehavior,
            PressureMeasurement: PressureMeasurementBehavior,
            FlowMeasurement: FlowMeasurementBehavior,
            OccupancySensing: OccupancySensingBehavior
        },

        mandatory: {}
    };
}

export const PumpDeviceDefinition = MutableEndpoint({
    name: "Pump",
    deviceType: 0x303,
    deviceRevision: 3,
    requirements: PumpRequirements,
    behaviors: SupportedBehaviors(PumpRequirements.server.mandatory.OnOff, PumpRequirements.server.mandatory.Identify)
});

export const PumpDevice: PumpDevice = PumpDeviceDefinition;
