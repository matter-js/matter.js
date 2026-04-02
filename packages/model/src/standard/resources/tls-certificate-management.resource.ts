/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "TlsCertificateManagement", pics: "TLSCERT", xref: "core§14.4",

    details: "This cluster is used to manage TLS CA Root and Client Certificates on a Node, which are then used by " +
        "other clusters to provision and manage their usage of TLS." +
        "\n" +
        "Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn't " +
        "require it, to reduce the testing matrix." +
        "\n" +
        "This cluster shall be present on the root node endpoint when required by a device type, may be " +
        "present on that endpoint otherwise, and shall NOT be present on any other Endpoint of any Node.",

    children: [
        {
            tag: "attribute", name: "MaxRootCertificates", xref: "core§14.4.5.1",
            details: "This attribute shall contain the maximum number of per fabric TLSRCACs that can be installed on this " +
                "Node."
        },

        {
            tag: "attribute", name: "ProvisionedRootCertificates", xref: "core§14.4.5.2",
            details: "This attribute shall be a list of all provisioned TLSCertStruct that are currently installed on this " +
                "Node. When this attribute is read over a non Large Message capable transport, the Certificate field " +
                "shall NOT be included. To get the full details of a certificate use the FindRootCertificate command."
        },

        {
            tag: "attribute", name: "MaxClientCertificates", xref: "core§14.4.5.3",
            details: "This attribute shall contain the maximum number of per fabric Client Certificates that can be " +
                "installed on this Node."
        },

        {
            tag: "attribute", name: "ProvisionedClientCertificates", xref: "core§14.4.5.4",
            details: "This attribute shall be a list of all provisioned TLSCCDID that are currently installed on this " +
                "Node. When this attribute is read over a non Large Message capable transport, the ClientCertificate " +
                "and IntermediateCertificates fields shall NOT be included. To get the full details of a client " +
                "certificate use the FindClientCertificate command."
        },

        {
            tag: "command", name: "ProvisionRootCertificate", xref: "core§14.4.6.1",
            details: "This command shall provision a newly provided certificate, or rotate an existing one, based on the " +
                "contents of the CAID field.",

            children: [
                {
                    tag: "field", name: "Certificate", xref: "core§14.4.6.1.1",
                    details: "This field shall be an octet string that represents a certificate encoded using DER encoding."
                },
                {
                    tag: "field", name: "Caid", xref: "core§14.4.6.1.2",
                    details: "This field shall be a TLSCAID representing the unique Certificate Authority ID. A null requests a " +
                        "new certificate to be added, and a non-null allows for updating / rotating an existing certificate."
                }
            ]
        },

        {
            tag: "command", name: "ProvisionRootCertificateResponse", xref: "core§14.4.6.2",
            details: "This command shall be generated in response to a ProvisionRootCertificate command.",
            children: [{
                tag: "field", name: "Caid", xref: "core§14.4.6.2.1",
                details: "This field shall be a TLSCAID representing the unique Certificate Authority ID."
            }]
        },

        {
            tag: "command", name: "FindRootCertificate", xref: "core§14.4.6.3",
            details: "This command shall return the specified TLS root certificate, or all provisioned TLS root " +
                "certificates for the accessing fabric, based on the contents of the CAID field.",
            children: [{
                tag: "field", name: "Caid", xref: "core§14.4.6.3.1",
                details: "This field shall be a TLSCAID representing the unique Certificate Authority ID to return, or null to " +
                    "return all provisioned root certificates."
            }]
        },

        {
            tag: "command", name: "FindRootCertificateResponse", xref: "core§14.4.6.4",
            details: "This command shall be generated in response to a FindRootCertificate command.",
            children: [{
                tag: "field", name: "CertificateDetails", xref: "core§14.4.6.4.1",
                details: "This field shall be a list of TLSCertStructs containing a minimum of one TLSCertStruct."
            }]
        },

        {
            tag: "command", name: "LookupRootCertificate", xref: "core§14.4.6.5",
            details: "This command shall return the CAID for the passed in fingerprint.",
            children: [{
                tag: "field", name: "Fingerprint", xref: "core§14.4.6.5.1",
                details: "This field shall be an octet string that represents the certificate fingerprint."
            }]
        },

        {
            tag: "command", name: "LookupRootCertificateResponse", xref: "core§14.4.6.6",
            details: "This command shall be generated in response to a LookupRootCertificate command.",
            children: [{
                tag: "field", name: "Caid", xref: "core§14.4.6.6.1",
                details: "This field shall be a TLSCAID representing the unique Certificate Authority ID."
            }]
        },

        {
            tag: "command", name: "RemoveRootCertificate", xref: "core§14.4.6.7",
            details: "This command shall be generated to request the server removes the certificate provisioned to the " +
                "provided Certificate Authority ID.",
            children: [{
                tag: "field", name: "Caid", xref: "core§14.4.6.7.1",
                details: "This field shall be a TLSCAID representing the unique Certificate Authority ID."
            }]
        },

        {
            tag: "command", name: "ClientCsr", xref: "core§14.4.6.8",
            details: "This command shall be generated to request the Node generates a certificate signing request for a " +
                "new TLS key pair or use an existing CCDID for certificate rotation.",

            children: [
                {
                    tag: "field", name: "Nonce", xref: "core§14.4.6.8.1",
                    details: "This field shall be an octet string that represents the nonce to be signed by the private key used " +
                        "in the CSR, with the resulting signature returned in the NonceSignature field of ClientCSRResponse."
                },
                {
                    tag: "field", name: "Ccdid", xref: "core§14.4.6.8.2",
                    details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID. If NULL, a new " +
                        "key pair and CCDID will be generated. If non-NULL, the existing key-pair for the CCDID will be used."
                }
            ]
        },

        {
            tag: "command", name: "ClientCsrResponse", xref: "core§14.4.6.9",
            details: "This command shall be generated in response to a ClientCSR command.",

            children: [
                {
                    tag: "field", name: "Ccdid", xref: "core§14.4.6.9.1",
                    details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID."
                },
                {
                    tag: "field", name: "Csr", xref: "core§14.4.6.9.2",
                    details: "This field shall be a DER-encoded octet string of a PKCS #10 format Certificate Signing Request."
                },
                {
                    tag: "field", name: "NonceSignature", xref: "core§14.4.6.9.3",
                    details: "This field shall be an octet string of the ec-signature of the Nonce field from the corresponding " +
                        "ClientCSR command."
                }
            ]
        },

        {
            tag: "command", name: "ProvisionClientCertificate", xref: "core§14.4.6.10",
            details: "This command shall be generated to request the Node provisions newly provided Client Certificate " +
                "Details, or rotate an existing client certificate." +
                "\n" +
                "This command is typically invoked after having created a new client certificate using the CSR " +
                "requested in ClientCSR, with the TLSCCDID returned by ClientCSRResponse.",

            children: [
                {
                    tag: "field", name: "Ccdid", xref: "core§14.4.6.10.1",
                    details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID."
                },
                {
                    tag: "field", name: "ClientCertificate", xref: "core§14.4.6.10.2",
                    details: "This field shall be an octet string that represents a TLS Client Certificate encoded using DER " +
                        "encoding."
                },

                {
                    tag: "field", name: "IntermediateCertificates", xref: "core§14.4.6.10.3",
                    details: "This field shall be a list of octet strings representing one or more ICACs (also encoded using DER) " +
                        "that form a Certificate Chain up to, but not including, the TLSRCAC. An empty value means no " +
                        "intermediate certificates are needed."
                }
            ]
        },

        {
            tag: "command", name: "FindClientCertificate", xref: "core§14.4.6.11",
            details: "This command shall return the TLSClientCertificateDetailStruct for the passed in CCDID, or all TLS " +
                "client certificates for the accessing fabric, based on the contents of the CCDID field.",
            children: [{
                tag: "field", name: "Ccdid", xref: "core§14.4.6.11.1",
                details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID."
            }]
        },

        {
            tag: "command", name: "FindClientCertificateResponse", xref: "core§14.4.6.12",
            details: "This command shall be generated in response to a FindClientCertificate command.",
            children: [{
                tag: "field", name: "CertificateDetails", xref: "core§14.4.6.12.1",
                details: "This field shall be a list of TLSClientCertificateDetailStruct containing a minimum of one entry."
            }]
        },

        {
            tag: "command", name: "LookupClientCertificate", xref: "core§14.4.6.13",
            details: "This command shall return the CCDID for the passed in Fingerprint.",
            children: [{
                tag: "field", name: "Fingerprint", xref: "core§14.4.6.13.1",
                details: "This field shall be an octet string that represents the certificate fingerprint."
            }]
        },

        {
            tag: "command", name: "LookupClientCertificateResponse", xref: "core§14.4.6.14",
            details: "This command shall be generated in response to a LookupClientCertificate command.",
            children: [{
                tag: "field", name: "Ccdid", xref: "core§14.4.6.14.1",
                details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID."
            }]
        },

        {
            tag: "command", name: "RemoveClientCertificate", xref: "core§14.4.6.15",
            details: "This command shall be used to request the Node removes all stored information for the provided " +
                "CCDID.",
            children: [{
                tag: "field", name: "Ccdid", xref: "core§14.4.6.15.1",
                details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID."
            }]
        },

        {
            tag: "datatype", name: "TLSCAID", xref: "core§14.4.4.1",
            details: "This data type is derived from uint16 and represents a provisioned certificate authority certificate " +
                "with valid values from 0 to 65534. This value SHOULD start at 0 and monotonically increase by 1 with " +
                "each new allocation provisioned by the Node. A value incremented past 65534 SHOULD wrap to 0. The " +
                "Node shall verify that a new value does not match any other value for this type. If such a match is " +
                "found, the value shall be changed until a unique value is found."
        },

        {
            tag: "datatype", name: "TLSCCDID", xref: "core§14.4.4.2",
            details: "This data type is derived from uint16 and represents a provisioned client certificate with valid " +
                "values from 0 to 65534. This value SHOULD start at 0 and monotonically increase by 1 with each new " +
                "allocation provisioned by the Node. A value incremented past 65534 SHOULD wrap to 0. The Node shall " +
                "verify that a new value does not match any other value for this type. If such a match is found, the " +
                "value shall be changed until a unique value is found."
        },

        {
            tag: "datatype", name: "TLSCertStruct", xref: "core§14.4.4.3",
            details: "This encodes the mapping between a TLSCAID and the associated root certificate.",

            children: [
                {
                    tag: "field", name: "Caid", xref: "core§14.4.4.3.1",
                    details: "This field shall be a TLSCAID representing the unique Certificate Authority ID."
                },

                {
                    tag: "field", name: "Certificate", xref: "core§14.4.4.3.2",
                    details: "This field shall be an octet string that represents a certificate encoded using DER encoding." +
                        "\n" +
                        "When this field exists and is read over a Large Message capable transport, it shall be included. " +
                        "When this field exists and is read over a non Large Message capable transport, it shall NOT be " +
                        "included. To get the full details of a certificate use the FindRootCertificate command."
                }
            ]
        },

        {
            tag: "datatype", name: "TLSClientCertificateDetailStruct", xref: "core§14.4.4.4",
            details: "This encodes a TLS Client Certificate and corresponding ICAC chain.",

            children: [
                {
                    tag: "field", name: "Ccdid", xref: "core§14.4.4.4.1",
                    details: "This field shall be a TLSCCDID representing the unique Client Certificate ID."
                },

                {
                    tag: "field", name: "ClientCertificate", xref: "core§14.4.4.4.2",

                    details: "This field shall be an octet string that represents a TLS Client Certificate encoded using DER " +
                        "encoding." +
                        "\n" +
                        "When this field exists and is read over a Large Message capable transport, it shall be included. " +
                        "When this field exists, is non-NULL, and is read over a non Large Message capable transport, it " +
                        "shall NOT be included. To get the full details of a certificate use the FindClientCertificate " +
                        "command." +
                        "\n" +
                        "A NULL value indicates that the TLS Client Certificate Signing Request (CSR) Procedure has not yet " +
                        "completed."
                },

                {
                    tag: "field", name: "IntermediateCertificates", xref: "core§14.4.4.4.3",

                    details: "This field shall be a list of octet strings representing one or more ICACs (also encoded using DER) " +
                        "that form a Certificate Chain up to, but not including, the TLSRCAC." +
                        "\n" +
                        "When this field exists and is read over a Large Message capable transport, it shall be included. " +
                        "When this field exists, is non-empty, and is read over a non Large Message capable transport, it " +
                        "shall NOT be included. To get the full details of a certificate use the FindClientCertificate " +
                        "command." +
                        "\n" +
                        "An empty value means that no intermediate certificates are needed for the TLS Server to validate the " +
                        "ClientCertificate."
                }
            ]
        }
    ]
});
