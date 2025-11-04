/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { OnOffBehavior as BaseOnOffBehavior } from "../behaviors/on-off/OnOffBehavior.js";
import {
    PumpConfigurationAndControlBehavior as BasePumpConfigurationAndControlBehavior
} from "../behaviors/pump-configuration-and-control/PumpConfigurationAndControlBehavior.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import { LevelControlBehavior as BaseLevelControlBehavior } from "../behaviors/level-control/LevelControlBehavior.js";
import {
    ScenesManagementBehavior as BaseScenesManagementBehavior
} from "../behaviors/scenes-management/ScenesManagementBehavior.js";
import {
    TemperatureMeasurementBehavior as BaseTemperatureMeasurementBehavior
} from "../behaviors/temperature-measurement/TemperatureMeasurementBehavior.js";
import {
    PressureMeasurementBehavior as BasePressureMeasurementBehavior
} from "../behaviors/pressure-measurement/PressureMeasurementBehavior.js";
import {
    FlowMeasurementBehavior as BaseFlowMeasurementBehavior
} from "../behaviors/flow-measurement/FlowMeasurementBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Pump Controller device is capable of configuring and controlling a Pump device.
 *
 * @see {@link MatterSpecification.v142.Device} § 6.5
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
     * We provide this alias to the default implementation {@link OnOffBehavior} for convenience.
     */
    export const OnOffBehavior = BaseOnOffBehavior;

    /**
     * The PumpConfigurationAndControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link PumpConfigurationAndControlBehavior} for convenience.
     */
    export const PumpConfigurationAndControlBehavior = BasePumpConfigurationAndControlBehavior;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyBehavior} for convenience.
     */
    export const IdentifyBehavior = BaseIdentifyBehavior;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsBehavior} for convenience.
     */
    export const GroupsBehavior = BaseGroupsBehavior;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlBehavior} for convenience.
     */
    export const LevelControlBehavior = BaseLevelControlBehavior;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementBehavior} for convenience.
     */
    export const ScenesManagementBehavior = BaseScenesManagementBehavior;

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
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { OnOff: OnOffBehavior, PumpConfigurationAndControl: PumpConfigurationAndControlBehavior },

        optional: {
            Identify: IdentifyBehavior,
            Groups: GroupsBehavior,
            LevelControl: LevelControlBehavior,
            ScenesManagement: ScenesManagementBehavior,
            TemperatureMeasurement: TemperatureMeasurementBehavior,
            PressureMeasurement: PressureMeasurementBehavior,
            FlowMeasurement: FlowMeasurementBehavior
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
