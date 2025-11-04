/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { AirQualityServer as BaseAirQualityServer } from "../behaviors/air-quality/AirQualityServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import {
    RelativeHumidityMeasurementServer as BaseRelativeHumidityMeasurementServer
} from "../behaviors/relative-humidity-measurement/RelativeHumidityMeasurementServer.js";
import {
    CarbonMonoxideConcentrationMeasurementServer as BaseCarbonMonoxideConcentrationMeasurementServer
} from "../behaviors/carbon-monoxide-concentration-measurement/CarbonMonoxideConcentrationMeasurementServer.js";
import {
    CarbonDioxideConcentrationMeasurementServer as BaseCarbonDioxideConcentrationMeasurementServer
} from "../behaviors/carbon-dioxide-concentration-measurement/CarbonDioxideConcentrationMeasurementServer.js";
import {
    NitrogenDioxideConcentrationMeasurementServer as BaseNitrogenDioxideConcentrationMeasurementServer
} from "../behaviors/nitrogen-dioxide-concentration-measurement/NitrogenDioxideConcentrationMeasurementServer.js";
import {
    OzoneConcentrationMeasurementServer as BaseOzoneConcentrationMeasurementServer
} from "../behaviors/ozone-concentration-measurement/OzoneConcentrationMeasurementServer.js";
import {
    FormaldehydeConcentrationMeasurementServer as BaseFormaldehydeConcentrationMeasurementServer
} from "../behaviors/formaldehyde-concentration-measurement/FormaldehydeConcentrationMeasurementServer.js";
import {
    Pm1ConcentrationMeasurementServer as BasePm1ConcentrationMeasurementServer
} from "../behaviors/pm1-concentration-measurement/Pm1ConcentrationMeasurementServer.js";
import {
    Pm25ConcentrationMeasurementServer as BasePm25ConcentrationMeasurementServer
} from "../behaviors/pm25-concentration-measurement/Pm25ConcentrationMeasurementServer.js";
import {
    Pm10ConcentrationMeasurementServer as BasePm10ConcentrationMeasurementServer
} from "../behaviors/pm10-concentration-measurement/Pm10ConcentrationMeasurementServer.js";
import {
    RadonConcentrationMeasurementServer as BaseRadonConcentrationMeasurementServer
} from "../behaviors/radon-concentration-measurement/RadonConcentrationMeasurementServer.js";
import {
    TotalVolatileOrganicCompoundsConcentrationMeasurementServer as BaseTotalVolatileOrganicCompoundsConcentrationMeasurementServer
} from "../behaviors/total-volatile-organic-compounds-concentration-measurement/TotalVolatileOrganicCompoundsConcentrationMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance for the Air Quality Sensor device type.
 *
 * An air quality sensor is a device designed to monitor and measure various parameters related to the quality of
 * ambient air in indoor or outdoor environments.
 *
 * @see {@link MatterSpecification.v142.Device} § 7.10
 */
export interface AirQualitySensorDevice extends Identity<typeof AirQualitySensorDeviceDefinition> {}

export namespace AirQualitySensorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The AirQuality cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link AirQualityServer} for convenience.
     */
    export const AirQualityServer = BaseAirQualityServer;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * The RelativeHumidityMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RelativeHumidityMeasurementServer} for convenience.
     */
    export const RelativeHumidityMeasurementServer = BaseRelativeHumidityMeasurementServer;

    /**
     * The CarbonMonoxideConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CarbonMonoxideConcentrationMeasurementServer} for
     * convenience.
     */
    export const CarbonMonoxideConcentrationMeasurementServer = BaseCarbonMonoxideConcentrationMeasurementServer;

    /**
     * The CarbonDioxideConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CarbonDioxideConcentrationMeasurementServer} for
     * convenience.
     */
    export const CarbonDioxideConcentrationMeasurementServer = BaseCarbonDioxideConcentrationMeasurementServer;

    /**
     * The NitrogenDioxideConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link NitrogenDioxideConcentrationMeasurementServer} for
     * convenience.
     */
    export const NitrogenDioxideConcentrationMeasurementServer = BaseNitrogenDioxideConcentrationMeasurementServer;

    /**
     * The OzoneConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OzoneConcentrationMeasurementServer} for convenience.
     */
    export const OzoneConcentrationMeasurementServer = BaseOzoneConcentrationMeasurementServer;

    /**
     * The FormaldehydeConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FormaldehydeConcentrationMeasurementServer} for
     * convenience.
     */
    export const FormaldehydeConcentrationMeasurementServer = BaseFormaldehydeConcentrationMeasurementServer;

    /**
     * The Pm1ConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link Pm1ConcentrationMeasurementServer} for convenience.
     */
    export const Pm1ConcentrationMeasurementServer = BasePm1ConcentrationMeasurementServer;

    /**
     * The Pm25ConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link Pm25ConcentrationMeasurementServer} for convenience.
     */
    export const Pm25ConcentrationMeasurementServer = BasePm25ConcentrationMeasurementServer;

    /**
     * The Pm10ConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link Pm10ConcentrationMeasurementServer} for convenience.
     */
    export const Pm10ConcentrationMeasurementServer = BasePm10ConcentrationMeasurementServer;

    /**
     * The RadonConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RadonConcentrationMeasurementServer} for convenience.
     */
    export const RadonConcentrationMeasurementServer = BaseRadonConcentrationMeasurementServer;

    /**
     * The TotalVolatileOrganicCompoundsConcentrationMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation
     * {@link TotalVolatileOrganicCompoundsConcentrationMeasurementServer} for convenience.
     */
    export const TotalVolatileOrganicCompoundsConcentrationMeasurementServer = BaseTotalVolatileOrganicCompoundsConcentrationMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, AirQuality: AirQualityServer },

        optional: {
            TemperatureMeasurement: TemperatureMeasurementServer,
            RelativeHumidityMeasurement: RelativeHumidityMeasurementServer,
            CarbonMonoxideConcentrationMeasurement: CarbonMonoxideConcentrationMeasurementServer,
            CarbonDioxideConcentrationMeasurement: CarbonDioxideConcentrationMeasurementServer,
            NitrogenDioxideConcentrationMeasurement: NitrogenDioxideConcentrationMeasurementServer,
            OzoneConcentrationMeasurement: OzoneConcentrationMeasurementServer,
            FormaldehydeConcentrationMeasurement: FormaldehydeConcentrationMeasurementServer,
            Pm1ConcentrationMeasurement: Pm1ConcentrationMeasurementServer,
            Pm25ConcentrationMeasurement: Pm25ConcentrationMeasurementServer,
            Pm10ConcentrationMeasurement: Pm10ConcentrationMeasurementServer,
            RadonConcentrationMeasurement: RadonConcentrationMeasurementServer,
            TotalVolatileOrganicCompoundsConcentrationMeasurement: TotalVolatileOrganicCompoundsConcentrationMeasurementServer
        }
    };
}

export const AirQualitySensorDeviceDefinition = MutableEndpoint({
    name: "AirQualitySensor",
    deviceType: 0x2c,
    deviceRevision: 1,
    requirements: AirQualitySensorRequirements,
    behaviors: SupportedBehaviors(
        AirQualitySensorRequirements.server.mandatory.Identify,
        AirQualitySensorRequirements.server.mandatory.AirQuality
    )
});

export const AirQualitySensorDevice: AirQualitySensorDevice = AirQualitySensorDeviceDefinition;
