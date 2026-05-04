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

/**
 * Definitions for the TlsCertificateManagement cluster.
 *
 * This cluster is used to manage TLS CA Root and Client Certificates on a Node, which are then used by other clusters
 * to provision and manage their usage of TLS.
 *
 * Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn't require it, to
 * reduce the testing matrix.
 *
 * This cluster shall be present on the root node endpoint when required by a device type, may be present on that
 * endpoint otherwise, and shall NOT be present on any other Endpoint of any Node.
 *
 * @see {@link MatterSpecification.v151.Core} § 14.4
 */
export declare namespace TlsCertificateManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0801;

    /**
     * Textual cluster identifier.
     */
    export const name: "TlsCertificateManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the TlsCertificateManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TlsCertificateManagement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall contain the maximum number of per fabric TLSRCACs that can be installed on this Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.1
         */
        maxRootCertificates: number;

        /**
         * This attribute shall be a list of all provisioned TLSCertStruct that are currently installed on this Node.
         * When this attribute is read over a non Large Message capable transport, the Certificate field shall NOT be
         * included. To get the full details of a certificate use the FindRootCertificate command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.2
         */
        provisionedRootCertificates: TlsCert[];

        /**
         * This attribute shall contain the maximum number of per fabric Client Certificates that can be installed on
         * this Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.3
         */
        maxClientCertificates: number;

        /**
         * This attribute shall be a list of all provisioned TLSCCDID that are currently installed on this Node. When
         * this attribute is read over a non Large Message capable transport, the ClientCertificate and
         * IntermediateCertificates fields shall NOT be included. To get the full details of a client certificate use
         * the FindClientCertificate command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.4
         */
        provisionedClientCertificates: TlsClientCertificateDetail[];
    }

    /**
     * Attributes that may appear in {@link TlsCertificateManagement}.
     */
    export interface Attributes {
        /**
         * This attribute shall contain the maximum number of per fabric TLSRCACs that can be installed on this Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.1
         */
        maxRootCertificates: number;

        /**
         * This attribute shall be a list of all provisioned TLSCertStruct that are currently installed on this Node.
         * When this attribute is read over a non Large Message capable transport, the Certificate field shall NOT be
         * included. To get the full details of a certificate use the FindRootCertificate command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.2
         */
        provisionedRootCertificates: TlsCert[];

        /**
         * This attribute shall contain the maximum number of per fabric Client Certificates that can be installed on
         * this Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.3
         */
        maxClientCertificates: number;

        /**
         * This attribute shall be a list of all provisioned TLSCCDID that are currently installed on this Node. When
         * this attribute is read over a non Large Message capable transport, the ClientCertificate and
         * IntermediateCertificates fields shall NOT be included. To get the full details of a client certificate use
         * the FindClientCertificate command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.5.4
         */
        provisionedClientCertificates: TlsClientCertificateDetail[];
    }

    /**
     * {@link TlsCertificateManagement} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command shall provision a newly provided certificate, or rotate an existing one, based on the contents
         * of the CAID field.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.1
         */
        provisionRootCertificate(request: ProvisionRootCertificateRequest): MaybePromise<ProvisionRootCertificateResponse>;

        /**
         * This command shall return the specified TLS root certificate, or all provisioned TLS root certificates for
         * the accessing fabric, based on the contents of the CAID field.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.3
         */
        findRootCertificate(request: FindRootCertificateRequest): MaybePromise<FindRootCertificateResponse>;

        /**
         * This command shall return the CAID for the passed in fingerprint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.5
         */
        lookupRootCertificate(request: LookupRootCertificateRequest): MaybePromise<LookupRootCertificateResponse>;

        /**
         * This command shall be generated to request the server removes the certificate provisioned to the provided
         * Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.7
         */
        removeRootCertificate(request: RemoveRootCertificateRequest): MaybePromise;

        /**
         * This command shall be generated to request the Node generates a certificate signing request for a new TLS key
         * pair or use an existing CCDID for certificate rotation.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.8
         */
        clientCsr(request: ClientCsrRequest): MaybePromise<ClientCsrResponse>;

        /**
         * This command shall be generated to request the Node provisions newly provided Client Certificate Details, or
         * rotate an existing client certificate.
         *
         * This command is typically invoked after having created a new client certificate using the CSR requested in
         * ClientCSR, with the TLSCCDID returned by ClientCSRResponse.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.10
         */
        provisionClientCertificate(request: ProvisionClientCertificateRequest): MaybePromise;

        /**
         * This command shall return the TLSClientCertificateDetailStruct for the passed in CCDID, or all TLS client
         * certificates for the accessing fabric, based on the contents of the CCDID field.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.11
         */
        findClientCertificate(request: FindClientCertificateRequest): MaybePromise<FindClientCertificateResponse>;

        /**
         * This command shall return the CCDID for the passed in Fingerprint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.13
         */
        lookupClientCertificate(request: LookupClientCertificateRequest): MaybePromise<LookupClientCertificateResponse>;

        /**
         * This command shall be used to request the Node removes all stored information for the provided CCDID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.15
         */
        removeClientCertificate(request: RemoveClientCertificateRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link TlsCertificateManagement}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * This encodes the mapping between a TLSCAID and the associated root certificate.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.4.3
     */
    export declare class TlsCert {
        constructor(values?: Partial<TlsCert>);

        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.4.3.1
         */
        caid: number;

        /**
         * This field shall be an octet string that represents a certificate encoded using DER encoding.
         *
         * When this field exists and is read over a Large Message capable transport, it shall be included. When this
         * field exists and is read over a non Large Message capable transport, it shall NOT be included. To get the
         * full details of a certificate use the FindRootCertificate command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.4.3.2
         */
        certificate?: Bytes;

        fabricIndex: FabricIndex;
    };

    /**
     * This encodes a TLS Client Certificate and corresponding ICAC chain.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.4.4
     */
    export declare class TlsClientCertificateDetail {
        constructor(values?: Partial<TlsClientCertificateDetail>);

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.4.4.1
         */
        ccdid: number;

        /**
         * This field shall be an octet string that represents a TLS Client Certificate encoded using DER encoding.
         *
         * When this field exists and is read over a Large Message capable transport, it shall be included. When this
         * field exists, is non-NULL, and is read over a non Large Message capable transport, it shall NOT be included.
         * To get the full details of a certificate use the FindClientCertificate command.
         *
         * A NULL value indicates that the TLS Client Certificate Signing Request (CSR) Procedure has not yet completed.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.4.4.2
         */
        clientCertificate?: Bytes | null;

        /**
         * This field shall be a list of octet strings representing one or more ICACs (also encoded using DER) that form
         * a Certificate Chain up to, but not including, the TLSRCAC.
         *
         * When this field exists and is read over a Large Message capable transport, it shall be included. When this
         * field exists, is non-empty, and is read over a non Large Message capable transport, it shall NOT be included.
         * To get the full details of a certificate use the FindClientCertificate command.
         *
         * An empty value means that no intermediate certificates are needed for the TLS Server to validate the
         * ClientCertificate.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.4.4.3
         */
        intermediateCertificates?: Bytes[];

        fabricIndex: FabricIndex;
    };

    /**
     * This command shall provision a newly provided certificate, or rotate an existing one, based on the contents of
     * the CAID field.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.1
     */
    export declare class ProvisionRootCertificateRequest {
        constructor(values?: Partial<ProvisionRootCertificateRequest>);

        /**
         * This field shall be an octet string that represents a certificate encoded using DER encoding.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.1.1
         */
        certificate: Bytes;

        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID. A null requests a new
         * certificate to be added, and a non-null allows for updating / rotating an existing certificate.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.1.2
         */
        caid: number | null;
    };

    /**
     * This command shall be generated in response to a ProvisionRootCertificate command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.2
     */
    export declare class ProvisionRootCertificateResponse {
        constructor(values?: Partial<ProvisionRootCertificateResponse>);

        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.2.1
         */
        caid: number;
    };

    /**
     * This command shall return the specified TLS root certificate, or all provisioned TLS root certificates for the
     * accessing fabric, based on the contents of the CAID field.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.3
     */
    export declare class FindRootCertificateRequest {
        constructor(values?: Partial<FindRootCertificateRequest>);

        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID to return, or null to return
         * all provisioned root certificates.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.3.1
         */
        caid: number | null;
    };

    /**
     * This command shall be generated in response to a FindRootCertificate command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.4
     */
    export declare class FindRootCertificateResponse {
        constructor(values?: Partial<FindRootCertificateResponse>);

        /**
         * This field shall be a list of TLSCertStructs containing a minimum of one TLSCertStruct.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.4.1
         */
        certificateDetails: TlsCert[];
    };

    /**
     * This command shall return the CAID for the passed in fingerprint.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.5
     */
    export declare class LookupRootCertificateRequest {
        constructor(values?: Partial<LookupRootCertificateRequest>);

        /**
         * This field shall be an octet string that represents the certificate fingerprint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.5.1
         */
        fingerprint: Bytes;
    };

    /**
     * This command shall be generated in response to a LookupRootCertificate command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.6
     */
    export declare class LookupRootCertificateResponse {
        constructor(values?: Partial<LookupRootCertificateResponse>);

        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.6.1
         */
        caid: number;
    };

    /**
     * This command shall be generated to request the server removes the certificate provisioned to the provided
     * Certificate Authority ID.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.7
     */
    export declare class RemoveRootCertificateRequest {
        constructor(values?: Partial<RemoveRootCertificateRequest>);

        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.7.1
         */
        caid: number;
    };

    /**
     * This command shall be generated to request the Node generates a certificate signing request for a new TLS key
     * pair or use an existing CCDID for certificate rotation.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.8
     */
    export declare class ClientCsrRequest {
        constructor(values?: Partial<ClientCsrRequest>);

        /**
         * This field shall be an octet string that represents the nonce to be signed by the private key used in the
         * CSR, with the resulting signature returned in the NonceSignature field of ClientCSRResponse.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.8.1
         */
        nonce: Bytes;

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID. If NULL, a new key pair
         * and CCDID will be generated. If non-NULL, the existing key-pair for the CCDID will be used.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.8.2
         */
        ccdid: number | null;
    };

    /**
     * This command shall be generated in response to a ClientCSR command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.9
     */
    export declare class ClientCsrResponse {
        constructor(values?: Partial<ClientCsrResponse>);

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.9.1
         */
        ccdid: number;

        /**
         * This field shall be a DER-encoded octet string of a PKCS #10 format Certificate Signing Request.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.9.2
         */
        csr: Bytes;

        /**
         * This field shall be an octet string of the ec-signature of the Nonce field from the corresponding ClientCSR
         * command.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.9.3
         */
        nonceSignature: Bytes;
    };

    /**
     * This command shall be generated to request the Node provisions newly provided Client Certificate Details, or
     * rotate an existing client certificate.
     *
     * This command is typically invoked after having created a new client certificate using the CSR requested in
     * ClientCSR, with the TLSCCDID returned by ClientCSRResponse.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.10
     */
    export declare class ProvisionClientCertificateRequest {
        constructor(values?: Partial<ProvisionClientCertificateRequest>);

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.10.1
         */
        ccdid: number;

        /**
         * This field shall be an octet string that represents a TLS Client Certificate encoded using DER encoding.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.10.2
         */
        clientCertificate: Bytes;

        /**
         * This field shall be a list of octet strings representing one or more ICACs (also encoded using DER) that form
         * a Certificate Chain up to, but not including, the TLSRCAC. An empty value means no intermediate certificates
         * are needed.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.10.3
         */
        intermediateCertificates: Bytes[];
    };

    /**
     * This command shall return the TLSClientCertificateDetailStruct for the passed in CCDID, or all TLS client
     * certificates for the accessing fabric, based on the contents of the CCDID field.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.11
     */
    export declare class FindClientCertificateRequest {
        constructor(values?: Partial<FindClientCertificateRequest>);

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.11.1
         */
        ccdid: number | null;
    };

    /**
     * This command shall be generated in response to a FindClientCertificate command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.12
     */
    export declare class FindClientCertificateResponse {
        constructor(values?: Partial<FindClientCertificateResponse>);

        /**
         * This field shall be a list of TLSClientCertificateDetailStruct containing a minimum of one entry.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.12.1
         */
        certificateDetails: TlsClientCertificateDetail[];
    };

    /**
     * This command shall return the CCDID for the passed in Fingerprint.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.13
     */
    export declare class LookupClientCertificateRequest {
        constructor(values?: Partial<LookupClientCertificateRequest>);

        /**
         * This field shall be an octet string that represents the certificate fingerprint.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.13.1
         */
        fingerprint: Bytes;
    };

    /**
     * This command shall be generated in response to a LookupClientCertificate command.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.14
     */
    export declare class LookupClientCertificateResponse {
        constructor(values?: Partial<LookupClientCertificateResponse>);

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.14.1
         */
        ccdid: number;
    };

    /**
     * This command shall be used to request the Node removes all stored information for the provided CCDID.
     *
     * @see {@link MatterSpecification.v151.Core} § 14.4.6.15
     */
    export declare class RemoveClientCertificateRequest {
        constructor(values?: Partial<RemoveClientCertificateRequest>);

        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v151.Core} § 14.4.6.15.1
         */
        ccdid: number;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link TlsCertificateManagement}.
     */
    export const Cluster: typeof TlsCertificateManagement;

    /**
     * @deprecated Use {@link TlsCertificateManagement}.
     */
    export const Complete: typeof TlsCertificateManagement;

    export const Typing: TlsCertificateManagement;
}

/**
 * @deprecated Use {@link TlsCertificateManagement}.
 */
export declare const TlsCertificateManagementCluster: typeof TlsCertificateManagement;

export interface TlsCertificateManagement extends ClusterTyping {
    Attributes: TlsCertificateManagement.Attributes;
    Commands: TlsCertificateManagement.Commands;
    Components: TlsCertificateManagement.Components;
}
