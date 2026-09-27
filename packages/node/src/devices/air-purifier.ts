/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
import { Identity } from "@matter/general";

/**
 * An Air Purifier is a standalone device that is designed to clean the air in a room.
 *
 * It is a device that has a fan to control the air speed while it is operating. Optionally, it can report on the
 * condition of its filters.
 *
 * ### Device Type Requirements
 *
 * An Air Purifier may expose elements of its functionality through one or more additional device types on different
 * endpoints. All devices used in compositions shall adhere to the disambiguation requirements of the System Model.
 * Other device types, not explicitly listed in the table, may also be included in device compositions but are not
 * considered part of the core functionality of the device.
 *
 * ### Cluster Restrictions
 *
 * #### On/Off Cluster (Server) Clarifications
 *
 * The On/Off cluster is independent from the Fan Control Cluster's FanMode attribute, which also includes an Off
 * setting.
 *
 * If the FanMode attribute of the Fan Control cluster is set to a value other than Off when the OnOff attribute of the
 * On/Off cluster transitions from TRUE to FALSE, it may be desirable to restore the FanMode, SpeedSetting and
 * PercentSetting attribute values of the Fan Control cluster when the OnOff attribute of the On/Off cluster later
 * transitions from FALSE to TRUE. If the FanMode is set to Off when the device is turned off, this information is lost,
 * as the SpeedSetting and PercentSetting will be set to zero. Using the On/Off cluster alongside the Fan Control
 * cluster allows the FanMode, SpeedSetting and PercentSetting to remain unchanged when the device is turned off. In
 * this case, the On/Off cluster would be set to Off, and the SpeedCurrent and PercentCurrent set to zero, without
 * changing FanMode, SpeedSetting and PercentSetting.
 *
 * @see {@link MatterSpecification.v16.Device} § 9.3
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
    deviceRevision: 3,
    requirements: AirPurifierRequirements,
    behaviors: SupportedBehaviors(
        AirPurifierRequirements.server.mandatory.Identify,
        AirPurifierRequirements.server.mandatory.FanControl
    )
});

Object.freeze(AirPurifierDeviceDefinition);
export const AirPurifierDevice: AirPurifierDevice = AirPurifierDeviceDefinition;
