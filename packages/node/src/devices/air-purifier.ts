/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { FanControlServer as BaseFanControlServer } from "../behaviors/fan-control/FanControlServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
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
 * An Air Purifier is a standalone device that is designed to clean the air in a room.
 *
 * It is a device that has a fan to control the air speed while it is operating. Optionally, it can report on the
 * condition of its filters.
 *
 * @see {@link MatterSpecification.v142.Device} § 9.3
 */
export interface AirPurifierDevice extends Identity<typeof AirPurifierDeviceDefinition> {}

export namespace AirPurifierRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The FanControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlServer} for convenience.
     */
    export const FanControlServer = BaseFanControlServer;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The OnOff cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffServer} for convenience.
     */
    export const OnOffServer = BaseOnOffServer;

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
        mandatory: { Identify: IdentifyServer, FanControl: FanControlServer },

        optional: {
            Groups: GroupsServer,
            OnOff: OnOffServer,
            HepaFilterMonitoring: HepaFilterMonitoringServer,
            ActivatedCarbonFilterMonitoring: ActivatedCarbonFilterMonitoringServer
        }
    };
}

export const AirPurifierDeviceDefinition = MutableEndpoint({
    name: "AirPurifier",
    deviceType: 0x2d,
    deviceRevision: 2,
    requirements: AirPurifierRequirements,
    behaviors: SupportedBehaviors(
        AirPurifierRequirements.server.mandatory.Identify,
        AirPurifierRequirements.server.mandatory.FanControl
    )
});

Object.freeze(AirPurifierDeviceDefinition);
export const AirPurifierDevice: AirPurifierDevice = AirPurifierDeviceDefinition;
