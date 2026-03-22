/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, FabricScopedAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvUInt8, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "@matter/model";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace TlsCertificateManagement {
    /**
     * This encodes the mapping between a TLSCAID and the associated root certificate.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.4.3
     */
    export const TlvTlsCert = TlvObject({
        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.4.3.1
         */
        caid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall be an octet string that represents a certificate encoded using DER encoding.
         *
         * When this field exists and is read over a Large Message capable transport, it shall be included. When this
         * field exists and is read over a non Large Message capable transport, it shall NOT be included. To get the
         * full details of a certificate use the FindRootCertificate command.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.4.3.2
         */
        certificate: TlvOptionalField(1, TlvByteString.bound({ maxLength: 3000 })),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * This encodes the mapping between a TLSCAID and the associated root certificate.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.4.3
     */
    export interface TlsCert extends TypeFromSchema<typeof TlvTlsCert> {}

    /**
     * This encodes a TLS Client Certificate and corresponding ICAC chain.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.4.4
     */
    export const TlvTlsClientCertificateDetail = TlvObject({
        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.4.4.1
         */
        ccdid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall be an octet string that represents a TLS Client Certificate encoded using DER encoding.
         *
         * When this field exists and is read over a Large Message capable transport, it shall be included. When this
         * field exists, is non-NULL, and is read over a non Large Message capable transport, it shall NOT be included.
         * To get the full details of a certificate use the FindClientCertificate command.
         *
         * A NULL value indicates that the TLS Client Certificate Signing Request (CSR) Procedure has not yet completed.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.4.4.2
         */
        clientCertificate: TlvOptionalField(1, TlvNullable(TlvByteString.bound({ maxLength: 3000 }))),

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
         * @see {@link MatterSpecification.v142.Core} § 14.4.4.4.3
         */
        intermediateCertificates: TlvOptionalField(2, TlvArray(TlvByteString, { maxLength: 10 })),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * This encodes a TLS Client Certificate and corresponding ICAC chain.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.4.4
     */
    export interface TlsClientCertificateDetail extends TypeFromSchema<typeof TlvTlsClientCertificateDetail> {}

    /**
     * Input to the TlsCertificateManagement provisionRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.1
     */
    export const TlvProvisionRootCertificateRequest = TlvObject({
        /**
         * This field shall be an octet string that represents a certificate encoded using DER encoding.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.1.1
         */
        certificate: TlvField(0, TlvByteString.bound({ maxLength: 3000 })),

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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.1.2
         */
        caid: TlvField(1, TlvNullable(TlvUInt16))
    });

    /**
     * Input to the TlsCertificateManagement provisionRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.1
     */
    export interface ProvisionRootCertificateRequest extends TypeFromSchema<typeof TlvProvisionRootCertificateRequest> {}

    /**
     * This command shall be generated in response to a ProvisionRootCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.2
     */
    export const TlvProvisionRootCertificateResponse = TlvObject({
        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.2.1
         */
        caid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * This command shall be generated in response to a ProvisionRootCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.2
     */
    export interface ProvisionRootCertificateResponse extends TypeFromSchema<typeof TlvProvisionRootCertificateResponse> {}

    /**
     * Input to the TlsCertificateManagement findRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.3
     */
    export const TlvFindRootCertificateRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.3.1
         */
        caid: TlvField(0, TlvNullable(TlvUInt16))
    });

    /**
     * Input to the TlsCertificateManagement findRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.3
     */
    export interface FindRootCertificateRequest extends TypeFromSchema<typeof TlvFindRootCertificateRequest> {}

    /**
     * This command shall be generated in response to a FindRootCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.4
     */
    export const TlvFindRootCertificateResponse = TlvObject({
        /**
         * This field shall be a list of TLSCertStructs containing a minimum of one TLSCertStruct.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.4.1
         */
        certificateDetails: TlvField(0, TlvArray(TlvTlsCert, { minLength: 1 }))
    });

    /**
     * This command shall be generated in response to a FindRootCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.4
     */
    export interface FindRootCertificateResponse extends TypeFromSchema<typeof TlvFindRootCertificateResponse> {}

    /**
     * Input to the TlsCertificateManagement lookupRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.5
     */
    export const TlvLookupRootCertificateRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.5.1
         */
        fingerprint: TlvField(0, TlvByteString.bound({ maxLength: 64 }))
    });

    /**
     * Input to the TlsCertificateManagement lookupRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.5
     */
    export interface LookupRootCertificateRequest extends TypeFromSchema<typeof TlvLookupRootCertificateRequest> {}

    /**
     * This command shall be generated in response to a LookupRootCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.6
     */
    export const TlvLookupRootCertificateResponse = TlvObject({
        /**
         * This field shall be a TLSCAID representing the unique Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.6.1
         */
        caid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * This command shall be generated in response to a LookupRootCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.6
     */
    export interface LookupRootCertificateResponse extends TypeFromSchema<typeof TlvLookupRootCertificateResponse> {}

    /**
     * Input to the TlsCertificateManagement removeRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.7
     */
    export const TlvRemoveRootCertificateRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.7.1
         */
        caid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * Input to the TlsCertificateManagement removeRootCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.7
     */
    export interface RemoveRootCertificateRequest extends TypeFromSchema<typeof TlvRemoveRootCertificateRequest> {}

    /**
     * Input to the TlsCertificateManagement clientCsr command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.8
     */
    export const TlvClientCsrRequest = TlvObject({
        /**
         * This field shall be an octet string that represents the nonce to be signed by the private key used in the
         * CSR, with the resulting signature returned in the NonceSignature field of ClientCSRResponse.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.8.1
         */
        nonce: TlvField(0, TlvByteString.bound({ length: 32 })),

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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.8.2
         */
        ccdid: TlvField(1, TlvNullable(TlvUInt16.bound({ min: 0, max: 65534 })))
    });

    /**
     * Input to the TlsCertificateManagement clientCsr command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.8
     */
    export interface ClientCsrRequest extends TypeFromSchema<typeof TlvClientCsrRequest> {}

    /**
     * This command shall be generated in response to a ClientCSR command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.9
     */
    export const TlvClientCsrResponse = TlvObject({
        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.9.1
         */
        ccdid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall be a DER-encoded octet string of a PKCS #10 format Certificate Signing Request.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.9.2
         */
        csr: TlvField(1, TlvByteString.bound({ maxLength: 3000 })),

        /**
         * This field shall be an octet string of the ec-signature of the Nonce field from the corresponding ClientCSR
         * command.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.9.3
         */
        nonceSignature: TlvField(2, TlvByteString.bound({ maxLength: 128 }))
    });

    /**
     * This command shall be generated in response to a ClientCSR command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.9
     */
    export interface ClientCsrResponse extends TypeFromSchema<typeof TlvClientCsrResponse> {}

    /**
     * Input to the TlsCertificateManagement provisionClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.10
     */
    export const TlvProvisionClientCertificateRequest = TlvObject({
        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.10.1
         */
        ccdid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall be an octet string that represents a TLS Client Certificate encoded using DER encoding.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.10.2
         */
        clientCertificate: TlvField(1, TlvByteString.bound({ maxLength: 3000 })),

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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.10.3
         */
        intermediateCertificates: TlvField(2, TlvArray(TlvByteString, { minLength: 0, maxLength: 10 }))
    });

    /**
     * Input to the TlsCertificateManagement provisionClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.10
     */
    export interface ProvisionClientCertificateRequest extends TypeFromSchema<typeof TlvProvisionClientCertificateRequest> {}

    /**
     * Input to the TlsCertificateManagement findClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.11
     */
    export const TlvFindClientCertificateRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.11.1
         */
        ccdid: TlvField(0, TlvNullable(TlvUInt16))
    });

    /**
     * Input to the TlsCertificateManagement findClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.11
     */
    export interface FindClientCertificateRequest extends TypeFromSchema<typeof TlvFindClientCertificateRequest> {}

    /**
     * This command shall be generated in response to a FindClientCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.12
     */
    export const TlvFindClientCertificateResponse = TlvObject({
        /**
         * This field shall be a list of TLSClientCertificateDetailStruct containing a minimum of one entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.12.1
         */
        certificateDetails: TlvField(0, TlvArray(TlvTlsClientCertificateDetail, { minLength: 1 }))
    });

    /**
     * This command shall be generated in response to a FindClientCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.12
     */
    export interface FindClientCertificateResponse extends TypeFromSchema<typeof TlvFindClientCertificateResponse> {}

    /**
     * Input to the TlsCertificateManagement lookupClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.13
     */
    export const TlvLookupClientCertificateRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.13.1
         */
        fingerprint: TlvField(0, TlvByteString.bound({ maxLength: 64 }))
    });

    /**
     * Input to the TlsCertificateManagement lookupClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.13
     */
    export interface LookupClientCertificateRequest extends TypeFromSchema<typeof TlvLookupClientCertificateRequest> {}

    /**
     * This command shall be generated in response to a LookupClientCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.14
     */
    export const TlvLookupClientCertificateResponse = TlvObject({
        /**
         * This field shall be a TLSCCDID representing the unique Client Certificate Details ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.14.1
         */
        ccdid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * This command shall be generated in response to a LookupClientCertificate command.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.14
     */
    export interface LookupClientCertificateResponse extends TypeFromSchema<typeof TlvLookupClientCertificateResponse> {}

    /**
     * Input to the TlsCertificateManagement removeClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.15
     */
    export const TlvRemoveClientCertificateRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.15.1
         */
        ccdid: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * Input to the TlsCertificateManagement removeClientCertificate command
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4.6.15
     */
    export interface RemoveClientCertificateRequest extends TypeFromSchema<typeof TlvRemoveClientCertificateRequest> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x801,
        name: "TlsCertificateManagement",
        revision: 1,

        attributes: {
            /**
             * This attribute shall contain the maximum number of per fabric TLSRCACs that can be installed on this
             * Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.5.1
             */
            maxRootCertificates: FixedAttribute(0x0, TlvUInt8.bound({ min: 5, max: 254 })),

            /**
             * This attribute shall be a list of all provisioned TLSCertStruct that are currently installed on this
             * Node. When this attribute is read over a non Large Message capable transport, the Certificate field shall
             * NOT be included. To get the full details of a certificate use the FindRootCertificate command.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.5.2
             */
            provisionedRootCertificates: FabricScopedAttribute(
                0x1,
                TlvArray(TlvTlsCert),
                { persistent: true, default: [] }
            ),

            /**
             * This attribute shall contain the maximum number of per fabric Client Certificates that can be installed
             * on this Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.5.3
             */
            maxClientCertificates: FixedAttribute(0x2, TlvUInt8.bound({ min: 2, max: 254 })),

            /**
             * This attribute shall be a list of all provisioned TLSCCDID that are currently installed on this Node.
             * When this attribute is read over a non Large Message capable transport, the ClientCertificate and
             * IntermediateCertificates fields shall NOT be included. To get the full details of a client certificate
             * use the FindClientCertificate command.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.5.4
             */
            provisionedClientCertificates: FabricScopedAttribute(
                0x3,
                TlvArray(TlvTlsClientCertificateDetail),
                { persistent: true, default: [] }
            )
        },

        commands: {
            /**
             * This command shall provision a newly provided certificate, or rotate an existing one, based on the
             * contents of the CAID field.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.1
             */
            provisionRootCertificate: Command(
                0x0,
                TlvProvisionRootCertificateRequest,
                0x1,
                TlvProvisionRootCertificateResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall return the specified TLS root certificate, or all provisioned TLS root certificates
             * for the accessing fabric, based on the contents of the CAID field.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.3
             */
            findRootCertificate: Command(0x2, TlvFindRootCertificateRequest, 0x3, TlvFindRootCertificateResponse),

            /**
             * This command shall return the CAID for the passed in fingerprint.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.5
             */
            lookupRootCertificate: Command(0x4, TlvLookupRootCertificateRequest, 0x5, TlvLookupRootCertificateResponse),

            /**
             * This command shall be generated to request the server removes the certificate provisioned to the provided
             * Certificate Authority ID.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.7
             */
            removeRootCertificate: Command(
                0x6,
                TlvRemoveRootCertificateRequest,
                0x6,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall be generated to request the Node generates a certificate signing request for a new TLS
             * key pair or use an existing CCDID for certificate rotation.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.8
             */
            clientCsr: Command(
                0x7,
                TlvClientCsrRequest,
                0x8,
                TlvClientCsrResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall be generated to request the Node provisions newly provided Client Certificate Details,
             * or rotate an existing client certificate.
             *
             * This command is typically invoked after having created a new client certificate using the CSR requested
             * in ClientCSR, with the TLSCCDID returned by ClientCSRResponse.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.10
             */
            provisionClientCertificate: Command(
                0x9,
                TlvProvisionClientCertificateRequest,
                0x9,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall return the TLSClientCertificateDetailStruct for the passed in CCDID, or all TLS client
             * certificates for the accessing fabric, based on the contents of the CCDID field.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.11
             */
            findClientCertificate: Command(0xa, TlvFindClientCertificateRequest, 0xb, TlvFindClientCertificateResponse),

            /**
             * This command shall return the CCDID for the passed in Fingerprint.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.13
             */
            lookupClientCertificate: Command(
                0xc,
                TlvLookupClientCertificateRequest,
                0xd,
                TlvLookupClientCertificateResponse
            ),

            /**
             * This command shall be used to request the Node removes all stored information for the provided CCDID.
             *
             * @see {@link MatterSpecification.v142.Core} § 14.4.6.15
             */
            removeClientCertificate: Command(
                0xe,
                TlvRemoveClientCertificateRequest,
                0xe,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * This cluster is used to manage TLS CA Root and Client Certificates on a Node, which are then used by other
     * clusters to provision and manage their usage of TLS.
     *
     * Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn’t require it, to
     * reduce the testing matrix.
     *
     * This cluster shall be present on the root node endpoint when required by a device type, may be present on that
     * endpoint otherwise, and shall NOT be present on any other Endpoint of any Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 14.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type TlsCertificateManagementCluster = TlsCertificateManagement.Cluster;
export const TlsCertificateManagementCluster = TlsCertificateManagement.Cluster;
ClusterRegistry.register(TlsCertificateManagement.Complete);
