/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricManager } from "#fabric/FabricManager.js";
import { StandardCrypto, StorageBackendMemory, StorageContext } from "#general";
import { SessionParameters } from "#index.js";
import { SessionManager } from "#session/SessionManager.js";
import { NodeId } from "#types";

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
});
