/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "TlsCertificateManagement", pics: "TLSCERT", xref: "core§14.4",

        details: "This cluster is used to manage TLS CA Root and Client Certificates on a Node, which are then used by " +
            "other clusters to provision and manage their usage of TLS." +
            "\n" +
            "Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn’t " +
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
                            "new certificate to be added, and a non-null allows for updating / rotating an existing certificate." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "The following process shall be followed when the server receives this command:" +
                            "\n" +
                            "  - If the UTCTime attribute of the Time Synchronization cluster is null:" +
                            "\n" +
                            "    - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If the passed in Certificate is an invalid TLS Certificate:" +
                            "\n" +
                            "    - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no " +
                            "other side effects." +
                            "\n" +
                            "  - If any existing entry for Certificate is found in ProvisionedRootCertificates which has both a " +
                            "matching Fingerprint and an associated fabric which matches the accessing fabric:" +
                            "\n" +
                            "    - Fail the command with the status code ALREADY_EXISTS, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If the passed in CAID is null:" +
                            "\n" +
                            "    - If the count of entries in the ProvisionedRootCertificates list where the associated fabric " +
                            "matches the accessing fabric, is equal to the MaxRootCertificates value:" +
                            "\n" +
                            "      - Fail the command with the status code RESOURCE_EXHAUSTED, and end processing with no other " +
                            "side effects." +
                            "\n" +
                            "    - Generate a new TLSCAID" +
                            "\n" +
                            "    - Create and populate a TLSCertStruct with the generated TLSCAID and the passed in Certificate " +
                            "field, associated with the accessing fabric" +
                            "\n" +
                            "    - Add the resulting TLSCertStruct to the ProvisionedRootCertificates list." +
                            "\n" +
                            "  - Else if the passed in CAID is not null:" +
                            "\n" +
                            "    - If there is no matching entry found for the passed in CAID in the ProvisionedRootCertificates " +
                            "list:" +
                            "\n" +
                            "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "    - If the associated fabric of that entry does not equal the accessing fabric:" +
                            "\n" +
                            "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "    - Update the Certificate Field field of that entry with the passed in Certificate field." +
                            "\n" +
                            "  - Return the TLSCAID as the CAID field in the corresponding ProvisionRootCertificateResponse " +
                            "command." +
                            "\n" +
                            "Note when using this command for certificate rotation, the updated certificate will only be used for " +
                            "new underlying TLS connections established after this call."
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
                        "return all provisioned root certificates." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedRootCertificates list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the passed in CAID is null:" +
                        "\n" +
                        "    - Create an empty list of TLSCertStruct." +
                        "\n" +
                        "    - For each entry in ProvisionedRootCertificates:" +
                        "\n" +
                        "      - If the associated fabric of the entry matches the accessing fabric:" +
                        "\n" +
                        "        - Add a populated TLSCertStruct entry for the CAID to the resulting list." +
                        "\n" +
                        "    - If the resulting list has no entries:" +
                        "\n" +
                        "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Else if the passed in CAID is not null:" +
                        "\n" +
                        "    - If there is no entry in the ProvisionedRootCertificates list that has a CAID Field matching " +
                        "the passed in CAID:" +
                        "\n" +
                        "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "    - If the associated fabric of the TLSCertStruct for that entry does not equal the accessing " +
                        "fabric:" +
                        "\n" +
                        "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "    - Create a list of one TLSCertStruct and populate with the values from that entry." +
                        "\n" +
                        "  - Return the resulting list in the corresponding FindRootCertificateResponse command."
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

                    details: "This field shall be an octet string that represents the certificate fingerprint." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedRootCertificates list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If there is no entry in the ProvisionedRootCertificates list that has a matching Fingerprint, or " +
                        "the associated fabric of that entry does not equal the accessing fabric:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Return the CAID of that entry, in the corresponding LookupRootCertificateResponse command."
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

                    details: "This field shall be a TLSCAID representing the unique Certificate Authority ID." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedRootCertificates list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If there is no entry in the ProvisionedRootCertificates list that has a CAID Field matching the " +
                        "passed in CAID:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the associated fabric of the TLSCertStruct for that entry does not equal the accessing " +
                        "fabric:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the passed in CAID equals the CAID of any entry in the ProvisionedEndpoints list in the TLS " +
                        "Client Management Cluster:" +
                        "\n" +
                        "    - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Remove the entry for the passed in CAID from the ProvisionedRootCertificates list."
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
                            "key pair and CCDID will be generated. If non-NULL, the existing key-pair for the CCDID will be used." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "The following process shall be followed when the server receives this command:" +
                            "\n" +
                            "  - If the passed in CCDID is NULL:" +
                            "\n" +
                            "    - If the count of entries in the ProvisionedClientCertificates list where the associated fabric " +
                            "matches the accessing fabric, is equal to the MaxClientCertificates value:" +
                            "\n" +
                            "      - Fail the command with the status code RESOURCE_EXHAUSTED, and end processing with no other " +
                            "side effects." +
                            "\n" +
                            "    - Generate a new key pair using Crypto_GenerateKeypair." +
                            "\n" +
                            "    - If a key collision is detected against any other TLS key pair or Operational credential key " +
                            "pair:" +
                            "\n" +
                            "      - Discard the new key pair." +
                            "\n" +
                            "      - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no " +
                            "other side effects." +
                            "\n" +
                            "    - Generate a new TLSCCDID value." +
                            "\n" +
                            "    - Create a new TLSClientCertificateDetailStruct associated with the accessing fabric." +
                            "\n" +
                            "    - Set the CCDID field with the newly created TLSCCDID value, and associate the key pair with it." +
                            "\n" +
                            "    - Set the ClientCertificate and IntermediateCertificates fields to NULL." +
                            "\n" +
                            "    - Add the TLSClientCertificateDetailStruct to the ProvisionedClientCertificates list." +
                            "\n" +
                            "  - Else if the passed in CCDID is not NULL:" +
                            "\n" +
                            "    - If there is no entry in the ProvisionedClientCertificates list that has a matching CCDID to " +
                            "the passed in CCDID:" +
                            "\n" +
                            "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "    - If the associated fabric of that entry does not equal the accessing fabric:" +
                            "\n" +
                            "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - Generate a tls_csr using the TLS key pair by following the format and procedure in PKCS #10, " +
                            "which includes a signature using the private key (see RFC 2986 section 4.2) associated with the " +
                            "public key which is the subjectPublicKey field of the CSR. The CSR subject may be any value and " +
                            "the device SHOULD NOT expect the final certificate to contain any of the CSR subject DN " +
                            "attributes." +
                            "\n" +
                            "  - Compute an ec-signature using Crypto_Sign() of the passed in Nonce, and encode the result as an " +
                            "octet string into tls_nonce_signature." +
                            "\n" +
                            "tls_nonce_signature = Crypto_Sign( message = Nonce, privateKey = TLS Private Key )" +
                            "\n" +
                            "  - Return the CCDID as CCDID, the DER-encoded tls_csr as CSR, and tls_nonce_signature as " +
                            "NonceSignature, in the corresponding ClientCSRResponse command."
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
                            "intermediate certificates are needed." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "The following process shall be followed when the server receives this command:" +
                            "\n" +
                            "  - If the ProvisionedClientCertificates list is empty:" +
                            "\n" +
                            "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If there is an existing entry for the passed in ClientCertificate in the " +
                            "ProvisionedClientCertificates list, which has both a matching Fingerprint and an associated " +
                            "fabric that equals the accessing fabric:" +
                            "\n" +
                            "    - Fail the command with the status code ALREADY_EXISTS, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If there is no entry in the ProvisionedClientCertificates list that has a CCDID matching the " +
                            "passed in CCDID:" +
                            "\n" +
                            "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If the associated fabric for that entry does not equal the accessing fabric:" +
                            "\n" +
                            "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If there is any invalid TLS Certificate in the passed in ClientCertificate or " +
                            "IntermediateCertificates:" +
                            "\n" +
                            "    - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no " +
                            "other side effects." +
                            "\n" +
                            "  - If the public key of the passed in ClientCertificate does not correspond to the private key of " +
                            "the matching entry:" +
                            "\n" +
                            "    - Fail the command with the status code DYNAMIC_CONSTRAINT_ERROR, and end processing with no " +
                            "other side effects." +
                            "\n" +
                            "  - Update the ClientCertificate and IntermediateCertificates fields of that entry to the passed in " +
                            "ClientCertificate and IntermediateCertificates." +
                            "\n" +
                            "  - Return SUCCESS." +
                            "\n" +
                            "Note: When using this command for client certificate rotation, only new underlying TLS connections " +
                            "(established after this finishes processing), will use the updated Certificate."
                    }
                ]
            },

            {
                tag: "command", name: "FindClientCertificate", xref: "core§14.4.6.11",
                details: "This command shall return the TLSClientCertificateDetailStruct for the passed in CCDID, or all TLS " +
                    "client certificates for the accessing fabric, based on the contents of the CCDID field.",

                children: [{
                    tag: "field", name: "Ccdid", xref: "core§14.4.6.11.1",

                    details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedClientCertificates list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the passed in CCDID is null:" +
                        "\n" +
                        "    - Create a list of TLSClientCertificateDetailStruct" +
                        "\n" +
                        "    - For each entry in ProvisionedClientCertificates:" +
                        "\n" +
                        "      - If the entry’s associated fabric matches the accessing fabric:" +
                        "\n" +
                        "        - Add a populated TLSClientCertificateDetailStruct entry for the passed in CCDID to the " +
                        "resulting list." +
                        "\n" +
                        "    - If the resulting list has no entries:" +
                        "\n" +
                        "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Else if the passed in CCDID is not null:" +
                        "\n" +
                        "    - If there is no entry in the ProvisionedClientCertificates list that has a CCDID matching the " +
                        "passed in CCDID:" +
                        "\n" +
                        "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "    - If the associated fabric of that entry does not equal the accessing fabric:" +
                        "\n" +
                        "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "    - Create a list of one TLSClientCertificateDetailStruct and populate with the values from that " +
                        "entry for the requested CCDID." +
                        "\n" +
                        "  - Return the list as the CertificateDetails field, in the corresponding " +
                        "FindClientCertificateResponse command." +
                        "\n" +
                        "Note: If an entry in the returned list has an empty ClientCertificate field, it means the ClientCSR " +
                        "command was invoked, but the corresponding ProvisionClientCertificate has not been invoked yet."
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

                    details: "This field shall be an octet string that represents the certificate fingerprint." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedClientCertificates list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If there is no entry in the ProvisionedClientCertificates list that has a Fingerprint matching " +
                        "the passed in Fingerprint:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the associated fabric of that entry does not equal the accessing fabric:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Return the CCDID field of the matching entry, as the CCDID field in the corresponding " +
                        "LookupClientCertificateResponse command."
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

                    details: "This field shall be a TLSCCDID representing the unique Client Certificate Details ID." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedClientCertificates list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If there is no entry in the ProvisionedClientCertificates list that has a CCDID matching the " +
                        "passed in CCDID:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the associated fabric of that entry does not equal the accessing fabric:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the passed in CCDID equals the CCDID of any entry in the ProvisionedEndpoints list in the TLS " +
                        "Client Management Cluster:" +
                        "\n" +
                        "    - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Remove the entry for the passed in CCDID from the ProvisionedClientCertificates list." +
                        "\n" +
                        "  - Remove the TLS Key Pair belonging to the passed in CCDID."
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
    }
);
