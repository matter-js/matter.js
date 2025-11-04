/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    OtaSoftwareUpdateProviderServer as BaseOtaSoftwareUpdateProviderServer
} from "../behaviors/ota-software-update-provider/OtaSoftwareUpdateProviderServer.js";
import {
    OtaSoftwareUpdateRequestorBehavior as BaseOtaSoftwareUpdateRequestorBehavior
} from "../behaviors/ota-software-update-requestor/OtaSoftwareUpdateRequestorBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * An OTA Provider is a node that is capable of providing an OTA software update to other nodes on the same fabric.
 *
 * @see {@link MatterSpecification.v142.Device} § 2.4
 */
export interface OtaProviderEndpoint extends Identity<typeof OtaProviderEndpointDefinition> {}

export namespace OtaProviderRequirements {
    /**
     * The OtaSoftwareUpdateProvider cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OtaSoftwareUpdateProviderServer} for convenience.
     */
    export const OtaSoftwareUpdateProviderServer = BaseOtaSoftwareUpdateProviderServer;

    /**
     * The OtaSoftwareUpdateRequestor cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OtaSoftwareUpdateRequestorBehavior} for convenience.
     */
    export const OtaSoftwareUpdateRequestorBehavior = BaseOtaSoftwareUpdateRequestorBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { OtaSoftwareUpdateProvider: OtaSoftwareUpdateProviderServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        optional: { OtaSoftwareUpdateRequestor: OtaSoftwareUpdateRequestorBehavior },
        mandatory: {}
    };
}

export const OtaProviderEndpointDefinition = MutableEndpoint({
    name: "OtaProvider",
    deviceType: 0x14,
    deviceRevision: 1,
    deviceClass: DeviceClassification.Utility,
    requirements: OtaProviderRequirements,
    behaviors: SupportedBehaviors(OtaProviderRequirements.server.mandatory.OtaSoftwareUpdateProvider)
});

export const OtaProviderEndpoint: OtaProviderEndpoint = OtaProviderEndpointDefinition;
