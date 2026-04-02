/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "OperationalCredentials", pics: "OPCREDS", xref: "core§11.18",
    details: "This cluster is used to add or remove Node Operational credentials on a Commissionee or " +
        "already-configured Node, as well as manage the associated Fabrics.",

    children: [
        {
            tag: "attribute", name: "Nocs", xref: "core§11.18.5.1",

            details: "This attribute shall contain all NOCs applicable to this Node, encoded as a read-only list of " +
                "NOCStruct." +
                "\n" +
                "Operational Certificates shall be added through the AddNOC command, and shall be removed through the " +
                "RemoveFabric command." +
                "\n" +
                "Upon Factory Data Reset, this attribute shall be set to a default value of an empty list." +
                "\n" +
                "The number of entries in this list shall match the number of entries in the Fabrics attribute."
        },

        {
            tag: "attribute", name: "Fabrics", xref: "core§11.18.5.2",

            details: "Indicates all fabrics to which this Node is commissioned, encoded as a read-only list of " +
                "FabricDescriptorStruct. This information may be computed directly from the NOCs attribute." +
                "\n" +
                "The Fabrics attribute is also known as \"the fabric table\"." +
                "\n" +
                "Upon Factory Data Reset, this attribute shall be set to a default value of an empty list." +
                "\n" +
                "The number of entries in this list shall match the number of entries in the NOCs attribute."
        },

        {
            tag: "attribute", name: "SupportedFabrics", xref: "core§11.18.5.3",
            details: "Indicates the number of Fabrics that are supported by the device. This value is fixed for a " +
                "particular device."
        },

        {
            tag: "attribute", name: "CommissionedFabrics", xref: "core§11.18.5.4",

            details: "Indicates the number of Fabrics to which the device is currently commissioned. This attribute shall " +
                "be equal to the following:" +
                "\n" +
                "  - The number of entries in the NOCs attribute." +
                "\n" +
                "  - The number of entries in the Fabrics attribute." +
                "\n" +
                "Upon Factory Data Reset, this attribute shall be set to a default value of 0."
        },

        {
            tag: "attribute", name: "TrustedRootCertificates", xref: "core§11.18.5.5",

            details: "This attribute shall contain the list of Trusted Root CA Certificates (RCAC) installed on the Node, " +
                "as octet strings containing their Matter Certificate Encoding representation." +
                "\n" +
                "These certificates are installed through the AddTrustedRootCertificate command." +
                "\n" +
                "Depending on the method of storage employed by the server, either shared storage for identical root " +
                "certificates shared by many fabrics, or individually stored root certificate per fabric, multiple " +
                "identical root certificates may legally appear within the list." +
                "\n" +
                "To match a root with a given fabric, the root certificate's subject and subject public key need to " +
                "be cross-referenced with the NOC or ICAC certificates that appear in the NOCs attribute for a given " +
                "fabric." +
                "\n" +
                "Upon Factory Data Reset, this attribute shall be set to a default value whereby the list is empty."
        },

        {
            tag: "attribute", name: "CurrentFabricIndex", xref: "core§11.18.5.6",
            details: "Indicates the accessing fabric index." +
                "\n" +
                "This attribute is useful to contextualize Fabric-Scoped entries obtained from response commands or " +
                "attribute reads, since a given Fabric may be referenced by a different Fabric Index locally on a " +
                "remote Node."
        },

        {
            tag: "command", name: "AttestationRequest", xref: "core§11.18.6.1",

            details: "This command is used to perform an attestation request." +
                "\n" +
                "This command shall be generated to request the Attestation Information, in the form of an " +
                "AttestationResponse Command. If the AttestationNonce that is provided in the command is malformed, a " +
                "recipient shall fail the command with a Status Code of INVALID_COMMAND. The AttestationNonce field " +
                "shall be used in the computation of the Attestation Information."
        },

        {
            tag: "command", name: "AttestationResponse", xref: "core§11.18.6.2",

            details: "This command is used to report the results of the AttestationRequest command. This command shall be " +
                "generated in response to an Attestation Request command." +
                "\n" +
                "See Section 11.18.4.7, \"Attestation Information\" for details about the generation of the fields " +
                "within this response command." +
                "\n" +
                "See Section F.2, \"Device Attestation Response test vector\" for an example computation of an " +
                "AttestationResponse.",

            children: [
                {
                    tag: "field", name: "AttestationElements", xref: "core§11.18.6.2.1",
                    details: "This field shall contain the octet string of the serialized attestation_elements_message."
                },
                {
                    tag: "field", name: "AttestationSignature", xref: "core§11.18.6.2.2",
                    details: "This field shall contain the octet string of the necessary attestation_signature as described in " +
                        "Section 11.18.4.7, \"Attestation Information\"."
                }
            ]
        },

        {
            tag: "command", name: "CertificateChainRequest", xref: "core§11.18.6.3",
            details: "This command is used to request a certificate from the device attestation certificate chain." +
                "\n" +
                "If the CertificateType is not a valid value per CertificateChainTypeEnum then the command shall fail " +
                "with a Status Code of INVALID_COMMAND."
        },

        {
            tag: "command", name: "CertificateChainResponse", xref: "core§11.18.6.4",
            details: "This command is used to report the results of the CertificateChainRequest command. This command " +
                "shall be generated in response to a CertificateChainRequest command.",
            children: [{
                tag: "field", name: "Certificate", xref: "core§11.18.6.4.1",
                details: "This field shall be the DER encoded certificate corresponding to the CertificateType field in the " +
                    "CertificateChainRequest command."
            }]
        },

        {
            tag: "command", name: "CsrRequest", xref: "core§11.18.6.5",

            details: "This command is used to perform a CSR request." +
                "\n" +
                "This command shall be generated to execute the Node Operational CSR Procedure and subsequently " +
                "return the NOCSR Information, in the form of a CSRResponse Command." +
                "\n" +
                "The CSRNonce field shall be used in the computation of the NOCSR Information. If the CSRNonce is " +
                "malformed, then this command shall fail with an INVALID_COMMAND status code." +
                "\n" +
                "If the IsForUpdateNOC field is present and set to true, but the command was received over a PASE " +
                "session, the command shall fail with an INVALID_COMMAND status code, as it would never be possible " +
                "to use a resulting subsequent certificate issued from the CSR with the UpdateNOC command, which is " +
                "forbidden over PASE sessions." +
                "\n" +
                "If the IsForUpdateNOC field is present and set to true, the internal state of the CSR associated key " +
                "pair shall be tagged as being for a subsequent UpdateNOC, otherwise the internal state of the CSR " +
                "shall be tagged as being for a subsequent AddNOC. See Section 11.18.6.8, \"AddNOC Command\" and " +
                "Section 11.18.6.9, \"UpdateNOC Command\" for details about the processing." +
                "\n" +
                "If this command is received without an armed fail-safe context (see Section 11.10.7.2, " +
                "\"ArmFailSafe\"), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                "initiator." +
                "\n" +
                "If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, " +
                "then this command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator." +
                "\n" +
                "If the Node Operational Key Pair generated during processing of the Node Operational CSR Procedure " +
                "is found to collide with an existing key pair already previously generated and installed, and that " +
                "check had been executed, then this command shall fail with a FAILURE status code sent back to the " +
                "initiator."
        },

        {
            tag: "command", name: "CsrResponse", xref: "core§11.18.6.6",

            details: "This command is used to report the results of the CSRRequest command. This command shall be " +
                "generated in response to a CSRRequest Command." +
                "\n" +
                "See Section 11.18.4.9, \"NOCSR Information\" for details about the generation of the fields within " +
                "this response command." +
                "\n" +
                "See Section F.3, \"Node Operational CSR Response test vector\" for an example computation of a " +
                "CSRResponse.",

            children: [
                {
                    tag: "field", name: "NocsrElements", xref: "core§11.18.6.6.1",
                    details: "This field shall contain the octet string of the serialized nocsr_elements_message."
                },
                {
                    tag: "field", name: "AttestationSignature", xref: "core§11.18.6.6.2",
                    details: "This field shall contain the octet string of the necessary attestation_signature as described in " +
                        "Section 11.18.4.9, \"NOCSR Information\"."
                }
            ]
        },

        {
            tag: "command", name: "AddNoc", xref: "core§11.18.6.8",

            details: "This command is used to add a new NOC to the device." +
                "\n" +
                "This command shall add a new NOC chain to the device and commission a new Fabric association upon " +
                "successful validation of all arguments and preconditions." +
                "\n" +
                "The new value shall immediately be reflected in the NOCs list attribute." +
                "\n" +
                "A Commissioner or Administrator shall issue this command after issuing the CSRRequest command and " +
                "receiving its response." +
                "\n" +
                "A Commissioner or Administrator SHOULD issue this command after performing the Attestation " +
                "Procedure.",

            children: [
                {
                    tag: "field", name: "IpkValue", xref: "core§11.18.6.8.1",

                    details: "This field shall contain the value of the Epoch Key for the Identity Protection Key (IPK) to set for " +
                        "the Fabric which is to be added. This is needed to bootstrap a necessary configuration value for " +
                        "subsequent CASE to succeed. See Section 4.14.2.6.1, \"Identity Protection Key (IPK)\" for details." +
                        "\n" +
                        "The IPK shall be provided as an octet string of length CRYPTO_SYMMETRIC_KEY_LENGTH_BYTES." +
                        "\n" +
                        "On successful execution of the AddNOC command, the side-effect of having provided this field shall " +
                        "be equivalent to having done a GroupKeyManagement cluster KeySetWrite command invocation using the " +
                        "newly joined fabric as the accessing fabric and with the following argument fields (assuming " +
                        "KeySetWrite allowed a GroupKeySetID set to 0):"
                },

                {
                    tag: "field", name: "CaseAdminSubject", xref: "core§11.18.6.8.2",

                    details: "If the AddNOC command succeeds according to the semantics of the following subsections, then the " +
                        "Access Control subject-id shall be used to atomically add an Access Control Entry enabling that " +
                        "Subject to subsequently administer the Node whose operational identity is being added by this " +
                        "command." +
                        "\n" +
                        "The format of the new Access Control Entry, created from this, shall be:" +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> NOTE: Unless such an Access Control Entry is added atomically as described here, there would be no " +
                        "way for the caller on its given Fabric to eventually add another Access Control Entry for CASE " +
                        "authentication mode, to enable the new Administrator to administer the device, since the Fabric " +
                        "Scoping of the Access Control List prevents the current Node from being able to write new entries " +
                        "scoped to that Fabric, if the session is established from CASE. While a session established from " +
                        "PASE does gain Fabric Scope of a newly-joined Fabric, this argument is made mandatory to provide " +
                        "symmetry between both types of session establishment, both of which need to eventually add an " +
                        "\"Administer Node over CASE\" Access Control Entry to finalize new Fabric configuration and " +
                        "subsequently be able to call the CommissioningComplete command."
                },

                {
                    tag: "field", name: "AdminVendorId", xref: "core§11.18.6.8.3",
                    details: "This field shall be set to the Vendor ID of the entity issuing the AddNOC command. This value shall " +
                        "NOT be one of the reserved Vendor ID values defined in Table 1, \"Vendor ID Allocations\"."
                }
            ]
        },

        {
            tag: "command", name: "UpdateNoc", xref: "core§11.18.6.9",

            details: "This command is used to update an existing NOC on the device." +
                "\n" +
                "This command shall replace the NOC and optional associated ICAC (if present) scoped under the " +
                "accessing fabric upon successful validation of all arguments and preconditions. The new value shall " +
                "immediately be reflected in the NOCs list attribute." +
                "\n" +
                "A Commissioner or Administrator shall issue this command after issuing the CSRRequest Command and " +
                "receiving its response." +
                "\n" +
                "A Commissioner or Administrator SHOULD issue this command after performing the Attestation " +
                "Procedure."
        },

        {
            tag: "command", name: "NocResponse", xref: "core§11.18.6.10",

            details: "This command is used to report the results of the AddNOC, UpdateNOC, UpdateFabricLabel and " +
                "RemoveFabric commands." +
                "\n" +
                "This command shall be generated in response to the following commands:" +
                "\n" +
                "  - AddNOC" +
                "\n" +
                "  - UpdateNOC" +
                "\n" +
                "  - UpdateFabricLabel" +
                "\n" +
                "  - RemoveFabric" +
                "\n" +
                "It provides status information about the success or failure of those commands.",

            children: [
                {
                    tag: "field", name: "StatusCode", xref: "core§11.18.6.10.1",
                    details: "This field shall contain an NOCStatus value representing the status of an operation involving a NOC."
                },
                {
                    tag: "field", name: "FabricIndex", xref: "core§11.18.6.10.2",
                    details: "If present, it shall contain the Fabric Index of the Fabric last added, removed or updated."
                },

                {
                    tag: "field", name: "DebugText", xref: "core§11.18.6.10.3",
                    details: "This field may contain debugging textual information from the cluster implementation, which SHOULD " +
                        "NOT be presented to user interfaces in any way. Its purpose is to help developers in troubleshooting " +
                        "errors and the contents may go into logs or crash reports."
                }
            ]
        },

        {
            tag: "command", name: "UpdateFabricLabel", xref: "core§11.18.6.11",

            details: "This command is used to set the user-visible fabric label for a given Fabric." +
                "\n" +
                "This command shall be used by an Administrator to set the user-visible Label field for a given " +
                "Fabric, as reflected by entries in the Fabrics attribute. An Administrator shall use this command to " +
                "set the Label to a string (possibly selected by the user themselves) that the user can recognize and " +
                "relate to this Administrator" +
                "\n" +
                "  - during the commissioning process, and" +
                "\n" +
                "  - whenever the user chooses to update this string." +
                "\n" +
                "The Label field, along with the VendorID field in the same entry of the Fabrics attribute, SHOULD be " +
                "used by Administrators to provide additional per-fabric context when operations such as RemoveFabric " +
                "are considered or used.",

            children: [{
                tag: "field", name: "Label", xref: "core§11.18.6.11.1",
                details: "This field shall contain the label to set for the fabric associated with the current secure session."
            }]
        },

        {
            tag: "command", name: "RemoveFabric", xref: "core§11.18.6.12",

            details: "This command is used to remove a Fabric from the device." +
                "\n" +
                "This command is used by Administrators to remove a given Fabric and delete all associated " +
                "fabric-scoped data." +
                "\n" +
                "If the given Fabric being removed is the last one to reference a given Trusted Root CA Certificate " +
                "stored in the Trusted Root Certificates list, then that Trusted Root Certificate shall be removed." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> WARNING: This command, if referring to an already existing Fabric not under the control of the " +
                "invoking Administrator, shall ONLY be invoked after obtaining some form of explicit user consent " +
                "through some method executed by the Administrator or Commissioner. This method of obtaining " +
                "consent SHOULD employ as much data as possible about the existing Fabric associations within the " +
                "Fabrics list, so that likelihood is as small as possible of a user removing a Fabric unwittingly. " +
                "If a method exists for an Administrator or Commissioner to convey Fabric Removal to an entity " +
                "related to that Fabric, whether in-band or out-of-band, then this method SHOULD be used to notify " +
                "the other Administrative Domain's party of the removal. Otherwise, users may only observe the " +
                "removal of a Fabric association as persistently failing attempts to reach a Node operationally." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> NOTE: If the Administrator intends to remove a fabric over a CASE session, the RevokeCommissioning " +
                "command of the AdministratorCommissioning Cluster SHOULD be invoked before removal of the fabric " +
                "and, if the removal is successful, also after the removal of the fabric. This serves as a security " +
                "measure to prevent a malicious fabric administrator from re-adding themselves through an open " +
                "commissioning window after being removed.",

            children: [{
                tag: "field", name: "FabricIndex", xref: "core§11.18.6.12.1",
                details: "This field shall contain the Fabric Index reference (see Section 7.19.2.23, \"Fabric Index\") " +
                    "associated with the Fabric which is to be removed from the device."
            }]
        },

        {
            tag: "command", name: "AddTrustedRootCertificate", xref: "core§11.18.6.13",

            details: "This command is used to add a trusted root certificate to the device." +
                "\n" +
                "This command shall add a Trusted Root CA Certificate, provided as its Matter Certificate Encoding " +
                "representation, to the TrustedRootCertificates Attribute list and shall ensure the next AddNOC " +
                "command executed uses the provided certificate as its root of trust." +
                "\n" +
                "If the certificate from the RootCACertificate field is already installed, based on exact " +
                "byte-for-byte equality, then this command shall succeed with no change to the list." +
                "\n" +
                "If this command is received without an armed fail-safe context (see Section 11.10.7.2, " +
                "\"ArmFailSafe\"), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                "initiator." +
                "\n" +
                "If a prior AddTrustedRootCertificate command was successfully invoked within the fail-safe timer " +
                "period, which would cause the new invocation to add a second root certificate within a given " +
                "fail-safe timer period, then this command shall fail with a CONSTRAINT_ERROR status code sent back " +
                "to the initiator." +
                "\n" +
                "If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, " +
                "then this command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator." +
                "\n" +
                "If the certificate from the RootCACertificate field fails any validity checks, not fulfilling all " +
                "the requirements for a valid Matter Certificate Encoding representation, including a truncated or " +
                "oversize value, then this command shall fail with an INVALID_COMMAND status code sent back to the " +
                "initiator." +
                "\n" +
                "Note that the only method of removing a trusted root is by removing the Fabric that uses it as its " +
                "root of trust using the RemoveFabric command."
        },

        {
            tag: "command", name: "SetVidVerificationStatement", xref: "core§11.18.6.14",

            details: "This command is used to manage the VendorID and VIDVerificationStatement fields of the Fabrics " +
                "attribute, and the VVSC field of an entry in the NOCs attribute." +
                "\n" +
                "This command shall be used to one or more of the following:" +
                "\n" +
                "  - Update the VendorID associated with an entry in the Fabrics attribute." +
                "\n" +
                "  - Associate or remove a VIDVerificationStatement associated with an entry in the Fabrics " +
                "attribute." +
                "\n" +
                "  - Associate or remove a VendorVerificationSigningCertificate (VVSC) associated with an entry in " +
                "the NOCs attribute." +
                "\n" +
                "This command shall only operate against the Fabrics and NOCs attribute entries associated with the " +
                "accessing fabric index."
        },

        {
            tag: "command", name: "SignVidVerificationRequest", xref: "core§11.18.6.15",

            details: "This command is used to authenticate the fabric associated with the FabricIndex." +
                "\n" +
                "This command shall be used to request that the server authenticate the fabric associated with the " +
                "FabricIndex given by generating the response described in Section 6.4.10, \"Fabric Table Vendor ID " +
                "Verification Procedure\"." +
                "\n" +
                "The FabricIndex field shall contain the fabric index being targeted by the request." +
                "\n" +
                "The ClientChallenge field shall contain a client-provided random challenge to be used during the " +
                "signature procedure."
        },

        {
            tag: "command", name: "SignVidVerificationResponse", xref: "core§11.18.6.16",

            details: "This command is used to report the results of the SignVIDVerificationRequest command. This command " +
                "shall contain the response of the SignVIDVerificationRequest, computed as described below." +
                "\n" +
                "The FabricIndex field shall contain the same value of FabricIndex as the value from the associated " +
                "SignVIDVerificationRequest." +
                "\n" +
                "The FabricBindingVersion field shall contain value 0x01 for version 1.0 of the Matter Cryptographic " +
                "Primitives." +
                "\n" +
                "The Signature field shall contain the octet string result of Crypto_Sign(noc_private_key, " +
                "vendor_id_verification_tbs):" +
                "\n" +
                "  - noc_private_key is the operational private key associated with the Node Operational Key Pair for " +
                "the FabricIndex requested in the associated SignVIDVerificationRequest." +
                "\n" +
                "  - vendor_id_verification_tbs := fabric_binding_version || client_challenge || " +
                "attestation_challenge || fabric_index || vendor_fabric_binding_message || " +
                "<vid_verification_statement>" +
                "\n" +
                "  - fabric_binding_version is the value from the FabricBindingVersion field of this " +
                "SignVIDVerificationResponse." +
                "\n" +
                "  - client_challenge is the 32-octet ClientChallenge from the SignVIDVerificationRequest." +
                "\n" +
                "  - attestation_challenge is the AttestationChallenge from a CASE session, resumed CASE session, or " +
                "PASE session depending on the method used to establish the current secure session context over " +
                "which the response will be sent." +
                "\n" +
                "  - fabric_index is the 1-octet value of FabricIndex from the SignVIDVerificationRequest." +
                "\n" +
                "  - vendor_fabric_binding_message is the octet string of the vendor_fabric_binding_message defined " +
                "in Section 6.4.10.1, \"Algorithm\"." +
                "\n" +
                "  - vid_verification_statement is the 85-octet (for cryptographic primitives mapping 1.0) value from " +
                "the VIDVerificationStatement field of the entry in the Fabrics attribute associated with the " +
                "fabric_index, if present. If there is no such field in the Fabrics attribute for the " +
                "fabric_index specified, this field shall be omitted from the vendor_id_verification_tbs message."
        },

        {
            tag: "datatype", name: "CertificateChainTypeEnum", xref: "core§11.18.4.2",
            details: "This enumeration is used by the CertificateChainRequest command to convey which certificate from the " +
                "device attestation certificate chain to transmit back to the client.",
            children: [
                { tag: "field", name: "DacCertificate", description: "Request the DER-encoded DAC certificate" },
                { tag: "field", name: "PaiCertificate", description: "Request the DER-encoded PAI certificate" }
            ]
        },

        {
            tag: "datatype", name: "NodeOperationalCertStatusEnum", xref: "core§11.18.4.3",
            details: "This enumeration is used by the NOCResponse common response command to convey detailed outcome of " +
                "several of this cluster's operations.",

            children: [
                { tag: "field", name: "Ok", description: "OK, no error" },
                {
                    tag: "field", name: "InvalidPublicKey",
                    description: "Public Key in the NOC does not match the public key in the NOCSR"
                },
                {
                    tag: "field", name: "InvalidNodeOpId",
                    description: "The Node Operational ID in the NOC is not formatted correctly."
                },
                { tag: "field", name: "InvalidNoc", description: "Any other validation error in NOC chain" },
                {
                    tag: "field", name: "MissingCsr",
                    description: "No record of prior CSR for which this NOC could match"
                },
                { tag: "field", name: "TableFull", description: "NOCs table full, cannot add another one" },
                {
                    tag: "field", name: "InvalidAdminSubject",
                    description: "Invalid CaseAdminSubject field for an AddNOC command."
                },
                {
                    tag: "field", name: "FabricConflict",
                    description: "Trying to AddNOC instead of UpdateNOC against an existing Fabric."
                },
                { tag: "field", name: "LabelConflict", description: "Label already exists on another Fabric." },
                { tag: "field", name: "InvalidFabricIndex", description: "FabricIndex argument is invalid." }
            ]
        },

        {
            tag: "datatype", name: "NOCStruct", xref: "core§11.18.4.4",

            details: "This encodes a NOC chain, underpinning a commissioned Operational Identity for a given Node." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> NOTE: The VVSC field is mutually exclusive with the ICAC field. If the ICAC field is non-null, the " +
                "VVSC field shall be omitted. If the VVSC field is present in the structure, the ICAC field shall " +
                "be null. The reason for this is to optimize storage usage, as the VID Verification Signer " +
                "Certificate (VVSC) is a field that is only needed in root-per-fabric situations without ICAC " +
                "present." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> NOTE: The Trusted Root CA Certificate (RCAC) is not included in this structure. The roots are " +
                "available in the TrustedRootCertificates attribute under the same associated fabric as the one for " +
                "the NOCStruct entry.",

            children: [
                {
                    tag: "field", name: "Noc", xref: "core§11.18.4.4.1",
                    details: "This field shall contain the NOC for the struct's associated fabric, encoded using Matter " +
                        "Certificate Encoding."
                },
                {
                    tag: "field", name: "Icac", xref: "core§11.18.4.4.2",
                    details: "This field shall contain the ICAC for the struct's associated fabric, encoded using Matter " +
                        "Certificate Encoding. If no ICAC is present in the chain, this field shall be set to null."
                },

                {
                    tag: "field", name: "Vvsc", xref: "core§11.18.4.4.3",
                    details: "This field shall contain the Vendor Verification Signer Certificate (VVSC) for the struct's " +
                        "associated fabric, encoded using Matter Certificate Encoding. If no VVSC is needed, this field shall " +
                        "be omitted (in that there shall NOT be a value present, not even an empty octet string). If the ICAC " +
                        "field is non-null, this field shall NOT be present."
                }
            ]
        },

        {
            tag: "datatype", name: "FabricDescriptorStruct", xref: "core§11.18.4.5",
            details: "This structure encodes a Fabric Reference for a fabric within which a given Node is currently " +
                "commissioned.",

            children: [
                {
                    tag: "field", name: "RootPublicKey", xref: "core§11.18.4.5.1",
                    details: "This field shall contain the public key for the trusted root that scopes the fabric referenced by " +
                        "FabricIndex and its associated operational credential (see Section 6.4.5.3, \"Trusted Root CA " +
                        "Certificates\"). The format for the key shall be the same as that used in the ec-pub-key field of the " +
                        "Matter Certificate Encoding for the root in the operational certificate chain."
                },

                {
                    tag: "field", name: "VendorId", xref: "core§11.18.4.5.2",

                    details: "This field shall contain the value of VendorID associated with the fabric." +
                        "\n" +
                        "This value shall have been provided by the AdminVendorID value provided in the AddNOC command that " +
                        "led to the creation of this FabricDescriptorStruct, or the value updated via the " +
                        "SetVIDVerificationStatement command, whichever was last completed. The set of allowed values is " +
                        "defined in AdminVendorID." +
                        "\n" +
                        "The intent is to provide user transparency about which entities have Administer privileges on the " +
                        "Node." +
                        "\n" +
                        "Clients shall consider the VendorID field value to be untrustworthy until the Fabric Table Vendor ID " +
                        "Verification Procedure has been executed against the fabric entry having this VendorID."
                },

                {
                    tag: "field", name: "FabricId", xref: "core§11.18.4.5.3",
                    details: "This field shall contain the FabricID allocated to the fabric referenced by FabricIndex. This field " +
                        "shall match the value found in the matter-fabric-id field from the operational certificate providing " +
                        "the operational identity under this Fabric."
                },

                {
                    tag: "field", name: "NodeId", xref: "core§11.18.4.5.4",
                    details: "This field shall contain the NodeID in use within the fabric referenced by FabricIndex. This field " +
                        "shall match the value found in the matter-node-id field from the operational certificate providing " +
                        "this operational identity."
                },

                {
                    tag: "field", name: "Label", xref: "core§11.18.4.5.5",
                    details: "This field shall contain a commissioner-set label for the fabric referenced by FabricIndex. This " +
                        "field is set by the UpdateFabricLabel command."
                },

                {
                    tag: "field", name: "VidVerificationStatement", xref: "core§11.18.4.5.6",
                    details: "This field, if present, shall contain a previously-installed administrator-set " +
                        "vid_verification_statement value (see Section 6.4.10, \"Fabric Table Vendor ID Verification " +
                        "Procedure\") for the fabric referenced by FabricIndex. This field is set by the " +
                        "SetVIDVerificationStatement command."
                }
            ]
        }
    ]
});
