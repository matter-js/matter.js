/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { TlsClientManagement } from "@matter/types/clusters/tls-client-management";

export namespace TlsClientManagementInterface {
    export interface Base {
        /**
         * This command is used to provision a TLS Endpoint for the provided Hostname / Port combination.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.5.7.1
         */
        provisionEndpoint(request: TlsClientManagement.ProvisionEndpointRequest): MaybePromise<TlsClientManagement.ProvisionEndpointResponse>;

        /**
         * This command is used to find a TLS Endpoint by its ID.
         *
         * This command shall return the TLSEndpointStruct for the passed in EndpointID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.5.7.3
         */
        findEndpoint(request: TlsClientManagement.FindEndpointRequest): MaybePromise<TlsClientManagement.FindEndpointResponse>;

        /**
         * This command is used to remove a TLS Endpoint by its ID.
         *
         * This command shall be generated to request the Node remove any TLS Endpoint.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.5.7.5
         */
        removeEndpoint(request: TlsClientManagement.RemoveEndpointRequest): MaybePromise;
    }
}

export type TlsClientManagementInterface = { components: [{ flags: {}, methods: TlsClientManagementInterface.Base }] };
