/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { ProductDescriptionServer } from "#behavior/system/product-description/ProductDescriptionServer.js";
import { AccessControlServer } from "#behaviors/access-control";
import { OperationalCredentials } from "#clusters/operational-credentials";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Crypto, CryptoVerifyError, Logger, MatterFlowError, MaybePromise, UnexpectedDataError } from "#general";
import { AccessLevel } from "#model";
import type { Node } from "#node/Node.js";
import {
    assertRemoteActor,
    CertificateError,
    DeviceCertification,
    DeviceCommissioner,
    Fabric,
    FabricManager,
    FabricTableFullError,
    MatterFabricConflictError,
    MatterFabricInvalidAdminSubjectError,
    NodeSession,
    PublicKeyError,
    TlvAttestation,
    TlvCertSigningRequest,
    Val,
} from "#protocol";
import {
    Command,
    FabricIndex,
    StatusCode,
    StatusResponse,
    StatusResponseError,
    TlvBoolean,
    TlvByteString,
    TlvField,
    TlvObject,
    TlvOptionalField,
    ValidationError,
    VendorId,
} from "#types";
import { OperationalCredentialsBehavior } from "./OperationalCredentialsBehavior.js";
import { VendorIdVerification } from "./VendorIdVerification.js";

const logger = Logger.get("OperationalCredentials");

/**
 * Monkey patching Tlv Structure of attestationRequest and csrRequest commands to prevent data validation of the nonce
 * fields to be handled as ConstraintError because we need to return a special error.
 * We do this to leave the model in fact for other validations and only apply the change for our Schema-aware Tlv parsing.
 */
OperationalCredentials.Cluster.commands = {
    ...OperationalCredentials.Cluster.commands,
    attestationRequest: Command(
        0x0,
        TlvObject({ attestationNonce: TlvField(0, TlvByteString) }),
        0x1,
        OperationalCredentials.TlvAttestationResponse,
        { invokeAcl: AccessLevel.Administer },
    ),
    csrRequest: Command(
        0x4,
        TlvObject({
            csrNonce: TlvField(0, TlvByteString),
            isForUpdateNoc: TlvOptionalField(1, TlvBoolean),
        }),
        0x5,
        OperationalCredentials.TlvCsrResponse,
        { invokeAcl: AccessLevel.Administer },
    ),
};

/**
 * This is the default server implementation of OperationalCredentialsBehavior.
 *
 * TODO - currently "source of truth" for fabric data is persisted by FabricManager.  If we remove some legacy code
 * paths we can move source of truth to here.  Right now we just sync fabrics with FabricManager.  This sync is only as
 * comprehensive as required by current use cases.  If fabrics are mutated directly on FabricManager then this code will
 * require update.
 */
export class OperationalCredentialsServer extends OperationalCredentialsBehavior {
    declare internal: OperationalCredentialsServer.Internal;
    declare state: OperationalCredentialsServer.State;

    override initialize(): MaybePromise {
        // maximum number of fabrics. Also, FabricBuilder uses 254 as max!
        if (!this.state.supportedFabrics) {
            this.state.supportedFabrics = 254;
        }
        this.state.commissionedFabrics = this.state.fabrics.length;

        this.reactTo((this.endpoint as Node).lifecycle.online, this.#nodeOnline);
    }

    override async attestationRequest({ attestationNonce }: OperationalCredentials.AttestationRequest) {
        assertRemoteActor(this.context);

        if (attestationNonce.byteLength !== 32) {
            throw new StatusResponseError("Invalid attestation nonce length", StatusCode.InvalidCommand);
        }

        const certification = await this.getCertification();

        const session = this.context.session;
        NodeSession.assert(session);

        const attestationElements = TlvAttestation.encode({
            declaration: certification.declaration,
            attestationNonce: attestationNonce,
            timestamp: 0,
        });

        const attestationSignature = (await certification.sign(session, attestationElements)).bytes;

        return { attestationElements, attestationSignature };
    }

    override async csrRequest({ csrNonce, isForUpdateNoc }: OperationalCredentials.CsrRequest) {
        assertRemoteActor(this.context);

        if (csrNonce.byteLength !== 32) {
            throw new StatusResponseError("Invalid csr nonce length", StatusCode.InvalidCommand);
        }

        const session = this.context.session;
        NodeSession.assert(session);
        if (isForUpdateNoc && session.isPase) {
            throw new StatusResponseError(
                "csrRequest for UpdateNoc received on a PASE session",
                StatusCode.InvalidCommand,
            );
        }

        const commissioner = this.env.get(DeviceCommissioner);
        const failsafeContext = commissioner.failsafeContext;
        if (failsafeContext.fabricIndex !== undefined) {
            throw new StatusResponseError(
                `csrRequest received after ${failsafeContext.forUpdateNoc ? "UpdateNOC" : "AddNOC"} already invoked`,
                StatusCode.ConstraintError,
            );
        }

        const certification = await this.getCertification();

        assertRemoteActor(this.context);
        const certSigningRequest = await failsafeContext.createCertificateSigningRequest(
            isForUpdateNoc ?? false,
            this.context.session.id,
        );
        const nocsrElements = TlvCertSigningRequest.encode({ certSigningRequest, csrNonce });
        const attestationSignature = (await certification.sign(session, nocsrElements)).bytes;
        return { nocsrElements, attestationSignature };
    }

    override async certificateChainRequest({ certificateType }: OperationalCredentials.CertificateChainRequest) {
        const certification = await this.getCertification();

        switch (certificateType) {
            case OperationalCredentials.CertificateChainType.DacCertificate:
                return { certificate: certification.certificate };
            case OperationalCredentials.CertificateChainType.PaiCertificate:
                return { certificate: certification.intermediateCertificate };
            default:
                throw new StatusResponseError(
                    `Unsupported certificate type: ${certificateType}`,
                    StatusCode.InvalidCommand,
                );
        }
    }

    #mapNocErrors(error: unknown): OperationalCredentials.NocResponse {
        if (error instanceof MatterFabricConflictError) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.FabricConflict,
                debugText: error.message,
            };
        } else if (error instanceof FabricTableFullError) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.TableFull,
                debugText: error.message,
            };
        } else if (
            error instanceof CryptoVerifyError ||
            error instanceof CertificateError ||
            error instanceof ValidationError ||
            error instanceof UnexpectedDataError
        ) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidNoc,
                debugText: error.message,
            };
        } else if (error instanceof PublicKeyError) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidPublicKey,
                debugText: error.message,
            };
        } else if (error instanceof MatterFabricInvalidAdminSubjectError) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidAdminSubject,
                debugText: error.message,
            };
        }
        throw error;
    }

    override async addNoc({
        nocValue,
        icacValue,
        ipkValue,
        caseAdminSubject,
        adminVendorId,
    }: OperationalCredentials.AddNocRequest) {
        assertRemoteActor(this.context);

        const failsafeContext = this.#failsafeContext;

        if (failsafeContext.fabricIndex !== undefined) {
            throw new StatusResponseError(
                `AddNoc is illegal after ${failsafeContext.forUpdateNoc ? "UpdateNOC" : "AddNOC"} in the same failsafe context`,
                StatusCode.ConstraintError,
            );
        }

        if (!failsafeContext.hasRootCert) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidNoc,
                debugText: "Root certificate not found",
            };
        }

        if (failsafeContext.csrSessionId !== this.context.session.id) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.MissingCsr,
                debugText: "CSR not found in failsafe context",
            };
        }

        if (failsafeContext.forUpdateNoc) {
            throw new StatusResponseError(
                `AddNoc is illegal after CsrRequest for UpdateNOC in same failsafe context`,
                StatusCode.ConstraintError,
            );
        }

        const state = this.state;
        if (state.commissionedFabrics >= state.supportedFabrics) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.TableFull,
                debugText: `No more fabrics can be added because limit ${state.supportedFabrics} reached`,
            };
        }

        let fabric: Fabric;
        try {
            fabric = await failsafeContext.buildFabric({
                nocValue,
                icacValue,
                adminVendorId,
                ipkValue,
                caseAdminSubject,
            });
        } catch (error) {
            logger.info("Building fabric for addNoc failed", error);
            return this.#mapNocErrors(error);
        }

        // The receiver SHALL create and add a new Access Control Entry using the CaseAdminSubject field to grant
        // subsequent Administer access to an Administrator member of the new Fabric.
        await this.endpoint.act(agent => agent.get(AccessControlServer).addDefaultCaseAcl(fabric, [caseAdminSubject]));

        const session = this.context.session;
        NodeSession.assert(session);

        try {
            if (session.isPase) {
                logger.debug(`Add Fabric ${fabric.fabricIndex} to PASE session ${session.name}`);
                session.addAssociatedFabric(fabric);
            }

            // Update attributes
            const existingFabricIndex = this.state.fabrics.findIndex(f => f.fabricIndex === fabric.fabricIndex);
            const existingNocIndex = this.state.nocs.findIndex(n => n.fabricIndex === fabric.fabricIndex);
            if (existingFabricIndex !== -1 || existingNocIndex !== -1) {
                throw new MatterFlowError(
                    `FabricIndex ${fabric.fabricIndex} already exists in state. This should not happen`,
                );
            }
        } catch (e) {
            // Fabric insertion into FabricManager is not currently transactional so we need to remove manually
            await fabric.delete(session.id);
            throw e;
        }

        // TODO The incoming IPKValue SHALL be stored in the Fabric-scoped slot within the Group Key Management cluster
        //  (see KeySetWrite), for subsequent use during CASE.

        // TODO If the current secure session was established with PASE, the receiver SHALL: a. Augment the secure
        //  session context with the FabricIndex generated above, such that subsequent interactions have the proper
        //  accessing fabric.

        logger.info(`addNoc success, adminVendorId ${adminVendorId}, caseAdminSubject ${caseAdminSubject}`);

        return {
            statusCode: OperationalCredentials.NodeOperationalCertStatus.Ok,
            fabricIndex: fabric.fabricIndex,
        };
    }

    override async updateNoc({ nocValue, icacValue }: OperationalCredentials.UpdateNocRequest) {
        assertRemoteActor(this.context);
        NodeSession.assert(this.context.session);

        const timedOp = this.#failsafeContext;

        if (timedOp.fabricIndex !== undefined) {
            throw new StatusResponseError(
                `UpdateNoc is illegal after ${timedOp.forUpdateNoc ? "UpdateNOC" : "AddNOC"} in same failsafe context`,
                StatusCode.ConstraintError,
            );
        }

        if (timedOp.forUpdateNoc === false) {
            throw new StatusResponseError(
                "UpdateNoc is illegal after CsrRequest for AddNOC in same failsafe context",
                StatusCode.ConstraintError,
            );
        }

        if (timedOp.rootCertSet) {
            // CERTIFICATION BUG WORKAROUND
            // This should be a ConstraintError but tests require this error
            // See https://github.com/CHIP-Specifications/chip-test-plans/issues/4807
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.MissingCsr,
            };
        }

        if (timedOp.forUpdateNoc === undefined) {
            // CERTIFICATION BUG WORKAROUND
            // This should be a ConstraintError but tests require this error
            // See https://github.com/CHIP-Specifications/chip-test-plans/issues/4807
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.MissingCsr,
            };
        }

        if (this.context.session.associatedFabric.fabricIndex !== timedOp.associatedFabric?.fabricIndex) {
            throw new StatusResponseError(
                "Fabric of this session and the failsafe context do not match",
                StatusCode.ConstraintError,
            );
        }

        // Build a new Fabric with the updated NOC and ICAC
        try {
            const updatedFabric = await timedOp.buildUpdatedFabric(nocValue, icacValue);

            // update FabricManager and Resumption records but leave current session intact
            await timedOp.replaceFabric(updatedFabric);

            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.Ok,
                fabricIndex: updatedFabric.fabricIndex,
            };
        } catch (error) {
            logger.info("Building fabric for updateNoc failed", error);
            return this.#mapNocErrors(error);
        }
    }

    override async updateFabricLabel({ label }: OperationalCredentials.UpdateFabricLabelRequest) {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;

        const currentFabricIndex = fabric.fabricIndex;
        const fabrics = this.env.get(FabricManager);
        const conflictingLabelFabric = fabrics.find(f => f.label === label && f.fabricIndex !== currentFabricIndex);
        if (conflictingLabelFabric !== undefined) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.LabelConflict,
                debugText: `Label ${label} already used by fabric ${conflictingLabelFabric.fabricIndex}`,
            };
        }

        await fabric.setLabel(label);

        return { statusCode: OperationalCredentials.NodeOperationalCertStatus.Ok, fabricIndex: fabric.fabricIndex };
    }

    override async removeFabric({ fabricIndex }: OperationalCredentials.RemoveFabricRequest) {
        assertRemoteActor(this.context);

        const fabric = this.env.get(FabricManager).findByIndex(fabricIndex);

        if (fabric === undefined) {
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidFabricIndex,
                debugText: `Fabric ${fabricIndex} not found`,
            };
        }

        await fabric.leave(this.context.session.id);
        // The state is updated on removal via commissionedFabricChanged event, see constructor

        return {
            statusCode: OperationalCredentials.NodeOperationalCertStatus.Ok,
            fabricIndex,
        };
    }

    override async addTrustedRootCertificate({
        rootCaCertificate,
    }: OperationalCredentials.AddTrustedRootCertificateRequest) {
        const failsafeContext = this.#failsafeContext;

        // TC_OPCREDS_3_4 fails if we don't allow set of the root certificate in updates, even though that's illegal and
        // UpdateNoc will subsequently fail.  So we can't just test for presence of root certificate; we actually need
        // to test if it's been set
        if (failsafeContext.rootCertSet) {
            throw new StatusResponseError(
                "Trusted root certificate already added in this FailSafe context",
                StatusCode.ConstraintError,
            );
        }

        if (failsafeContext.fabricIndex !== undefined) {
            throw new StatusResponseError(
                `Cannot add trusted root certificates after ${failsafeContext.forUpdateNoc ? "UpdateNOC" : "AddNOC"}`,
                StatusCode.ConstraintError,
            );
        }

        try {
            await failsafeContext.setRootCert(rootCaCertificate);
        } catch (error) {
            logger.info("Error installing root certificate:", error);
            if (
                error instanceof CryptoVerifyError ||
                error instanceof CertificateError ||
                error instanceof ValidationError ||
                error instanceof UnexpectedDataError
            ) {
                throw new StatusResponseError(error.message, StatusCode.InvalidCommand);
            }
            throw error;
        }

        const fabrics = this.env.get(FabricManager);
        const trustedRootCertificates = fabrics.map(fabric => fabric.rootCert);
        trustedRootCertificates.push(rootCaCertificate);
        this.state.trustedRootCertificates = trustedRootCertificates;
    }

    override async signVidVerificationRequest({
        fabricIndex,
        clientChallenge,
    }: OperationalCredentials.SignVidVerificationRequest): Promise<OperationalCredentials.SignVidVerificationResponse> {
        assertRemoteActor(this.context);
        NodeSession.assert(this.context.session);

        const fabrics = this.env.get(FabricManager);
        if (!fabrics.has(fabricIndex)) {
            throw new StatusResponse.ConstraintErrorError(`Fabric with index ${fabricIndex} does not exist`);
        }
        const fabric = fabrics.for(fabricIndex);

        const { fabricBindingVersion, signatureData } = VendorIdVerification.dataToSign({
            attChallenge: this.context.session.attestationChallengeKey,
            clientChallenge,
            fabricIndex,
            fabric: fabric.config,
        });

        return {
            fabricIndex,
            fabricBindingVersion,
            signature: (await fabric.sign(signatureData)).bytes,
        };
    }

    override async setVidVerificationStatement({
        vendorId,
        vidVerificationStatement,
        vvsc,
    }: OperationalCredentials.SetVidVerificationStatementRequest): Promise<void> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;

        if (vendorId === undefined && vidVerificationStatement === undefined && vvsc === undefined) {
            throw new StatusResponse.InvalidCommandError(
                "At least one of vendorId, vidVerificationStatement or vvsc must be provided",
            );
        }
        if (vendorId !== undefined && !VendorId.isValid(vendorId)) {
            throw new StatusResponse.ConstraintErrorError(`Invalid vendorId: ${vendorId}`);
        }

        // Error checks included in updateVendorVerificationData method
        await fabric.updateVendorVerificationData(vendorId, vidVerificationStatement, vvsc);
    }

    async #updateFabrics() {
        const fabrics = this.env.get(FabricManager);
        this.state.fabrics = fabrics.map(fabric => ({
            fabricId: fabric.fabricId,
            label: fabric.label,
            nodeId: fabric.nodeId,
            rootPublicKey: fabric.rootPublicKey,
            vendorId: fabric.rootVendorId,
            vidVerificationStatement: fabric.vidVerificationStatement,
            fabricIndex: fabric.fabricIndex,
        }));

        this.state.nocs = fabrics.map(fabric => ({
            noc: fabric.operationalCert,
            icac: fabric.intermediateCACert ?? null,
            vvsc: fabric.vvsc,
            fabricIndex: fabric.fabricIndex,
        }));

        this.state.trustedRootCertificates = fabrics.map(fabric => fabric.rootCert);

        this.state.commissionedFabrics = fabrics.length;

        await this.context.transaction.commit();
    }

    async getCertification() {
        const certification =
            this.internal.certification ??
            (this.internal.certification = new DeviceCertification(
                this.env.get(Crypto),
                this.state.certification,
                this.agent.get(ProductDescriptionServer).state,
            ));

        await certification.construction;

        return certification;
    }

    async #handleAddedFabric({ fabricIndex }: Fabric) {
        await this.#updateFabrics();
        this.agent.get(CommissioningServer).handleFabricChange(fabricIndex, "added");
    }

    async #handleUpdatedFabric({ fabricIndex }: Fabric) {
        await this.#updateFabrics();
        this.agent.get(CommissioningServer).handleFabricChange(fabricIndex, "updated");
    }

    async #handleRemovedFabric({ fabricIndex }: Fabric) {
        await this.#updateFabrics();
        this.agent.get(CommissioningServer).handleFabricChange(fabricIndex, "deleted");
    }

    async #handleFailsafeClosed() {
        await this.#updateFabrics();
    }

    async #nodeOnline() {
        const fabricManager = this.env.get(FabricManager);
        this.reactTo(fabricManager.events.added, this.#handleAddedFabric, { lock: true });
        this.reactTo(fabricManager.events.replaced, this.#handleUpdatedFabric, { lock: true });
        this.reactTo(fabricManager.events.deleted, this.#handleRemovedFabric, { lock: true });
        this.reactTo(fabricManager.events.failsafeClosed, this.#handleFailsafeClosed, { lock: true });
        await this.#updateFabrics();
    }

    get #failsafeContext() {
        return this.env.get(DeviceCommissioner).failsafeContext;
    }
}

export namespace OperationalCredentialsServer {
    export class Internal {
        certification?: DeviceCertification;
        commissionedFabric?: FabricIndex;
    }

    export class State extends OperationalCredentialsBehavior.State {
        /**
         * Device certification information.
         *
         * Device certification provides a cryptographic certificate that asserts the official status of a device.
         * Production consumer-facing devices are certified by the CSA.
         *
         * Development devices and those intended for personal use may use a development certificate.  This is the
         * default if you do not provide an official certification in {@link ServerOptions.certification}.
         */
        certification?: DeviceCertification.Definition = undefined;

        [Val.properties](_endpoint: Endpoint, session: ValueSupervisor.Session) {
            return {
                get currentFabricIndex() {
                    return session.fabric ?? FabricIndex.NO_FABRIC;
                },
            };
        }
    }
}
