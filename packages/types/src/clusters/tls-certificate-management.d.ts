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
 * Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn’t require it, to
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the UTCTime attribute of the Time Synchronization cluster is null:
         *
         *     - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side effects.
         *
         *   - If the passed in Certificate is an invalid TLS Certificate:
         *
         *     - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no other side
         *       effects.
         *
         *   - If any existing entry for Certificate is found in ProvisionedRootCertificates which has both a matching
         *     Fingerprint and an associated fabric which matches the accessing fabric:
         *
         *     - Fail the command with the status code ALREADY_EXISTS, and end processing with no other side effects.
         *
         *   - If the passed in CAID is null:
         *
         *     - If the count of entries in the ProvisionedRootCertificates list where the associated fabric matches the
         *       accessing fabric, is equal to the MaxRootCertificates value:
         *
         *       - Fail the command with the status code RESOURCE_EXHAUSTED, and end processing with no other side
         *         effects.
         *
         *     - Generate a new TLSCAID
         *
         *     - Create and populate a TLSCertStruct with the generated TLSCAID and the passed in Certificate field,
         *       associated with the accessing fabric
         *
         *     - Add the resulting TLSCertStruct to the ProvisionedRootCertificates list.
         *
         *   - Else if the passed in CAID is not null:
         *
         *     - If there is no matching entry found for the passed in CAID in the ProvisionedRootCertificates list:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - If the associated fabric of that entry does not equal the accessing fabric:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - Update the Certificate Field field of that entry with the passed in Certificate field.
         *
         *   - Return the TLSCAID as the CAID field in the corresponding ProvisionRootCertificateResponse command.
         *
         * Note when using this command for certificate rotation, the updated certificate will only be used for new
         * underlying TLS connections established after this call.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedRootCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the passed in CAID is null:
         *
         *     - Create an empty list of TLSCertStruct.
         *
         *     - For each entry in ProvisionedRootCertificates:
         *
         *       - If the associated fabric of the entry matches the accessing fabric:
         *
         *         - Add a populated TLSCertStruct entry for the CAID to the resulting list.
         *
         *     - If the resulting list has no entries:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - Else if the passed in CAID is not null:
         *
         *     - If there is no entry in the ProvisionedRootCertificates list that has a CAID Field matching the passed
         *       in CAID:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - If the associated fabric of the TLSCertStruct for that entry does not equal the accessing fabric:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - Create a list of one TLSCertStruct and populate with the values from that entry.
         *
         *   - Return the resulting list in the corresponding FindRootCertificateResponse command.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedRootCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If there is no entry in the ProvisionedRootCertificates list that has a matching Fingerprint, or the
         *     associated fabric of that entry does not equal the accessing fabric:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - Return the CAID of that entry, in the corresponding LookupRootCertificateResponse command.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedRootCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If there is no entry in the ProvisionedRootCertificates list that has a CAID Field matching the passed in
         *     CAID:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the associated fabric of the TLSCertStruct for that entry does not equal the accessing fabric:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the passed in CAID equals the CAID of any entry in the ProvisionedEndpoints list in the TLS Client
         *     Management Cluster:
         *
         *     - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side effects.
         *
         *   - Remove the entry for the passed in CAID from the ProvisionedRootCertificates list.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the passed in CCDID is NULL:
         *
         *     - If the count of entries in the ProvisionedClientCertificates list where the associated fabric matches
         *       the accessing fabric, is equal to the MaxClientCertificates value:
         *
         *       - Fail the command with the status code RESOURCE_EXHAUSTED, and end processing with no other side
         *         effects.
         *
         *     - Generate a new key pair using Crypto_GenerateKeypair.
         *
         *     - If a key collision is detected against any other TLS key pair or Operational credential key pair:
         *
         *       - Discard the new key pair.
         *
         *       - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no other side
         *         effects.
         *
         *     - Generate a new TLSCCDID value.
         *
         *     - Create a new TLSClientCertificateDetailStruct associated with the accessing fabric.
         *
         *     - Set the CCDID field with the newly created TLSCCDID value, and associate the key pair with it.
         *
         *     - Set the ClientCertificate and IntermediateCertificates fields to NULL.
         *
         *     - Add the TLSClientCertificateDetailStruct to the ProvisionedClientCertificates list.
         *
         *   - Else if the passed in CCDID is not NULL:
         *
         *     - If there is no entry in the ProvisionedClientCertificates list that has a matching CCDID to the passed
         *       in CCDID:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - If the associated fabric of that entry does not equal the accessing fabric:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - Generate a tls_csr using the TLS key pair by following the format and procedure in PKCS #10, which
         *     includes a signature using the private key (see RFC 2986 section 4.2) associated with the public key
         *     which is the subjectPublicKey field of the CSR. The CSR subject may be any value and the device SHOULD
         *     NOT expect the final certificate to contain any of the CSR subject DN attributes.
         *
         *   - Compute an ec-signature using Crypto_Sign() of the passed in Nonce, and encode the result as an octet
         *     string into tls_nonce_signature.
         *
         * tls_nonce_signature = Crypto_Sign( message = Nonce, privateKey = TLS Private Key )
         *
         *   - Return the CCDID as CCDID, the DER-encoded tls_csr as CSR, and tls_nonce_signature as NonceSignature, in
         *     the corresponding ClientCSRResponse command.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedClientCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If there is an existing entry for the passed in ClientCertificate in the ProvisionedClientCertificates
         *     list, which has both a matching Fingerprint and an associated fabric that equals the accessing fabric:
         *
         *     - Fail the command with the status code ALREADY_EXISTS, and end processing with no other side effects.
         *
         *   - If there is no entry in the ProvisionedClientCertificates list that has a CCDID matching the passed in
         *     CCDID:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the associated fabric for that entry does not equal the accessing fabric:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If there is any invalid TLS Certificate in the passed in ClientCertificate or IntermediateCertificates:
         *
         *     - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no other side
         *       effects.
         *
         *   - If the public key of the passed in ClientCertificate does not correspond to the private key of the
         *     matching entry:
         *
         *     - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no other side
         *       effects.
         *
         *   - Update the ClientCertificate and IntermediateCertificates fields of that entry to the passed in
         *     ClientCertificate and IntermediateCertificates.
         *
         *   - Return SUCCESS.
         *
         * Note: When using this command for client certificate rotation, only new underlying TLS connections
         * (established after this finishes processing), will use the updated Certificate.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedClientCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the passed in CCDID is null:
         *
         *     - Create a list of TLSClientCertificateDetailStruct
         *
         *     - For each entry in ProvisionedClientCertificates:
         *
         *       - If the entry’s associated fabric matches the accessing fabric:
         *
         *         - Add a populated TLSClientCertificateDetailStruct entry for the passed in CCDID to the resulting
         *           list.
         *
         *     - If the resulting list has no entries:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - Else if the passed in CCDID is not null:
         *
         *     - If there is no entry in the ProvisionedClientCertificates list that has a CCDID matching the passed in
         *       CCDID:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - If the associated fabric of that entry does not equal the accessing fabric:
         *
         *       - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *     - Create a list of one TLSClientCertificateDetailStruct and populate with the values from that entry for
         *       the requested CCDID.
         *
         *   - Return the list as the CertificateDetails field, in the corresponding FindClientCertificateResponse
         *     command.
         *
         * Note: If an entry in the returned list has an empty ClientCertificate field, it means the ClientCSR command
         * was invoked, but the corresponding ProvisionClientCertificate has not been invoked yet.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedClientCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If there is no entry in the ProvisionedClientCertificates list that has a Fingerprint matching the passed
         *     in Fingerprint:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the associated fabric of that entry does not equal the accessing fabric:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - Return the CCDID field of the matching entry, as the CCDID field in the corresponding
         *     LookupClientCertificateResponse command.
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
         * ### Effect on Receipt
         *
         * The following process shall be followed when the server receives this command:
         *
         *   - If the ProvisionedClientCertificates list is empty:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If there is no entry in the ProvisionedClientCertificates list that has a CCDID matching the passed in
         *     CCDID:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the associated fabric of that entry does not equal the accessing fabric:
         *
         *     - Fail the command with the status code NOT_FOUND, and end processing with no other side effects.
         *
         *   - If the passed in CCDID equals the CCDID of any entry in the ProvisionedEndpoints list in the TLS Client
         *     Management Cluster:
         *
         *     - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side effects.
         *
         *   - Remove the entry for the passed in CCDID from the ProvisionedClientCertificates list.
         *
         *   - Remove the TLS Key Pair belonging to the passed in CCDID.
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
