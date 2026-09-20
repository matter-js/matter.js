/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    RefrigeratorAndTemperatureControlledCabinetModeServer as BaseRefrigeratorAndTemperatureControlledCabinetModeServer
} from "../behaviors/refrigerator-and-temperature-controlled-cabinet-mode/RefrigeratorAndTemperatureControlledCabinetModeServer.js";
import {
    RefrigeratorAlarmServer as BaseRefrigeratorAlarmServer
} from "../behaviors/refrigerator-alarm/RefrigeratorAlarmServer.js";
import {
    ActivatedCarbonFilterMonitoringServer as BaseActivatedCarbonFilterMonitoringServer
} from "../behaviors/activated-carbon-filter-monitoring/ActivatedCarbonFilterMonitoringServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A refrigerator represents a device that contains one or more cabinets that are capable of chilling or freezing food.
 * Examples of consumer products that may make use of this device type include refrigerators, freezers, and wine
 * coolers.
 *
 * ### Refrigerator Architecture
 *
 * A Refrigerator is always defined via endpoint composition. See Section 13.2.6, "Device Type Requirements" for more
 * details.
 *
 * A Refrigerator may include a semantic tag in the TagList attribute of the Descriptor cluster to describe the primary
 * function of the device, e.g., "Refrigerator" or "Freezer".
 *
 * An example of a Refrigerator with multiple cabinets is illustrated below.
 *
 * ### Device Type Requirements
 *
 * A Refrigerator shall be composed of at least one endpoint with the Temperature Controlled Cabinet device type as
 * defined by the conformance below. There may be more endpoints with other device types existing in the Refrigerator.
 *
 * If the Refrigerator contains more than one instance of a Temperature Controlled Cabinet, those instances shall
 * include a semantic tag in the TagList attribute of the Descriptor cluster to disambiguate the cabinet, e.g.,
 * "freezer" or "refrigerator". Such a semantic tag shall be from either the defined Common or Refrigerator namespaces.
 *
 * ### Cluster Requirements
 *
 * #### Activated Carbon Filter Monitoring Cluster
 *
 * This cluster is used to represent the status of a water filter, if present on the device.
 *
 * @see {@link MatterSpecification.v16.Device} § 13.2
 */
export interface RefrigeratorDevice extends Identity<typeof RefrigeratorDeviceDefinition> {}

export namespace RefrigeratorRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The RefrigeratorAndTemperatureControlledCabinetMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RefrigeratorAndTemperatureControlledCabinetModeServer}
     * for convenience.
     */
    export const RefrigeratorAndTemperatureControlledCabinetModeServer = BaseRefrigeratorAndTemperatureControlledCabinetModeServer;

    /**
     * The RefrigeratorAlarm cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RefrigeratorAlarmServer} for convenience.
     */
    export const RefrigeratorAlarmServer = BaseRefrigeratorAlarmServer;

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
        optional: {
            Identify: IdentifyServer,
            RefrigeratorAndTemperatureControlledCabinetMode: RefrigeratorAndTemperatureControlledCabinetModeServer,
            RefrigeratorAlarm: RefrigeratorAlarmServer,
            ActivatedCarbonFilterMonitoring: ActivatedCarbonFilterMonitoringServer
        }
    };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = { mandatory: { TemperatureControlledCabinet: { deviceType: 0x71, constraint: "min 1" } } };

    /**
     * Conditions this device type's requirements are stated against, keyed by condition name, per the Matter
     *
     * specification.
     */
    export const conditions = { mandatory: { Cooler: { declaredBy: "TemperatureControlledCabinet" } } };
}

export const RefrigeratorDeviceDefinition = MutableEndpoint({
    name: "Refrigerator",
    deviceType: 0x70,
    deviceRevision: 3,
    requirements: RefrigeratorRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(RefrigeratorDeviceDefinition);
export const RefrigeratorDevice: RefrigeratorDevice = RefrigeratorDeviceDefinition;
