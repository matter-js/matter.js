/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { SessionClosedError } from "#protocol/errors.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import { DuplicateMessageError } from "#protocol/MessageReceptionState.js";
import { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    b$,
    Bytes,
    Environment,
    Hours,
    ImplementationError,
    InternalError,
    Key,
    Lifetime,
    Logger,
    LogLevel,
    MaybePromise,
    MemoryStorageDriver,
    Millis,
    NetworkError,
    PrivateKey,
    Seconds,
    StandardCrypto,
    StorageContext,
    StorageError,
    StorageManager,
    SupportedStorageTypes,
    Time,
    Timestamp,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, FabricIndex, GlobalFabricId, NodeId, VendorId } from "@matter/types";

const DUMMY_BYTEARRAY = new Uint8Array();

const TEST_ROOT_PUBLIC_KEY = Bytes.fromHex(
    "044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa",
);
const TEST_IDENTITY_PROTECTION_KEY = Bytes.fromHex("9bc61cd9c62a2df6d64dfcaa9dc472d4");
const SEC1_KEY = Bytes.fromHex(
    "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba",
);

function testFabric(crypto: StandardCrypto, fabricStorage: StorageContext) {
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

        describe("with a fixed random seed", () => {
            class FixedSeedCrypto extends StandardCrypto {
                constructor(readonly seed: number) {
                    super();
                }

                override get randomUint16() {
                    return this.seed;
                }

                override get randomUint32() {
                    return this.seed;
                }
            }

            async function managerWithSeed(seed: number) {
                const manager = new SessionManager({
                    parameters: {} as SessionParameters,
                    fabrics: new FabricManager(new FixedSeedCrypto(seed)),
                    storage: storageContext,
                });
                await manager.construction.ready;
                return manager;
            }

            async function occupy(manager: SessionManager, id: number) {
                await manager.createSecureSession({
                    id,
                    fabric: undefined,
                    peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                    peerSessionId: 0x8d4b,
                    sharedSecret: DUMMY_BYTEARRAY,
                    salt: DUMMY_BYTEARRAY,
                    isInitiator: false,
                    isResumption: false,
                });
            }

            it("never allocates 0 when the random seed is 0", async () => {
                const manager = await managerWithSeed(0);

                expect(await manager.getNextAvailableSessionId()).to.equal(1);
                expect(await manager.getNextAvailableSessionId()).to.equal(2);
            });

            it("stays within the ID range after reusing the session with the highest ID", async () => {
                const manager = await managerWithSeed(0);
                manager.compressIdRange(3);

                const [first, second, third] = [
                    await manager.getNextAvailableSessionId(),
                    await manager.getNextAvailableSessionId(),
                    await manager.getNextAvailableSessionId(),
                ];
                expect([first, second, third]).to.deep.equal([1, 2, 3]);
                await occupy(manager, third);
                await MockTime.advance(1000);
                await occupy(manager, first);
                await occupy(manager, second);

                const reused = await manager.getNextAvailableSessionId();
                expect(reused).to.equal(3);
                await occupy(manager, reused);

                expect(await manager.getNextAvailableSessionId()).to.be.within(1, 3);
            });
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

        it("closes the peer's least recently used session beyond the per-peer cap", async () => {
            const PEER_NODE_ID = NodeId(0x1234n);

            const sessions = new Array<NodeSession>();
            for (let i = 0; i < 6; i++) {
                sessions.push(
                    await sessionManager.createSecureSession({
                        id: 0x0100 + i,
                        fabric: undefined,
                        peerNodeId: PEER_NODE_ID,
                        peerSessionId: 0x0001 + i,
                        sharedSecret: DUMMY_BYTEARRAY,
                        salt: DUMMY_BYTEARRAY,
                        isInitiator: false, // the peer established these; we are the responder
                        isResumption: false,
                    }),
                );
                // Least-recently-used ordering decides who goes
                sessions[i].timestamp = Timestamp(1000 + i);
            }

            await MockTime.yield3();

            expect(sessions[0].isClosing).is.true;
            expect(sessions.slice(1).filter(session => session.isClosing)).is.empty;
        });

        it("never evicts a session we initiated, even when it is the least recently used", async () => {
            const PEER_NODE_ID = NodeId(0x9abcn);

            // Ours, and the oldest -- a naive least-recently-used sweep would take this one first
            const ours = await sessionManager.createSecureSession({
                id: 0x0300,
                fabric: undefined,
                peerNodeId: PEER_NODE_ID,
                peerSessionId: 0x0021,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: true,
                isResumption: false,
            });
            ours.timestamp = Timestamp(1);

            const theirs = new Array<NodeSession>();
            for (let i = 0; i < 6; i++) {
                theirs.push(
                    await sessionManager.createSecureSession({
                        id: 0x0301 + i,
                        fabric: undefined,
                        peerNodeId: PEER_NODE_ID,
                        peerSessionId: 0x0031 + i,
                        sharedSecret: DUMMY_BYTEARRAY,
                        salt: DUMMY_BYTEARRAY,
                        isInitiator: false,
                        isResumption: false,
                    }),
                );
                theirs[i].timestamp = Timestamp(1000 + i);
            }

            await MockTime.yield3();

            expect(ours.isClosing).is.false;
            expect(theirs[0].isClosing).is.true;
            expect(theirs.slice(1).filter(session => session.isClosing)).is.empty;
        });

        it("leaves sessions we initiated alone; peer loss reclaims those", async () => {
            const PEER_NODE_ID = NodeId(0x5678n);

            const sessions = new Array<NodeSession>();
            for (let i = 0; i < 6; i++) {
                sessions.push(
                    await sessionManager.createSecureSession({
                        id: 0x0200 + i,
                        fabric: undefined,
                        peerNodeId: PEER_NODE_ID,
                        peerSessionId: 0x0011 + i,
                        sharedSecret: DUMMY_BYTEARRAY,
                        salt: DUMMY_BYTEARRAY,
                        isInitiator: true,
                        isResumption: false,
                    }),
                );
                sessions[i].timestamp = Timestamp(1000 + i);
            }

            await MockTime.yield3();

            expect(sessions.filter(session => session.isClosing)).is.empty;
        });

        it("conveys the initiating exchange when reporting peer loss", async () => {
            const PEER_NODE_ID = NodeId(0x1234n);
            const PEER_ADDRESS = { fabricIndex: FabricIndex(0), nodeId: PEER_NODE_ID };

            const session = await sessionManager.createSecureSession({
                id: 0x0100,
                fabric: undefined,
                peerNodeId: PEER_NODE_ID,
                peerSessionId: 0x0001,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: true,
                isResumption: false,
            });

            const currentExchange = {} as MessageExchange;
            const received = new Array<MessageExchange | undefined>();
            session.subscriptions.add({
                subscriptionId: 1,
                isTerminated: false,
                async handlePeerCancel() {},
                async close(_flushViaSession, exchange) {
                    received.push(exchange);
                },
                async closeForShutdown() {},
            });

            await sessionManager.handlePeerLoss(PEER_ADDRESS, {
                cause: new Error("unresponsive"),
                asOf: Timestamp(Number.MAX_SAFE_INTEGER),
                currentExchange,
            });

            expect(received[0]).equals(currentExchange);
        });
    });

    describe("session supersession", () => {
        const PEER_NODE_ID = NodeId(0x1234n);
        const PEER_ADDRESS = PeerAddress({ fabricIndex: FabricIndex.NO_FABRIC, nodeId: PEER_NODE_ID });
        const [CAT_A, CAT_B] = [CaseAuthenticatedTag(0x0001_0001), CaseAuthenticatedTag(0x0002_0001)];
        let sessionManager: SessionManager;
        let nextId: number;

        beforeEach(async () => {
            const storage = new MemoryStorageDriver();
            storage.initialize();
            sessionManager = new SessionManager({
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessionManager.construction.ready;
            nextId = 0x0100;
        });

        function session(
            options: {
                peerNodeId?: NodeId;
                caseAuthenticatedTags?: CaseAuthenticatedTag[];
                isInitiator?: boolean;
                establishing?: true;
            } = {},
        ) {
            const id = nextId++;
            return sessionManager.createSecureSession({
                id,
                fabric: undefined,
                peerNodeId: options.peerNodeId ?? PEER_NODE_ID,
                peerSessionId: id,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: options.isInitiator ?? false,
                isResumption: false,
                caseAuthenticatedTags: options.caseAuthenticatedTags,
                establishing: options.establishing,
            });
        }

        /** The sessions that superseded {@link older}, in order. */
        function supersessionsOf(older: NodeSession) {
            const newer = new Array<NodeSession>();
            older.superseded.on(session => {
                newer.push(session);
            });
            return newer;
        }

        /** Start closing {@link session} and keep it in the closing state until the returned function runs. */
        function holdClosing(session: NodeSession) {
            let release!: () => void;
            const closed = session.initiateClose(() => new Promise<void>(resolve => (release = resolve)));
            return async () => {
                release();
                await closed;
            };
        }

        it("supersedes an older session with the same peer and CATs in any order", async () => {
            const older = await session({ caseAuthenticatedTags: [CAT_A, CAT_B] });
            const superseded = supersessionsOf(older);
            const newer = await session({ caseAuthenticatedTags: [CAT_B, CAT_A, CAT_B] });
            expect(superseded).deep.equals([newer]);
        });

        it("does not supersede a session with other CATs", async () => {
            const superseded = supersessionsOf(await session({ caseAuthenticatedTags: [CAT_A] }));
            await session({ caseAuthenticatedTags: [CAT_A, CAT_B] });
            await session({ caseAuthenticatedTags: [CAT_B] });
            await session();
            expect(superseded).deep.equals([]);
        });

        it("supersedes a session of the other role with equal CATs", async () => {
            const initiated = await session({ isInitiator: true, caseAuthenticatedTags: [CAT_A] });
            const ofInitiated = supersessionsOf(initiated);
            const responded = await session({ caseAuthenticatedTags: [CAT_A] });
            const ofResponded = supersessionsOf(responded);
            const initiatedAgain = await session({ isInitiator: true, caseAuthenticatedTags: [CAT_A] });

            expect(ofInitiated).deep.equals([responded, initiatedAgain]);
            expect(ofResponded).deep.equals([initiatedAgain]);
        });

        it("does not supersede a session of the other role with other CATs", async () => {
            const ofInitiated = supersessionsOf(await session({ isInitiator: true, caseAuthenticatedTags: [CAT_A] }));
            const ofResponded = supersessionsOf(await session({ caseAuthenticatedTags: [CAT_B] }));
            await session({ isInitiator: true, caseAuthenticatedTags: [CAT_A, CAT_B] });
            expect(ofInitiated).deep.equals([]);
            expect(ofResponded).deep.equals([]);
        });

        it("does not supersede a session with another peer", async () => {
            const superseded = supersessionsOf(await session());
            await session({ peerNodeId: NodeId(0x5678n) });
            expect(superseded).deep.equals([]);
        });

        it("does not supersede a PASE session", async () => {
            const superseded = supersessionsOf(await session({ peerNodeId: NodeId.UNSPECIFIED_NODE_ID }));
            await session({ peerNodeId: NodeId.UNSPECIFIED_NODE_ID });
            expect(superseded).deep.equals([]);
        });

        it("does not supersede a closing session", async () => {
            const older = await session();
            const superseded = supersessionsOf(older);
            const release = holdClosing(older);
            await session();
            expect(superseded).deep.equals([]);
            await release();
        });

        it("does not supersede a session that is still establishing", async () => {
            const establishing = await session({ establishing: true });
            const superseded = supersessionsOf(establishing);
            await session();
            expect(superseded).deep.equals([]);
        });

        it("supersedes nothing while establishing and the older sessions once established", async () => {
            const older = await session();
            const superseded = supersessionsOf(older);
            const newer = await session({ establishing: true });
            const ofNewer = supersessionsOf(newer);
            expect(superseded).deep.equals([]);

            newer.completeEstablishment();
            expect(superseded).deep.equals([newer]);
            expect(ofNewer).deep.equals([]);
        });

        it("orders supersession by completion, not by registration", async () => {
            const older = await session();
            const ofOlder = supersessionsOf(older);
            const resumed = await session({ establishing: true });
            const ofResumed = supersessionsOf(resumed);
            const newer = await session();
            const ofNewer = supersessionsOf(newer);

            resumed.completeEstablishment();

            expect(ofOlder).deep.equals([newer, resumed]);
            expect(ofNewer).deep.equals([resumed]);
            expect(ofResumed).deep.equals([]);
        });

        it("does not establish a session that is closing", async () => {
            const superseded = supersessionsOf(await session());
            const establishing = await session({ establishing: true });
            const release = holdClosing(establishing);

            expect(establishing.completeEstablishment()).false;

            expect(establishing.isEstablishing).true;
            expect(superseded).deep.equals([]);
            await release();
        });

        it("completes establishment once and shows observers an established session", async () => {
            const superseded = supersessionsOf(await session());
            const establishing = await session({ establishing: true });
            const seenEstablishing = new Array<boolean>();
            establishing.established.on(() => {
                seenEstablishing.push(establishing.isEstablishing);
            });

            expect(establishing.completeEstablishment()).true;
            expect(establishing.completeEstablishment()).true;

            expect(seenEstablishing).deep.equals([false]);
            expect(superseded).deep.equals([establishing]);
        });

        it("finds an establishing session only once it is established", async () => {
            const older = await session();
            const establishing = await session({ establishing: true });
            establishing.activeTimestamp = Timestamp(older.activeTimestamp + 1);

            expect(sessionManager.maybeSessionFor(PEER_ADDRESS)).equals(older);

            establishing.completeEstablishment();
            expect(sessionManager.maybeSessionFor(PEER_ADDRESS)).equals(establishing);
        });

        it("supersedes the least recently used session before it evicts it", async () => {
            const older = await session();
            older.timestamp = Timestamp(0);
            const events = new Array<string>();
            older.superseded.on(() => {
                events.push("superseded");
            });
            older.closing.on(() => {
                events.push("closing");
            });
            for (let i = 0; i < 4; i++) {
                await session({ caseAuthenticatedTags: [CAT_A] });
            }

            const newer = await session({ establishing: true });
            await MockTime.yield3();
            expect(older.isClosing).false;

            newer.completeEstablishment();
            await MockTime.yield3();
            expect(events).deep.equals(["superseded", "closing"]);
        });

        it("lists an establishing session in sessions only once it is established", async () => {
            const added = new Array<NodeSession>();
            sessionManager.sessions.added.on(session => {
                added.push(session);
            });

            const establishing = await session({ establishing: true });

            expect(sessionManager.sessions.has(establishing)).false;
            expect(sessionManager.registeredSessions.has(establishing)).true;
            expect(sessionManager.getSession(establishing.id)).equals(establishing);
            expect(added).deep.equals([]);

            establishing.completeEstablishment();

            expect(sessionManager.sessions.has(establishing)).true;
            expect(added).deep.equals([establishing]);
        });

        it("lists a session in sessions only after every observer of registeredSessions saw it", async () => {
            const events = new Array<string>();
            sessionManager.sessions.added.on(() => {
                events.push("sessions");
            });
            sessionManager.registeredSessions.added.on(() => {
                events.push("registeredSessions");
            });

            await session();

            expect(events).deep.equals(["registeredSessions", "sessions"]);
        });

        it("never lists a session whose handshake fails", async () => {
            const events = new Array<string>();
            sessionManager.sessions.added.on(() => {
                events.push("added");
            });
            sessionManager.sessions.deleted.on(() => {
                events.push("deleted");
            });
            const establishing = await session({ establishing: true });

            await establishing.initiateForceClose({ cause: new SessionClosedError("test") });

            expect(establishing.completeEstablishment()).false;
            expect(sessionManager.registeredSessions.has(establishing)).false;
            expect(sessionManager.sessions.has(establishing)).false;
            expect(events).deep.equals([]);
        });

        it("characterization: does not list a session that establishes after it was disposed", async () => {
            const establishing = await session({ establishing: true });

            await establishing[Symbol.asyncDispose]();
            expect(establishing.completeEstablishment()).true;

            expect(sessionManager.registeredSessions.has(establishing)).false;
            expect(sessionManager.sessions.has(establishing)).false;
        });

        it("reports an established session that is closing as established", async () => {
            const established = await session();
            const release = holdClosing(established);

            expect(established.completeEstablishment()).true;

            await release();
        });

        it("completes establishment when an observer of sessions throws", async () => {
            sessionManager.sessions.added.on(() => {
                throw new InternalError("test: observer fails");
            });
            const establishing = await session({ establishing: true });

            expect(establishing.completeEstablishment()).true;

            expect(establishing.isEstablishing).false;
            expect(sessionManager.sessions.has(establishing)).true;
        });

        it("neither counts nor evicts an establishing session for the per-peer cap", async () => {
            const sessions = new Array<NodeSession>();
            for (let i = 0; i < 3; i++) {
                sessions.push(await session());
            }
            const establishing = await session({ establishing: true });
            establishing.timestamp = Timestamp(0);
            sessions.push(await session());
            sessions.push(await session());
            await MockTime.yield3();

            expect([...sessions, establishing].filter(session => session.isClosing)).deep.equals([]);
        });
    });

    describe("log attribution", () => {
        // Session eviction runs from a timer or transport callback, so nothing on the call stack says which node
        // it belongs to.  A process running several nodes reads these lines only if the message names its owner.
        it("names the originating environment on the lines an eviction produces", async () => {
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const storageManager = new StorageManager(storage);
            await storageManager.initialize();

            const environment = new Environment("test", Environment.default);
            environment.set(StorageManager, storageManager);
            environment.set(FabricManager, new FabricManager(new StandardCrypto()));

            // Through the environment rather than by construction, so the logger the environment installs is the
            // one under test
            const sessionManager = environment.get(SessionManager);
            await sessionManager.construction.ready;

            const dest = Logger.destinations.default;
            const original = { ...dest };
            const origins = new Array<unknown>();
            // The level is process-global and other suites move it; the line under test is INFO
            dest.level = LogLevel.INFO;
            dest.add = message => {
                if (String(message.values[1]).startsWith("Closing least recently used session")) {
                    origins.push(message.origin);
                }
            };

            try {
                const PEER_NODE_ID = NodeId(0x4321n);
                for (let i = 0; i < 6; i++) {
                    const session = await sessionManager.createSecureSession({
                        id: 0x0200 + i,
                        fabric: undefined,
                        peerNodeId: PEER_NODE_ID,
                        peerSessionId: 0x0001 + i,
                        sharedSecret: DUMMY_BYTEARRAY,
                        salt: DUMMY_BYTEARRAY,
                        isInitiator: false,
                        isResumption: false,
                    });
                    session.timestamp = Timestamp(1000 + i);
                }

                await MockTime.yield3();
            } finally {
                Object.assign(Logger.destinations.default, original);
                await sessionManager.close();
            }

            // Identity, not deep equality: an origin is a plain name-and-parent record, so deep equality holds
            // between any two environments named alike and would accept attribution to the wrong node
            expect(origins.length).equals(1);
            expect(origins[0]).equals(environment.logOrigin);
        });
    });

    describe("group data message counter", () => {
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

        it("closes the counter it replaces when cleared", async () => {
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["sessions"]),
            });
            await sessionManager.construction.ready;

            const counterLifetimes = () => {
                using probe = Lifetime.process.join("probe");
                return [...(probe.owner?.spans ?? [])].filter(({ name }) => name === "persisted message counter")
                    .length;
            };
            const before = counterLifetimes();

            await sessionManager.clear();

            expect(counterLifetimes()).equal(before);
            await sessionManager.close();
            expect(counterLifetimes()).equal(before - 1);
        });

        it("seeds the global counter above legacy per-key counters and clears them (Q-02 migration)", async () => {
            const crypto = new StandardCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            const fabricStorage = new StorageContext(storage, ["fabric"]);
            const fabric = testFabric(crypto, fabricStorage);
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
            const fabric = testFabric(crypto, new StorageContext(storage, ["fabric"]));
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

        const keySet = (groupKeySetId: number, epochKey0: Bytes) => ({
            groupKeySetId,
            groupKeySecurityPolicy: 0,
            epochKey0,
            epochStartTime0: 1,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
            groupKeyMulticastPolicy: 0,
        });

        it("forgets group message reception state when its key set is removed so a reused key re-syncs", async () => {
            const crypto = new StandardCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            const fabric = testFabric(crypto, new StorageContext(storage, ["fabric"]));
            fabricManager.addFabric(fabric);

            const epochKey = b$`000102030405060708090a0b0c0d0e0f`;
            await fabric.groups.setFromGroupKeySet(keySet(1, epochKey));

            const source = NodeId(2);
            const operationalKey = fabric.groups.keySets.get("groupKeySetId", 1)!.operationalEpochKey0;

            // Advance the replay window; a lower counter on the retained state is then a replay.
            fabric.groups.messaging.receptionStateFor(source, operationalKey).updateMessageCounter(1000);
            expect(() =>
                fabric.groups.messaging.receptionStateFor(source, operationalKey).updateMessageCounter(500),
            ).throws(DuplicateMessageError);

            // Remove and re-provision the identical epoch key (same derived operational key).
            fabric.groups.removeGroupKeySet(1);
            await fabric.groups.setFromGroupKeySet(keySet(1, epochKey));
            const reusedKey = fabric.groups.keySets.get("groupKeySetId", 1)!.operationalEpochKey0;
            expect(Bytes.toHex(reusedKey)).equals(Bytes.toHex(operationalKey));

            // The fresh window syncs on the first (lower) counter instead of rejecting it as a replay.
            expect(() =>
                fabric.groups.messaging.receptionStateFor(source, reusedKey).updateMessageCounter(500),
            ).not.throws();
        });

        it("keeps reception state until the last key set sharing an operational key is removed", async () => {
            const crypto = new StandardCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            const fabric = testFabric(crypto, new StorageContext(storage, ["fabric"]));
            fabricManager.addFabric(fabric);

            const epochKey = b$`000102030405060708090a0b0c0d0e0f`;
            await fabric.groups.setFromGroupKeySet(keySet(1, epochKey));
            await fabric.groups.setFromGroupKeySet(keySet(2, epochKey));

            const source = NodeId(2);
            const operationalKey = fabric.groups.keySets.get("groupKeySetId", 1)!.operationalEpochKey0;
            fabric.groups.messaging.receptionStateFor(source, operationalKey).updateMessageCounter(1000);

            // One of two key sets shares the derived key, so its reception window must survive this removal.
            fabric.groups.removeGroupKeySet(1);
            expect(() =>
                fabric.groups.messaging.receptionStateFor(source, operationalKey).updateMessageCounter(500),
            ).throws(DuplicateMessageError);

            // Removing the last referencing key set forgets it.
            fabric.groups.removeGroupKeySet(2);
            expect(() =>
                fabric.groups.messaging.receptionStateFor(source, operationalKey).updateMessageCounter(500),
            ).not.throws();
        });

        it("forgets the previous operational key when a key set is rewritten with a new epoch key", async () => {
            const crypto = new StandardCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            const fabric = testFabric(crypto, new StorageContext(storage, ["fabric"]));
            fabricManager.addFabric(fabric);

            const epochA = b$`000102030405060708090a0b0c0d0e0f`;
            const epochB = b$`0f0e0d0c0b0a09080706050403020100`;
            await fabric.groups.setFromGroupKeySet(keySet(1, epochA));

            const source = NodeId(2);
            const operationalA = fabric.groups.keySets.get("groupKeySetId", 1)!.operationalEpochKey0;
            fabric.groups.messaging.receptionStateFor(source, operationalA).updateMessageCounter(1000);

            // In-place rewrite with a different epoch key drops key A, so its window must be forgotten.
            await fabric.groups.setFromGroupKeySet(keySet(1, epochB));

            expect(() =>
                fabric.groups.messaging.receptionStateFor(source, operationalA).updateMessageCounter(500),
            ).not.throws();
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

    describe("max paths per invoke validation", () => {
        function newManager(parameters: Partial<SessionParameters>) {
            const storage = new MemoryStorageDriver();
            storage.initialize();
            return new SessionManager({
                parameters: parameters as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["context"]),
            });
        }

        it("rejects a local max paths per invoke of zero on construction", () => {
            expect(() => newManager({ maxPathsPerInvoke: 0 })).throws(ImplementationError, "Max Paths Per Invoke");
        });

        it("rejects a local max paths per invoke of zero via the setter", async () => {
            const sessionManager = newManager({});
            await sessionManager.construction.ready;

            expect(() => (sessionManager.sessionParameters = { maxPathsPerInvoke: 0 })).throws(
                ImplementationError,
                "Max Paths Per Invoke",
            );
        });

        it("rejects a local max paths per invoke that is not a whole count", async () => {
            const sessionManager = newManager({});
            await sessionManager.construction.ready;

            expect(() => (sessionManager.sessionParameters = { maxPathsPerInvoke: 2.5 })).throws(
                ImplementationError,
                "Max Paths Per Invoke",
            );
        });

        it("accepts a local max paths per invoke of one", async () => {
            const sessionManager = newManager({ maxPathsPerInvoke: 1 });
            await sessionManager.construction.ready;

            expect(sessionManager.sessionParameters.maxPathsPerInvoke).equals(1);
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

    describe("wall-clock steps", () => {
        const PEER_NODE_ID = NodeId(0x1234n);
        const PEER_ADDRESS = PeerAddress({ fabricIndex: FabricIndex(0), nodeId: PEER_NODE_ID });

        let sessionManager: SessionManager;

        beforeEach(async () => {
            MockTime.reset();
            const storage = new MemoryStorageDriver();
            storage.initialize();
            sessionManager = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessionManager.construction.ready;
        });

        function aSession(id = 0x0100) {
            return sessionManager.createSecureSession({
                id,
                fabric: undefined,
                peerNodeId: PEER_NODE_ID,
                peerSessionId: id,
                sharedSecret: DUMMY_BYTEARRAY,
                salt: DUMMY_BYTEARRAY,
                isInitiator: false,
                isResumption: false,
            });
        }

        it("keeps a peer heard from just now active across a forward step", async () => {
            const session = await aSession();
            expect(session.isPeerActive).true;

            MockTime.stepWallClock(Hours(1));

            expect(session.isPeerActive).true;
        });

        it("keeps a peer silent beyond the active threshold idle across a backward step", async () => {
            const session = await aSession();
            await MockTime.advance(session.parameters.activeThreshold + Seconds(1));
            expect(session.isPeerActive).false;

            MockTime.stepWallClock(-3_600_000);

            expect(session.isPeerActive).false;
        });

        it("prefers the session heard from last when the clock stepped back between them", async () => {
            const first = await aSession(0x0100);
            const second = await aSession(0x0200);
            first.notifyActivity(true);

            MockTime.stepWallClock(-3_600_000);
            await MockTime.advance(Seconds(1));
            second.notifyActivity(true);

            expect(sessionManager.maybeSessionFor(PEER_ADDRESS)).equals(second);
        });

        it("evicts the least recently used session when the clock stepped back since its last traffic", async () => {
            const sessions = new Array<NodeSession>();
            for (let i = 0; i < 5; i++) {
                sessions.push(await aSession(0x0100 + i));
            }

            MockTime.stepWallClock(-3_600_000);
            await MockTime.advance(Seconds(1));
            sessions[0].notifyActivity(false);
            await aSession(0x0200);
            await MockTime.yield3();

            expect(sessions[0].isClosing).false;
            expect(sessions[1].isClosing).true;
        });

        it("closes a session on peer loss after the clock stepped back", async () => {
            const session = await aSession();

            MockTime.stepWallClock(-3_600_000);
            await MockTime.advance(Seconds(1));
            await sessionManager.handlePeerLoss(PEER_ADDRESS, { cause: new NetworkError("unresponsive") });

            expect(session.isPeerLost).true;
        });

        it("closes a session on peer loss when the clock stepped forward before it was created", async () => {
            MockTime.stepWallClock(Hours(1));
            const session = await aSession();

            await MockTime.advance(Seconds(1));
            await sessionManager.handlePeerLoss(PEER_ADDRESS, { cause: new NetworkError("unresponsive") });

            expect(session.isPeerLost).true;
        });

        it("closes a session on peer shutdown after the clock stepped back", async () => {
            const session = await aSession();

            MockTime.stepWallClock(-3_600_000);
            await MockTime.advance(Seconds(1));
            await sessionManager.handlePeerShutdown(PEER_ADDRESS);

            expect(session.isPeerLost).true;
        });

        it("reports session activity on the wall clock as it reads now", async () => {
            await MockTime.advance(0.4);
            await aSession();
            await MockTime.advance(Seconds(5));

            MockTime.stepWallClock(Hours(1));

            const [info] = sessionManager.getActiveSessionInformation();
            const expected = Math.round(Time.nowMs - Seconds(5));
            expect(info.lastInteractionTimestamp).equals(expected);
            expect(info.lastActiveTimestamp).equals(expected);
        });

        it("reports a peer never heard from with a last active time of 0", async () => {
            const session = await aSession();
            session.activeTimestamp = 0;
            MockTime.stepWallClock(Hours(1));

            const [info] = sessionManager.getActiveSessionInformation();
            expect(info.lastActiveTimestamp).equals(0);
        });
    });
    describe("resumption record storage", () => {
        const CATS = [CaseAuthenticatedTag(0x00010001)];
        const VERSIONED_PEER = NodeId(0x1234);
        const UNVERSIONED_PEER = NodeId(0x5678);
        const NO_CATS_PEER = NodeId(0x9abc);

        class RecordingStorageDriver extends MemoryStorageDriver {
            resumptionRecordWrites = 0;
            failResumptionRecordWrites = false;

            override set(contexts: string[], values: Record<string, SupportedStorageTypes>): MaybePromise<void>;
            override set(contexts: string[], key: string, value: SupportedStorageTypes): MaybePromise<void>;
            override set(
                contexts: string[],
                keyOrValues: string | Record<string, SupportedStorageTypes>,
                value?: SupportedStorageTypes,
            ) {
                if (keyOrValues === "resumptionRecords") {
                    this.resumptionRecordWrites++;
                    if (this.failResumptionRecordWrites) {
                        throw new StorageError("Simulated write failure");
                    }
                }
                if (typeof keyOrValues === "string") {
                    return super.set(contexts, keyOrValues, value!);
                }
                return super.set(contexts, keyOrValues);
            }
        }

        function storedRecord(peerNodeId: NodeId, version?: number, caseAuthenticatedTags: typeof CATS | null = CATS) {
            return {
                ...(version === undefined ? {} : { version }),
                nodeId: peerNodeId,
                sharedSecret: b$`00112233`,
                resumptionId: b$`44556677`,
                fabricId: FabricId(BigInt("0x456789ABCDEF1234")),
                fabricIndex: FabricIndex(1),
                peerNodeId,
                sessionParameters: SessionParameters({}),
                ...(caseAuthenticatedTags === null ? {} : { caseAuthenticatedTags }),
            };
        }

        async function sessionManagerWith(records: ReturnType<typeof storedRecord>[], { failRewrite = false } = {}) {
            const crypto = new StandardCrypto();
            const storage = new RecordingStorageDriver();
            storage.initialize();
            const fabrics = new FabricManager(crypto);
            await fabrics.construction.ready;
            const fabric = testFabric(crypto, new StorageContext(storage, ["fabric"]));
            fabrics.addFabric(fabric);

            const sessionStorage = new StorageContext(storage, ["sessions"]);
            await sessionStorage.set("resumptionRecords", records);
            storage.resumptionRecordWrites = 0;
            storage.failResumptionRecordWrites = failRewrite;
            const sessionManager = new SessionManager({
                parameters: SessionParameters({}),
                fabrics,
                storage: sessionStorage,
            });
            await sessionManager.construction.ready;
            storage.failResumptionRecordWrites = false;
            return { sessionManager, sessionStorage, storage, fabric };
        }

        function storedPeers(stored: { peerNodeId: NodeId }[]) {
            return stored.map(({ peerNodeId }) => peerNodeId);
        }

        it("drops records stored without a version that carry CATs", async () => {
            const { sessionManager, sessionStorage, fabric } = await sessionManagerWith([
                storedRecord(UNVERSIONED_PEER),
            ]);

            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(UNVERSIONED_PEER))).undefined;
            expect(await sessionStorage.get("resumptionRecords")).deep.equals([]);
        });

        it("keeps records stored without a version and without CATs and stores them with the version", async () => {
            const { sessionManager, sessionStorage, storage, fabric } = await sessionManagerWith([
                storedRecord(NO_CATS_PEER, undefined, []),
            ]);

            expect(
                sessionManager.findResumptionRecordByAddress(fabric.addressOf(NO_CATS_PEER))?.caseAuthenticatedTags,
            ).deep.equals([]);
            expect(storage.resumptionRecordWrites).equals(1);
            const stored = await sessionStorage.get<{ version?: number; peerNodeId: NodeId }[]>("resumptionRecords");
            expect(storedPeers(stored)).deep.equals([NO_CATS_PEER]);
            expect(stored[0].version).equals(1);
        });

        it("keeps records stored without a version and without a CAT field and stores them with the version", async () => {
            const { sessionManager, sessionStorage, storage, fabric } = await sessionManagerWith([
                storedRecord(NO_CATS_PEER, undefined, null),
            ]);

            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(NO_CATS_PEER))).not.undefined;
            expect(storage.resumptionRecordWrites).equals(1);
            const stored = await sessionStorage.get<{ version?: number; peerNodeId: NodeId }[]>("resumptionRecords");
            expect(storedPeers(stored)).deep.equals([NO_CATS_PEER]);
            expect(stored[0].version).equals(1);
        });

        it("skips an unversioned record of an unknown fabric without rewriting storage", async () => {
            const { sessionManager, storage, fabric } = await sessionManagerWith([
                { ...storedRecord(NO_CATS_PEER, undefined, []), fabricId: FabricId(BigInt("0x1111")) },
            ]);

            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(NO_CATS_PEER))).undefined;
            expect(storage.resumptionRecordWrites).equals(0);
        });

        it("keeps the version of a newer record when another record triggers a rewrite", async () => {
            const { sessionManager, sessionStorage, storage, fabric } = await sessionManagerWith([
                storedRecord(NO_CATS_PEER, undefined, []),
                storedRecord(VERSIONED_PEER, 99),
            ]);

            expect(storage.resumptionRecordWrites).equals(1);
            const stored = await sessionStorage.get<{ version?: number; peerNodeId: NodeId }[]>("resumptionRecords");
            expect(storedPeers(stored)).deep.equals([NO_CATS_PEER, VERSIONED_PEER]);
            expect(stored.map(({ version }) => version)).deep.equals([1, 99]);

            // A record saved by this build for the same peer carries the current version
            const record = sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER));
            if (record === undefined) {
                expect.fail("newer record was not restored");
            }
            await sessionManager.saveResumptionRecord(record);
            const saved = await sessionStorage.get<{ version?: number; peerNodeId: NodeId }[]>("resumptionRecords");
            expect(saved.map(({ version }) => version)).deep.equals([1, 1]);
        });

        it("drops only the unversioned records with CATs when versioned and CAT-less records are also stored", async () => {
            const { sessionManager, sessionStorage, fabric } = await sessionManagerWith([
                storedRecord(UNVERSIONED_PEER),
                storedRecord(NO_CATS_PEER, undefined, []),
                storedRecord(VERSIONED_PEER, 1),
            ]);

            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(UNVERSIONED_PEER))).undefined;
            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(NO_CATS_PEER))).not.undefined;
            expect(
                sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER))?.caseAuthenticatedTags,
            ).deep.equals(CATS);

            const stored = await sessionStorage.get<{ version?: number; peerNodeId: NodeId }[]>("resumptionRecords");
            expect(storedPeers(stored)).deep.equals([NO_CATS_PEER, VERSIONED_PEER]);
            expect(stored.map(({ version }) => version)).deep.equals([1, 1]);
        });

        it("keeps a versioned record with CATs untouched", async () => {
            const { sessionManager, sessionStorage, storage, fabric } = await sessionManagerWith([
                storedRecord(VERSIONED_PEER, 1),
            ]);

            expect(
                sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER))?.caseAuthenticatedTags,
            ).deep.equals(CATS);
            expect(storage.resumptionRecordWrites).equals(0);
            expect((await sessionStorage.get<{ peerNodeId: NodeId }[]>("resumptionRecords")).length).equals(1);
        });

        it("does not rewrite storage when every stored record is versioned", async () => {
            const { sessionManager, storage, fabric } = await sessionManagerWith([storedRecord(VERSIONED_PEER, 1)]);

            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER))).not.undefined;
            expect(storage.resumptionRecordWrites).equals(0);
        });

        it("keeps records stored with a newer version, also with CATs", async () => {
            const { sessionManager, storage, fabric } = await sessionManagerWith([storedRecord(VERSIONED_PEER, 99)]);

            expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER))).not.undefined;
            expect(storage.resumptionRecordWrites).equals(0);
        });

        it("stores saved records with the version", async () => {
            const { sessionManager, sessionStorage, fabric } = await sessionManagerWith([
                storedRecord(VERSIONED_PEER, 1),
            ]);

            const record = sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER));
            if (record === undefined) {
                expect.fail("versioned record was not restored");
            }
            await sessionManager.saveResumptionRecord(record);
            const [stored] = await sessionStorage.get<{ version?: number }[]>("resumptionRecords");
            expect(stored.version).equals(1);
        });

        it("starts and logs a warning when the rewrite after dropping records fails", async () => {
            const dest = Logger.destinations.default;
            const original = { ...dest };
            const warnings = new Array<string>();
            dest.level = LogLevel.WARN;
            dest.add = message => {
                if (message.level === LogLevel.WARN) {
                    warnings.push(message.values.map(String).join(" "));
                }
            };

            try {
                const { sessionManager, storage, fabric } = await sessionManagerWith(
                    [storedRecord(UNVERSIONED_PEER), storedRecord(VERSIONED_PEER, 1)],
                    { failRewrite: true },
                );

                expect(storage.resumptionRecordWrites).equals(1);
                expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(UNVERSIONED_PEER))).undefined;
                expect(sessionManager.findResumptionRecordByAddress(fabric.addressOf(VERSIONED_PEER))).not.undefined;
            } finally {
                Object.assign(Logger.destinations.default, original);
            }

            expect(warnings.filter(w => w.includes("Could not rewrite resumption records")).length).equals(1);
        });
    });
});
