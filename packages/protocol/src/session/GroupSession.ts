/**
 * @license
 * Copyright 2022-2023 Project CHIP Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Subject } from "#action/server/Subject.js";
import { DecodedMessage, DecodedPacket, Message, MessageCodec, Packet, SessionType } from "#codec/MessageCodec.js";
import type { Fabric } from "#fabric/Fabric.js";
import type { FabricManager } from "#fabric/FabricManager.js";
import {
    Bytes,
    ChannelType,
    ConnectionlessTransportSet,
    CryptoDecryptError,
    Diagnostic,
    ImplementationError,
    InternalError,
    Logger,
    MatterFlowError,
    STANDARD_MATTER_PORT,
    UnexpectedDataError,
} from "#general";
import { PairRetransmissionLimitReachedError } from "#peer/ControllerDiscovery.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { FabricIndex, GroupId, NodeId } from "#types";
import { SecureSession } from "./SecureSession.js";
import { Session } from "./Session.js";
import { SessionManager } from "./SessionManager.js";

const logger = Logger.get("SecureGroupSession");

/** Secure Group session instance */
export class GroupSession extends SecureSession {
    readonly #id: number;
    readonly #fabric: Fabric;
    readonly #peerNodeId: NodeId;
    readonly #operationalGroupKey: Bytes;
    readonly supportsMRP = false;
    readonly closingAfterExchangeFinished = false; // Group sessions do not close after exchange finished, they are long-lived

    readonly keySetId: number;

    constructor(config: GroupSession.Config) {
        const { manager, fabric, operationalGroupKey, id, peerNodeId, keySetId } = config;
        super({
            ...config,
            setActiveTimestamp: false, // We always set the active timestamp for Secure sessions TODO Check
            messageCounter: fabric.groups.messaging.counterFor(operationalGroupKey),
        });
        this.#id = id;
        this.#fabric = fabric;
        this.#peerNodeId = peerNodeId;
        this.keySetId = keySetId;
        this.#operationalGroupKey = operationalGroupKey;

        manager?.registerGroupSession(this);
        fabric.addSession(this);

        logger.debug(this.via, `Created secure GROUP session for fabric index ${fabric.fabricIndex}`);
    }

    /**
     * Create an outbound group session.
     */
    static async create(options: {
        manager?: SessionManager;
        transports: ConnectionlessTransportSet;
        id: number;
        fabric: Fabric;
        keySetId: number;
        groupNodeId: NodeId;
        operationalGroupKey: Bytes;
    }) {
        const { manager, transports, id, fabric, keySetId, groupNodeId, operationalGroupKey } = options;

        const groupId = GroupId.fromNodeId(groupNodeId);
        const multicastAddress = fabric.groups.multicastAddressFor(groupId);

        const operationalInterface = transports.interfaceFor(ChannelType.UDP, multicastAddress);
        if (operationalInterface === undefined) {
            // TODO - better error class
            throw new PairRetransmissionLimitReachedError(`IPv6 interface not initialized`);
        }

        const channel = await operationalInterface.openChannel({
            type: ChannelType.UDP,
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
        });
    }

    override get type() {
        return SessionType.Group;
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
        return Diagnostic.via(`group/${this.idStr}`);
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
        return this.fabric.groups.subjectForGroup(GroupId(message.packetHeader.destGroupId), this.keySetId);
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

        return {
            header,
            applicationPayload: this.#fabric.crypto.encrypt(
                this.#operationalGroupKey,
                applicationPayload,
                nonce,
                headerBytes,
            ),
        };
    }

    decode(): DecodedMessage {
        throw new InternalError("GroupSession does not support decode on instance.");
    }

    static decode(
        fabrics: FabricManager,
        { header, applicationPayload, messageExtension }: DecodedPacket,
        aad: Bytes,
    ): {
        message: DecodedMessage;
        key: Bytes;
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
        const sourceNodeId = header.sourceNodeId;
        if (sourceNodeId === undefined) {
            // Already checked on decoding, but validate twice
            throw new UnexpectedDataError("Source Node ID is required for GroupSession decode.");
        }
        const nonce = Session.generateNonce(header.securityFlags, header.messageId, sourceNodeId);
        const sessionId = header.sessionId;
        const keys = new Array<{ key: Bytes; keySetId: number; fabric: Fabric }>();
        for (const fabric of fabrics) {
            const sessions = fabric.groups.sessions.get(sessionId);
            if (sessions?.length) {
                for (const session of sessions) {
                    keys.push({ ...session, fabric });
                }
            }
        }
        if (keys.length === 0) {
            throw new MatterFlowError("No key candidate found for group session decryption.");
        }
        let message: DecodedMessage | undefined;
        let key: Bytes | undefined;
        let fabric: Fabric | undefined;
        let keySetId: number | undefined;
        let found = false;
        for ({ key, keySetId, fabric } of keys) {
            try {
                message = MessageCodec.decodePayload({
                    header,
                    applicationPayload: fabric.crypto.decrypt(key, applicationPayload, nonce, aad),
                });
                found = true;
                break; // Exit loop on first successful decryption
            } catch (error) {
                CryptoDecryptError.accept(error);
            }
        }
        if (!found || !message || !key || !keySetId || !fabric) {
            throw new MatterFlowError("Failed to decode group message with any key candidate.");
        }

        if (message.payloadHeader.hasSecuredExtension) {
            logger.info(
                `Secured extensions are not supported. Ignoring ${message.securityExtension ? Bytes.toHex(message.securityExtension) : undefined}`,
            );
        }

        return { message, key, sessionId, sourceNodeId, keySetId, fabric };
    }

    override async destroy() {
        logger.info(`End group session ${this.via}`);
        await super.destroy();
        this.manager?.removeGroupSession(this);
    }

    end() {
        return this.destroy();
    }
}

export namespace GroupSession {
    export interface Config extends Session.CommonConfig {
        id: number; // Records the Group Session ID derived from the Operational Group Key used to encrypt the message.
        fabric: Fabric;
        keySetId: number; // The Group Key Set ID that was used to encrypt the incoming group message.
        peerNodeId: NodeId; //The Target Group Node Id
        operationalGroupKey: Bytes; // The Operational Group Key that was used to encrypt the incoming group message.
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
