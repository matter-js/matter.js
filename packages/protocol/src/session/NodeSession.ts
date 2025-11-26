/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subject } from "#action/server/Subject.js";
import { DecodedMessage, DecodedPacket, Message, MessageCodec, Packet, SessionType } from "#codec/MessageCodec.js";
import { Fabric } from "#fabric/Fabric.js";
import {
    BasicSet,
    Bytes,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Crypto,
    Diagnostic,
    Duration,
    Logger,
    MatterFlowError,
} from "#general";
import type { Subscription } from "#interaction/Subscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { NoAssociatedFabricError, SessionClosedError } from "#protocol/errors.js";
import { MessageCounter } from "#protocol/MessageCounter.js";
import { MessageReceptionStateEncryptedWithoutRollover } from "#protocol/MessageReceptionState.js";
import { SecureChannelMessenger } from "#securechannel/SecureChannelMessenger.js";
import { CaseAuthenticatedTag, FabricIndex, NodeId } from "#types";
import { SecureSession } from "./SecureSession.js";
import { Session } from "./Session.js";
import { SessionParameters } from "./SessionParameters.js";

const logger = Logger.get("SecureSession");

const SESSION_KEYS_INFO = Bytes.fromString("SessionKeys");
const SESSION_RESUMPTION_KEYS_INFO = Bytes.fromString("SessionResumptionKeys");

export class NodeSession extends SecureSession {
    readonly #crypto: Crypto;
    readonly #subscriptions = new BasicSet<Subscription>();
    #closingAfterExchangeFinished = false;
    #sendCloseMessageWhenClosing = true;
    readonly #id: number;
    readonly #isInitiator: boolean;
    #fabric: Fabric | undefined;
    readonly #peerNodeId: NodeId;
    readonly #peerSessionId: number;
    readonly #decryptKey: Bytes;
    readonly #encryptKey: Bytes;
    readonly #attestationKey: Bytes;
    #caseAuthenticatedTags: CaseAuthenticatedTag[];
    #isClosing = false;
    readonly supportsMRP = true;
    readonly type = SessionType.Unicast;

    static async create(config: NodeSession.CreateConfig) {
        const { manager, sharedSecret, salt, isResumption, peerSessionParameters, isInitiator } = config;

        if (manager) {
            await manager.construction;
        }

        const keys = Bytes.of(
            await config.crypto.createHkdfKey(
                sharedSecret,
                salt,
                isResumption ? SESSION_RESUMPTION_KEYS_INFO : SESSION_KEYS_INFO,
                CRYPTO_SYMMETRIC_KEY_LENGTH * 3,
            ),
        );
        const decryptKey = isInitiator ? keys.slice(16, 32) : keys.slice(0, 16);
        const encryptKey = isInitiator ? keys.slice(0, 16) : keys.slice(16, 32);
        const attestationKey = keys.slice(32, 48);

        return new this({
            ...config,
            decryptKey,
            encryptKey,
            attestationKey,
            sessionParameters: peerSessionParameters,
        });
    }

    constructor(config: NodeSession.Config) {
        const {
            crypto,
            manager,
            id,
            fabric,
            peerNodeId,
            peerSessionId,
            decryptKey,
            encryptKey,
            attestationKey,
            caseAuthenticatedTags,
            isInitiator,
        } = config;

        super({
            ...config,
            setActiveTimestamp: true, // We always set the active timestamp for Secure sessions
            // Can be changed to a PersistedMessageCounter if we implement session storage
            messageCounter: new MessageCounter(crypto, async () => {
                // Secure Session Message Counter
                // Expire/End the session before the counter rolls over
                return this.end(true, true);
            }),
            messageReceptionState: new MessageReceptionStateEncryptedWithoutRollover(),
        });

        this.#crypto = crypto;
        this.#id = id;
        this.#fabric = fabric;
        this.#peerNodeId = peerNodeId;
        this.#peerSessionId = peerSessionId;
        this.#decryptKey = decryptKey;
        this.#encryptKey = encryptKey;
        this.#attestationKey = attestationKey;
        this.#caseAuthenticatedTags = caseAuthenticatedTags ?? [];
        this.#isInitiator = isInitiator;

        manager?.sessions.add(this);
        fabric?.addSession(this);

        logger.debug(
            `Created secure ${this.isPase ? "PASE" : "CASE"} session for fabric index ${fabric?.fabricIndex}`,
            this.via,
            this.parameterDiagnostics,
        );
    }

    get parameterDiagnostics() {
        return Diagnostic.dict(
            {
                SII: Duration.format(this.idleInterval),
                SAI: Duration.format(this.activeInterval),
                SAT: Duration.format(this.activeThreshold),
                DMRev: this.dataModelRevision,
                IMRev: this.interactionModelRevision,
                spec: Diagnostic.hex(this.specificationVersion),
                maxPaths: this.maxPathsPerInvoke,
                CATs: this.#caseAuthenticatedTags,
            },
            true,
        );
    }

    get caseAuthenticatedTags() {
        return this.#caseAuthenticatedTags;
    }

    get closingAfterExchangeFinished() {
        return this.#closingAfterExchangeFinished;
    }

    get sendCloseMessageWhenClosing() {
        return this.#sendCloseMessageWhenClosing;
    }

    get isPase(): boolean {
        return this.#peerNodeId === NodeId.UNSPECIFIED_NODE_ID;
    }

    get subscriptions() {
        return this.#subscriptions;
    }

    get isInitiator() {
        return this.#isInitiator;
    }

    get isClosing() {
        return this.#isClosing;
    }

    subjectFor(_message?: Message): Subject {
        return Subject.Node({
            id: this.peerNodeId,
            catSubjects: this.#caseAuthenticatedTags.map(cat => NodeId.fromCaseAuthenticatedTag(cat)),
        });
    }

    async close(closeAfterExchangeFinished?: boolean) {
        if (closeAfterExchangeFinished === undefined) {
            closeAfterExchangeFinished = this.isPeerActive; // We delay session close if the peer is actively communicating with us
        }
        await this.end(true, closeAfterExchangeFinished);
    }

    decode({ header, applicationPayload, messageExtension }: DecodedPacket, aad: Bytes): DecodedMessage {
        if (header.hasMessageExtensions) {
            logger.info(
                `Message extensions are not supported. Ignoring ${messageExtension ? Bytes.toHex(messageExtension) : undefined}`,
            );
        }
        const nonce = Session.generateNonce(header.securityFlags, header.messageId, this.#peerNodeId);
        const message = MessageCodec.decodePayload({
            header,
            applicationPayload: this.#crypto.decrypt(this.#decryptKey, applicationPayload, nonce, aad),
        });

        if (message.payloadHeader.hasSecuredExtension) {
            logger.info(
                `Secured extensions are not supported. Ignoring ${message.securityExtension ? Bytes.toHex(message.securityExtension) : undefined}`,
            );
        }

        return message;
    }

    encode(message: Message): Packet {
        message.packetHeader.sessionId = this.#peerSessionId;
        const { header, applicationPayload } = MessageCodec.encodePayload(message);
        const headerBytes = MessageCodec.encodePacketHeader(message.packetHeader);
        const securityFlags = headerBytes[3];
        const sessionNodeId = this.isPase
            ? NodeId.UNSPECIFIED_NODE_ID
            : (this.#fabric?.nodeId ?? NodeId.UNSPECIFIED_NODE_ID);
        const nonce = Session.generateNonce(securityFlags, header.messageId, sessionNodeId);
        return {
            header,
            applicationPayload: this.#crypto.encrypt(this.#encryptKey, applicationPayload, nonce, headerBytes),
        };
    }

    get attestationChallengeKey(): Bytes {
        return this.#attestationKey;
    }

    get fabric(): Fabric | undefined {
        return this.#fabric;
    }

    set fabric(fabric: Fabric) {
        if (this.#fabric !== undefined) {
            throw new MatterFlowError("Session already has an associated Fabric. Cannot change this.");
        }
        this.#fabric = fabric;
        this.#fabric.addSession(this);
    }

    get id() {
        return this.#id;
    }

    get via() {
        return Diagnostic.via(`${this.isPase ? "pase" : "case"}:${this.idStr}`);
    }

    get peerSessionId(): number {
        return this.#peerSessionId;
    }

    get nodeId() {
        return this.#fabric?.nodeId ?? NodeId.UNSPECIFIED_NODE_ID;
    }

    get peerNodeId() {
        return this.#peerNodeId;
    }

    get hasAssociatedFabric() {
        return this.#fabric !== undefined;
    }

    get associatedFabric(): Fabric {
        if (this.#fabric === undefined) {
            throw new NoAssociatedFabricError(
                `${this.isPase ? "PASE " : ""}Session needs to have an associated Fabric for fabric sensitive data handling.`,
            );
        }
        return this.#fabric;
    }

    async clearSubscriptions(flushSubscriptions = false, cancelledByPeer = false) {
        const subscriptions = [...this.#subscriptions]; // get all values because subscriptions will remove themselves when cancelled
        for (const subscription of subscriptions) {
            await subscription.close(flushSubscriptions, cancelledByPeer);
        }
        return subscriptions.length;
    }

    /** Ends a session. Outstanding subscription data will be flushed before the session is destroyed. */
    async end(sendClose: boolean, closeAfterExchangeFinished = false) {
        await this.clearSubscriptions(true);
        await this.destroy(sendClose, closeAfterExchangeFinished);
    }

    async closeByPeer() {
        await this.destroy(false, false);
        await this.closedByPeer.emit();
    }

    /** Destroys a session. Outstanding subscription data will be discarded. */
    override async destroy(sendClose = false, closeAfterExchangeFinished = true, flushSubscriptions = false) {
        await this.clearSubscriptions(flushSubscriptions);
        this.#fabric?.deleteSession(this);
        if (!sendClose) {
            this.#sendCloseMessageWhenClosing = false;
        }

        if (closeAfterExchangeFinished) {
            logger.info(this.via, `Register session to close when exchange is ended`);
            this.#closingAfterExchangeFinished = true;
        } else {
            this.#isClosing = true;
            logger.info(this.via, `End session`);
            this.manager?.sessions.delete(this);

            // Wait for the exchange to finish closing, but ignore errors if channel is already closed
            if (this.closer) {
                try {
                    await this.closer;
                } catch (error) {
                    SessionClosedError.accept(error);
                } finally {
                    await super.destroy();
                    await this.destroyed.emit();
                }
                return;
            }
            await super.destroy();
            await this.destroyed.emit();
        }
    }

    /**
     * The peer node's address.
     */
    get peerAddress() {
        return PeerAddress({
            fabricIndex: this.#fabric?.fabricIndex ?? FabricIndex.NO_FABRIC,
            nodeId: this.#peerNodeId,
        });
    }

    /**
     * Indicates whether a peer matches a specific address.
     */
    peerIs(address: PeerAddress) {
        return (
            (this.#fabric?.fabricIndex ?? FabricIndex.NO_FABRIC) === address.fabricIndex &&
            this.#peerNodeId === address.nodeId
        );
    }
}

export namespace NodeSession {
    export function assert(session?: Session, errorText?: string): asserts session is NodeSession {
        if (!is(session)) {
            throw new MatterFlowError(errorText ?? "Unsecured session in secure context");
        }
    }

    export function is(session?: Session): session is NodeSession {
        return session?.type === SessionType.Unicast;
    }

    export function logNew(
        logger: Logger,
        operation: "New" | "Resumed",
        session: NodeSession,
        messenger: SecureChannelMessenger,
        fabric: Fabric,
        peerNodeId: NodeId,
    ) {
        logger.info(
            `${operation} session with`,
            Diagnostic.strong(PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: peerNodeId }).toString()),
            Diagnostic.dict({
                id: session.id,
                address: messenger.channelName,
                fabric: `${NodeId.toHexString(fabric.nodeId)} (#${fabric.fabricIndex})`,
                ...session.parameterDiagnostics,
            }),
        );
    }
}

export namespace NodeSession {
    export interface CommonConfig extends Session.CommonConfig {
        crypto: Crypto;
        id: number;
        fabric?: Fabric;
        peerNodeId: NodeId;
        peerSessionId: number;
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
    }

    export interface Config extends CommonConfig {
        decryptKey: Bytes;
        encryptKey: Bytes;
        attestationKey: Bytes;
        sessionParameters?: SessionParameters.Config;
        isInitiator: boolean;
    }

    export interface CreateConfig extends CommonConfig {
        sharedSecret: Bytes;
        salt: Bytes;
        isInitiator: boolean;
        isResumption: boolean;
        peerSessionParameters?: SessionParameters.Config;
    }
}
