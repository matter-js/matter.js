/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status } from "../globals/Status.js";

/**
 * Definitions for the TlsClientManagement cluster.
 *
 * This Cluster is used to provision TLS Endpoints with enough information to facilitate subsequent connection.
 *
 * Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn't require it, to
 * reduce the testing matrix.
 *
 * This cluster shall be present on the root node endpoint when required by a device type, may be present on that
 * endpoint otherwise, and shall NOT be present on any other Endpoint of any Node.
 *
 * @see {@link MatterSpecification.v151.Core} § 14.5
 */
export declare namespace TlsClientManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0802;

    /**
     * Textual cluster identifier.
     */
    export const name: "TlsClientManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the TlsClientManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TlsClientManagement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the maximum number of per fabric TLSEndpoints that can be installed on this Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.6.1
         */
        maxProvisioned: number;

        /**
         * Indicates a list of currently provisioned TLS Endpoints on this Node. The maximum length of this list when
         * read will be the value of MaxProvisioned.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.6.2
         */
        provisionedEndpoints: TlsEndpoint[];
    }

    /**
     * Attributes that may appear in {@link TlsClientManagement}.
     */
    export interface Attributes {
        /**
         * Indicates the maximum number of per fabric TLSEndpoints that can be installed on this Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.6.1
         */
        maxProvisioned: number;

        /**
         * Indicates a list of currently provisioned TLS Endpoints on this Node. The maximum length of this list when
         * read will be the value of MaxProvisioned.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.6.2
         */
        provisionedEndpoints: TlsEndpoint[];
    }

    /**
     * {@link TlsClientManagement} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to provision a TLS Endpoint for the provided Hostname / Port combination.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.1
         */
        provisionEndpoint(request: ProvisionEndpointRequest): MaybePromise<ProvisionEndpointResponse>;

        /**
         * This command is used to find a TLS Endpoint by its ID.
         *
         * This command shall return the TLSEndpointStruct for the passed in EndpointID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.3
         */
        findEndpoint(request: FindEndpointRequest): MaybePromise<FindEndpointResponse>;

        /**
         * This command is used to remove a TLS Endpoint by its ID.
         *
         * This command shall be generated to request the Node remove any TLS Endpoint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.5
         */
        removeEndpoint(request: RemoveEndpointRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link TlsClientManagement}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * This struct encodes details about a TLS Endpoint.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.4.2
     */
    export declare class TlsEndpoint {
        constructor(values?: Partial<TlsEndpoint>);

        /**
         * This field shall represent the unique TLS Endpoint ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.4.2.1
         */
        endpointId: number;

        /**
         * This field shall represent a TLS Hostname.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.4.2.2
         */
        hostname: Bytes;

        /**
         * This field shall represent a TLS Port Number.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.4.2.3
         */
        port: number;

        /**
         * This field shall be a TLSCAID representing the associated Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.4.2.4
         */
        caid: number;

        /**
         * This field shall be a TLSCCDID representing the associated Client Certificate Details ID. A NULL value means
         * no client certificate is used with this endpoint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.4.2.5
         */
        ccdid: number | null;

        /**
         * This field shall indicate a reference count of the number of entities currently using this TLS Endpoint. The
         * node shall recompute this field to reflect the correct value at runtime (e.g., when restored from a persisted
         * value after a reboot).
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.4.2.6
         */
        referenceCount: number;

        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to provision a TLS Endpoint for the provided Hostname / Port combination.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.7.1
     */
    export declare class ProvisionEndpointRequest {
        constructor(values?: Partial<ProvisionEndpointRequest>);

        /**
         * This field shall represent a TLS Hostname.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.1.1
         */
        hostname: Bytes;

        /**
         * This field shall represent a TLS Port Number.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.1.2
         */
        port: number;

        /**
         * This field shall be the TLSCAID used to associate the TLSRCAC with this endpoint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.1.3
         */
        caid: number;

        /**
         * This field shall be the TLSCCDID used to associate the Client Certificate Details with this endpoint. A NULL
         * value means no client certificate is associated.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.1.4
         */
        ccdid: number | null;

        /**
         * This field shall represent the unique TLS Endpoint. A NULL value causes a new endpoint to be created and a
         * non-NULL value allows for updating an existing endpoint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.1.5
         */
        endpointId: number | null;
    };

    /**
     * This command is used to report the result of the ProvisionEndpoint command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.7.2
     */
    export declare class ProvisionEndpointResponse {
        constructor(values?: Partial<ProvisionEndpointResponse>);

        /**
         * This field shall be the TLS Endpoint ID created or updated by the ProvisionEndpoint command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.2.1
         */
        endpointId: number;
    };

    /**
     * This command is used to find a TLS Endpoint by its ID.
     *
     * This command shall return the TLSEndpointStruct for the passed in EndpointID.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.7.3
     */
    export declare class FindEndpointRequest {
        constructor(values?: Partial<FindEndpointRequest>);

        /**
         * This field shall be the TLS Endpoint ID being looked up.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.3.1
         */
        endpointId: number;
    };

    /**
     * This command is used to report the result of the FindEndpoint command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.7.4
     */
    export declare class FindEndpointResponse {
        constructor(values?: Partial<FindEndpointResponse>);

        /**
         * The field shall be a TLSEndpointStruct containing the requested entry.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.4.1
         */
        endpoint: TlsEndpoint;
    };

    /**
     * This command is used to remove a TLS Endpoint by its ID.
     *
     * This command shall be generated to request the Node remove any TLS Endpoint.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.7.5
     */
    export declare class RemoveEndpointRequest {
        constructor(values?: Partial<RemoveEndpointRequest>);

        /**
         * This field shall represent the unique TLSEndpointID of the TLS Endpoint to remove.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.5.7.5.1
         */
        endpointId: number;
    };

    /**
     * @see {@link MatterSpecification.v151.Core} § 14.5.5.1
     */
    export enum StatusCode {
        /**
         * The endpoint is already installed.
         */
        EndpointAlreadyInstalled = 2,

        /**
         * No root certificate exists for this CAID.
         */
        RootCertificateNotFound = 3,

        /**
         * No client certificate exists for this CCDID.
         */
        ClientCertificateNotFound = 4,

        /**
         * The endpoint is in use and cannot be removed.
         */
        EndpointInUse = 5,

        /**
         * Time sync has not yet occurred.
         */
        InvalidTime = 6
    }

    /**
     * Thrown for cluster status code {@link StatusCode.EndpointAlreadyInstalled}.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.5.1
     */
    export class EndpointAlreadyInstalledError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.RootCertificateNotFound}.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.5.1
     */
    export class RootCertificateNotFoundError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.ClientCertificateNotFound}.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.5.1
     */
    export class ClientCertificateNotFoundError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.EndpointInUse}.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.5.1
     */
    export class EndpointInUseError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidTime}.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.5.5.1
     */
    export class InvalidTimeError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link TlsClientManagement}.
     */
    export const Cluster: typeof TlsClientManagement;

    /**
     * @deprecated Use {@link TlsClientManagement}.
     */
    export const Complete: typeof TlsClientManagement;

    export const Typing: TlsClientManagement;
}

/**
 * @deprecated Use {@link TlsClientManagement}.
 */
export declare const TlsClientManagementCluster: typeof TlsClientManagement;

export interface TlsClientManagement extends ClusterTyping {
    Attributes: TlsClientManagement.Attributes;
    Commands: TlsClientManagement.Commands;
    Components: TlsClientManagement.Components;
}
