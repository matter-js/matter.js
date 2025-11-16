/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedTransportsBitmap } from "#common/SupportedTransportsBitmap.js";
import {
    AsyncObservable,
    Bytes,
    Channel,
    DataWriter,
    Duration,
    Endian,
    ImplementationError,
    InternalError,
    Time,
    Timespan,
    Timestamp,
} from "#general";
import { MessageChannel } from "#protocol/MessageChannel.js";
import { NodeId, TypeFromPartialBitSchema } from "#types";
import { DecodedMessage, DecodedPacket, Message, Packet, SessionType } from "../codec/MessageCodec.js";
import { Fabric } from "../fabric/Fabric.js";
import { MessageCounter } from "../protocol/MessageCounter.js";
import { MessageReceptionState } from "../protocol/MessageReceptionState.js";
import { SessionIntervals } from "./SessionIntervals.js";
import { type SessionManager } from "./SessionManager.js";

/** Fallback value for Data Model Revision when not provided in Session parameters. We use Matter 1.2 as assumption. */
export const FALLBACK_DATAMODEL_REVISION = 17;

/** Fallback value for Interaction Model Revision when not provided in Session parameters. We use Matter 1.2 as assumption. */
export const FALLBACK_INTERACTIONMODEL_REVISION = 11;

/**
 * Fallback value for Specification Version when not provided in Session parameters. We use 0 as assumption which is
 * "before 1.3".
 */
export const FALLBACK_SPECIFICATION_VERSION = 0;

/**
 * Fallback value for the maximum number of paths that can be included in a single invoke message when not provided in
 * Session parameters.
 */
export const FALLBACK_MAX_PATHS_PER_INVOKE = 1;

export const FALLBACK_MAX_TCP_MESSAGE_SIZE = 64000;

export interface SessionParameters extends SessionIntervals {
    /** Version of Data Model for the Session parameters side where it appears. */
    dataModelRevision: number;

    /** Version of Interaction Model for the Session parameters side where it appears. */
    interactionModelRevision: number;

    /** Version of Specification for the Session parameters side where it appears. */
    specificationVersion: number;

    /** The maximum number of elements in the InvokeRequests list that the Node is able to process. */
    maxPathsPerInvoke: number;

    /** A bitmap of the supported transport protocols in addition to MRP. */
    supportedTransports: TypeFromPartialBitSchema<typeof SupportedTransportsBitmap>;

    /**
     * Maximum size of the message carried over TCP, excluding the framing message length
     * field, that the node is capable of receiving from its peer.
     * Default: 64000 bytes
     */
    maxTcpMessageSize?: number;
}

export type SessionParameterOptions = Partial<SessionParameters>;

export class NonOperationalSession extends ImplementationError {
    constructor(session: Session) {
        super(`Session ${session.name} has no channel assigned`);
    }
}

export abstract class Session {
    #channel?: MessageChannel;

    abstract get name(): string;
    abstract get closingAfterExchangeFinished(): boolean;
    #manager?: SessionManager;
    timestamp = Time.nowMs;
    readonly createdAt = Time.nowMs;
    activeTimestamp: Timestamp = 0;
    abstract type: SessionType;
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
    protected readonly maxTcpMessageSize: number;

    /**
     * If the ExchangeManager performs async work to clean up a session it sets this promise.  This is because
     * historically we didn't return from destroy() until ExchangeManager was complete.  Not sure if this is entirely
     * necessary, but it makes sense so this allows us to maintain the old behavior.
     */
    closer?: Promise<void>;
    #destroyed = AsyncObservable<[]>();
    #closedByPeer = AsyncObservable<[]>();

    constructor(config: Session.Configuration) {
        const {
            manager,
            messageCounter,
            messageReceptionState,
            sessionParameters: {
                idleInterval = SessionIntervals.defaults.idleInterval,
                activeInterval = SessionIntervals.defaults.activeInterval,
                activeThreshold = SessionIntervals.defaults.activeThreshold,
                dataModelRevision = FALLBACK_DATAMODEL_REVISION,
                interactionModelRevision = FALLBACK_INTERACTIONMODEL_REVISION,
                specificationVersion = FALLBACK_SPECIFICATION_VERSION,
                maxPathsPerInvoke = FALLBACK_MAX_PATHS_PER_INVOKE,
                supportedTransports = {}, // no TCP support by default
                maxTcpMessageSize = FALLBACK_MAX_TCP_MESSAGE_SIZE,
            } = {},
            setActiveTimestamp,
        } = config;
        this.#manager = manager;
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

    get destroyed() {
        return this.#destroyed;
    }

    get closedByPeer() {
        return this.#closedByPeer;
    }

    notifyActivity(messageReceived: boolean) {
        this.timestamp = Time.nowMs;
        if (messageReceived) {
            // only update active timestamp if we received a message
            this.activeTimestamp = this.timestamp;
        }
    }

    isPeerActive(): boolean {
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
    abstract end(sendClose: boolean): Promise<void>;
    async destroy(
        _sendClose?: boolean,
        _closeAfterExchangeFinished?: boolean,
        _flushSubscriptions?: boolean,
    ): Promise<void> {
        if (this.#channel) {
            await this.#channel.close();
            this.#channel = undefined;
        }
    }

    protected get manager() {
        return this.#manager;
    }

    /**
     * @deprecated
     */
    get owner() {
        return this.#manager?.owner;
    }

    get hasChannel() {
        return !!this.#channel;
    }

    set channel(channel: Channel<Bytes>) {
        if (this.#channel === undefined) {
            throw new ImplementationError("Cannot reassign session channel");
        }
        this.#channel = new MessageChannel(channel, this);
    }

    get channel(): MessageChannel {
        if (this.#channel === undefined) {
            throw new NonOperationalSession(this);
        }
        return this.#channel;
    }
}

export namespace Session {
    export interface CommonConfig {
        manager?: SessionManager;
    }

    export interface Configuration extends CommonConfig {
        messageCounter: MessageCounter;
        messageReceptionState?: MessageReceptionState;
        sessionParameters?: SessionParameterOptions;
        setActiveTimestamp: boolean;
    }
}
