/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { VendorId } from "../datatype/VendorId.js";
import type { FabricId } from "../datatype/FabricId.js";
import type { NodeId } from "../datatype/NodeId.js";
import type { SubjectId } from "../datatype/SubjectId.js";

/**
 * Definitions for the OperationalCredentials cluster.
 *
 * This cluster is used to add or remove Node Operational credentials on a Commissionee or already-configured Node, as
 * well as manage the associated Fabrics.
 *
 * @see {@link MatterSpecification.v151.Core} § 11.18
 */
export declare namespace OperationalCredentials {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x003e;

    /**
     * Textual cluster identifier.
     */
    export const name: "OperationalCredentials";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the OperationalCredentials cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link OperationalCredentials} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall contain all NOCs applicable to this Node, encoded as a read-only list of NOCStruct.
         *
         * Operational Certificates shall be added through the AddNOC command, and shall be removed through the
         * RemoveFabric command.
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value of an empty list.
         *
         * The number of entries in this list shall match the number of entries in the Fabrics attribute.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.1
         */
        nocs: Noc[];

        /**
         * Indicates all fabrics to which this Node is commissioned, encoded as a read-only list of
         * FabricDescriptorStruct. This information may be computed directly from the NOCs attribute.
         *
         * The Fabrics attribute is also known as "the fabric table".
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value of an empty list.
         *
         * The number of entries in this list shall match the number of entries in the NOCs attribute.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.2
         */
        fabrics: FabricDescriptor[];

        /**
         * Indicates the number of Fabrics that are supported by the device. This value is fixed for a particular
         * device.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.3
         */
        supportedFabrics: number;

        /**
         * Indicates the number of Fabrics to which the device is currently commissioned. This attribute shall be equal
         * to the following:
         *
         *   - The number of entries in the NOCs attribute.
         *
         *   - The number of entries in the Fabrics attribute.
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value of 0.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.4
         */
        commissionedFabrics: number;

        /**
         * This attribute shall contain the list of Trusted Root CA Certificates (RCAC) installed on the Node, as octet
         * strings containing their Matter Certificate Encoding representation.
         *
         * These certificates are installed through the AddTrustedRootCertificate command.
         *
         * Depending on the method of storage employed by the server, either shared storage for identical root
         * certificates shared by many fabrics, or individually stored root certificate per fabric, multiple identical
         * root certificates may legally appear within the list.
         *
         * To match a root with a given fabric, the root certificate's subject and subject public key need to be
         * cross-referenced with the NOC or ICAC certificates that appear in the NOCs attribute for a given fabric.
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value whereby the list is empty.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.5
         */
        trustedRootCertificates: Bytes[];

        /**
         * Indicates the accessing fabric index.
         *
         * This attribute is useful to contextualize Fabric-Scoped entries obtained from response commands or attribute
         * reads, since a given Fabric may be referenced by a different Fabric Index locally on a remote Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.6
         */
        currentFabricIndex: FabricIndex;
    }

    /**
     * Attributes that may appear in {@link OperationalCredentials}.
     */
    export interface Attributes {
        /**
         * This attribute shall contain all NOCs applicable to this Node, encoded as a read-only list of NOCStruct.
         *
         * Operational Certificates shall be added through the AddNOC command, and shall be removed through the
         * RemoveFabric command.
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value of an empty list.
         *
         * The number of entries in this list shall match the number of entries in the Fabrics attribute.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.1
         */
        nocs: Noc[];

        /**
         * Indicates all fabrics to which this Node is commissioned, encoded as a read-only list of
         * FabricDescriptorStruct. This information may be computed directly from the NOCs attribute.
         *
         * The Fabrics attribute is also known as "the fabric table".
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value of an empty list.
         *
         * The number of entries in this list shall match the number of entries in the NOCs attribute.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.2
         */
        fabrics: FabricDescriptor[];

        /**
         * Indicates the number of Fabrics that are supported by the device. This value is fixed for a particular
         * device.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.3
         */
        supportedFabrics: number;

        /**
         * Indicates the number of Fabrics to which the device is currently commissioned. This attribute shall be equal
         * to the following:
         *
         *   - The number of entries in the NOCs attribute.
         *
         *   - The number of entries in the Fabrics attribute.
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value of 0.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.4
         */
        commissionedFabrics: number;

        /**
         * This attribute shall contain the list of Trusted Root CA Certificates (RCAC) installed on the Node, as octet
         * strings containing their Matter Certificate Encoding representation.
         *
         * These certificates are installed through the AddTrustedRootCertificate command.
         *
         * Depending on the method of storage employed by the server, either shared storage for identical root
         * certificates shared by many fabrics, or individually stored root certificate per fabric, multiple identical
         * root certificates may legally appear within the list.
         *
         * To match a root with a given fabric, the root certificate's subject and subject public key need to be
         * cross-referenced with the NOC or ICAC certificates that appear in the NOCs attribute for a given fabric.
         *
         * Upon Factory Data Reset, this attribute shall be set to a default value whereby the list is empty.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.5
         */
        trustedRootCertificates: Bytes[];

        /**
         * Indicates the accessing fabric index.
         *
         * This attribute is useful to contextualize Fabric-Scoped entries obtained from response commands or attribute
         * reads, since a given Fabric may be referenced by a different Fabric Index locally on a remote Node.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.5.6
         */
        currentFabricIndex: FabricIndex;
    }

    /**
     * {@link OperationalCredentials} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to perform an attestation request.
         *
         * This command shall be generated to request the Attestation Information, in the form of an AttestationResponse
         * Command. If the AttestationNonce that is provided in the command is malformed, a recipient shall fail the
         * command with a Status Code of INVALID_COMMAND. The AttestationNonce field shall be used in the computation of
         * the Attestation Information.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.1
         */
        attestationRequest(request: AttestationRequest): MaybePromise<AttestationResponse>;

        /**
         * This command is used to request a certificate from the device attestation certificate chain.
         *
         * If the CertificateType is not a valid value per CertificateChainTypeEnum then the command shall fail with a
         * Status Code of INVALID_COMMAND.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.3
         */
        certificateChainRequest(request: CertificateChainRequest): MaybePromise<CertificateChainResponse>;

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
         * as being for a subsequent AddNOC. See Section 11.18.6.8, "AddNOC Command" and Section 11.18.6.9, "UpdateNOC
         * Command" for details about the processing.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, "ArmFailSafe"), then
         * this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, then this
         * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * If the Node Operational Key Pair generated during processing of the Node Operational CSR Procedure is found
         * to collide with an existing key pair already previously generated and installed, and that check had been
         * executed, then this command shall fail with a FAILURE status code sent back to the initiator.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.5
         */
        csrRequest(request: CsrRequest): MaybePromise<CsrResponse>;

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
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.8
         */
        addNoc(request: AddNocRequest): MaybePromise<NocResponse>;

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
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.9
         */
        updateNoc(request: UpdateNocRequest): MaybePromise<NocResponse>;

        /**
         * This command is used to set the user-visible fabric label for a given Fabric.
         *
         * This command shall be used by an Administrator to set the user-visible Label field for a given Fabric, as
         * reflected by entries in the Fabrics attribute. An Administrator shall use this command to set the Label to a
         * string (possibly selected by the user themselves) that the user can recognize and relate to this
         * Administrator
         *
         *   - during the commissioning process, and
         *
         *   - whenever the user chooses to update this string.
         *
         * The Label field, along with the VendorID field in the same entry of the Fabrics attribute, SHOULD be used by
         * Administrators to provide additional per-fabric context when operations such as RemoveFabric are considered
         * or used.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.11
         */
        updateFabricLabel(request: UpdateFabricLabelRequest): MaybePromise<NocResponse>;

        /**
         * This command is used to remove a Fabric from the device.
         *
         * This command is used by Administrators to remove a given Fabric and delete all associated fabric-scoped data.
         *
         * If the given Fabric being removed is the last one to reference a given Trusted Root CA Certificate stored in
         * the Trusted Root Certificates list, then that Trusted Root Certificate shall be removed.
         *
         * > [!NOTE]
         *
         * > WARNING: This command, if referring to an already existing Fabric not under the control of the invoking
         *   Administrator, shall ONLY be invoked after obtaining some form of explicit user consent through some method
         *   executed by the Administrator or Commissioner. This method of obtaining consent SHOULD employ as much data
         *   as possible about the existing Fabric associations within the Fabrics list, so that likelihood is as small
         *   as possible of a user removing a Fabric unwittingly. If a method exists for an Administrator or
         *   Commissioner to convey Fabric Removal to an entity related to that Fabric, whether in-band or out-of-band,
         *   then this method SHOULD be used to notify the other Administrative Domain's party of the removal.
         *   Otherwise, users may only observe the removal of a Fabric association as persistently failing attempts to
         *   reach a Node operationally.
         *
         * > [!NOTE]
         *
         * > NOTE: If the Administrator intends to remove a fabric over a CASE session, the RevokeCommissioning command
         *   of the AdministratorCommissioning Cluster SHOULD be invoked before removal of the fabric and, if the
         *   removal is successful, also after the removal of the fabric. This serves as a security measure to prevent a
         *   malicious fabric administrator from re-adding themselves through an open commissioning window after being
         *   removed.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.12
         */
        removeFabric(request: RemoveFabricRequest): MaybePromise<NocResponse>;

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
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, "ArmFailSafe"), then
         * this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
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
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.13
         */
        addTrustedRootCertificate(request: AddTrustedRootCertificateRequest): MaybePromise;

        /**
         * This command is used to manage the VendorID and VIDVerificationStatement fields of the Fabrics attribute, and
         * the VVSC field of an entry in the NOCs attribute.
         *
         * This command shall be used to one or more of the following:
         *
         *   - Update the VendorID associated with an entry in the Fabrics attribute.
         *
         *   - Associate or remove a VIDVerificationStatement associated with an entry in the Fabrics attribute.
         *
         *   - Associate or remove a VendorVerificationSigningCertificate (VVSC) associated with an entry in the NOCs
         *     attribute.
         *
         * This command shall only operate against the Fabrics and NOCs attribute entries associated with the accessing
         * fabric index.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.14
         */
        setVidVerificationStatement(request: SetVidVerificationStatementRequest): MaybePromise;

        /**
         * This command is used to authenticate the fabric associated with the FabricIndex.
         *
         * This command shall be used to request that the server authenticate the fabric associated with the FabricIndex
         * given by generating the response described in Section 6.4.10, "Fabric Table Vendor ID Verification
         * Procedure".
         *
         * The FabricIndex field shall contain the fabric index being targeted by the request.
         *
         * The ClientChallenge field shall contain a client-provided random challenge to be used during the signature
         * procedure.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.15
         */
        signVidVerificationRequest(request: SignVidVerificationRequest): MaybePromise<SignVidVerificationResponse>;
    }

    /**
     * Commands that may appear in {@link OperationalCredentials}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * This encodes a NOC chain, underpinning a commissioned Operational Identity for a given Node.
     *
     * > [!NOTE]
     *
     * > NOTE: The VVSC field is mutually exclusive with the ICAC field. If the ICAC field is non-null, the VVSC field
     *   shall be omitted. If the VVSC field is present in the structure, the ICAC field shall be null. The reason for
     *   this is to optimize storage usage, as the VID Verification Signer Certificate (VVSC) is a field that is only
     *   needed in root-per-fabric situations without ICAC present.
     *
     * > [!NOTE]
     *
     * > NOTE: The Trusted Root CA Certificate (RCAC) is not included in this structure. The roots are available in the
     *   TrustedRootCertificates attribute under the same associated fabric as the one for the NOCStruct entry.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.4.4
     */
    export declare class Noc {
        constructor(values?: Partial<Noc>);

        /**
         * This field shall contain the NOC for the struct's associated fabric, encoded using Matter Certificate
         * Encoding.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.4.1
         */
        noc: Bytes;

        /**
         * This field shall contain the ICAC for the struct's associated fabric, encoded using Matter Certificate
         * Encoding. If no ICAC is present in the chain, this field shall be set to null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.4.2
         */
        icac: Bytes | null;

        /**
         * This field shall contain the Vendor Verification Signer Certificate (VVSC) for the struct's associated
         * fabric, encoded using Matter Certificate Encoding. If no VVSC is needed, this field shall be omitted (in that
         * there shall NOT be a value present, not even an empty octet string). If the ICAC field is non-null, this
         * field shall NOT be present.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.4.3
         */
        vvsc?: Bytes;

        fabricIndex: FabricIndex;
    };

    /**
     * This structure encodes a Fabric Reference for a fabric within which a given Node is currently commissioned.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.4.5
     */
    export declare class FabricDescriptor {
        constructor(values?: Partial<FabricDescriptor>);

        /**
         * This field shall contain the public key for the trusted root that scopes the fabric referenced by FabricIndex
         * and its associated operational credential (see Section 6.4.5.3, "Trusted Root CA Certificates"). The format
         * for the key shall be the same as that used in the ec-pub-key field of the Matter Certificate Encoding for the
         * root in the operational certificate chain.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.5.1
         */
        rootPublicKey: Bytes;

        /**
         * This field shall contain the value of VendorID associated with the fabric.
         *
         * This value shall have been provided by the AdminVendorID value provided in the AddNOC command that led to the
         * creation of this FabricDescriptorStruct, or the value updated via the SetVIDVerificationStatement command,
         * whichever was last completed. The set of allowed values is defined in AdminVendorID.
         *
         * The intent is to provide user transparency about which entities have Administer privileges on the Node.
         *
         * Clients shall consider the VendorID field value to be untrustworthy until the Fabric Table Vendor ID
         * Verification Procedure has been executed against the fabric entry having this VendorID.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.5.2
         */
        vendorId: VendorId;

        /**
         * This field shall contain the FabricID allocated to the fabric referenced by FabricIndex. This field shall
         * match the value found in the matter-fabric-id field from the operational certificate providing the
         * operational identity under this Fabric.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.5.3
         */
        fabricId: FabricId;

        /**
         * This field shall contain the NodeID in use within the fabric referenced by FabricIndex. This field shall
         * match the value found in the matter-node-id field from the operational certificate providing this operational
         * identity.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.5.4
         */
        nodeId: NodeId;

        /**
         * This field shall contain a commissioner-set label for the fabric referenced by FabricIndex. This field is set
         * by the UpdateFabricLabel command.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.5.5
         */
        label: string;

        /**
         * This field, if present, shall contain a previously-installed administrator-set vid_verification_statement
         * value (see Section 6.4.10, "Fabric Table Vendor ID Verification Procedure") for the fabric referenced by
         * FabricIndex. This field is set by the SetVIDVerificationStatement command.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.4.5.6
         */
        vidVerificationStatement?: Bytes;

        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to perform an attestation request.
     *
     * This command shall be generated to request the Attestation Information, in the form of an AttestationResponse
     * Command. If the AttestationNonce that is provided in the command is malformed, a recipient shall fail the command
     * with a Status Code of INVALID_COMMAND. The AttestationNonce field shall be used in the computation of the
     * Attestation Information.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.1
     */
    export declare class AttestationRequest {
        constructor(values?: Partial<AttestationRequest>);
        attestationNonce: Bytes;
    };

    /**
     * This command is used to report the results of the AttestationRequest command. This command shall be generated in
     * response to an Attestation Request command.
     *
     * See Section 11.18.4.7, "Attestation Information" for details about the generation of the fields within this
     * response command.
     *
     * See Section F.2, "Device Attestation Response test vector" for an example computation of an AttestationResponse.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.2
     */
    export declare class AttestationResponse {
        constructor(values?: Partial<AttestationResponse>);

        /**
         * This field shall contain the octet string of the serialized attestation_elements_message.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.2.1
         */
        attestationElements: Bytes;

        /**
         * This field shall contain the octet string of the necessary attestation_signature as described in Section
         * 11.18.4.7, "Attestation Information".
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.2.2
         */
        attestationSignature: Bytes;
    };

    /**
     * This command is used to request a certificate from the device attestation certificate chain.
     *
     * If the CertificateType is not a valid value per CertificateChainTypeEnum then the command shall fail with a
     * Status Code of INVALID_COMMAND.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.3
     */
    export declare class CertificateChainRequest {
        constructor(values?: Partial<CertificateChainRequest>);
        certificateType: CertificateChainType;
    };

    /**
     * This command is used to report the results of the CertificateChainRequest command. This command shall be
     * generated in response to a CertificateChainRequest command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.4
     */
    export declare class CertificateChainResponse {
        constructor(values?: Partial<CertificateChainResponse>);

        /**
         * This field shall be the DER encoded certificate corresponding to the CertificateType field in the
         * CertificateChainRequest command.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.4.1
         */
        certificate: Bytes;
    };

    /**
     * This command is used to perform a CSR request.
     *
     * This command shall be generated to execute the Node Operational CSR Procedure and subsequently return the NOCSR
     * Information, in the form of a CSRResponse Command.
     *
     * The CSRNonce field shall be used in the computation of the NOCSR Information. If the CSRNonce is malformed, then
     * this command shall fail with an INVALID_COMMAND status code.
     *
     * If the IsForUpdateNOC field is present and set to true, but the command was received over a PASE session, the
     * command shall fail with an INVALID_COMMAND status code, as it would never be possible to use a resulting
     * subsequent certificate issued from the CSR with the UpdateNOC command, which is forbidden over PASE sessions.
     *
     * If the IsForUpdateNOC field is present and set to true, the internal state of the CSR associated key pair shall
     * be tagged as being for a subsequent UpdateNOC, otherwise the internal state of the CSR shall be tagged as being
     * for a subsequent AddNOC. See Section 11.18.6.8, "AddNOC Command" and Section 11.18.6.9, "UpdateNOC Command" for
     * details about the processing.
     *
     * If this command is received without an armed fail-safe context (see Section 11.10.7.2, "ArmFailSafe"), then this
     * command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
     *
     * If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, then this
     * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
     *
     * If the Node Operational Key Pair generated during processing of the Node Operational CSR Procedure is found to
     * collide with an existing key pair already previously generated and installed, and that check had been executed,
     * then this command shall fail with a FAILURE status code sent back to the initiator.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.5
     */
    export declare class CsrRequest {
        constructor(values?: Partial<CsrRequest>);
        csrNonce: Bytes;
        isForUpdateNoc?: boolean;
    };

    /**
     * This command is used to report the results of the CSRRequest command. This command shall be generated in response
     * to a CSRRequest Command.
     *
     * See Section 11.18.4.9, "NOCSR Information" for details about the generation of the fields within this response
     * command.
     *
     * See Section F.3, "Node Operational CSR Response test vector" for an example computation of a CSRResponse.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.6
     */
    export declare class CsrResponse {
        constructor(values?: Partial<CsrResponse>);

        /**
         * This field shall contain the octet string of the serialized nocsr_elements_message.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.6.1
         */
        nocsrElements: Bytes;

        /**
         * This field shall contain the octet string of the necessary attestation_signature as described in Section
         * 11.18.4.9, "NOCSR Information".
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.6.2
         */
        attestationSignature: Bytes;
    };

    /**
     * This command is used to add a new NOC to the device.
     *
     * This command shall add a new NOC chain to the device and commission a new Fabric association upon successful
     * validation of all arguments and preconditions.
     *
     * The new value shall immediately be reflected in the NOCs list attribute.
     *
     * A Commissioner or Administrator shall issue this command after issuing the CSRRequest command and receiving its
     * response.
     *
     * A Commissioner or Administrator SHOULD issue this command after performing the Attestation Procedure.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.8
     */
    export declare class AddNocRequest {
        constructor(values?: Partial<AddNocRequest>);
        nocValue: Bytes;
        icacValue?: Bytes;

        /**
         * This field shall contain the value of the Epoch Key for the Identity Protection Key (IPK) to set for the
         * Fabric which is to be added. This is needed to bootstrap a necessary configuration value for subsequent CASE
         * to succeed. See Section 4.14.2.6.1, "Identity Protection Key (IPK)" for details.
         *
         * The IPK shall be provided as an octet string of length CRYPTO_SYMMETRIC_KEY_LENGTH_BYTES.
         *
         * On successful execution of the AddNOC command, the side-effect of having provided this field shall be
         * equivalent to having done a GroupKeyManagement cluster KeySetWrite command invocation using the newly joined
         * fabric as the accessing fabric and with the following argument fields (assuming KeySetWrite allowed a
         * GroupKeySetID set to 0):
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.8.1
         */
        ipkValue: Bytes;

        /**
         * If the AddNOC command succeeds according to the semantics of the following subsections, then the Access
         * Control subject-id shall be used to atomically add an Access Control Entry enabling that Subject to
         * subsequently administer the Node whose operational identity is being added by this command.
         *
         * The format of the new Access Control Entry, created from this, shall be:
         *
         * > [!NOTE]
         *
         * > NOTE: Unless such an Access Control Entry is added atomically as described here, there would be no way for
         *   the caller on its given Fabric to eventually add another Access Control Entry for CASE authentication mode,
         *   to enable the new Administrator to administer the device, since the Fabric Scoping of the Access Control
         *   List prevents the current Node from being able to write new entries scoped to that Fabric, if the session
         *   is established from CASE. While a session established from PASE does gain Fabric Scope of a newly-joined
         *   Fabric, this argument is made mandatory to provide symmetry between both types of session establishment,
         *   both of which need to eventually add an "Administer Node over CASE" Access Control Entry to finalize new
         *   Fabric configuration and subsequently be able to call the CommissioningComplete command.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.8.2
         */
        caseAdminSubject: SubjectId;

        /**
         * This field shall be set to the Vendor ID of the entity issuing the AddNOC command. This value shall NOT be
         * one of the reserved Vendor ID values defined in Table 1, "Vendor ID Allocations".
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.8.3
         */
        adminVendorId: VendorId;
    };

    /**
     * This command is used to report the results of the AddNOC, UpdateNOC, UpdateFabricLabel and RemoveFabric commands.
     *
     * This command shall be generated in response to the following commands:
     *
     *   - AddNOC
     *
     *   - UpdateNOC
     *
     *   - UpdateFabricLabel
     *
     *   - RemoveFabric
     *
     * It provides status information about the success or failure of those commands.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.10
     */
    export declare class NocResponse {
        constructor(values?: Partial<NocResponse>);

        /**
         * This field shall contain an NOCStatus value representing the status of an operation involving a NOC.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.10.1
         */
        statusCode: NodeOperationalCertStatus;

        /**
         * If present, it shall contain the Fabric Index of the Fabric last added, removed or updated.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.10.2
         */
        fabricIndex?: FabricIndex;

        /**
         * This field may contain debugging textual information from the cluster implementation, which SHOULD NOT be
         * presented to user interfaces in any way. Its purpose is to help developers in troubleshooting errors and the
         * contents may go into logs or crash reports.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.10.3
         */
        debugText?: string;
    };

    /**
     * This command is used to update an existing NOC on the device.
     *
     * This command shall replace the NOC and optional associated ICAC (if present) scoped under the accessing fabric
     * upon successful validation of all arguments and preconditions. The new value shall immediately be reflected in
     * the NOCs list attribute.
     *
     * A Commissioner or Administrator shall issue this command after issuing the CSRRequest Command and receiving its
     * response.
     *
     * A Commissioner or Administrator SHOULD issue this command after performing the Attestation Procedure.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.9
     */
    export declare class UpdateNocRequest {
        constructor(values?: Partial<UpdateNocRequest>);
        nocValue: Bytes;
        icacValue?: Bytes;
        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to set the user-visible fabric label for a given Fabric.
     *
     * This command shall be used by an Administrator to set the user-visible Label field for a given Fabric, as
     * reflected by entries in the Fabrics attribute. An Administrator shall use this command to set the Label to a
     * string (possibly selected by the user themselves) that the user can recognize and relate to this Administrator
     *
     *   - during the commissioning process, and
     *
     *   - whenever the user chooses to update this string.
     *
     * The Label field, along with the VendorID field in the same entry of the Fabrics attribute, SHOULD be used by
     * Administrators to provide additional per-fabric context when operations such as RemoveFabric are considered or
     * used.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.11
     */
    export declare class UpdateFabricLabelRequest {
        constructor(values?: Partial<UpdateFabricLabelRequest>);

        /**
         * This field shall contain the label to set for the fabric associated with the current secure session.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.11.1
         */
        label: string;

        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to remove a Fabric from the device.
     *
     * This command is used by Administrators to remove a given Fabric and delete all associated fabric-scoped data.
     *
     * If the given Fabric being removed is the last one to reference a given Trusted Root CA Certificate stored in the
     * Trusted Root Certificates list, then that Trusted Root Certificate shall be removed.
     *
     * > [!NOTE]
     *
     * > WARNING: This command, if referring to an already existing Fabric not under the control of the invoking
     *   Administrator, shall ONLY be invoked after obtaining some form of explicit user consent through some method
     *   executed by the Administrator or Commissioner. This method of obtaining consent SHOULD employ as much data as
     *   possible about the existing Fabric associations within the Fabrics list, so that likelihood is as small as
     *   possible of a user removing a Fabric unwittingly. If a method exists for an Administrator or Commissioner to
     *   convey Fabric Removal to an entity related to that Fabric, whether in-band or out-of-band, then this method
     *   SHOULD be used to notify the other Administrative Domain's party of the removal. Otherwise, users may only
     *   observe the removal of a Fabric association as persistently failing attempts to reach a Node operationally.
     *
     * > [!NOTE]
     *
     * > NOTE: If the Administrator intends to remove a fabric over a CASE session, the RevokeCommissioning command of
     *   the AdministratorCommissioning Cluster SHOULD be invoked before removal of the fabric and, if the removal is
     *   successful, also after the removal of the fabric. This serves as a security measure to prevent a malicious
     *   fabric administrator from re-adding themselves through an open commissioning window after being removed.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.12
     */
    export declare class RemoveFabricRequest {
        constructor(values?: Partial<RemoveFabricRequest>);

        /**
         * This field shall contain the Fabric Index reference (see Section 7.19.2.23, "Fabric Index") associated with
         * the Fabric which is to be removed from the device.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.18.6.12.1
         */
        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to add a trusted root certificate to the device.
     *
     * This command shall add a Trusted Root CA Certificate, provided as its Matter Certificate Encoding representation,
     * to the TrustedRootCertificates Attribute list and shall ensure the next AddNOC command executed uses the provided
     * certificate as its root of trust.
     *
     * If the certificate from the RootCACertificate field is already installed, based on exact byte-for-byte equality,
     * then this command shall succeed with no change to the list.
     *
     * If this command is received without an armed fail-safe context (see Section 11.10.7.2, "ArmFailSafe"), then this
     * command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
     *
     * If a prior AddTrustedRootCertificate command was successfully invoked within the fail-safe timer period, which
     * would cause the new invocation to add a second root certificate within a given fail-safe timer period, then this
     * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
     *
     * If a prior UpdateNOC or AddNOC command was successfully executed within the fail-safe timer period, then this
     * command shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
     *
     * If the certificate from the RootCACertificate field fails any validity checks, not fulfilling all the
     * requirements for a valid Matter Certificate Encoding representation, including a truncated or oversize value,
     * then this command shall fail with an INVALID_COMMAND status code sent back to the initiator.
     *
     * Note that the only method of removing a trusted root is by removing the Fabric that uses it as its root of trust
     * using the RemoveFabric command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.13
     */
    export declare class AddTrustedRootCertificateRequest {
        constructor(values?: Partial<AddTrustedRootCertificateRequest>);
        rootCaCertificate: Bytes;
    };

    /**
     * This command is used to manage the VendorID and VIDVerificationStatement fields of the Fabrics attribute, and the
     * VVSC field of an entry in the NOCs attribute.
     *
     * This command shall be used to one or more of the following:
     *
     *   - Update the VendorID associated with an entry in the Fabrics attribute.
     *
     *   - Associate or remove a VIDVerificationStatement associated with an entry in the Fabrics attribute.
     *
     *   - Associate or remove a VendorVerificationSigningCertificate (VVSC) associated with an entry in the NOCs
     *     attribute.
     *
     * This command shall only operate against the Fabrics and NOCs attribute entries associated with the accessing
     * fabric index.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.14
     */
    export declare class SetVidVerificationStatementRequest {
        constructor(values?: Partial<SetVidVerificationStatementRequest>);
        vendorId?: VendorId;
        vidVerificationStatement?: Bytes;
        vvsc?: Bytes;
    };

    /**
     * This command is used to authenticate the fabric associated with the FabricIndex.
     *
     * This command shall be used to request that the server authenticate the fabric associated with the FabricIndex
     * given by generating the response described in Section 6.4.10, "Fabric Table Vendor ID Verification Procedure".
     *
     * The FabricIndex field shall contain the fabric index being targeted by the request.
     *
     * The ClientChallenge field shall contain a client-provided random challenge to be used during the signature
     * procedure.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.15
     */
    export declare class SignVidVerificationRequest {
        constructor(values?: Partial<SignVidVerificationRequest>);
        fabricIndex: FabricIndex;
        clientChallenge: Bytes;
    };

    /**
     * This command is used to report the results of the SignVIDVerificationRequest command. This command shall contain
     * the response of the SignVIDVerificationRequest, computed as described below.
     *
     * The FabricIndex field shall contain the same value of FabricIndex as the value from the associated
     * SignVIDVerificationRequest.
     *
     * The FabricBindingVersion field shall contain value 0x01 for version 1.0 of the Matter Cryptographic Primitives.
     *
     * The Signature field shall contain the octet string result of Crypto_Sign(noc_private_key,
     * vendor_id_verification_tbs):
     *
     *   - noc_private_key is the operational private key associated with the Node Operational Key Pair for the
     *     FabricIndex requested in the associated SignVIDVerificationRequest.
     *
     *   - vendor_id_verification_tbs := fabric_binding_version || client_challenge || attestation_challenge ||
     *     fabric_index || vendor_fabric_binding_message || <vid_verification_statement>
     *
     *   - fabric_binding_version is the value from the FabricBindingVersion field of this SignVIDVerificationResponse.
     *
     *   - client_challenge is the 32-octet ClientChallenge from the SignVIDVerificationRequest.
     *
     *   - attestation_challenge is the AttestationChallenge from a CASE session, resumed CASE session, or PASE session
     *     depending on the method used to establish the current secure session context over which the response will be
     *     sent.
     *
     *   - fabric_index is the 1-octet value of FabricIndex from the SignVIDVerificationRequest.
     *
     *   - vendor_fabric_binding_message is the octet string of the vendor_fabric_binding_message defined in Section
     *     6.4.10.1, "Algorithm".
     *
     *   - vid_verification_statement is the 85-octet (for cryptographic primitives mapping 1.0) value from the
     *     VIDVerificationStatement field of the entry in the Fabrics attribute associated with the fabric_index, if
     *     present. If there is no such field in the Fabrics attribute for the fabric_index specified, this field shall
     *     be omitted from the vendor_id_verification_tbs message.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.6.16
     */
    export declare class SignVidVerificationResponse {
        constructor(values?: Partial<SignVidVerificationResponse>);
        fabricIndex: FabricIndex;
        fabricBindingVersion: number;
        signature: Bytes;
    };

    /**
     * This enumeration is used by the CertificateChainRequest command to convey which certificate from the device
     * attestation certificate chain to transmit back to the client.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.4.2
     */
    export enum CertificateChainType {
        /**
         * Request the DER-encoded DAC certificate
         */
        DacCertificate = 1,

        /**
         * Request the DER-encoded PAI certificate
         */
        PaiCertificate = 2
    }

    /**
     * This enumeration is used by the NOCResponse common response command to convey detailed outcome of several of this
     * cluster's operations.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.18.4.3
     */
    export enum NodeOperationalCertStatus {
        /**
         * OK, no error
         */
        Ok = 0,

        /**
         * Public Key in the NOC does not match the public key in the NOCSR
         */
        InvalidPublicKey = 1,

        /**
         * The Node Operational ID in the NOC is not formatted correctly.
         */
        InvalidNodeOpId = 2,

        /**
         * Any other validation error in NOC chain
         */
        InvalidNoc = 3,

        /**
         * No record of prior CSR for which this NOC could match
         */
        MissingCsr = 4,

        /**
         * NOCs table full, cannot add another one
         */
        TableFull = 5,

        /**
         * Invalid CaseAdminSubject field for an AddNOC command.
         */
        InvalidAdminSubject = 6,

        /**
         * Trying to AddNOC instead of UpdateNOC against an existing Fabric.
         */
        FabricConflict = 9,

        /**
         * Label already exists on another Fabric.
         */
        LabelConflict = 10,

        /**
         * FabricIndex argument is invalid.
         */
        InvalidFabricIndex = 11
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
     * @deprecated Use {@link OperationalCredentials}.
     */
    export const Cluster: typeof OperationalCredentials;

    /**
     * @deprecated Use {@link OperationalCredentials}.
     */
    export const Complete: typeof OperationalCredentials;

    export const Typing: OperationalCredentials;
}

/**
 * @deprecated Use {@link OperationalCredentials}.
 */
export declare const OperationalCredentialsCluster: typeof OperationalCredentials;

export interface OperationalCredentials extends ClusterTyping {
    Attributes: OperationalCredentials.Attributes;
    Commands: OperationalCredentials.Commands;
    Components: OperationalCredentials.Components;
}
