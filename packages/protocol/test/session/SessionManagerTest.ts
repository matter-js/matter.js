/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    b$,
    Bytes,
    ImplementationError,
    Key,
    MemoryStorageDriver,
    Millis,
    PrivateKey,
    StandardCrypto,
    StorageContext,
    Timestamp,
} from "@matter/general";
import { FabricId, FabricIndex, GlobalFabricId, NodeId, VendorId } from "@matter/types";

const DUMMY_BYTEARRAY = new Uint8Array();

const TEST_ROOT_PUBLIC_KEY = Bytes.fromHex(
    "044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa",
);
const TEST_IDENTITY_PROTECTION_KEY = Bytes.fromHex("9bc61cd9c62a2df6d64dfcaa9dc472d4");
const SEC1_KEY = Bytes.fromHex(
    "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba",
);

describe("SessionManager", () => {
    describe("getNextAvailableSessionId", () => {
        let storage: MemoryStorageDriver;
        let storageContext: StorageContext;
        let sessionManager: SessionManager;

        beforeEach(async () => {
            storage = new MemoryStorageDriver();
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
        let storage: MemoryStorageDriver;
        let storageContext: StorageContext;
        let sessionManager: SessionManager;

        beforeEach(async () => {
            storage = new MemoryStorageDriver();
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

    describe("group data message counter", () => {
        function groupFabric(crypto: StandardCrypto, fabricStorage: StorageContext) {
            const fabric = new Fabric(crypto, {
                fabricIndex: FabricIndex(1),
                fabricId: FabricId(BigInt("0x456789ABCDEF1234")),
                nodeId: NodeId(1),
                rootNodeId: NodeId(1),
                globalId: GlobalFabricId(0),
                keyPair: Key({ sec1: SEC1_KEY }) as PrivateKey,
                rootPublicKey: TEST_ROOT_PUBLIC_KEY,
                rootVendorId: VendorId(0),
                rootCert: new Uint8Array(),
                identityProtectionKey: new Uint8Array(),
                operationalIdentityProtectionKey: TEST_IDENTITY_PROTECTION_KEY,
                intermediateCACert: new Uint8Array(),
                operationalCert: new Uint8Array(),
                label: "",
            });
            fabric.storage = fabricStorage;
            return fabric;
        }

        it("exposes one node-global counter shared across group sessions", async () => {
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["sessions"]),
            });
            await sessionManager.construction.ready;

            const first = await sessionManager.groupDataMessageCounter.getIncrementedCounter();
            const second = await sessionManager.groupDataMessageCounter.getIncrementedCounter();
            expect(second).equal(first + 1);
        });

        it("seeds the global counter above legacy per-key counters and clears them (Q-02 migration)", async () => {
            const crypto = new StandardCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            const fabricStorage = new StorageContext(storage, ["fabric"]);
            const fabric = groupFabric(crypto, fabricStorage);
            fabricManager.addFabric(fabric);

            // Simulate a legacy per-operational-key data counter persisted by the old model.
            const legacyKey = `${"a".repeat(32)}-data`;
            await fabricStorage.set(legacyKey, 4242);

            const sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: fabricManager,
                storage: new StorageContext(storage, ["sessions"]),
            });
            await sessionManager.construction.ready;

            expect(await sessionManager.groupDataMessageCounter.getIncrementedCounter()).greaterThan(4242);
            expect(await fabricStorage.has(legacyKey)).equal(false);
        });

        it("does not roll the counter back when a group key set is removed (Q-02)", async () => {
            const crypto = new StandardCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            const fabric = groupFabric(crypto, new StorageContext(storage, ["fabric"]));
            fabricManager.addFabric(fabric);
            await fabric.groups.setFromGroupKeySet({
                groupKeySetId: 1,
                groupKeySecurityPolicy: 0,
                epochKey0: b$`000102030405060708090a0b0c0d0e0f`,
                epochStartTime0: 1,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
                groupKeyMulticastPolicy: 0,
            });

            const sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: fabricManager,
                storage: new StorageContext(storage, ["sessions"]),
            });
            await sessionManager.construction.ready;

            const before = await sessionManager.groupDataMessageCounter.getIncrementedCounter();
            fabric.groups.removeGroupKeySet(1);
            const after = await sessionManager.groupDataMessageCounter.getIncrementedCounter();
            expect(after).greaterThan(before);
        });
    });

    describe("active threshold validation", () => {
        function newManager(parameters: Partial<SessionParameters>) {
            const storage = new MemoryStorageDriver();
            storage.initialize();
            return new SessionManager({
                parameters: parameters as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["context"]),
            });
        }

        it("rejects a local active threshold over 65535 milliseconds on construction", () => {
            expect(() => newManager({ activeThreshold: Millis(65536) })).throws(
                ImplementationError,
                "Active Threshold",
            );
        });

        it("rejects a local active threshold over 65535 milliseconds via the setter", async () => {
            const sessionManager = newManager({});
            await sessionManager.construction.ready;

            expect(() => (sessionManager.sessionParameters = { activeThreshold: Millis(65536) })).throws(
                ImplementationError,
                "Active Threshold",
            );
        });

        it("accepts a local active threshold of exactly 65535 milliseconds", async () => {
            const sessionManager = newManager({ activeThreshold: Millis(65535) });
            await sessionManager.construction.ready;

            expect(sessionManager.sessionParameters.activeThreshold).equal(Millis(65535));
        });
    });

    describe("session parameter setter", () => {
        function newManager(parameters: Partial<SessionParameters>) {
            const storage = new MemoryStorageDriver();
            storage.initialize();
            return new SessionManager({
                parameters: parameters as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["context"]),
            });
        }

        it("ignores undefined values and retains current values", async () => {
            const sessionManager = newManager({ idleInterval: Millis(1000), activeInterval: Millis(700) });
            await sessionManager.construction.ready;

            sessionManager.sessionParameters = { idleInterval: undefined, activeInterval: Millis(600) };

            expect(sessionManager.sessionParameters.idleInterval).equal(Millis(1000));
            expect(sessionManager.sessionParameters.activeInterval).equal(Millis(600));
        });
    });
});
