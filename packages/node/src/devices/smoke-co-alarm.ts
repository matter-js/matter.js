/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { SmokeCoAlarmServer as BaseSmokeCoAlarmServer } from "../behaviors/smoke-co-alarm/SmokeCoAlarmServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import {
    RelativeHumidityMeasurementServer as BaseRelativeHumidityMeasurementServer
} from "../behaviors/relative-humidity-measurement/RelativeHumidityMeasurementServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import {
    CarbonMonoxideConcentrationMeasurementServer as BaseCarbonMonoxideConcentrationMeasurementServer
} from "../behaviors/carbon-monoxide-concentration-measurement/CarbonMonoxideConcentrationMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Smoke CO Alarm device is capable of sensing smoke, carbon monoxide or both. It is capable of issuing a visual and
 * audible alert to indicate elevated concentration of smoke or carbon monoxide.
 *
 * Smoke CO Alarms are capable of monitoring themselves and issuing visual and audible alerts for hardware faults,
 * critical low battery conditions, and end of service. Optionally, some of the audible alerts can be temporarily
 * silenced. Smoke CO Alarms are capable of performing a self-test which performs a diagnostic of the primary sensor and
 * issuing a cycle of the audible and visual life safety alarm indications.
 *
 * Some smoke alarms may be capable of adjusting sensitivity. Smoke CO Alarm may have the ability to detect and report
 * humidity levels, temperature levels, and contamination levels.
 *
 * SmokeCoAlarmDevice requires SmokeCoAlarm cluster but SmokeCoAlarm is not added by default because you must select the
 * features your device supports. You can add manually using SmokeCoAlarmDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 7.9
 */
export interface SmokeCoAlarmDevice extends Identity<typeof SmokeCoAlarmDeviceDefinition> {}

export namespace SmokeCoAlarmRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The SmokeCoAlarm cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link SmokeCoAlarmServer} for convenience.
     */
    export const SmokeCoAlarmServer = BaseSmokeCoAlarmServer;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The RelativeHumidityMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RelativeHumidityMeasurementServer} for convenience.
     */
    export const RelativeHumidityMeasurementServer = BaseRelativeHumidityMeasurementServer;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * The CarbonMonoxideConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CarbonMonoxideConcentrationMeasurementServer} for
     * convenience.
     */
    export const CarbonMonoxideConcentrationMeasurementServer = BaseCarbonMonoxideConcentrationMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, SmokeCoAlarm: SmokeCoAlarmServer },

        optional: {
            Groups: GroupsServer,
            RelativeHumidityMeasurement: RelativeHumidityMeasurementServer,
            TemperatureMeasurement: TemperatureMeasurementServer,
            CarbonMonoxideConcentrationMeasurement: CarbonMonoxideConcentrationMeasurementServer
        }
    };
}

export const SmokeCoAlarmDeviceDefinition = MutableEndpoint({
    name: "SmokeCoAlarm",
    deviceType: 0x76,
    deviceRevision: 1,
    requirements: SmokeCoAlarmRequirements,
    behaviors: SupportedBehaviors(SmokeCoAlarmRequirements.server.mandatory.Identify)
});

Object.freeze(SmokeCoAlarmDeviceDefinition);
export const SmokeCoAlarmDevice: SmokeCoAlarmDevice = SmokeCoAlarmDeviceDefinition;
