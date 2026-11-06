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
import { Groupcast } from "@matter/types/clusters/groupcast";
import { SecureSession } from "./SecureSession.js";
import { Session } from "./Session.js";
import { SessionManager } from "./SessionManager.js";

/**
 * What is known about a received group message for which no candidate passed: none authenticated it for its
 * destination group with a payload that parses.
 * Groupcast testing reports it from these facts.
 */
export interface GroupMessageRejection {
    /**
     * Fabrics with at least one candidate key: a key with the message's session id whose key set GroupKeyMap maps to a
     * group.  Empty when no key was found.
     */
    readonly candidateFabrics: ReadonlySet<FabricIndex>;

    /**
     * The group id the message names, to derive the address the message arrived on.  It must not be reported as the
     * GroupID.  Unset when no candidate authenticated the message and the decoded header has no `destGroupId`, as for
     * a privacy message.
     */
    readonly group?: GroupMessageRejection.Group;
}

export namespace GroupMessageRejection {
    export interface Group {
        readonly groupId: GroupId;

        /**
         * The fabric whose candidate key authenticated the id, so it owns the id; it is not the fabric to report on.
         * Unset for an id from a plain header that no candidate authenticated.
         */
        readonly fabricIndex?: FabricIndex;
    }

    /**
     * The Groupcast testing result of a rejected message for the given fabric: FailedAuth when a key of the fabric was a
     * candidate, NoAvailableKey otherwise.  The CHIP SDK decides the same way.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.27.7.6.3
     */
    export function resultFor(
        { candidateFabrics }: GroupMessageRejection,
        fabricIndex: FabricIndex,
    ): Groupcast.GroupcastTestResult.FailedAuth | Groupcast.GroupcastTestResult.NoAvailableKey {
        return candidateFabrics.has(fabricIndex)
            ? Groupcast.GroupcastTestResult.FailedAuth
            : Groupcast.GroupcastTestResult.NoAvailableKey;
    }
}

/**
 * Thrown by {@link GroupSession.decodeWithCandidateKeys} when no candidate passed for a received group message: none
 * authenticated it for its destination group with a payload that parses, or there was no candidate at all.  Any sender
 * can cause it, so it is routine.
 */
export class GroupSessionDecodeError extends MatterFlowError implements GroupMessageRejection {
    readonly candidateFabrics: ReadonlySet<FabricIndex>;
    readonly group?: GroupMessageRejection.Group;

    constructor({ candidateFabrics, group }: GroupMessageRejection) {
        super(
            candidateFabrics.size === 0
                ? "No key candidate found for group message"
                : "No candidate key passed for the group message",
        );
        this.candidateFabrics = candidateFabrics;
        this.group = group;
    }
}

const logger = Logger.get("SecureGroupSession");

/** Secure Group session instance */
export class GroupSession extends SecureSession {
    readonly #id: number;
    readonly #fabricIndex: FabricIndex;
    readonly #createdFor: Fabric;
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
        this.#fabricIndex = fabric.fabricIndex;
        this.#createdFor = fabric;
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
     * Where a message on this session's group is addressed, in the form an IPv6 destination is
     * written: the multicast address in brackets and the port beside it. Group traffic goes to the
     * standard port, which is what makes the pair worth printing together — an address alone does not
     * say where a message went. A session created from a received packet reports the same pair, though
     * it sends nothing itself.
     */
    get destination(): string {
        return `[${this.#multicastAddress}]:${STANDARD_MATTER_PORT}`;
    }

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

    /**
     * The current Fabric object of this session's fabric.  A replacement (UpdateNOC) can change the node ID this
     * session sends as, so the object it was created with is used only while the fabric is being removed.
     */
    get fabric(): Fabric {
        return this.manager?.maybeFabricFor(this.#fabricIndex) ?? this.#createdFor;
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
        return this.fabric.nodeId;
    }

    get peerNodeId() {
        return this.#peerNodeId;
    }

    get associatedFabric(): Fabric {
        return this.fabric;
    }

    /**
     * The peer group's address.
     */
    get peerAddress() {
        return PeerAddress({
            fabricIndex: this.#fabricIndex,
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
            this.#fabricIndex === fabricIndex &&
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
        const receptionState = this.fabric.groups.messaging.receptionStateFor(sourceNodeId, operationalKey);
        receptionState.updateMessageCounter(messageCounter);
    }

    encode(message: Message): Packet {
        message.packetHeader.sessionId = this.#id;
        const { header, applicationPayload } = MessageCodec.encodePayload(message);
        if (header.destGroupId === undefined || header.sourceNodeId === undefined) {
            // Just to be sure
            throw new UnexpectedDataError("Group ID and source node ID are required for GroupSession encode.");
        }

        const headerBytes = MessageCodec.encodePacketHeader(message.packetHeader);
        const securityFlags = headerBytes[3];
        const fabric = this.fabric;
        // Receivers derive the nonce from the header, so the header's source node ID is the only one used
        const nonce = Session.generateNonce(securityFlags, header.messageId, header.sourceNodeId);
        const ciphertext = fabric.crypto.encrypt(this.#operationalGroupKey, applicationPayload, nonce, headerBytes);

        if (!message.packetHeader.hasPrivacyEnhancements) {
            return { header, applicationPayload: ciphertext };
        }

        if (this.#operationalPrivacyKey === undefined) {
            throw new InternalError("Privacy key not available for this group session.");
        }
        const mic = Bytes.of(ciphertext).slice(-CRYPTO_AEAD_MIC_LENGTH_BYTES);
        const privacyNonce = MessagePrivacy.buildNonce(header.sessionId, mic);
        const region = Bytes.of(headerBytes).slice(4);
        const obfuscated = MessagePrivacy.obfuscate(fabric.crypto, this.#operationalPrivacyKey, region, privacyNonce);
        const obfuscatedHeader = Bytes.concat(Bytes.of(headerBytes).slice(0, 4), obfuscated);
        return { header, applicationPayload: ciphertext, headerBytes: obfuscatedHeader };
    }

    decode(): DecodedMessage {
        throw new InternalError("GroupSession does not support decode on instance.");
    }

    /**
     * Find the key that authenticates a received group message and decode the message with it.  Every key of a mapped
     * key set with the message's session id is a candidate, across all fabrics.  A candidate fails when it does not
     * authenticate the message, when GroupKeyMap does not map the message's destination group to a key set holding it,
     * or when the authenticated payload does not parse.  The first candidate that passes wins.
     *
     * The message counter is not processed here.  The packet must come from {@link MessageCodec.decodePacket}, which
     * guarantees a destination group id and a source node id.  A payload that cannot be decrypted with Matter's AES-CCM
     * parameters fails every candidate.
     *
     * @throws GroupSessionDecodeError when no candidate passes
     * @see {@link MatterSpecification.v161.Core} § 4.17.3.6
     */
    static decodeWithCandidateKeys(
        fabrics: FabricManager,
        { header, applicationPayload, messageExtension, privacyHeader }: DecodedPacket,
        aad: Bytes,
    ): {
        message: DecodedMessage;
        key: Bytes;
        privacyKey?: Bytes;
        sessionId: number;
        sourceNodeId: NodeId;
        groupId: GroupId;
        keySetId: number;
        fabric: Fabric;
    } {
        if (header.hasMessageExtensions) {
            logger.debug(
                `Message extensions are not supported. Ignoring ${messageExtension ? Bytes.toHex(messageExtension) : undefined}`,
            );
        }

        type CandidateKey = { key: Bytes; privacyKey?: Bytes; keySetId: number; fabric: Fabric };
        const sessionId = header.sessionId;
        const candidates = new Array<CandidateKey>();
        for (const fabric of fabrics) {
            const sessions = fabric.groups.sessions.get(sessionId);
            if (sessions?.length) {
                for (const session of sessions) {
                    // As in the CHIP SDK, a key set that no group maps to is never tried
                    if (fabric.groups.isKeySetMapped(session.keySetId)) {
                        candidates.push({ ...session, fabric });
                    }
                }
            }
        }

        const mic = Bytes.of(applicationPayload).slice(-CRYPTO_AEAD_MIC_LENGTH_BYTES);

        /** Deobfuscate the header and decrypt the payload with the key; `undefined` when the key does not authenticate. */
        const authenticate = ({ key, privacyKey, keySetId, fabric }: CandidateKey) => {
            let packetHeader = header;
            let decryptAad = aad;
            if (header.hasPrivacyEnhancements) {
                if (privacyHeader === undefined || privacyKey === undefined) {
                    logger.debug(`No privacy key for group session candidate ${keySetId}, skipping`);
                    return undefined;
                }
                const privacyNonce = MessagePrivacy.buildNonce(sessionId, mic);
                const deobfuscated = MessagePrivacy.obfuscate(fabric.crypto, privacyKey, privacyHeader, privacyNonce);
                packetHeader = {
                    ...header,
                    ...MessageCodec.decodeObfuscatedHeaderFields(header.messageFlags, deobfuscated),
                };
                decryptAad = Bytes.concat(
                    Bytes.of(aad).slice(0, 4),
                    deobfuscated,
                    Bytes.of(aad).slice(4 + deobfuscated.byteLength),
                );
            }

            const { sourceNodeId, destGroupId } = packetHeader;
            if (sourceNodeId === undefined) {
                throw new InternalError("Source node id missing although the packet decoder guarantees it");
            }
            if (destGroupId === undefined) {
                throw new InternalError("Destination group id missing although the packet decoder guarantees it");
            }
            const nonce = Session.generateNonce(packetHeader.securityFlags, packetHeader.messageId, sourceNodeId);
            try {
                const payload = fabric.crypto.decrypt(key, applicationPayload, nonce, decryptAad);
                return { packetHeader, payload, sourceNodeId, groupId: GroupId(destGroupId) };
            } catch (error) {
                // A wrong key (including a wrong privacy key, whose garbage header yields a different nonce) fails here
                CryptoDecryptError.accept(error);
            }
        };

        let group: GroupMessageRejection.Group | undefined;
        // A payload that no key can decrypt fails every candidate; the candidates still count for the report
        const tried = SecureSession.undecryptablePayloadReason(applicationPayload, aad) === undefined ? candidates : [];
        for (const candidate of tried) {
            const authenticated = authenticate(candidate);
            if (authenticated === undefined) {
                continue;
            }
            const { packetHeader, payload, sourceNodeId, groupId } = authenticated;
            group ??= { groupId, fabricIndex: candidate.fabric.fabricIndex };

            if (!candidate.fabric.groups.mappingAllows(groupId, candidate.key)) {
                continue;
            }

            let message: DecodedMessage;
            try {
                message = MessageCodec.decodePayload({ header: packetHeader, applicationPayload: payload });
            } catch (error) {
                // As in the CHIP SDK, an authenticated payload that does not parse fails the candidate
                UnexpectedDataError.accept(error);
                continue;
            }

            if (message.payloadHeader.hasSecuredExtension) {
                logger.debug(
                    `Secured extensions are not supported. Ignoring ${message.securityExtension ? Bytes.toHex(message.securityExtension) : undefined}`,
                );
            }

            const { key, privacyKey, keySetId, fabric } = candidate;
            return { message, key, privacyKey, sessionId, sourceNodeId, groupId, keySetId, fabric };
        }

        if (group === undefined && header.destGroupId !== undefined) {
            group = { groupId: GroupId(header.destGroupId) };
        }

        throw new GroupSessionDecodeError({
            candidateFabrics: new Set(candidates.map(({ fabric }) => fabric.fabricIndex)),
            group,
        });
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
