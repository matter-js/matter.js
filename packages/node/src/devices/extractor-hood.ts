/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FanControlServer as BaseFanControlServer } from "../behaviors/fan-control/FanControlServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    HepaFilterMonitoringServer as BaseHepaFilterMonitoringServer
} from "../behaviors/hepa-filter-monitoring/HepaFilterMonitoringServer.js";
import {
    ActivatedCarbonFilterMonitoringServer as BaseActivatedCarbonFilterMonitoringServer
} from "../behaviors/activated-carbon-filter-monitoring/ActivatedCarbonFilterMonitoringServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * An Extractor Hood is a device that is generally installed above a cooking surface in residential kitchens. An
 * Extractor Hood’s primary purpose is to reduce odors that arise during the cooking process by either extracting the
 * air above the cooking surface or by recirculating and filtering it. It may also contain a light for illuminating the
 * cooking surface.
 *
 * Extractor Hoods may also be known by the following names:
 *
 *   • Hoods
 *
 *   • Extractor Fans
 *
 *   • Extractors
 *
 *   • Range Hoods
 *
 *   • Telescoping Hoods
 *
 *   • Telescoping Extractors
 *
 * @see {@link MatterSpecification.v142.Device} § 13.10
 */
export interface ExtractorHoodDevice extends Identity<typeof ExtractorHoodDeviceDefinition> {}

export namespace ExtractorHoodRequirements {
    /**
     * The FanControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlServer} for convenience.
     */
    export const FanControlServer = BaseFanControlServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The HepaFilterMonitoring cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link HepaFilterMonitoringServer} for convenience.
     */
    export const HepaFilterMonitoringServer = BaseHepaFilterMonitoringServer;

    /**
     * The ActivatedCarbonFilterMonitoring cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ActivatedCarbonFilterMonitoringServer} for
     * convenience.
     */
    export const ActivatedCarbonFilterMonitoringServer = BaseActivatedCarbonFilterMonitoringServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { FanControl: FanControlServer },
        optional: {
            Identify: IdentifyServer,
            HepaFilterMonitoring: HepaFilterMonitoringServer,
            ActivatedCarbonFilterMonitoring: ActivatedCarbonFilterMonitoringServer
        }
    };
}

export const ExtractorHoodDeviceDefinition = MutableEndpoint({
    name: "ExtractorHood",
    deviceType: 0x7a,
    deviceRevision: 1,
    requirements: ExtractorHoodRequirements,
    behaviors: SupportedBehaviors(ExtractorHoodRequirements.server.mandatory.FanControl)
});

Object.freeze(ExtractorHoodDeviceDefinition);
export const ExtractorHoodDevice: ExtractorHoodDevice = ExtractorHoodDeviceDefinition;
