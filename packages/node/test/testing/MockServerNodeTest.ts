/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { MockExchange, MockServerNode } from "@matter/node/testing";
import { ExchangeManager, SessionManager } from "@matter/protocol";
import { INTERACTION_PROTOCOL_ID, NodeId } from "@matter/types";

describe("MockServerNode", () => {
    before(() => {
        MockTime.init();
    });

    it("hands out exchanges on mock sessions and leaves exchanges on other sessions to the exchange manager", async () => {
        const node = await MockServerNode.createOnline();
        const fabric = await node.addFabric();
        const { session: mockSession } = await node.createExchange({ fabric });
        const realSession = await node.env.get(SessionManager).createSecureSession({
            id: 0x7000,
            fabric,
            peerNodeId: NodeId(0x1234),
            peerSessionId: 0x7000,
            sharedSecret: Bytes.empty,
            salt: Bytes.empty,
            isInitiator: false,
            isResumption: false,
        });
        const exchanges = node.env.get(ExchangeManager);

        const onRealSession = exchanges.initiateExchangeForSession(realSession, INTERACTION_PROTOCOL_ID);
        expect(onRealSession).not.instanceOf(MockExchange);
        await onRealSession.close();

        const onMockSession = exchanges.initiateExchangeForSession(mockSession, INTERACTION_PROTOCOL_ID);
        expect(onMockSession).instanceOf(MockExchange);
        expect(await node.handleExchange()).equals(onMockSession);

        await MockTime.resolve(node.close());
    });
});
