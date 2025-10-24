/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { OperationalCredentials } from "#clusters/operational-credentials";

export namespace OperationalCredentialsInterface {
    export interface Base {
        /**
         * This command is used to perform an attestation request.
         *
         * This command shall be generated to request the Attestation Information, in the form of an AttestationResponse
         * Command. If the AttestationNonce that is provided in the command is malformed, a recipient shall fail the
         * command with a Status Code of INVALID_COMMAND. The AttestationNonce field shall be used in the computation of
         * the Attestation Information.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.1
         */
        attestationRequest(request: OperationalCredentials.AttestationRequest): MaybePromise<OperationalCredentials.AttestationResponse>;

        /**
         * This command is used to request a certificate from the device attestation certificate chain.
         *
         * If the CertificateType is not a valid value per CertificateChainTypeEnum then the command shall fail with a
         * Status Code of INVALID_COMMAND.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.3
         */
        certificateChainRequest(request: OperationalCredentials.CertificateChainRequest): MaybePromise<OperationalCredentials.CertificateChainResponse>;

        /**
         * This command is used to perform a CSR request.
         *
         * This command shall be generated to execute the Node Operational CSR Procedure and subsequently return the
         * NOCSR Information, in the form of a CSRResponse Command.
         *
         * The CSRNonce field shall be used in the computation of the NOCSR Information. If the CSRNonce is malformed,
         * then this command shall fail with an INVALID_COMMAND status code.
         *
         * If the IsForUpdateNOC field is present and set to true, but the command was received over a PASE session, the
         * command shall fail with an INVALID_COMMAND status code, as it would never be possible to use a resulting
         * subsequent certificate issued from the CSR with the UpdateNOC command, which is forbidden over PASE sessions.
         *
         * If the IsForUpdateNOC field is present and set to true, the internal state of the CSR associated key pair
         * shall be tagged as being for a subsequent UpdateNOC, otherwise the internal state of the CSR shall be tagged
         * as being for a subsequent AddNOC. See Section 11.18.6.8, “AddNOC Command” and Section 11.18.6.9, “UpdateNOC
         * Command” for details about the processing.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, then this
         * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * If the Node Operational Key Pair generated during processing of the Node Operational CSR Procedure is found
         * to collide with an existing key pair already previously generated and installed, and that check had been
         * executed, then this command shall fail with a FAILURE status code sent back to the initiator.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.5
         */
        csrRequest(request: OperationalCredentials.CsrRequest): MaybePromise<OperationalCredentials.CsrResponse>;

        /**
         * This command is used to add a new NOC to the device.
         *
         * This command shall add a new NOC chain to the device and commission a new Fabric association upon successful
         * validation of all arguments and preconditions.
         *
         * The new value shall immediately be reflected in the NOCs list attribute.
         *
         * A Commissioner or Administrator shall issue this command after issuing the CSRRequest command and receiving
         * its response.
         *
         * A Commissioner or Administrator SHOULD issue this command after performing the Attestation Procedure.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.8
         */
        addNoc(request: OperationalCredentials.AddNocRequest): MaybePromise<OperationalCredentials.NocResponse>;

        /**
         * This command is used to update an existing NOC on the device.
         *
         * This command shall replace the NOC and optional associated ICAC (if present) scoped under the accessing
         * fabric upon successful validation of all arguments and preconditions. The new value shall immediately be
         * reflected in the NOCs list attribute.
         *
         * A Commissioner or Administrator shall issue this command after issuing the CSRRequest Command and receiving
         * its response.
         *
         * A Commissioner or Administrator SHOULD issue this command after performing the Attestation Procedure.
         *
         * ### Effect on Receipt
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, then this
         * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * If a prior AddTrustedRootCertificate command was successfully invoked within the fail-safe timer period, then
         * this command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator, since the only valid
         * following logical operation is invoking the AddNOC command.
         *
         * If the prior CSRRequest state that preceded UpdateNOC had the IsForUpdateNOC field indicated as false, then
         * this command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * If any of the following conditions arise, the Node shall process an error by responding with an NOCResponse
         * with a StatusCode of InvalidNOC as described in Section 11.18.6.7.2, “Handling Errors”:
         *
         *   • The NOC provided in the NOCValue does not refer in its subject to the FabricID associated with the
         *     accessing fabric.
         *
         *   • The ICAC provided in the ICACValue (if present) has a FabricID in its subject that does not match the
         *     FabricID associated with the accessing fabric.
         *
         * Otherwise, the command is considered an update of existing credentials for a given Fabric, and the following
         * shall apply:
         *
         *   1. The Operational Certificate under the accessing fabric index in the NOCs list shall be updated to match
         *      the incoming NOCValue and ICACValue (if present), such that the Node’s Operational Identifier within the
         *      Fabric immediately changes.
         *
         *     a. The operational key pair associated with the incoming NOC from the NOCValue, and generated by the
         *        prior CSRRequest command, shall be committed to permanent storage, for subsequent use during CASE.
         *
         *     b. The operational discovery service record shall immediately reflect the new Operational Identifier.
         *
         *     c. All internal data reflecting the prior operational identifier of the Node within the Fabric shall be
         *        revoked and removed, to an outcome equivalent to the disappearance of the prior Node, except for the
         *        ongoing CASE session context, which shall temporarily remain valid until the NOCResponse has been
         *        successfully delivered or until the next transport-layer error, so that the response can be received
         *        by the Administrator invoking the command.
         *
         * Thereafter, the Node shall respond with an NOCResponse with a StatusCode of OK and a FabricIndex field
         * matching the FabricIndex under which the updated NOC is scoped.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.9
         */
        updateNoc(request: OperationalCredentials.UpdateNocRequest): MaybePromise<OperationalCredentials.NocResponse>;

        /**
         * This command is used to set the user-visible fabric label for a given Fabric.
         *
         * This command shall be used by an Administrator to set the user-visible Label field for a given Fabric, as
         * reflected by entries in the Fabrics attribute. An Administrator shall use this command to set the Label to a
         * string (possibly selected by the user themselves) that the user can recognize and relate to this
         * Administrator
         *
         *   • during the commissioning process, and
         *
         *   • whenever the user chooses to update this string.
         *
         * The Label field, along with the VendorID field in the same entry of the Fabrics attribute, SHOULD be used by
         * Administrators to provide additional per-fabric context when operations such as RemoveFabric are considered
         * or used.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.11
         */
        updateFabricLabel(request: OperationalCredentials.UpdateFabricLabelRequest): MaybePromise<OperationalCredentials.NocResponse>;

        /**
         * This command is used to remove a Fabric from the device.
         *
         * This command is used by Administrators to remove a given Fabric and delete all associated fabric-scoped data.
         *
         * If the given Fabric being removed is the last one to reference a given Trusted Root CA Certificate stored in
         * the Trusted Root Certificates list, then that Trusted Root Certificate shall be removed.
         *
         * ### WARNING
         *
         * This command, if referring to an already existing Fabric not under the control of the invoking Administrator,
         * shall ONLY be invoked after obtaining some form of explicit user consent through some method executed by the
         * Administrator or Commissioner. This method of obtaining consent SHOULD employ as much data as possible about
         * the existing Fabric associations within the Fabrics list, so that likelihood is as small as possible of a
         * user removing a Fabric unwittingly. If a method exists for an Administrator or Commissioner to convey Fabric
         * Removal to an entity related to that Fabric, whether in-band or out-of-band, then this method SHOULD be used
         * to notify the other Administrative Domain’s party of the removal. Otherwise, users may only observe the
         * removal of a Fabric association as persistently failing attempts to reach a Node operationally.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.12
         */
        removeFabric(request: OperationalCredentials.RemoveFabricRequest): MaybePromise<OperationalCredentials.NocResponse>;

        /**
         * This command is used to add a trusted root certificate to the device.
         *
         * This command shall add a Trusted Root CA Certificate, provided as its Matter Certificate Encoding
         * representation, to the TrustedRootCertificates Attribute list and shall ensure the next AddNOC command
         * executed uses the provided certificate as its root of trust.
         *
         * If the certificate from the RootCACertificate field is already installed, based on exact byte-for-byte
         * equality, then this command shall succeed with no change to the list.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * If a prior AddTrustedRootCertificate command was successfully invoked within the fail-safe timer period,
         * which would cause the new invocation to add a second root certificate within a given fail-safe timer period,
         * then this command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, then this
         * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * If the certificate from the RootCACertificate field fails any validity checks, not fulfilling all the
         * requirements for a valid Matter Certificate Encoding representation, including a truncated or oversize value,
         * then this command shall fail with an INVALID_COMMAND status code sent back to the initiator.
         *
         * Note that the only method of removing a trusted root is by removing the Fabric that uses it as its root of
         * trust using the RemoveFabric command.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.13
         */
        addTrustedRootCertificate(request: OperationalCredentials.AddTrustedRootCertificateRequest): MaybePromise;

        /**
         * This command is used to manage the VendorID and VIDVerificationStatement fields of the Fabrics attribute, and
         * the VVSC field of an entry in the NOCs attribute.
         *
         * This command shall be used to one or more of the following:
         *
         *   • Update the VendorID associated with an entry in the Fabrics attribute.
         *
         *   • Associate or remove a VIDVerificationStatement associated with an entry in the Fabrics attribute.
         *
         *   • Associate or remove a VendorVerificationSigningCertificate (VVSC) associated with an entry in the NOCs
         *     attribute.
         *
         * This command shall only operate against the Fabrics and NOCs attribute entries associated with the accessing
         * fabric index.
         *
         * ### Effect on Receipt
         *
         * If the VendorID field is present, the value of the VendorID in the Fabrics attribute entry associated with
         * the accessing fabric index shall have its value replaced with the value from the command field.
         *
         * If the VVSC field is present, but the ICAC field is already present in the NOCs attribute entry associated
         * with the accessing fabric index, then the command shall fail with a status code of INVALID_COMMAND.
         *
         * If the VIDVerificationStatement field is present:
         *
         *   • If the length of the field’s value is neither exactly 0 nor exactly 85, then the command shall fail with
         *     a status code of CONSTRAINT_ERROR.
         *
         *   • If the length of the field’s value is exactly 0, then the VIDVerificationStatement field in the Fabrics
         *     attribute entry associated with the accessing fabric index shall be erased and the field shall disappear
         *     from the Fabrics entry.
         *
         *   • If the length of the field’s value is exactly 85, then the VIDVerificationStatement field in the Fabrics
         *     attribute entry associated with the accessing fabric index shall have its value replaced with the value
         *     from the command field.
         *
         * If the VVSC field is present:
         *
         *   • If the length of the field’s value is exactly 0, then the VVSC field in the NOCs attribute entry
         *     associated with the accessing fabric index shall be erased and the field shall disappear from the NOCs
         *     entry.
         *
         *   • If the length of the field’s value is not 0, then the VVSC field in the NOCs attribute entry associated
         *     with the accessing fabric index shall have its value replaced with the value from the command field. The
         *     contents of the certificate need not be validated by the server. Clients shall validate the contents at
         *     time of use.
         *
         * If the command was invoked within a fail-safe context after a successful AddNOC or UpdateNOC command, then
         * the field updates shall apply to the pending update state that will be reverted if fail-safe expires prior to
         * a CommissioningComplete command. In other words, field updates apply to the state of the Fabrics Attribute as
         * currently visible, even for an existing fabric currently in process of being updated.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.14
         */
        setVidVerificationStatement(request: OperationalCredentials.SetVidVerificationStatementRequest): MaybePromise;

        /**
         * This command is used to authenticate the fabric associated with the FabricIndex.
         *
         * This command shall be used to request that the server authenticate the fabric associated with the FabricIndex
         * given by generating the response described in Section 6.4.10, “Fabric Table Vendor ID Verification
         * Procedure”.
         *
         * The FabricIndex field shall contain the fabric index being targeted by the request.
         *
         * The ClientChallenge field shall contain a client-provided random challenge to be used during the signature
         * procedure.
         *
         * ### Effect on Receipt
         *
         * If the FabricIndex field contains a fabric index which does not have an associated entry in the Fabrics
         * attribute, then the command shall fail with a status code of CONSTRAINT_ERROR.
         *
         * Otherwise, if no other errors have occurred, the command shall generate a SignVIDVerificationResponse.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.18.6.15
         */
        signVidVerificationRequest(request: OperationalCredentials.SignVidVerificationRequest): MaybePromise<OperationalCredentials.SignVidVerificationResponse>;
    }
}

export type OperationalCredentialsInterface = {
    components: [{ flags: {}, methods: OperationalCredentialsInterface.Base }]
};
