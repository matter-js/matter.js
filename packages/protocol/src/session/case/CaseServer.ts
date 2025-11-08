/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Noc } from "#certificate/kinds/Noc.js";
import { Bytes, Crypto, CryptoDecryptError, Diagnostic, Logger, PublicKey, UnexpectedDataError } from "#general";
import { NodeSession } from "#session/NodeSession.js";
import { SessionParametersWithDurations } from "#session/pase/PaseMessages.js";
import { ResumptionRecord, SessionManager } from "#session/SessionManager.js";
import { SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "#types";
import { FabricManager, FabricNotFoundError } from "../../fabric/FabricManager.js";
import { MessageExchange } from "../../protocol/MessageExchange.js";
import { ProtocolHandler } from "../../protocol/ProtocolHandler.js";
import { ChannelStatusResponseError } from "../../securechannel/SecureChannelMessenger.js";
import {
    CaseSigma1,
    KDFSR1_KEY_INFO,
    KDFSR2_INFO,
    KDFSR2_KEY_INFO,
    KDFSR3_INFO,
    RESUME1_MIC_NONCE,
    RESUME2_MIC_NONCE,
    TBE_DATA2_NONCE,
    TBE_DATA3_NONCE,
    TlvEncryptedDataSigma2,
    TlvEncryptedDataSigma3,
    TlvSignedData,
} from "./CaseMessages.js";
import { CaseServerMessenger } from "./CaseMessenger.js";

const logger = Logger.get("CaseServer");

export class CaseServer implements ProtocolHandler {
    readonly id = SECURE_CHANNEL_PROTOCOL_ID;
    readonly requiresSecureSession = false;

    #sessions: SessionManager;
    #fabrics: FabricManager;

    constructor(sessions: SessionManager, fabrics: FabricManager) {
        this.#sessions = sessions;
        this.#fabrics = fabrics;
    }

    async onNewExchange(exchange: MessageExchange) {
        const messenger = new CaseServerMessenger(exchange);
        try {
            await this.#handleSigma1(messenger);
        } catch (error) {
            logger.error("Error establishing CASE session", error);

            if (error instanceof FabricNotFoundError) {
                await messenger.sendError(SecureChannelStatusCode.NoSharedTrustRoots);
            }
            // If we received a ChannelStatusResponseError we do not need to send one back, so just cancel pairing
            else if (!(error instanceof ChannelStatusResponseError)) {
                await messenger.sendError(SecureChannelStatusCode.InvalidParam);
            }
        } finally {
            // Destroy the unsecure session used to establish the secure Case session
            await exchange.session.destroy();
        }
    }

    async #handleSigma1(messenger: CaseServerMessenger) {
        logger.info("Received pairing request «", Diagnostic.via(messenger.channelName));

        // Initialize context with information from peer
        const { sigma1Bytes, sigma1 } = await messenger.readSigma1();
        const resumptionRecord =
            sigma1.resumptionId !== undefined && sigma1.initiatorResumeMic !== undefined
                ? this.#sessions.findResumptionRecordById(sigma1.resumptionId)
                : undefined;

        const context = new Sigma1Context(this.#fabrics.crypto, messenger, sigma1Bytes, sigma1, resumptionRecord);

        // Attempt resumption
        if (await this.#resume(context)) {
            return;
        }

        // Attempt sigma2 negotiation
        if (await this.#generateSigma2(context)) {
            return;
        }

        logger.info(
            "Invalid resumption ID or resume MIC received from",
            messenger.channelName,
            Diagnostic.dict({
                resumptionId: context.peerResumptionId,
                resumeMic: context.peerResumeMic,
            }),
        );

        throw new UnexpectedDataError("Invalid resumption ID or resume MIC.");
    }

    async #resume(cx: Sigma1Context) {
        if (cx.peerResumptionId === undefined || cx.peerResumeMic === undefined || cx.resumptionRecord === undefined) {
            return false;
        }

        const { sharedSecret, fabric, peerNodeId, caseAuthenticatedTags } = cx.resumptionRecord;
        const { crypto } = this.#fabrics;
        const peerResumeKey = await crypto.createHkdfKey(
            sharedSecret,
            Bytes.concat(cx.peerRandom, cx.peerResumptionId),
            KDFSR1_KEY_INFO,
        );

        try {
            crypto.decrypt(peerResumeKey, cx.peerResumeMic, RESUME1_MIC_NONCE);
        } catch (e) {
            CryptoDecryptError.accept(e);

            // Clear resumption and initiate negotiate new connection
            cx.peerResumptionId = cx.peerResumeMic = undefined;

            return false;
        }

        // All good! Create secure session
        const responderSessionId = await this.#sessions.getNextAvailableSessionId();
        const secureSessionSalt = Bytes.concat(cx.peerRandom, cx.peerResumptionId);
        const secureSession = await this.#sessions.createSecureSession({
            sessionId: responderSessionId,
            fabric,
            peerNodeId,
            peerSessionId: cx.peerSessionId,
            sharedSecret,
            salt: secureSessionSalt,
            isInitiator: false,
            isResumption: true,
            peerSessionParameters: cx.peerSessionParams,
            caseAuthenticatedTags,
        });

        // Generate sigma 2 resume
        const resumeSalt = Bytes.concat(cx.peerRandom, cx.localResumptionId);
        const resumeKey = await crypto.createHkdfKey(sharedSecret, resumeSalt, KDFSR2_KEY_INFO);
        const resumeMic = crypto.encrypt(resumeKey, new Uint8Array(0), RESUME2_MIC_NONCE);
        try {
            const responderSessionParams = this.#sessions.sessionParameters;
            await cx.messenger.sendSigma2Resume({
                resumptionId: cx.localResumptionId,
                resumeMic,
                responderSessionId,
                responderSessionParams,
            });
        } catch (error) {
            // If we fail to send the resume message, we destroy the session
            await secureSession.destroy(false);
            throw error;
        }

        NodeSession.logNew(logger, "Resumed", secureSession, cx.messenger, fabric, peerNodeId);

        cx.resumptionRecord.resumptionId = cx.localResumptionId; /* Update the ID */

        // Wait for success on the peer side
        await cx.messenger.waitForSuccess("Sigma2Resume-Success");

        await cx.messenger.close();
        await this.#sessions.saveResumptionRecord(cx.resumptionRecord);

        return true;
    }

    async #generateSigma2(cx: Sigma1Context) {
        if (
            // No resumption attempted is OK
            !(cx.peerResumptionId === undefined && cx.peerResumeMic === undefined) &&
            // Resumption attempted with no record on our side is OK
            !(cx.peerResumptionId !== undefined && cx.peerResumeMic !== undefined && cx.resumptionRecord === undefined)
        ) {
            return false;
        }

        // Generate pairing info
        const { crypto } = this.#fabrics;
        const responderRandom = crypto.randomBytes(32);

        // TODO: Pass through a group id?
        const fabric = await this.#fabrics.findFabricFromDestinationId(cx.destinationId, cx.peerRandom);
        const { operationalCert: nodeOpCert, intermediateCACert, operationalIdentityProtectionKey } = fabric;
        const key = await crypto.createKeyPair();
        const responderEcdhPublicKey = key.publicBits;
        const sharedSecret = await crypto.generateDhSecret(key, PublicKey(cx.peerEcdhPublicKey));

        const sigma2Salt = Bytes.concat(
            operationalIdentityProtectionKey,
            responderRandom,
            responderEcdhPublicKey,
            await crypto.computeSha256(cx.bytes),
        );
        const sigma2Key = await crypto.createHkdfKey(sharedSecret, sigma2Salt, KDFSR2_INFO);
        const signatureData = TlvSignedData.encode({
            responderNoc: nodeOpCert,
            responderIcac: intermediateCACert,
            responderPublicKey: responderEcdhPublicKey,
            initiatorPublicKey: cx.peerEcdhPublicKey,
        });
        const signature = await fabric.sign(signatureData);
        const encryptedData = TlvEncryptedDataSigma2.encode({
            responderNoc: nodeOpCert,
            responderIcac: intermediateCACert,
            signature,
            resumptionId: cx.localResumptionId,
        });
        const encrypted = crypto.encrypt(sigma2Key, encryptedData, TBE_DATA2_NONCE);
        const responderSessionId = await this.#sessions.getNextAvailableSessionId();
        const sigma2Bytes = await cx.messenger.sendSigma2({
            responderRandom,
            responderSessionId,
            responderEcdhPublicKey,
            encrypted,
            responderSessionParams: this.#sessions.sessionParameters, // responder session parameters
        });

        // Read and process sigma 3
        const {
            sigma3Bytes,
            sigma3: { encrypted: peerEncrypted },
        } = await cx.messenger.readSigma3();
        const sigma3Salt = Bytes.concat(
            operationalIdentityProtectionKey,
            await crypto.computeSha256([cx.bytes, sigma2Bytes]),
        );
        const sigma3Key = await crypto.createHkdfKey(sharedSecret, sigma3Salt, KDFSR3_INFO);
        const peerDecryptedData = crypto.decrypt(sigma3Key, peerEncrypted, TBE_DATA3_NONCE);
        const {
            responderNoc: peerNewOpCert,
            responderIcac: peerIntermediateCACert,
            signature: peerSignature,
        } = TlvEncryptedDataSigma3.decode(peerDecryptedData);

        await fabric.verifyCredentials(peerNewOpCert, peerIntermediateCACert);

        const peerSignatureData = TlvSignedData.encode({
            responderNoc: peerNewOpCert,
            responderIcac: peerIntermediateCACert,
            responderPublicKey: cx.peerEcdhPublicKey,
            initiatorPublicKey: responderEcdhPublicKey,
        });
        const {
            ellipticCurvePublicKey: peerPublicKey,
            subject: { fabricId: peerFabricId, nodeId: peerNodeId, caseAuthenticatedTags },
        } = Noc.fromTlv(peerNewOpCert).cert;

        if (fabric.fabricId !== peerFabricId) {
            throw new UnexpectedDataError(`Fabric ID mismatch: ${fabric.fabricId} !== ${peerFabricId}`);
        }

        await crypto.verifyEcdsa(PublicKey(peerPublicKey), peerSignatureData, peerSignature);

        // All good! Create secure session
        const secureSessionSalt = Bytes.concat(
            operationalIdentityProtectionKey,
            await crypto.computeSha256([cx.bytes, sigma2Bytes, sigma3Bytes]),
        );
        const secureSession = await this.#sessions.createSecureSession({
            sessionId: responderSessionId,
            fabric,
            peerNodeId,
            peerSessionId: cx.peerSessionId,
            sharedSecret,
            salt: secureSessionSalt,
            isInitiator: false,
            isResumption: false,
            peerSessionParameters: cx.peerSessionParams,
            caseAuthenticatedTags,
        });

        NodeSession.logNew(logger, "New", secureSession, cx.messenger, fabric, peerNodeId);

        await cx.messenger.sendSuccess();

        const resumptionRecord = {
            peerNodeId,
            fabric,
            sharedSecret,
            resumptionId: cx.localResumptionId,
            sessionParameters: secureSession.parameters,
            caseAuthenticatedTags,
        };

        await cx.messenger.close();
        await this.#sessions.saveResumptionRecord(resumptionRecord);

        return true;
    }

    async close() {
        // Nothing to do
    }
}

class Sigma1Context {
    crypto: Crypto;
    messenger: CaseServerMessenger;
    bytes: Bytes;
    peerSessionId: number;
    peerResumptionId?: Bytes;
    peerResumeMic?: Bytes;
    destinationId: Bytes;
    peerRandom: Bytes;
    peerEcdhPublicKey: Bytes;
    peerSessionParams?: SessionParametersWithDurations;
    resumptionRecord?: ResumptionRecord;

    #localResumptionId?: Bytes;

    constructor(
        crypto: Crypto,
        messenger: CaseServerMessenger,
        bytes: Bytes,
        sigma1: CaseSigma1,
        resumptionRecord?: ResumptionRecord,
    ) {
        this.crypto = crypto;
        this.messenger = messenger;
        this.bytes = bytes;
        this.peerSessionId = sigma1.initiatorSessionId;
        this.peerResumptionId = sigma1.resumptionId;
        this.peerResumeMic = sigma1.initiatorResumeMic;
        this.destinationId = sigma1.destinationId;
        this.peerRandom = sigma1.initiatorRandom;
        this.peerEcdhPublicKey = sigma1.initiatorEcdhPublicKey;
        this.peerSessionParams = sigma1.initiatorSessionParams;
        this.resumptionRecord = resumptionRecord;
    }

    get localResumptionId() {
        return (this.#localResumptionId ??= this.crypto.randomBytes(16));
    }
}
