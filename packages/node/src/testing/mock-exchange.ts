/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessLevel } from "@matter/model";
import { PeerAddress, ProtocolMocks, Session } from "@matter/protocol";

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
    /**
     * The peer address this exchange was created for.
     */
    address: PeerAddress;

    constructor(address: PeerAddress, { session, accessLevel = AccessLevel.Operate }: MockExchange.Options = {}) {
        if (!session) {
            const fabric = new ProtocolMocks.Fabric({ fabricIndex: address.fabricIndex });
            fabric.accessControl.accessLevelsFor = () => [AccessLevel.View, accessLevel];
            session = new ProtocolMocks.NodeSession({ fabric, peerNodeId: address.nodeId });
        }
        super({ context: { session } });
        this.address = address;
    }

    /**
     * Reads the next message, resolving it through {@link MockTime} so no manual clock advance is needed.
     */
    override async read() {
        return MockTime.resolve(super.read());
    }

    /**
     * Returns the next message, resolving it through {@link MockTime} so no manual clock advance is needed.
     */
    override async nextMessage() {
        return await MockTime.resolve(super.nextMessage());
    }
}

export namespace MockExchange {
    /**
     * Options for {@link MockExchange}.
     */
    export interface Options {
        /**
         * Session to use.  If omitted, a mock fabric and mock node session for the peer address are created.
         */
        session?: Session;
        /**
         * Access level granted on the generated session (View is always granted too).  Ignored if `session` is given.  Defaults to Operate.
         */
        accessLevel?: AccessLevel;
    }
}
