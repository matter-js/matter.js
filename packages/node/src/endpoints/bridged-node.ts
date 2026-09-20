/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PartsBehavior } from "../behavior/system/parts/PartsBehavior.js";
import { IndexBehavior } from "../behavior/system/index/IndexBehavior.js";
import {
    BridgedDeviceBasicInformationServer as BaseBridgedDeviceBasicInformationServer
} from "../behaviors/bridged-device-basic-information/BridgedDeviceBasicInformationServer.js";
import {
    PowerSourceConfigurationServer as BasePowerSourceConfigurationServer
} from "../behaviors/power-source-configuration/PowerSourceConfigurationServer.js";
import { PowerSourceServer as BasePowerSourceServer } from "../behaviors/power-source/PowerSourceServer.js";
import {
    AdministratorCommissioningServer as BaseAdministratorCommissioningServer
} from "../behaviors/administrator-commissioning/AdministratorCommissioningServer.js";
import {
    EcosystemInformationServer as BaseEcosystemInformationServer
} from "../behaviors/ecosystem-information/EcosystemInformationServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "@matter/model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance for a Bridged Node root endpoint. This endpoint is akin to a "read me first" endpoint that
 * describes itself and any other endpoints that make up the Bridged Node. A Bridged Node endpoint represents a device
 * on a foreign network, but is not the root endpoint of the bridge itself.
 *
 * ### Device Type Requirements
 *
 * This device type shall only be indicated on endpoints which are listed in the Descriptor cluster PartsList of another
 * endpoint with an Aggregator device type.
 *
 * ### Endpoint Composition
 *
 * A Bridged Node endpoint shall support one of the following composition patterns:
 *
 *   - Separate Endpoints: All application device types are supported on separate descendant endpoints, and shall NOT be
 *     hosted on the Bridged Node endpoint. The Bridged Node endpoint's Descriptor cluster PartsList attribute shall
 *     indicate a list of all endpoints representing the functionality of the bridged device, including the endpoints
 *     supporting the application device types, i.e. the full-family pattern defined in the System Model specification.
 *     This is used for the following cases:
 *
 *   - Exposing a compound device - the child endpoints each have a part of the functionality of the bridged device. See
 *     endpoints 31-34 in the example below; the bridged device is a PIR sensor which also has temperature and
 *     illuminance measurement. Endpoints 32-34 host the associated application device types and clusters. Endpoint 31
 *     (the endpoint with the Bridged Node device type) functions as parent for these endpoints and has no application
 *     device types.
 *
 *   - Exposing a composed device type - a child endpoint of the endpoint with the Bridged Node device type has the
 *     composed device type; this endpoint with the composed device type has child endpoints for the device type(s) that
 *     are mandatory or optional for the composed device type. See endpoints 41-43 in the example below; this is a
 *     refrigerator, which is a composed device type, hosted on endpoint 42, with the associated temperature controlled
 *     cabinet device type on child endpoint 43. Endpoint 41 (the endpoint with the Bridged Node device type) functions
 *     as parent for the endpoint hosting the composed device type and has no application clusters.
 *
 *   - Combinations of the above.
 *
 *   - One Endpoint: Both the Bridged Node and one or more application device types are supported on the same endpoint
 *     (following application device type rules). The PartsList attribute in the Descriptor cluster shall be empty.
 *     Since compound devices and composed device types each need more than one endpoint to expose their functionality,
 *     they cannot use the "One Endpoint" pattern and need to use the "Separate Endpoints" model described above.
 *
 *   - Example in the figure below: endpoint 21 hosts the Bridged Node utility device type, plus the application device
 *     type for a dimmable light on same endpoint. Since the dimmable light device type is a superset of on/off light,
 *     that subset device type may be added here as well.
 *
 * In all these composition patterns, endpoint composition shall conform to the application device type(s) definition.
 *
 * @see {@link MatterSpecification.v16.Device} § 2.5
 */
export interface BridgedNodeEndpoint extends Identity<typeof BridgedNodeEndpointDefinition> {}

export namespace BridgedNodeRequirements {
    /**
     * The BridgedDeviceBasicInformation cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link BridgedDeviceBasicInformationServer} for convenience.
     */
    export const BridgedDeviceBasicInformationServer = BaseBridgedDeviceBasicInformationServer;

    /**
     * The PowerSourceConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerSourceConfigurationServer} for convenience.
     */
    export const PowerSourceConfigurationServer = BasePowerSourceConfigurationServer;

    /**
     * The PowerSource cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerSourceServer} for convenience.
     */
    export const PowerSourceServer = BasePowerSourceServer;

    /**
     * The AdministratorCommissioning cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AdministratorCommissioningServer} for convenience.
     */
    export const AdministratorCommissioningServer = BaseAdministratorCommissioningServer;

    /**
     * The EcosystemInformation cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link EcosystemInformationServer} for convenience.
     */
    export const EcosystemInformationServer = BaseEcosystemInformationServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            Parts: PartsBehavior,
            Index: IndexBehavior,
            BridgedDeviceBasicInformation: BridgedDeviceBasicInformationServer
        },

        optional: {
            PowerSourceConfiguration: PowerSourceConfigurationServer,
            PowerSource: PowerSourceServer,
            AdministratorCommissioning: AdministratorCommissioningServer,
            EcosystemInformation: EcosystemInformationServer
        }
    };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = { optional: { PowerSource: { deviceType: 0x11 } } };
}

export const BridgedNodeEndpointDefinition = MutableEndpoint({
    name: "BridgedNode",
    deviceType: 0x13,
    deviceRevision: 3,
    deviceClass: DeviceClassification.Utility,
    requirements: BridgedNodeRequirements,
    behaviors: SupportedBehaviors(
        BridgedNodeRequirements.server.mandatory.Parts,
        BridgedNodeRequirements.server.mandatory.Index,
        BridgedNodeRequirements.server.mandatory.BridgedDeviceBasicInformation
    )
});

Object.freeze(BridgedNodeEndpointDefinition);
export const BridgedNodeEndpoint: BridgedNodeEndpoint = BridgedNodeEndpointDefinition;
