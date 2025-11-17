/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessLevel } from "#model";
import { PeerAddress, ProtocolMocks, Session } from "#protocol";

/**
 * A mock message exchange.
 *
 * This provides an intermediate level of mock communication, higher level than network mocking but lower level than
 * direct method calls.
 *
 * Our mocking of the message exchange context is a bit half assed, we don't use a real channel or session and just
 * stub out methods as necessary.
 */
export class MockExchange extends ProtocolMocks.Exchange {
    address: PeerAddress;

    constructor(address: PeerAddress, { session, accessLevel = AccessLevel.Operate }: MockExchange.Options = {}) {
        if (!session) {
            const fabric = new ProtocolMocks.Fabric({ fabricIndex: address.fabricIndex });
            fabric.accessControl.accessLevelsFor = () => [AccessLevel.View, accessLevel];
            session = new ProtocolMocks.NodeSession({ fabric, peerNodeId: address.nodeId });
        }
        const channel = new ProtocolMocks.MessageChannel({ session });
        super({ context: { channel } });
        this.address = address;
    }

    override async read() {
        return MockTime.resolve(super.read());
    }

    override async nextMessage() {
        return await MockTime.resolve(super.nextMessage());
    }
}

export namespace MockExchange {
    export interface Options {
        session?: Session;
        accessLevel?: AccessLevel;
    }
}
