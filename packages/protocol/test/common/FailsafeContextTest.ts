/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FailsafeContext } from "#common/FailsafeContext.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { b$, MemoryStorageDriver, Seconds, StandardCrypto, StorageContext } from "@matter/general";
import { NodeId } from "@matter/types";

const KEY = b$`66951379d0a6d151cf5472cccf13f360`;

class TestFailsafeContext extends FailsafeContext {
    override async storeEndpointState() {}
    override async restoreNetworkState() {}
    override async restoreBreadcrumb() {}
}

describe("FailsafeContext", () => {
    function setup() {
        const crypto = new StandardCrypto();
        const storage = new MemoryStorageDriver();
        storage.initialize();
        const fabrics = new FabricManager(crypto);
        const sessions = new SessionManager({
            parameters: {} as SessionParameters,
            fabrics,
            storage: new StorageContext(storage, ["context"]),
        });
        const session = new NodeSession({
            crypto,
            id: 1,
            fabric: undefined,
            peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
            peerSessionId: 1,
            decryptKey: KEY,
            encryptKey: KEY,
            attestationKey: new Uint8Array(),
            isInitiator: true,
        });
        return { sessions, fabrics, session };
    }

    it("detaches its closedByPeer listener on close", async () => {
        const { sessions, fabrics, session } = setup();

        expect(session.closedByPeer.isObserved).false;

        const context = new TestFailsafeContext({
            sessions,
            fabrics,
            session,
            expiryLength: Seconds(60),
            maxCumulativeFailsafe: Seconds(900),
        });
        await context.construction.ready;

        expect(session.closedByPeer.isObserved).true;

        await context.close();

        expect(session.closedByPeer.isObserved).false;
    });
});
