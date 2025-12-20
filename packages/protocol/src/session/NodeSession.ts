/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subject } from "#action/server/Subject.js";
import { DecodedMessage, DecodedPacket, Message, MessageCodec, Packet, SessionType } from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import { Fabric } from "#fabric/Fabric.js";
import {
    AsyncObservableValue,
    BasicSet,
    Bytes,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Crypto,
    Diagnostic,
    Duration,
    InternalError,
    Logger,
    MatterFlowError,
    hex,
} from "#general";
import { Subscription } from "#interaction/Subscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { NoAssociatedFabricError } from "#protocol/errors.js";
import { MessageCounter } from "#protocol/MessageCounter.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { MessageReceptionStateEncryptedWithoutRollover } from "#protocol/MessageReceptionState.js";
import { SecureChannelMessenger } from "#securechannel/SecureChannelMessenger.js";
import { CaseAuthenticatedTag, FabricIndex, GlobalFabricId, NodeId } from "#types";
import { SecureSession } from "./SecureSession.js";
import { Session } from "./Session.js";
import { SessionParameters } from "./SessionParameters.js";

const logger = Logger.get("SecureSession");

const SESSION_KEYS_INFO = Bytes.fromString("SessionKeys");
const SESSION_RESUMPTION_KEYS_INFO = Bytes.fromString("SessionResumptionKeys");

export class NodeSession extends SecureSession {
    readonly #crypto: Crypto;
    readonly #id: number;
    readonly #isInitiator: boolean;
    #fabric: Fabric | undefined;
    readonly #peerNodeId: NodeId;
    readonly #peerSessionId: number;
    readonly #decryptKey: Bytes;
    readonly #encryptKey: Bytes;
    readonly #attestationKey: Bytes;
    #caseAuthenticatedTags: CaseAuthenticatedTag[];
    readonly supportsMRP = true;
    readonly type = SessionType.Unicast;
    readonly #closedByPeer = AsyncObservableValue();
    #isPeerLost = false;

    // TODO - remove this; subscriptions should be owned by the peer, not the session
    readonly #subscriptions = new BasicSet<Subscription>();

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
                await this.initiateClose(async () => {
                    await this.closeSubscriptions(true);
                });
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

    get isPase(): boolean {
        return this.#peerNodeId === NodeId.UNSPECIFIED_NODE_ID;
    }

    get subscriptions() {
        return this.#subscriptions;
    }

    get isInitiator() {
        return this.#isInitiator;
    }

    subjectFor(_message?: Message): Subject {
        return Subject.Node({
            id: this.peerNodeId,
            catSubjects: this.#caseAuthenticatedTags.map(cat => NodeId.fromCaseAuthenticatedTag(cat)),
        });
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
        if (this.#fabric !== undefined && this.#fabric !== fabric) {
            throw new InternalError("Cannot change session fabric");
        }
        this.#fabric = fabric;
        fabric.addSession(this);
    }

    get id() {
        return this.#id;
    }

    get via() {
        return Diagnostic.via(`${this.peerAddress.toString()}${Mark.SESSION}${hex.word(this.id)}`);
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

    override async closeSubscriptions(flush = false) {
        const subscriptions = [...this.#subscriptions]; // get all values because subscriptions will remove themselves when cancelled
        for (const subscription of subscriptions) {
            await subscription.close(flush ? this : undefined);
        }
        return subscriptions.length;
    }

    get closedByPeer() {
        return this.#closedByPeer;
    }

    async handlePeerClose() {
        this.#isPeerLost = true;
        await this.#closedByPeer.emit(true);
        await this.handlePeerLoss();
    }

    async handlePeerLoss(data: { currentExchange?: MessageExchange; keepSubscriptions?: boolean } = {}) {
        this.#isPeerLost = true;
        const { currentExchange, keepSubscriptions } = data;
        await this.initiateForceClose(currentExchange, keepSubscriptions);
    }

    get isPeerLost() {
        return this.#isPeerLost;
    }

    /**
     * Close the session.
     *
     * If there are open subscriptions they are closed without flushing.  To flush, use {@link closeSubscriptions}
     * before invoking.
     *
     * TODO - subscription handling is only relevant for server; needs to move to server-specific component
     *
     * If there are active exchanges the close is deferred until the final exchange closes.  To close sooner, use
     * {@link initiateForceClose}.
     *
     * A final exchange will be opened to notify the peer of closure unless the peer is marked as lost.
     */
    override async initiateClose(shutdownLogic?: () => Promise<void>) {
        await super.initiateClose(async () => {
            await shutdownLogic?.();

            // If there are active exchanges defer closing until they complete
            if (this.hasActiveExchanges) {
                logger.debug(this.via, "Session ends when exchanges end");
                this.deferredClose = true;
            }
        });
    }

    override async initiateForceClose(currentExchange?: MessageExchange, keepSubscriptions = false) {
        this.#isPeerLost = true;
        await super.initiateForceClose(currentExchange, keepSubscriptions);
    }

    override addExchange(exchange: MessageExchange) {
        super.addExchange(exchange);
        exchange.closed.on(async () => {
            this.exchanges.delete(exchange);
            if (this.deferredClose && !this.hasActiveExchanges) {
                this.deferredClose = false;
                await this.close();
            }
        });
    }

    protected override async close() {
        if (!this.#isPeerLost) {
            try {
                await this.gracefulClose.emit();
            } catch (e) {
                logger.error(`Unhandled error in ${this.via} graceful close handler:`, e);
            }
        }

        await this.closeSubscriptions();

        this.#fabric?.deleteSession(this);
        await super.close();

        this.manager?.sessions.delete(this);
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
            session.via,
            `${operation} session with`,
            Diagnostic.strong(PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: peerNodeId }).toString()),
            Diagnostic.dict({
                address: messenger.channelName,
                fabric: `${GlobalFabricId.strOf(fabric.globalId)} (#${fabric.fabricIndex})`,
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
