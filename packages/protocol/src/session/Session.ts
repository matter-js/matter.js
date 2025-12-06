/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupportedTransportsBitmap } from "#common/SupportedTransportsBitmap.js";
import {
    AsyncObservable,
    Bytes,
    Channel,
    DataWriter,
    Duration,
    Endian,
    hex,
    ImplementationError,
    InternalError,
    Lifetime,
    Logger,
    ObservableValue,
    Time,
    Timespan,
    Timestamp,
} from "#general";
import { SessionClosedError } from "#protocol/errors.js";
import { MessageChannel } from "#protocol/MessageChannel.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import type { NodeId, TypeFromPartialBitSchema } from "#types";
import type {
    DecodedMessage,
    DecodedPacket,
    Message,
    Packet,
    PacketHeader,
    SessionType,
} from "../codec/MessageCodec.js";
import type { Fabric } from "../fabric/Fabric.js";
import type { MessageCounter } from "../protocol/MessageCounter.js";
import type { MessageReceptionState } from "../protocol/MessageReceptionState.js";
import type { SessionManager } from "./SessionManager.js";
import { SessionParameters } from "./SessionParameters.js";

const logger = Logger.get("Session");

export abstract class Session {
    #channel?: MessageChannel;
    #lifetime?: Lifetime;

    abstract get via(): string;
    #manager?: SessionManager;
    timestamp = Time.nowMs;
    readonly createdAt = Time.nowMs;
    activeTimestamp: Timestamp = 0;
    abstract type: SessionType;

    #closing = ObservableValue();
    #gracefulClose = AsyncObservable<[]>();
    readonly #exchanges = new Set<MessageExchange>();
    protected deferredClose = false;

    protected readonly idleInterval: Duration;
    protected readonly activeInterval: Duration;
    protected readonly activeThreshold: Duration;
    protected readonly dataModelRevision: number;
    protected readonly interactionModelRevision: number;
    protected readonly specificationVersion: number;
    protected readonly maxPathsPerInvoke: number;
    protected readonly messageCounter: MessageCounter;
    protected readonly messageReceptionState?: MessageReceptionState;
    protected readonly supportedTransports: TypeFromPartialBitSchema<typeof SupportedTransportsBitmap>;
    protected readonly maxTcpMessageSize?: number;

    constructor(config: Session.Configuration) {
        const { manager, channel, messageCounter, messageReceptionState, sessionParameters, setActiveTimestamp } =
            config;

        const {
            idleInterval,
            activeInterval,
            activeThreshold,
            dataModelRevision,
            interactionModelRevision,
            specificationVersion,
            maxPathsPerInvoke,
            supportedTransports,
            maxTcpMessageSize,
        } = SessionParameters(sessionParameters);

        this.#manager = manager;
        if (channel) {
            this.#channel = new MessageChannel(channel, this);
        }
        this.messageCounter = messageCounter;
        this.messageReceptionState = messageReceptionState;
        this.idleInterval = idleInterval;
        this.activeInterval = activeInterval;
        this.activeThreshold = activeThreshold;
        this.dataModelRevision = dataModelRevision;
        this.interactionModelRevision = interactionModelRevision;
        this.specificationVersion = specificationVersion;
        this.maxPathsPerInvoke = maxPathsPerInvoke;
        this.supportedTransports = supportedTransports;
        this.maxTcpMessageSize = maxTcpMessageSize;
        if (setActiveTimestamp) {
            this.activeTimestamp = this.timestamp;
        }
    }

    get exchanges() {
        return this.#exchanges;
    }

    addExchange(exchange: MessageExchange) {
        this.#exchanges.add(exchange);
    }

    deleteExchange(exchange: MessageExchange) {
        this.#exchanges.delete(exchange);
    }

    get closing() {
        return this.#closing || this.deferredClose;
    }

    notifyActivity(messageReceived: boolean) {
        this.timestamp = Time.nowMs;
        if (messageReceived) {
            // only update active timestamp if we received a message
            this.activeTimestamp = this.timestamp;
        }
    }

    get isPeerActive(): boolean {
        return Timespan(this.activeTimestamp, Time.nowMs).duration < this.activeThreshold;
    }

    getIncrementedMessageCounter() {
        return this.messageCounter.getIncrementedCounter();
    }

    updateMessageCounter(messageCounter: number, _sourceNodeId?: NodeId, _operationalKey?: Bytes) {
        if (this.messageReceptionState === undefined) {
            throw new InternalError("MessageReceptionState is not defined for this session");
        }
        this.messageReceptionState.updateMessageCounter(messageCounter);
    }

    /**
     * Emits on graceful close.
     *
     * During normal operation this should trigger a close message to notify the peer of closure.
     */
    get gracefulClose() {
        return this.#gracefulClose;
    }

    /**
     * Once set this flag prevents establishment of new exchanges.
     */
    get isClosing(): boolean {
        return this.#closing.value;
    }

    protected static generateNonce(securityFlags: number, messageId: number, nodeId: NodeId) {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(securityFlags);
        writer.writeUInt32(messageId);
        writer.writeUInt64(nodeId);
        return writer.toByteArray();
    }

    /**
     * The peer's session parameters.
     */
    get parameters(): SessionParameters {
        const {
            idleInterval,
            activeInterval,
            activeThreshold,
            dataModelRevision,
            interactionModelRevision,
            specificationVersion,
            maxPathsPerInvoke,
            supportedTransports,
            maxTcpMessageSize,
        } = this;
        return {
            idleInterval,
            activeInterval,
            activeThreshold,
            dataModelRevision,
            interactionModelRevision,
            specificationVersion,
            maxPathsPerInvoke,
            supportedTransports,
            maxTcpMessageSize,
        };
    }

    abstract isSecure: boolean;
    abstract id: number;
    abstract peerSessionId: number;
    abstract nodeId: NodeId | undefined;
    abstract peerNodeId: NodeId | undefined;
    abstract associatedFabric: Fabric;
    abstract supportsMRP: boolean; // TODO: always false for Group Sessions

    abstract decode(packet: DecodedPacket, aad?: Bytes): DecodedMessage;
    abstract encode(message: Message): Packet;

    static idStrOf(source: Packet | PacketHeader | number) {
        let id;
        if (typeof source === "number") {
            id = source;
        } else {
            if ("header" in source) {
                id = source.header?.sessionId;
            } else if ("sessionId" in source) {
                id = source.sessionId;
            }
            if (typeof id !== "number") {
                return "?";
            }
        }

        return hex.word(id);
    }

    /**
     * Close the session.
     *
     * This begins the close process.  {@link shutdownLogic} is logic that should run once the session no longer accepts
     * new exchanges.  It may set {@link deferredClose} to prevent the close from proceeding until all exchanges are
     * finished.  Otherwise the close will proceed immediately.
     */
    async initiateClose(shutdownLogic?: () => Promise<void>) {
        if (this.isClosing) {
            return;
        }

        this.#lifetime?.closing();

        this.#closing.emit(true);

        await shutdownLogic?.();

        if (this.deferredClose && this.hasActiveExchanges) {
            return;
        }

        await this.close();
    }

    /**
     * Force-close the session.
     *
     * This terminates subscriptions and exchanges without notifying peers.  It places the session in a closing state
     * so no further exchanges are accepted.
     *
     * @param except an exchange that should not be forced close; this allows the current exchange to remain open
     */
    async initiateForceClose(except?: MessageExchange) {
        await this.initiateClose(async () => {
            await this.closeSubscriptions();
            for (const exchange of this.#exchanges) {
                if (exchange === except) {
                    continue;
                }
                await exchange.close(true);
            }
        });
    }

    get isClosed() {
        return !this.#channel;
    }

    /**
     * The {@link MessageChannel} other components use for session communication.
     */
    get channel(): MessageChannel {
        if (this.#channel === undefined) {
            throw new SessionClosedError(`Session ${this.via} ended`);
        }
        return this.#channel;
    }

    get usesMrp() {
        return this.supportsMRP && !this.#channel?.isReliable;
    }

    get supportsLargeMessages() {
        return this.#channel !== undefined && !!this.#channel?.supportsLargeMessages;
    }

    get hasActiveExchanges() {
        return !!this.#exchanges.size;
    }

    async closeSubscriptions(_cancelledByPeer = false): Promise<number> {
        return 0;
    }

    detachChannel() {
        const channel = this.#channel;
        this.#channel = undefined;
        logger.info(this.via, "Channel detached");
        return channel;
    }

    protected async close() {
        using _closting = this.#lifetime?.closing();

        if (this.#channel) {
            await this.#channel.close();
            this.#channel = undefined;
            logger.info(this.via, "Session ended");
        }
    }

    protected get manager() {
        return this.#manager;
    }

    /**
     * This is primarily intended for testing.
     */
    protected set channel(channel: MessageChannel) {
        if (this.#channel !== undefined) {
            throw new ImplementationError("Cannot replace active channel");
        }
        this.#channel = channel;
    }

    join(...name: unknown[]): Lifetime {
        return this.activate().join(...name);
    }

    /**
     * Invoked by manager when the session is "live".
     *
     * This is separate from construction because we sometimes discard sessions without installing in a manager or
     * closing.
     */
    activate(): Lifetime {
        if (!this.#lifetime) {
            this.#lifetime = (this.#manager?.construction ?? Lifetime.process).join("session", this.via);
        }

        return this.#lifetime;
    }

    protected set lifetime(lifetime: Lifetime) {
        this.#lifetime = lifetime;
    }
}

export namespace Session {
    export interface CommonConfig {
        manager?: SessionManager;
        channel?: Channel<Bytes>;
    }

    export interface Configuration extends CommonConfig {
        messageCounter: MessageCounter;
        messageReceptionState?: MessageReceptionState;
        sessionParameters?: SessionParameters.Config;
        setActiveTimestamp: boolean;
    }
}
