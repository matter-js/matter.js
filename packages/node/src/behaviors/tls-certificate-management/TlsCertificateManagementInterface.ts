/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { TlsCertificateManagement } from "@matter/types/clusters/tls-certificate-management";

export namespace TlsCertificateManagementInterface {
    export interface Base {
        /**
         * This command shall provision a newly provided certificate, or rotate an existing one, based on the contents
         * of the CAID field.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.1
         */
        provisionRootCertificate(request: TlsCertificateManagement.ProvisionRootCertificateRequest): MaybePromise<TlsCertificateManagement.ProvisionRootCertificateResponse>;

        /**
         * This command shall return the specified TLS root certificate, or all provisioned TLS root certificates for
         * the accessing fabric, based on the contents of the CAID field.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.3
         */
        findRootCertificate(request: TlsCertificateManagement.FindRootCertificateRequest): MaybePromise<TlsCertificateManagement.FindRootCertificateResponse>;

        /**
         * This command shall return the CAID for the passed in fingerprint.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.5
         */
        lookupRootCertificate(request: TlsCertificateManagement.LookupRootCertificateRequest): MaybePromise<TlsCertificateManagement.LookupRootCertificateResponse>;

        /**
         * This command shall be generated to request the server removes the certificate provisioned to the provided
         * Certificate Authority ID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.7
         */
        removeRootCertificate(request: TlsCertificateManagement.RemoveRootCertificateRequest): MaybePromise;

        /**
         * This command shall be generated to request the Node generates a certificate signing request for a new TLS key
         * pair or use an existing CCDID for certificate rotation.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.8
         */
        clientCsr(request: TlsCertificateManagement.ClientCsrRequest): MaybePromise<TlsCertificateManagement.ClientCsrResponse>;

        /**
         * This command shall be generated to request the Node provisions newly provided Client Certificate Details, or
         * rotate an existing client certificate.
         *
         * This command is typically invoked after having created a new client certificate using the CSR requested in
         * ClientCSR, with the TLSCCDID returned by ClientCSRResponse.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.10
         */
        provisionClientCertificate(request: TlsCertificateManagement.ProvisionClientCertificateRequest): MaybePromise;

        /**
         * This command shall return the TLSClientCertificateDetailStruct for the passed in CCDID, or all TLS client
         * certificates for the accessing fabric, based on the contents of the CCDID field.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.11
         */
        findClientCertificate(request: TlsCertificateManagement.FindClientCertificateRequest): MaybePromise<TlsCertificateManagement.FindClientCertificateResponse>;

        /**
         * This command shall return the CCDID for the passed in Fingerprint.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.13
         */
        lookupClientCertificate(request: TlsCertificateManagement.LookupClientCertificateRequest): MaybePromise<TlsCertificateManagement.LookupClientCertificateResponse>;

        /**
         * This command shall be used to request the Node removes all stored information for the provided CCDID.
         *
         * @see {@link MatterSpecification.v142.Core} § 14.4.6.15
         */
        removeClientCertificate(request: TlsCertificateManagement.RemoveClientCertificateRequest): MaybePromise;
    }
}

export type TlsCertificateManagementInterface = {
    components: [{ flags: {}, methods: TlsCertificateManagementInterface.Base }]
};
