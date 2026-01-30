/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Icac } from "#certificate/kinds/Icac.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Fabric } from "#fabric/Fabric.js";
import {
    Abort,
    Bytes,
    causedBy,
    Duration,
    EcdsaSignature,
    Logger,
    MatterError,
    NetworkError,
    PublicKey,
    UnexpectedDataError,
} from "#general";
import { PeerCommunicationError } from "#peer/PeerCommunicationError.js";
import { ExchangeSendOptions, MessageExchange } from "#protocol/MessageExchange.js";
import { RetransmissionLimitReachedError } from "#protocol/errors.js";
import { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { CaseAuthenticatedTag, NodeId, SecureChannelStatusCode } from "#types";
import {
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
import { CaseClientMessenger } from "./CaseMessenger.js";

const logger = Logger.get("CaseClient");

export class CaseClient {
    #sessions: SessionManager;

    constructor(sessions: SessionManager) {
        this.#sessions = sessions;
    }

    async pair(exchange: MessageExchange, fabric: Fabric, peerNodeId: NodeId, options?: CaseClient.PairOptions) {
        const { expectedProcessingTime, caseAuthenticatedTags, abort } = options ?? {};
        const messenger = new CaseClientMessenger(exchange, expectedProcessingTime);

        const localAbort = new Abort({ abort });

        try {
            return await this.#doPair(messenger, exchange, fabric, peerNodeId, localAbort, caseAuthenticatedTags, {
                maxRetransmissions: options?.maxInitialRetransmissions,
                maxRetransmissionTime: options?.maxInitialRetransmissionTime,
            });
        } catch (error) {
            if (
                !localAbort.aborted &&
                !causedBy(error, NetworkError, PeerCommunicationError, RetransmissionLimitReachedError)
            ) {
                await messenger.sendError(SecureChannelStatusCode.InvalidParam);
            }
            throw error;
        } finally {
            await messenger.close();
        }
    }

    async #doPair(
        messenger: CaseClientMessenger,
        exchange: MessageExchange,
        fabric: Fabric,
        peerNodeId: NodeId,
        abort: Abort,
        caseAuthenticatedTags?: readonly CaseAuthenticatedTag[],
        initialSendOptions?: ExchangeSendOptions,
    ) {
        const { crypto } = fabric;

        // Generate pairing info
        const initiatorRandom = crypto.randomBytes(32);
        const initiatorSessionId = await abort.attempt(this.#sessions.getNextAvailableSessionId()); // Initiator Session Id
        const { operationalIdentityProtectionKey, operationalCert: localNoc, intermediateCACert: localIcac } = fabric;
        const localKey = await abort.attempt(crypto.createKeyPair());

        // Send sigma1
        let sigma1Bytes;
        let resumed = false;
        let resumptionRecord = this.#sessions.findResumptionRecordByAddress(fabric.addressOf(peerNodeId));
        if (resumptionRecord !== undefined) {
            const { sharedSecret, resumptionId } = resumptionRecord;
            const resumeKey = await abort.attempt(
                crypto.createHkdfKey(sharedSecret, Bytes.concat(initiatorRandom, resumptionId), KDFSR1_KEY_INFO),
            );
            const initiatorResumeMic = crypto.encrypt(resumeKey, new Uint8Array(0), RESUME1_MIC_NONCE);
            sigma1Bytes = await abort.attempt(
                messenger.sendSigma1(
                    {
                        initiatorSessionId,
                        destinationId: await abort.attempt(fabric.currentDestinationIdFor(peerNodeId, initiatorRandom)),
                        initiatorEcdhPublicKey: localKey.publicBits,
                        initiatorRandom,
                        resumptionId,
                        initiatorResumeMic,
                        initiatorSessionParams: this.#sessions.sessionParameters,
                    },
                    initialSendOptions,
                ),
            );
        } else {
            sigma1Bytes = await abort.attempt(
                messenger.sendSigma1(
                    {
                        initiatorSessionId,
                        destinationId: await abort.attempt(fabric.currentDestinationIdFor(peerNodeId, initiatorRandom)),
                        initiatorEcdhPublicKey: localKey.publicBits,
                        initiatorRandom,
                        initiatorSessionParams: this.#sessions.sessionParameters,
                    },
                    {
                        abort,
                        ...initialSendOptions,
                    },
                ),
            );
        }

        let secureSession: NodeSession;
        const { sigma2Bytes, sigma2, sigma2Resume } = await messenger.readSigma2(abort);
        if (sigma2Resume !== undefined) {
            // Process sigma2 resume
            if (resumptionRecord === undefined) {
                throw new UnexpectedDataError("Received an unexpected sigma2Resume.");
            }
            const {
                sharedSecret,
                fabric,
                sessionParameters: resumptionSessionParams,
                caseAuthenticatedTags,
            } = resumptionRecord;
            const { responderSessionId: peerSessionId, resumptionId, resumeMic } = sigma2Resume;

            // We use the Fallbacks for the session parameters overridden by our stored ones from the resumption record
            const sessionParameters = {
                ...exchange.session.parameters,
                ...(resumptionSessionParams ?? {}),
            };

            const resumeSalt = Bytes.concat(initiatorRandom, resumptionId);
            const resumeKey = await abort.attempt(crypto.createHkdfKey(sharedSecret, resumeSalt, KDFSR2_KEY_INFO));
            crypto.decrypt(resumeKey, resumeMic, RESUME2_MIC_NONCE);

            await messenger.sendSuccess(abort);

            const secureSessionSalt = Bytes.concat(initiatorRandom, resumptionRecord.resumptionId);
            secureSession = await abort.attempt(
                this.#sessions.createSecureSession({
                    channel: exchange.channel.channel,
                    id: initiatorSessionId,
                    fabric,
                    peerNodeId,
                    peerSessionId,
                    sharedSecret,
                    salt: secureSessionSalt,
                    isInitiator: true,
                    isResumption: true,
                    peerSessionParameters: sessionParameters,
                    caseAuthenticatedTags,
                }),
            );
            NodeSession.logNew(logger, "Resumed", secureSession, messenger, fabric, peerNodeId);

            resumptionRecord.resumptionId = resumptionId; /* update resumptionId */
            resumptionRecord.sessionParameters = secureSession.parameters; /* update mrpParams */
            resumed = true;

            try {
                await messenger.sendSuccess();
            } catch (error) {
                MatterError.accept(error);
                logger.info(
                    messenger.exchange.via,
                    "Error sending Sigma2Resume-Success, assume session still valid:",
                    error,
                );
            }
        } else {
            // Process sigma2
            const {
                responderEcdhPublicKey: peerKey,
                encrypted: peerEncrypted,
                responderRandom,
                responderSessionId: peerSessionId,
                responderSessionParams,
            } = sigma2;

            // Update the session timing parameters with the just received ones to optimize the session establishment
            if (responderSessionParams !== undefined) {
                exchange.session.timingParameters = responderSessionParams;
            }

            // We use the Fallbacks for the session parameters overridden by what was sent by the device in Sigma2
            const peerSessionParameters = {
                ...exchange.session.parameters,
                ...(responderSessionParams ?? {}),
            };

            const sharedSecret = await abort.attempt(crypto.generateDhSecret(localKey, PublicKey(peerKey)));
            const sigma2Salt = Bytes.concat(
                operationalIdentityProtectionKey,
                responderRandom,
                peerKey,
                await abort.attempt(crypto.computeHash(sigma1Bytes)),
            );
            const sigma2Key = await abort.attempt(crypto.createHkdfKey(sharedSecret, sigma2Salt, KDFSR2_INFO));
            const peerEncryptedData = crypto.decrypt(sigma2Key, peerEncrypted, TBE_DATA2_NONCE);
            const {
                responderNoc: peerNoc,
                responderIcac: peerIcac,
                signature: peerSignature,
                resumptionId: peerResumptionId,
            } = TlvEncryptedDataSigma2.decode(peerEncryptedData);
            const peerSignatureData = TlvSignedData.encode({
                responderNoc: peerNoc,
                responderIcac: peerIcac,
                responderPublicKey: peerKey,
                initiatorPublicKey: localKey.publicBits,
            });
            const {
                ellipticCurvePublicKey: peerPublicKey,
                subject: { fabricId: peerFabricIdNOCert, nodeId: peerNodeIdNOCert },
            } = Noc.fromTlv(peerNoc).cert;

            await abort.attempt(
                crypto.verifyEcdsa(PublicKey(peerPublicKey), peerSignatureData, new EcdsaSignature(peerSignature)),
            );

            if (peerNodeIdNOCert !== peerNodeId) {
                throw new UnexpectedDataError(
                    `The node ID in the peer certificate ${peerNodeIdNOCert} doesn't match the expected peer node ID ${peerNodeId}`,
                );
            }
            if (peerFabricIdNOCert !== fabric.fabricId) {
                throw new UnexpectedDataError(
                    `The fabric ID in the peer certificate ${peerFabricIdNOCert} doesn't match the expected fabric ID ${fabric.fabricId}`,
                );
            }
            if (peerIcac !== undefined) {
                const {
                    subject: { fabricId: peerFabricIdIcaCert },
                } = Icac.fromTlv(peerIcac).cert;

                if (peerFabricIdIcaCert !== undefined && peerFabricIdIcaCert !== fabric.fabricId) {
                    throw new UnexpectedDataError(
                        `The fabric ID in the peer intermediate CA certificate ${peerFabricIdIcaCert} doesn't match the expected fabric ID ${fabric.fabricId}`,
                    );
                }
            }
            await abort.attempt(fabric.verifyCredentials(peerNoc, peerIcac));

            // Generate and send sigma3
            const sigma3Salt = Bytes.concat(
                operationalIdentityProtectionKey,
                await abort.attempt(crypto.computeHash([sigma1Bytes, sigma2Bytes])),
            );
            const sigma3Key = await abort.attempt(crypto.createHkdfKey(sharedSecret, sigma3Salt, KDFSR3_INFO));
            const signatureData = TlvSignedData.encode({
                responderNoc: localNoc,
                responderIcac: localIcac,
                responderPublicKey: localKey.publicBits,
                initiatorPublicKey: peerKey,
            });
            const signature = await abort.attempt(fabric.sign(signatureData));
            const encryptedData = TlvEncryptedDataSigma3.encode({
                responderNoc: localNoc,
                responderIcac: localIcac,
                signature: signature.bytes,
            });
            const encrypted = crypto.encrypt(sigma3Key, encryptedData, TBE_DATA3_NONCE);
            const sigma3Bytes = await messenger.sendSigma3({ encrypted }, { abort });
            await abort.attempt(messenger.waitForSuccess({ description: "Sigma3-Success" }));

            // Create a secure session. Configured CATs take precedence over resumption record ones
            const sessionCaseAuthenticatedTags = caseAuthenticatedTags ?? resumptionRecord?.caseAuthenticatedTags;
            const secureSessionSalt = Bytes.concat(
                operationalIdentityProtectionKey,
                await abort.attempt(crypto.computeHash([sigma1Bytes, sigma2Bytes, sigma3Bytes])),
            );
            secureSession = await abort.attempt(
                this.#sessions.createSecureSession({
                    channel: exchange.channel.channel,
                    id: initiatorSessionId,
                    fabric,
                    peerNodeId,
                    peerSessionId,
                    sharedSecret,
                    salt: secureSessionSalt,
                    isInitiator: true,
                    isResumption: false,
                    peerSessionParameters,
                    caseAuthenticatedTags: sessionCaseAuthenticatedTags,
                }),
            );
            NodeSession.logNew(logger, "New", secureSession, messenger, fabric, peerNodeId);
            resumptionRecord = {
                fabric,
                peerNodeId,
                sharedSecret,
                resumptionId: peerResumptionId,
                sessionParameters: secureSession.parameters,
                caseAuthenticatedTags: sessionCaseAuthenticatedTags,
            };
        }

        // These are not abortable
        try {
            await messenger.close();
        } catch (e) {
            logger.error("Unhandled error closing CASE messenger:", e);
        }
        await this.#sessions.saveResumptionRecord(resumptionRecord);

        return { session: secureSession, resumed };
    }
}

export namespace CaseClient {
    export interface PairOptions {
        expectedProcessingTime?: Duration;
        caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];
        abort?: AbortSignal;
        maxInitialRetransmissions?: number;
        maxInitialRetransmissionTime?: Duration;
    }
}
