/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    OtaSoftwareUpdateRequestorServer as BaseOtaSoftwareUpdateRequestorServer
} from "../behaviors/ota-software-update-requestor/OtaSoftwareUpdateRequestorServer.js";
import {
    OtaSoftwareUpdateProviderBehavior as BaseOtaSoftwareUpdateProviderBehavior
} from "../behaviors/ota-software-update-provider/OtaSoftwareUpdateProviderBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * An OTA Requestor is a device that is capable of receiving an OTA software update.
 *
 * @see {@link MatterSpecification.v142.Device} § 2.3
 */
export interface OtaRequestorEndpoint extends Identity<typeof OtaRequestorEndpointDefinition> {}

export namespace OtaRequestorRequirements {
    /**
     * The OtaSoftwareUpdateRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OtaSoftwareUpdateRequestorServer} for convenience.
     */
    export const OtaSoftwareUpdateRequestorServer = BaseOtaSoftwareUpdateRequestorServer;

    /**
     * The OtaSoftwareUpdateProvider cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OtaSoftwareUpdateProviderBehavior} for convenience.
     */
    export const OtaSoftwareUpdateProviderBehavior = BaseOtaSoftwareUpdateProviderBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { OtaSoftwareUpdateRequestor: OtaSoftwareUpdateRequestorServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { mandatory: { OtaSoftwareUpdateProvider: OtaSoftwareUpdateProviderBehavior } };
}

export const OtaRequestorEndpointDefinition = MutableEndpoint({
    name: "OtaRequestor",
    deviceType: 0x12,
    deviceRevision: 1,
    deviceClass: DeviceClassification.Utility,
    requirements: OtaRequestorRequirements,
    behaviors: SupportedBehaviors(OtaRequestorRequirements.server.mandatory.OtaSoftwareUpdateRequestor)
});

Object.freeze(OtaRequestorEndpointDefinition);
export const OtaRequestorEndpoint: OtaRequestorEndpoint = OtaRequestorEndpointDefinition;
