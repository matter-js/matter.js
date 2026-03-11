/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { SessionManager } from "#session/SessionManager.js";
import { FabricIndex, NodeId } from "@matter/types";
import { StandardCrypto, StorageBackendMemory, StorageContext, Timestamp } from "@matter/general";

const DUMMY_BYTEARRAY = new Uint8Array();

describe("SessionManager", () => {
    describe("getNextAvailableSessionId", () => {
        let storage: StorageBackendMemory;
        let storageContext: StorageContext;
        let sessionManager: SessionManager;

        beforeEach(async () => {
            storage = new StorageBackendMemory();
            storage.initialize();
            storageContext = new StorageContext(storage, ["context"]);

            sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: storageContext,
            });

            await sessionManager.construction.ready;
        });

        it("next number is increasing", async () => {
            let first = await sessionManager.getNextAvailableSessionId();
            if (first === 0xffff) {
                // Keep test simple and just ignore the special case and let it overflow
                first = await sessionManager.getNextAvailableSessionId();
            }
            const second = await sessionManager.getNextAvailableSessionId();
            expect(first + 1).to.equal(second);
        });

        it("verify that id is 1 after being 0xffff", async () => {
            const first = await sessionManager.getNextAvailableSessionId();
            if (first === 0xffff) {
                expect(await sessionManager.getNextAvailableSessionId()).to.equal(1);
            } else {
                for (let i = first; i < 0xfffe; i++) {
                    // read over until one before overrun
                    await sessionManager.getNextAvailableSessionId();
                }
                expect(await sessionManager.getNextAvailableSessionId()).to.equal(0xffff);
                expect(await sessionManager.getNextAvailableSessionId()).to.equal(1);
            }
        });

        it("verify that existing session ids are skipped", async () => {
            let first = await sessionManager.getNextAvailableSessionId();
            if (first === 0xfffe) {
                // Keep test simple and just ignore the special case and let it overflow
                first = await sessionManager.getNextAvailableSessionId();
            }
            if (first === 0xffff) {
                // Keep test simple and just ignore the special case and let it overflow
                first = await sessionManager.getNextAvailableSessionId();
            }
            // Create a session with "next expected number"
            await sessionManager.createSecureSession({
                id: first + 1,
                fabric: undefined,
                peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                peerSessionId: 0x8d4b,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: false,
                isResumption: false,
            });
            expect(await sessionManager.getNextAvailableSessionId()).to.equal(first + 2);
        });

        it("verify that oldest session gets closed when no more ids are available", async () => {
            // Reduce ID space range so this test takes a reasonable amount of time.  Otherwise it takes 4x the time of
            // all other nodejs tests combined
            sessionManager.compressIdRange(0xff);

            const first = await sessionManager.getNextAvailableSessionId();
            let firstClosed = false;
            sessionManager.sessions.deleted.on(() => {
                firstClosed = true;
            });
            await sessionManager.createSecureSession({
                id: first,
                fabric: undefined,
                peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                peerSessionId: 0x8d4b,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: false,
                isResumption: false,
            });
            await MockTime.advance(1000);

            for (let i = 0; i < 0xfe; i++) {
                const sessionId = await sessionManager.getNextAvailableSessionId();
                await sessionManager.createSecureSession({
                    id: sessionId,
                    fabric: undefined,
                    peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                    peerSessionId: 0x8d4b,
                    sharedSecret: DUMMY_BYTEARRAY,
                    salt: DUMMY_BYTEARRAY,
                    isInitiator: false,
                    isResumption: false,
                });
            }
            expect(await sessionManager.getNextAvailableSessionId()).to.equal(first);
            expect(firstClosed).to.be.true;
        });
    });

    describe("maybeSessionFor", () => {
        let storage: StorageBackendMemory;
        let storageContext: StorageContext;
        let sessionManager: SessionManager;

        beforeEach(async () => {
            storage = new StorageBackendMemory();
            storage.initialize();
            storageContext = new StorageContext(storage, ["context"]);

            sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: storageContext,
            });

            await sessionManager.construction.ready;
        });

        it("returns session with most recent activeTimestamp, not timestamp", async () => {
            const PEER_NODE_ID = NodeId(0x1234n);
            const PEER_ADDRESS = { fabricIndex: FabricIndex(0), nodeId: PEER_NODE_ID };

            // Session A: recently active on sends (high timestamp) but peer hasn't talked to us recently
            const sessionA = await sessionManager.createSecureSession({
                id: 0x0100,
                fabric: undefined,
                peerNodeId: PEER_NODE_ID,
                peerSessionId: 0x0001,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: true,
                isResumption: false,
            });

            // Session B: peer has more recently communicated with us (higher activeTimestamp)
            const sessionB = await sessionManager.createSecureSession({
                id: 0x0200,
                fabric: undefined,
                peerNodeId: PEER_NODE_ID,
                peerSessionId: 0x0002,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: true,
                isResumption: false,
            });

            // Manipulate timestamps: sessionA has higher timestamp (from sends) but lower activeTimestamp
            sessionA.timestamp = Timestamp(2000);
            sessionA.activeTimestamp = Timestamp(100);

            // sessionB has lower timestamp but higher activeTimestamp (peer was recently heard from)
            sessionB.timestamp = Timestamp(1000);
            sessionB.activeTimestamp = Timestamp(200);

            const result = sessionManager.maybeSessionFor(PEER_ADDRESS);
            expect(result).to.equal(sessionB);
        });
    });
});
