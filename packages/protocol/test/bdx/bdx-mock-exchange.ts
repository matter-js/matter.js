/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { DataReadQueue, Observable, StandardCrypto } from "#general";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { Specification } from "#model";
import { PeerAddress } from "#peer/PeerAddress.js";
import { MessageExchange, MessageExchangeContext } from "#protocol/MessageExchange.js";
import { NodeSession } from "#session/index.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { BDX_PROTOCOL_ID, NodeId, StatusCode, TlvStatusResponse } from "#types";

export function createSession(options?: Partial<Parameters<SessionManager["createSecureSession"]>[0]>) {
    return NodeSession.create({
        crypto: new StandardCrypto(),
        id: 1,
        fabric: undefined,
        peerNodeId: NodeId(0),
        peerSessionId: 1,
        sharedSecret: new Uint8Array(),
        salt: new Uint8Array(),
        isInitiator: false,
        isResumption: false,
        ...options,
    });
}

/**
 * A mock message exchange for the BDX protocol.
 *
 * This provides an intermediate level of mock communication, higher level than network mocking but lower level than
 * direct method calls.
 *
 * Our mocking of the message exchange context is a bit half assed, we don't use a real channel or session and just
 * stub out methods as necessary.
 */
export class MockExchange extends MessageExchange {
    #requests = new DataReadQueue<Message>();
    #responses = new DataReadQueue<Message>();
    #dataWritten = Observable();
    address: PeerAddress;

    constructor(address: PeerAddress, options: { id?: number; session: Session }) {
        const context = {
            channel: {
                name: "test",
                usesMrp: false,
                isReliable: true,
                maxPayloadSize: 1024,
                send: async message => {
                    await this.#requests.write(message);
                    this.#dataWritten.emit();
                },
                session: options.session,
            },
            retry(_number: number) {},
            localSessionParameters: {},
        } as MessageExchangeContext;

        super({
            context,
            isInitiator: true,
            exchangeId: 1,
            nodeId: NodeId(1),
            peerNodeId: NodeId(address.nodeId),
            peerSessionId: options.id ?? 1,
            protocolId: BDX_PROTOCOL_ID,
            requiresSecureSession: true,
        });

        this.address = address;
    }

    get newData() {
        return this.#dataWritten;
    }

    /**
     * Enqueue a mock response.
     */
    async write(message: Message) {
        this.#responses.push(message);
    }

    /**
     * Enqueue a mock status response.
     */
    async writeStatus(status = StatusCode.Success) {
        await this.write({
            payloadHeader: {
                messageType: MessageType.StatusResponse,
            },
            payload: TlvStatusResponse.encode({
                status,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            }),
        } as Message);
    }

    /**
     * Wait for a mock request.
     */
    async read() {
        return this.#requests.read();
    }

    override async nextMessage() {
        return this.#responses.read();
    }

    override async close() {}
}
