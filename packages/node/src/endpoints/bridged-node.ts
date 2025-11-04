/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
    EcosystemInformationServer as BaseEcosystemInformationServer
} from "../behaviors/ecosystem-information/EcosystemInformationServer.js";
import {
    AdministratorCommissioningServer as BaseAdministratorCommissioningServer
} from "../behaviors/administrator-commissioning/AdministratorCommissioningServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance for a Bridged Node root endpoint. This endpoint is akin to a "read me first" endpoint that
 * describes itself and any other endpoints that make up the Bridged Node. A Bridged Node endpoint represents a device
 * on a foreign network, but is not the root endpoint of the bridge itself.
 *
 * @see {@link MatterSpecification.v142.Device} § 2.5
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
     * The EcosystemInformation cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link EcosystemInformationServer} for convenience.
     */
    export const EcosystemInformationServer = BaseEcosystemInformationServer;

    /**
     * The AdministratorCommissioning cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AdministratorCommissioningServer} for convenience.
     */
    export const AdministratorCommissioningServer = BaseAdministratorCommissioningServer;

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
            EcosystemInformation: EcosystemInformationServer,
            AdministratorCommissioning: AdministratorCommissioningServer
        }
    };
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
