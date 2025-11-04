/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "JointFabricAdministrator", pics: "JFPKI", xref: "core§11.25",
        details: "An instance of the Joint Fabric Administrator Cluster only applies to Joint Fabric Administrator " +
            "nodes fulfilling the role of Anchor CA." +
            "\n" +
            "NOTE Support for Joint Fabric Administrator Cluster is provisional.",

        children: [
            {
                tag: "attribute", name: "AdministratorFabricIndex", xref: "core§11.25.6.1",
                details: "The AdministratorFabricIndex attribute shall indicate the FabricIndex from the Endpoint 0’s " +
                    "Operational Cluster Fabrics attribute (i.e. the Fabric Table) which is associated with the " +
                    "JointFabric. This field shall have the value of null if there is no fabric associated with the " +
                    "JointFabric."
            },

            {
                tag: "command", name: "IcaccsrRequest", xref: "core§11.25.7.1",

                details: "This command shall be generated during Joint Commissioning Method and subsequently be responded in " +
                    "the form of an ICACCSRResponse command." +
                    "\n" +
                    "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "If this command is received from a peer against FabricFabric Table Vendor ID Verification Procedure " +
                    "hasn’t been executed then it shall fail with a JfVidNotVerified status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "If a prior AddICAC command was successfully executed within the fail-safe timer period, then this " +
                    "command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator."
            },

            {
                tag: "command", name: "IcaccsrResponse", xref: "core§11.25.7.2",
                details: "This command shall be generated in response to a ICACCSRRequest command. Check ICAC Cross Signing " +
                    "for details about the generation of the ICACCSR.",
                children: [{
                    tag: "field", name: "Icaccsr", xref: "core§11.25.7.2.1",
                    details: "This field shall be a DER-encoded octet string of a properly encoded PKCS #10 Certificate Signing " +
                        "Request (CSR)."
                }]
            },

            {
                tag: "command", name: "AddIcac", xref: "core§11.25.7.3",

                details: "This command shall be generated and executed during Joint Commissioning Method and subsequently be " +
                    "responded in the form of an ICACResponse command." +
                    "\n" +
                    "A Commissioner or Administrator shall issue this command after issuing the ICACCSRRequest command " +
                    "and receiving its response." +
                    "\n" +
                    "A Commissioner or Administrator shall issue this command after performing the Attestation Procedure, " +
                    "Fabric Table VID Verification and after validating that the peer is authorized to act as an " +
                    "Administrator in its own Fabric." +
                    "\n" +
                    "Check ICA Cross Signing for details about the generation of ICACValue.",

                children: [
                    {
                        tag: "field", name: "IcacValue", xref: "core§11.25.7.3.1",

                        details: "This field shall contain an ICAC encoded using Matter Certificate Encoding." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                            "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                            "initiator." +
                            "\n" +
                            "This command shall be received over a CASE session otherwise it shall fail with an INVALID_COMMAND " +
                            "status code." +
                            "\n" +
                            "Upon receipt, the ICACValue shall be validated in the following ways:" +
                            "\n" +
                            "  1. Verify the ICAC using Crypto_VerifyChain(certificates = [ICACValue, RootCACertificate]) where " +
                            "     RootCACertificate is the associated RCAC of the accessing fabric. If this check fails, the " +
                            "     error status shall be InvalidICAC." +
                            "\n" +
                            "  2. The public key of the ICAC shall match the public key present in the last ICACCSRResponse " +
                            "     provided to the Administrator that sent the AddICAC command. If this check fails, the error " +
                            "     status shall be InvalidPublicKey." +
                            "\n" +
                            "  3. The DN Encoding Rules shall be validated for the ICAC. If this check fails, the error status " +
                            "     shall be InvalidICAC." +
                            "\n" +
                            "If any of the above validation checks fail, the server shall immediately respond to the client with " +
                            "an ICACResponse. The StatusCode field of the ICACResponse shall be set to the error status value " +
                            "specified in the above validation checks." +
                            "\n" +
                            "If all the checks succeed, then the ICACValue shall be used as described in the Joint Commissioning " +
                            "Method."
                    }
                ]
            },

            {
                tag: "command", name: "IcacResponse", xref: "core§11.25.7.4",
                details: "This command shall be generated in response to the AddICAC command.",
                children: [{
                    tag: "field", name: "StatusCode", xref: "core§11.25.7.4.1",
                    details: "This field shall contain an ICACResponseStatusEnum value representing the status of the AddICAC " +
                        "operation."
                }]
            },

            {
                tag: "command", name: "OpenJointCommissioningWindow", xref: "core§11.25.7.5",

                details: "> [!NOTE]" +
                    "\n" +
                    "> This is an alias onto the OpenCommissioningWindow command within the Joint Fabric Administrator " +
                    "  Cluster. Refer to the OpenCommissioningWindow command for a description of the command behavior " +
                    "  and parameters." +
                    "\n" +
                    "This command shall fail with a InvalidAdministratorFabricIndex status code sent back to the " +
                    "initiator if the AdministratorFabricIndex field has the value of null." +
                    "\n" +
                    "The parameters for OpenJointCommissioningWindow command are as follows:"
            },

            {
                tag: "command", name: "TransferAnchorRequest", xref: "core§11.25.7.6",
                details: "This command shall be sent by a candidate Joint Fabric Anchor Administrator to the current Joint " +
                    "Fabric Anchor Administrator to request transfer of the Anchor Fabric."
            },
            {
                tag: "command", name: "TransferAnchorResponse", xref: "core§11.25.7.7",
                details: "This command shall be generated in response to the Transfer Anchor Request command."
            },
            {
                tag: "command", name: "TransferAnchorComplete", xref: "core§11.25.7.8",
                details: "This command shall indicate the completion of the transfer of the Anchor Fabric to another Joint " +
                    "Fabric Ecosystem Administrator."
            },

            {
                tag: "command", name: "AnnounceJointFabricAdministrator", xref: "core§11.25.7.9",
                details: "This command shall be used for communicating to client the endpoint that holds the Joint Fabric " +
                    "Administrator Cluster." +
                    "\n" +
                    "### This field shall contain the unique identifier for the endpoint that holds the Joint Fabric " +
                    "Administrator Cluster."
            },

            {
                tag: "datatype", name: "ICACResponseStatusEnum", xref: "core§11.25.4.1",
                details: "This enumeration is used by the ICACResponse command to convey the outcome of this cluster’s " +
                    "operations.",

                children: [
                    { tag: "field", name: "Ok", description: "No error" },
                    { tag: "field", name: "InvalidPublicKey", description: "Public Key in the ICAC is invalid" },
                    {
                        tag: "field", name: "InvalidIcac",
                        description: "ICAC chain validation failed / ICAC DN Encoding rules verification failed"
                    }
                ]
            },

            {
                tag: "datatype", name: "TransferAnchorResponseStatusEnum", xref: "core§11.25.4.2",
                details: "This enumeration is used by the TransferAnchorResponse command to convey the detailed outcome of " +
                    "this cluster’s TransferAnchorRequest command.",

                children: [
                    { tag: "field", name: "Ok", description: "No error" },
                    {
                        tag: "field", name: "TransferAnchorStatusDatastoreBusy",
                        description: "Anchor Transfer was not started due to on-going Datastore operations"
                    },
                    {
                        tag: "field", name: "TransferAnchorStatusNoUserConsent",
                        description: "User has not consented for Anchor Transfer"
                    }
                ]
            },

            {
                tag: "datatype", name: "StatusCodeEnum", xref: "core§11.25.5.1",

                children: [
                    {
                        tag: "field", name: "Busy",
                        description: "Could not be completed because another commissioning is in progress"
                    },
                    {
                        tag: "field", name: "PakeParameterError",
                        description: "Provided PAKE parameters were incorrectly formatted or otherwise invalid"
                    },
                    { tag: "field", name: "WindowNotOpen", description: "No commissioning window was currently open" },
                    {
                        tag: "field", name: "VidNotVerified",
                        description: "ICACCSRRequest command has been invoked by a peer against which Fabric Table VID Verification hasn’t been executed"
                    },
                    {
                        tag: "field", name: "InvalidAdministratorFabricIndex",
                        description: "OpenJointCommissioningWindow command has been invoked but the AdministratorFabricIndex field has the value of null"
                    }
                ]
            }
        ]
    }
);
