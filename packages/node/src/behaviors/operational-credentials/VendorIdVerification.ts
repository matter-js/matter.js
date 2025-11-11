/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OperationalCredentials } from "#clusters/operational-credentials";
import {
    Bytes,
    Crypto,
    CryptoError,
    DataReader,
    DataWriter,
    EcdsaSignature,
    Endian,
    InternalError,
    Logger,
    MATTER_CRYPTO_PRIMITIVES_VERSION,
    PublicKey,
    UnexpectedDataError,
} from "#general";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Icac, Noc, NodeSession, Rcac, Vvsc } from "#protocol";
import { FabricId, FabricIndex, ReceivedStatusResponseError, StatusResponse, VendorId } from "#types";
import { OperationalCredentialsClient } from "../operational-credentials/OperationalCredentialsClient.js";

const logger = Logger.get("VendorIdVerification");

const VERIFICATION_STATEMENT_VERSION = 0x21;

// fabric_binding_version (1 byte) || root_public_key || fabric_id (64bit) || vendor_id (16bit)
// sizeof(uint8_t) + CHIP_CRYPTO_PUBLIC_KEY_SIZE_BYTES + sizeof(uint64_t) + sizeof(uint16_t)
const FABRIC_BINDING_MESSAGE_SIZE = 76;

// sizeof(uint8_t) + kSubjectKeyIdentifierLength + kP256_ECDSA_Signature_Length_Raw;
// sizeof(uint8_t) + kSubjectKeyIdentifierLength + kP256_ECDSA_Signature_Length_Raw
export const VERIFICATION_STATEMENT_SIZE = 85;

const FABRIC_BINDING_VERSION = MATTER_CRYPTO_PRIMITIVES_VERSION;

export namespace VendorIdVerification {
    export interface SignData {
        fabricBindingVersion?: number;
        clientChallenge: Bytes;
        attChallenge: Bytes;
        fabricIndex: FabricIndex;
        fabric: {
            // A partial variant for Fabric.Config with only the needed details that als a client has
            rootPublicKey: Bytes;
            fabricId: FabricId;
            rootVendorId: VendorId;
            vidVerificationStatement?: Bytes;
        };
    }

    /** Prepare the data to be signed for VID Verification */
    export function dataToSign(data: SignData) {
        const {
            fabricBindingVersion = FABRIC_BINDING_VERSION,
            clientChallenge,
            attChallenge,
            fabricIndex,
            fabric,
        } = data;

        if (fabricBindingVersion !== FABRIC_BINDING_VERSION) {
            throw new InternalError(`Unsupported Fabric Binding Version ${fabricBindingVersion}`);
        }

        const tbsWriter = new DataWriter(Endian.Big);
        tbsWriter.writeUInt8(fabricBindingVersion);
        tbsWriter.writeByteArray(clientChallenge);
        tbsWriter.writeByteArray(attChallenge);
        tbsWriter.writeUInt8(fabricIndex);

        // Fabric Binding Message
        tbsWriter.writeUInt8(fabricBindingVersion);
        tbsWriter.writeByteArray(fabric.rootPublicKey);
        tbsWriter.writeUInt64(fabric.fabricId);
        tbsWriter.writeUInt16(fabric.rootVendorId);

        if (fabric.vidVerificationStatement) {
            tbsWriter.writeByteArray(fabric.vidVerificationStatement);
        }

        return {
            fabricBindingVersion,
            signatureData: tbsWriter.toByteArray(),
        };
    }

    /**
     * Verify VendorId ownership using VID Verification protocol including needed requests to the device
     * TODO: Finalize this with DCL data and wire into controller as option
     *
     * It requires data read the the device (if relevant read non fabric filtered) for fabrics, nocs and
     * trustedRootCertificates to provide the raw input data for verification.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.10.1.
     */
    export async function verify(
        node: ClientNode,
        options: {
            noc: OperationalCredentials.Noc; // Noc entry read from device for the relevant fabric index
            rcac: Bytes; // Trusted Root Certificate , TODO: Allow to provide multiple and find the needed one
            fabric: OperationalCredentials.FabricDescriptor; // Fabric entry read from device for the relevant fabric index
        },
    ) {
        const crypto = node.env.get(Crypto);
        const clientChallenge = crypto.randomBytes(32);
        const {
            fabric: { fabricIndex },
        } = options;
        let signVerificationResponse;
        try {
            signVerificationResponse = await node
                .commandsOf(OperationalCredentialsClient)
                .signVidVerificationRequest({ fabricIndex, clientChallenge });
            if (fabricIndex !== signVerificationResponse.fabricIndex) {
                throw new StatusResponse.InvalidCommandError(
                    `Fabric Index mismatch: expected ${fabricIndex}, got ${signVerificationResponse.fabricIndex}`,
                );
            }
        } catch (error) {
            ReceivedStatusResponseError.accept(error);
            logger.error("Could not verify VendorId", error);
            return undefined;
        }

        const session = (node.interaction as ClientNodeInteraction).session;
        if (session === undefined || !NodeSession.is(session)) {
            // Should not happen when above command was successful
            logger.error("Could not verify VendorId: no session established");
            return undefined;
        }

        const { noc, rcac, fabric } = options;
        return await verifyData(crypto, {
            clientChallenge,
            attChallenge: session.attestationChallengeKey,
            signVerificationResponse,
            noc,
            rcac,
            fabric,
        });
    }

    /**
     * Verify VendorId ownership using VID Verification protocol on pure data level
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.10.1.
     */
    export async function verifyData(
        crypto: Crypto,
        options: {
            clientChallenge: Bytes;
            attChallenge: Bytes;
            signVerificationResponse: OperationalCredentials.SignVidVerificationResponse;
            noc: OperationalCredentials.Noc;
            rcac: Bytes;
            fabric: OperationalCredentials.FabricDescriptor;
        },
    ) {
        const {
            clientChallenge,
            attChallenge,
            signVerificationResponse: { fabricBindingVersion, signature },
            noc: { noc, icac, vvsc },
            rcac,
            fabric: { vendorId: rootVendorId, vidVerificationStatement, fabricIndex },
        } = options;
        const {
            subject: { fabricId },
            ellipticCurvePublicKey: rootPublicKey,
        } = Noc.fromTlv(noc).cert;

        const tbs = dataToSign({
            fabricBindingVersion,
            clientChallenge,
            attChallenge,
            fabricIndex,
            fabric: {
                rootPublicKey,
                fabricId,
                rootVendorId,
                vidVerificationStatement,
            },
        }).signatureData;

        try {
            // Validate signature over TBS data
            await crypto.verifyEcdsa(PublicKey(rootPublicKey), tbs, new EcdsaSignature(signature));

            // Verify Noc cert chain using trusted root
            const rootCert = Rcac.fromTlv(rcac);
            const nocCert = Noc.fromTlv(noc);
            const icaCert = icac ? Icac.fromTlv(icac) : undefined;
            if (icaCert !== undefined) {
                await icaCert.verify(crypto, rootCert);
            }
            await nocCert.verify(crypto, rootCert, icaCert);
        } catch (error) {
            CryptoError.accept(error);
            logger.error("Could not verify VendorId", error);
            return false;
        }

        if (vidVerificationStatement) {
            const {
                signerSkid,
                version: vidStatementVersion,
                signature: vidStatementSignature,
            } = parseStatement(vidVerificationStatement);

            if (vidStatementSignature === undefined) {
                throw new UnexpectedDataError("VID Verification Statement is missing signature");
            }

            let vvscCert: Vvsc;
            if (vvsc !== undefined) {
                vvscCert = Vvsc.fromTlv(vvsc);
            } else {
                // TODO Fetch VVSC from DCL if needed
                // Otherwise, look up the entry in the Operational Trust Anchors Schema
                // under the expected VendorID (VID field) being verified whose IsVIDVerificationSigner
                // field is true and whose SubjectKeyID matches the vid_verification_signer_skid
                // field value as the VIDVerificationSignerCertificate.
                // TODO Fail if not available!
                return true;
            }
            const {
                extensions: { subjectKeyIdentifier },
                ellipticCurvePublicKey,
            } = vvscCert.cert;
            if (!Bytes.areEqual(subjectKeyIdentifier, signerSkid)) {
                throw new UnexpectedDataError(
                    `VVSC SubjectKeyIdentifier does not match signerSkid in VID Verification Statement`,
                );
            }

            // TODO Gather and Verify the VVSC cert chain using trusted root
            // Validate the path of VIDVerificationSignerCertificate using the certificates in the Operational
            // Trust Anchors Schema under the expected VendorID (VID field) being verified. If
            // the path is invalid (e.g. any element of the chain missing, any certificate malformed, any
            // signature verification fails, etc), then the procedure terminates as failed. Only the self-
            // signed certificates among the set SHALL be considered as trust anchors during certificate
            // path validation. The path length SHALL NOT be longer than 3. The verifier MAY
            // apply knowledge of revoked entities obtained from outside the Distributed Compliance
            // Ledger.
            await vvscCert.verify(crypto);

            const ourStatement = createStatementBytes({
                version: vidStatementVersion,
                fabricBindingMessage: tbs,
                signerSkid,
            });

            await crypto.verifyEcdsa(
                PublicKey(ellipticCurvePublicKey),
                ourStatement,
                new EcdsaSignature(vidStatementSignature),
            );
        } else {
            // TODO
            // Look-up the entry in the Operational Trust Anchors Schema under the expected VendorID
            // (VID field) being verified whose IsRoot field is true and whose SubjectKeyID matches the
            // SubjectKeyID field value of the TrustedRootCertificates attribute entry whose FabricIndex
            // field matches the fabric being verified (i.e. the RCAC of the candidate fabric). If a
            // matching RCAC certificate is not found or empty after this step, then the procedure terminates
            // as failed. If found, save the certificate as GloballyTrustedRoot
            // then: Verify that the NOC chain is valid using Crypto_VerifyChain() against the entire chain
            // reconstructed from the NOCs attribute entry whose FabricIndex field matches the fabric
            // being verified, but populating the trusted root with the GloballyTrustedRoot certificate
            // rather than the value in TrustedRootCertificates associated with the candidate fabric. If
            // the chain is not valid, the procedure terminates as failed.
        }

        return true;
    }

    export function createStatementBytes(options: {
        version?: number;
        fabricBindingMessage: Bytes;
        signerSkid: Bytes;
    }) {
        const { version = VERIFICATION_STATEMENT_VERSION, fabricBindingMessage, signerSkid } = options;
        const writer = new DataWriter();
        writer.writeUInt8(version);
        writer.writeByteArray(fabricBindingMessage);
        writer.writeByteArray(signerSkid);
        return writer.toByteArray();
    }

    export function parseStatement(statement: Bytes) {
        const reader = new DataReader(statement);
        const version = reader.readUInt8();
        if (version !== VERIFICATION_STATEMENT_VERSION) {
            throw new UnexpectedDataError(`Unsupported VID Verification Statement version ${version}`);
        }
        const fabricBindingMessage = reader.readByteArray(FABRIC_BINDING_MESSAGE_SIZE);
        const signerSkid = reader.readByteArray(20);
        const signature = reader.remainingBytesCount > 0 ? reader.remainingBytes : undefined;
        return {
            version,
            fabricBindingMessage,
            signerSkid,
            signature,
        };
    }
}
