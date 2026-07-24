/**
 * @license
 * Copyright 2022-2023 Project CHIP Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Subject } from "#action/server/Subject.js";
import { DecodedMessage, DecodedPacket, Message, MessageCodec, Packet, SessionType } from "#codec/MessageCodec.js";
import { MessagePrivacy } from "#codec/MessagePrivacy.js";
import { Mark } from "#common/Mark.js";
import type { Fabric } from "#fabric/Fabric.js";
import type { FabricManager } from "#fabric/FabricManager.js";
import { PairRetransmissionLimitReachedError } from "#peer/CommissioningError.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import type { MessageCounter } from "#protocol/MessageCounter.js";
import {
    Bytes,
    ChannelType,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    CryptoDecryptError,
    Diagnostic,
    hex,
    ImplementationError,
    InternalError,
    Logger,
    MatterFlowError,
    STANDARD_MATTER_PORT,
    Transport,
    UnexpectedDataError,
} from "@matter/general";
import { FabricIndex, GroupId, NodeId } from "@matter/types";
import { SecureSession } from "./SecureSession.js";
import { Session } from "./Session.js";
import { SessionManager } from "./SessionManager.js";

/** Thrown by {@link GroupSession.decode} when no installed key can be a candidate for the received group message. */
export class GroupSessionNoKeyError extends MatterFlowError {
    /**
     * Group id of the message, when a key set decrypted it successfully but is not usable because no group maps to it.
     * The id is authenticated in that case, so Groupcast testing may report it.
     */
    readonly groupId?: GroupId;

    constructor(message = "No key candidate found for group session decryption", groupId?: GroupId) {
        super(message);
        this.groupId = groupId;
    }
}

/** Thrown by {@link GroupSession.decode} when decryption failed with all candidate keys. */
export class GroupSessionDecodeError extends MatterFlowError {
    constructor(message = "Failed to decode group message with any key candidate") {
        super(message);
    }
}

const logger = Logger.get("SecureGroupSession");

/** Secure Group session instance */
export class GroupSession extends SecureSession {
    readonly #id: number;
    readonly #fabric: Fabric;
    readonly #peerNodeId: NodeId;
    readonly #operationalGroupKey: Bytes;
    readonly #operationalPrivacyKey?: Bytes;
    readonly #multicastAddress: string;
    readonly supportsMRP = false;
    readonly closingAfterExchangeFinished = false; // Group sessions do not close after exchange finished, they are long-lived

    readonly keySetId: number;

    constructor(config: GroupSession.Config) {
        const {
            manager,
            fabric,
            operationalGroupKey,
            operationalPrivacyKey,
            id,
            peerNodeId,
            keySetId,
            multicastAddress,
            messageCounter,
        } = config;
        super({
            ...config,
            setActiveTimestamp: false, // We always set the active timestamp for Secure sessions TODO Check
            messageCounter,
        });
        this.#id = id;
        this.#fabric = fabric;
        this.#peerNodeId = peerNodeId;
        this.keySetId = keySetId;
        this.#operationalGroupKey = operationalGroupKey;
        this.#operationalPrivacyKey = operationalPrivacyKey;
        this.#multicastAddress = multicastAddress;

        manager?.registerGroupSession(this);
        fabric.addSession(this);

        logger.debug(this.via, `Created secure GROUP session for fabric index ${fabric.fabricIndex}`);
    }

    /** IPv6 multicast destination address this group session sends to. */
    get multicastAddress(): string {
        return this.#multicastAddress;
    }

    /**
     * Source IP address of the most recently received datagram on this session.  Inbound group sessions have no
     * channel, so the receive path records this for Groupcast testing event reporting.
     */
    receivedFrom?: string;

    /**
     * Create an outbound group session.
     */
    static async create(options: {
        manager?: SessionManager;
        transports: Transport.Provider;
        id: number;
        fabric: Fabric;
        keySetId: number;
        groupNodeId: NodeId;
        operationalGroupKey: Bytes;
        messageCounter: MessageCounter;
    }) {
        const { manager, transports, id, fabric, keySetId, groupNodeId, operationalGroupKey, messageCounter } = options;

        const groupId = GroupId.fromNodeId(groupNodeId);
        const multicastAddress = fabric.groups.multicastAddressFor(groupId);

        const operationalInterface = transports.interfaceFor(ChannelType.UDP, multicastAddress);
        if (operationalInterface === undefined) {
            // TODO - better error class
            throw new PairRetransmissionLimitReachedError(`IPv6 interface not initialized`);
        }

        const channel = await operationalInterface.openChannel({
            ip: multicastAddress,
            port: STANDARD_MATTER_PORT,
        });

        return new GroupSession({
            manager,
            channel,
            id,
            fabric,
            keySetId,
            peerNodeId: groupNodeId,
            operationalGroupKey,
            operationalPrivacyKey: Bytes.of(await MessagePrivacy.deriveKey(fabric.crypto, operationalGroupKey)),
            multicastAddress,
            messageCounter,
        });
    }

    override get type() {
        return SessionType.Group;
    }

    /**
     * Core Specification, Secure Channel, "Sending a group message": the Security Flags SHALL have the P Flag set, so
     * group multicasts are always sent privacy-enhanced.
     */
    override get usePrivacy() {
        return true;
    }

    get fabric(): Fabric {
        return this.#fabric;
    }

    get id() {
        return this.#id;
    }

    get peerSessionId(): number {
        return this.#id; // we use the same peer session ID then ours because should be the same keys
    }

    get via() {
        return Diagnostic.via(`${Mark.SESSION}group#${hex.word(this.id)}`);
    }

    get nodeId() {
        return this.#fabric.nodeId;
    }

    get peerNodeId() {
        return this.#peerNodeId;
    }

    get associatedFabric(): Fabric {
        return this.#fabric;
    }

    /**
     * The peer group's address.
     */
    get peerAddress() {
        return PeerAddress({
            fabricIndex: this.#fabric?.fabricIndex ?? FabricIndex.NO_FABRIC,
            nodeId: this.#peerNodeId,
        });
    }

    subjectFor(message?: Message): Subject {
        if (message === undefined || message.packetHeader.destGroupId === undefined) {
            throw new ImplementationError("GroupSession requires a message with destGroupId");
        }
        return this.fabric.groups.subjectForGroup(GroupId(message.packetHeader.destGroupId), this.#operationalGroupKey);
    }

    /**
     * Whether this cached session was established for the given fabric, group session id and operational key. Session
     * ids are a 16-bit hash of the operational key, so two key sets can share one; a cached session must therefore be
     * matched by key (and fabric), never by session id alone, or a later message would be evaluated against a stale key.
     */
    matches(fabricIndex: FabricIndex, id: number, operationalKey: Bytes): boolean {
        return (
            this.#id === id &&
            this.#fabric.fabricIndex === fabricIndex &&
            Bytes.areEqual(this.#operationalGroupKey, operationalKey)
        );
    }

    override notifyActivity(_messageReceived: boolean) {
        // Group sessions do not have a specific activity notification, so we do nothing here
    }

    override updateMessageCounter(messageCounter: number, sourceNodeId: NodeId, operationalKey: Bytes) {
        if (sourceNodeId === undefined || operationalKey === undefined) {
            throw new InternalError("Source Node ID is required for GroupSession updateMessageCounter.");
        }
        const receptionState = this.#fabric.groups.messaging.receptionStateFor(sourceNodeId, operationalKey);
        receptionState.updateMessageCounter(messageCounter);
    }

    encode(message: Message): Packet {
        message.packetHeader.sessionId = this.#id;
        const { header, applicationPayload } = MessageCodec.encodePayload(message);
        if (header.destGroupId === undefined) {
            // Just to be sure
            throw new UnexpectedDataError("Group ID is required for GroupSession encode.");
        }

        const headerBytes = MessageCodec.encodePacketHeader(message.packetHeader);
        const securityFlags = headerBytes[3];
        const nonce = Session.generateNonce(securityFlags, header.messageId, this.#fabric.nodeId);
        const ciphertext = this.#fabric.crypto.encrypt(
            this.#operationalGroupKey,
            applicationPayload,
            nonce,
            headerBytes,
        );

        if (!message.packetHeader.hasPrivacyEnhancements) {
            return { header, applicationPayload: ciphertext };
        }

        if (this.#operationalPrivacyKey === undefined) {
            throw new InternalError("Privacy key not available for this group session.");
        }
        const mic = Bytes.of(ciphertext).slice(-CRYPTO_AEAD_MIC_LENGTH_BYTES);
        const privacyNonce = MessagePrivacy.buildNonce(header.sessionId, mic);
        const region = Bytes.of(headerBytes).slice(4);
        const obfuscated = MessagePrivacy.obfuscate(
            this.#fabric.crypto,
            this.#operationalPrivacyKey,
            region,
            privacyNonce,
        );
        const obfuscatedHeader = Bytes.concat(Bytes.of(headerBytes).slice(0, 4), obfuscated);
        return { header, applicationPayload: ciphertext, headerBytes: obfuscatedHeader };
    }

    decode(): DecodedMessage {
        throw new InternalError("GroupSession does not support decode on instance.");
    }

    static decode(
        fabrics: FabricManager,
        { header, applicationPayload, messageExtension, privacyHeader }: DecodedPacket,
        aad: Bytes,
    ): {
        message: DecodedMessage;
        key: Bytes;
        privacyKey?: Bytes;
        sessionId: number;
        sourceNodeId: NodeId;
        keySetId: number;
        fabric: Fabric;
    } {
        if (header.hasMessageExtensions) {
            logger.info(
                `Message extensions are not supported. Ignoring ${messageExtension ? Bytes.toHex(messageExtension) : undefined}`,
            );
        }

        const sessionId = header.sessionId;
        const mappedKeys = new Array<{ key: Bytes; privacyKey?: Bytes; keySetId: number; fabric: Fabric }>();
        const unmappedKeys = new Array<{ key: Bytes; privacyKey?: Bytes; keySetId: number; fabric: Fabric }>();
        for (const fabric of fabrics) {
            const sessions = fabric.groups.sessions.get(sessionId);
            if (sessions?.length) {
                for (const session of sessions) {
                    // A key set is only usable for group communication while a group maps to it in GroupKeyMap.
                    // Unmapped key sets do not participate in decryption; they only recover the group id for
                    // Groupcast testing when nothing is usable.
                    if (fabric.groups.isKeySetMapped(session.keySetId)) {
                        mappedKeys.push({ ...session, fabric });
                    } else {
                        unmappedKeys.push({ ...session, fabric });
                    }
                }
            }
        }

        const messageFlags = Bytes.of(aad)[0];
        const mic = Bytes.of(applicationPayload).slice(-CRYPTO_AEAD_MIC_LENGTH_BYTES);

        /** Deobfuscates the header (when privacy is active) and decrypts with the candidate's key. */
        const tryDecrypt = (candidate: { key: Bytes; privacyKey?: Bytes; keySetId: number; fabric: Fabric }) => {
            try {
                let packetHeader = header;
                let decryptAad = aad;
                if (header.hasPrivacyEnhancements) {
                    if (privacyHeader === undefined || candidate.privacyKey === undefined) {
                        logger.debug(`No privacy key for group session candidate ${candidate.keySetId}, skipping`);
                        return undefined;
                    }
                    const privacyNonce = MessagePrivacy.buildNonce(sessionId, mic);
                    const deobfuscated = MessagePrivacy.obfuscate(
                        candidate.fabric.crypto,
                        candidate.privacyKey,
                        privacyHeader,
                        privacyNonce,
                    );
                    packetHeader = {
                        ...header,
                        ...MessageCodec.decodeObfuscatedHeaderFields(messageFlags, deobfuscated),
                    };
                    decryptAad = Bytes.concat(Bytes.of(aad).slice(0, 4), deobfuscated);
                }

                if (packetHeader.sourceNodeId === undefined) {
                    throw new UnexpectedDataError("Source Node ID is required for GroupSession decode.");
                }
                const nonce = Session.generateNonce(
                    packetHeader.securityFlags,
                    packetHeader.messageId,
                    packetHeader.sourceNodeId,
                );
                const message = MessageCodec.decodePayload({
                    header: packetHeader,
                    applicationPayload: candidate.fabric.crypto.decrypt(
                        candidate.key,
                        applicationPayload,
                        nonce,
                        decryptAad,
                    ),
                });
                return { message, packetHeader };
            } catch (error) {
                // A wrong key (including a wrong privacy key, whose garbage header yields a different nonce) fails AEAD
                // decryption; skip to the next candidate. Genuine parse errors on an authenticated payload propagate.
                CryptoDecryptError.accept(error);
            }
        };

        /** Group id of the message when an unusable key set authenticates it, for Groupcast testing reporting. */
        const unmappedGroupId = () => {
            for (const candidate of unmappedKeys) {
                const decrypted = tryDecrypt(candidate);
                if (decrypted?.packetHeader.destGroupId !== undefined) {
                    return GroupId(decrypted.packetHeader.destGroupId);
                }
            }
        };

        // Matching the CHIP SDK, only mapped key sets count as available: without any, the result is "no key found",
        // even if an unmapped key set could authenticate the message
        if (mappedKeys.length === 0) {
            throw new GroupSessionNoKeyError(undefined, unmappedGroupId());
        }

        let message: DecodedMessage | undefined;
        let key: Bytes | undefined;
        let privacyKey: Bytes | undefined;
        let fabric: Fabric | undefined;
        let keySetId: number | undefined;
        let sourceNodeId: NodeId | undefined;
        let found = false;
        for (const candidate of mappedKeys) {
            const decrypted = tryDecrypt(candidate);
            if (decrypted === undefined) {
                continue;
            }
            message = decrypted.message;
            key = candidate.key;
            privacyKey = candidate.privacyKey;
            keySetId = candidate.keySetId;
            fabric = candidate.fabric;
            sourceNodeId = decrypted.packetHeader.sourceNodeId;
            found = true;
            break;
        }
        if (!found || !message || !key || keySetId === undefined || !fabric || sourceNodeId === undefined) {
            throw new GroupSessionDecodeError();
        }

        if (message.payloadHeader.hasSecuredExtension) {
            logger.info(
                `Secured extensions are not supported. Ignoring ${message.securityExtension ? Bytes.toHex(message.securityExtension) : undefined}`,
            );
        }

        return { message, key, privacyKey, sessionId, sourceNodeId, keySetId, fabric };
    }

    override async close() {
        this.manager?.removeGroupSession(this);
        await super.close();
    }
}

export namespace GroupSession {
    export interface Config extends Session.CommonConfig {
        id: number; // Records the Group Session ID derived from the Operational Group Key used to encrypt the message.
        fabric: Fabric;
        keySetId: number; // The Group Key Set ID that was used to encrypt the incoming group message.
        peerNodeId: NodeId; //The Target Group Node Id
        operationalGroupKey: Bytes; // The Operational Group Key that was used to encrypt the incoming group message.
        operationalPrivacyKey?: Bytes;
        multicastAddress: string; // IPv6 multicast destination address this session sends to.
        messageCounter: MessageCounter;
    }

    export function assert(session?: Session, errorText?: string): asserts session is GroupSession {
        if (!is(session)) {
            throw new MatterFlowError(errorText ?? "Unsecured session in secure context");
        }
    }

    export function is(session?: Session): session is GroupSession {
        return session?.type === SessionType.Group;
    }
}
