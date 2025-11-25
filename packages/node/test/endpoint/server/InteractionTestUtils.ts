/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncObservable, Bytes, DataReadQueue, MAX_UDP_MESSAGE_SIZE } from "#general";
import {
    ExchangeSendOptions,
    MATTER_MESSAGE_OVERHEAD,
    Message,
    MessageExchange,
    ProtocolMocks,
    SecureSession,
    SessionManager,
} from "#protocol";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";

// TODO Sync with mock-exchange.ts
export class DummyMessageExchange {
    messagesQueue = new DataReadQueue<Message>();
    channel = { name: "test" };
    maxPayloadSize = MAX_UDP_MESSAGE_SIZE - MATTER_MESSAGE_OVERHEAD;
    closing = AsyncObservable();

    constructor(
        public session: SecureSession,
        public hasTimedInteractionFlag = false,
        public timedInteractionExpired = false,
        public writeCallback?: (
            messageType: number,
            payload: Bytes,
            options?: ExchangeSendOptions,
        ) => { payload: Bytes; messageType: number } | void,
        public clearTimedInteractionCallback?: () => void,
        public closeCallback?: () => void,
    ) {}

    injectMessage(message: Message) {
        this.messagesQueue.write(message);
    }

    async send(messageType: number, payload: Bytes, options?: ExchangeSendOptions) {
        const { payload: responsePayload, messageType: responseMessageType } =
            this.writeCallback?.(messageType, payload, options) ?? {};
        if (payload) {
            return this.messagesQueue.write({
                ...interaction.BarelyMockedMessage,
                payloadHeader: { messageType: responseMessageType },
                payload: responsePayload,
            } as Message);
        }
    }

    nextMessage() {
        return this.messagesQueue.read();
    }

    close() {
        this.closeCallback?.();
    }

    clearTimedInteraction() {
        return this.clearTimedInteractionCallback?.();
    }

    hasTimedInteraction() {
        return this.hasTimedInteractionFlag;
    }

    hasActiveTimedInteraction() {
        return this.hasTimedInteractionFlag && !this.timedInteractionExpired;
    }

    hasExpiredTimedInteraction() {
        return this.hasTimedInteractionFlag && this.timedInteractionExpired;
    }
}

export async function createDummyMessageExchange(
    node: MockServerNode,
    sessionData?: Partial<Parameters<SessionManager["createSecureSession"]>[0]>,
    hasTimedInteraction = false,
    timedInteractionExpired = false,
    writeCallback?: (
        messageType: number,
        payload: Bytes,
        options?: ExchangeSendOptions,
    ) => { payload: Bytes; messageType: number } | void,
    clearTimedInteractionCallback?: () => void,
    closeCallback?: () => void,
) {
    const session = await ProtocolMocks.NodeSession.create({
        manager: node.env.get(SessionManager),
        fabric: undefined,
        ...sessionData,
    });

    return new DummyMessageExchange(
        session,
        hasTimedInteraction,
        timedInteractionExpired,
        writeCallback,
        clearTimedInteractionCallback,
        closeCallback,
    ) as unknown as MessageExchange;
}
