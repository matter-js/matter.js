/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckInMessage } from "#icd/CheckInMessage.js";
import { FabricIcd } from "#icd/FabricIcd.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { Bytes, ImplementationError, InternalError, Seconds, StandardCrypto } from "@matter/general";
import { NodeId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";

const crypto = new StandardCrypto();
const KEY_A = Bytes.fromHex("d90e13180d00baadd20cf5ed4913d3ff");
const KEY_B = Bytes.fromHex("18fdbceaef01955b0ec875eda3ae6ee8");

function fabricIcd() {
    return new FabricIcd(crypto);
}

describe("FabricIcd", () => {
    describe("device role — registrations", () => {
        it("stores, lists and removes registrations", () => {
            const icd = fabricIcd();
            icd.setRegistration({
                checkInNodeId: NodeId(1),
                monitoredSubject: NodeId(1),
                key: KEY_A,
                clientType: IcdManagement.ClientType.Permanent,
            });
            expect(icd.registrations.length).equal(1);
            icd.deleteRegistration(NodeId(1));
            expect(icd.registrations.length).equal(0);
        });

        it("replaces registration for the same checkInNodeId", () => {
            const icd = fabricIcd();
            icd.setRegistration({
                checkInNodeId: NodeId(1),
                monitoredSubject: NodeId(1),
                key: KEY_A,
                clientType: IcdManagement.ClientType.Permanent,
            });
            icd.setRegistration({
                checkInNodeId: NodeId(1),
                monitoredSubject: NodeId(7),
                key: KEY_B,
                clientType: IcdManagement.ClientType.Ephemeral,
            });
            expect(icd.registrations.length).equal(1);
            expect(icd.registrations[0].monitoredSubject).equal(NodeId(7));
        });
    });

    describe("controller role — processCheckIn", () => {
        describe("wakefulness", () => {
            before(MockTime.enable);
            after(MockTime.disable);

            it("starts Active Mode of the peer's wakefulness for its ActiveModeDuration", async () => {
                const icd = fabricIcd();
                icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
                const wakefulness = icd.wakefulnessFor(NodeId(11));
                if (wakefulness === undefined) {
                    throw new InternalError("peer not fed");
                }
                wakefulness.requiresAwait = true;
                wakefulness.setTimings({
                    activeModeThreshold: Seconds(5),
                    activeModeDuration: Seconds(20),
                    idleModeDuration: Seconds(30),
                });

                await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000));
                await MockTime.advance(Seconds(10));

                expect(wakefulness.awake.value).equal(true);
                wakefulness.close();
            });
        });

        it("trial-decrypts and routes to the matching peer", async () => {
            const icd = fabricIcd();
            const received = new Array<FabricIcd.ReceivedCheckIn>();

            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, checkIn => {
                received.push(checkIn);
            });
            icd.addPeer({ peerNodeId: NodeId(22), key: KEY_B, counterStart: 0, lastOffset: 0 }, () => {
                throw new Error("wrong peer");
            });

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000);
            const result = await icd.processCheckIn(payload);

            expect(result).true;
            expect(received).deep.equal([{ peerNodeId: NodeId(11), counter: 12, activeModeThreshold: 5000 }]);
        });

        it("ignores undecryptable payloads", async () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {
                throw new Error("should not be called");
            });

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_B, 12, 5000);
            const result = await icd.processCheckIn(payload);

            expect(result).false;
        });

        it("drops replayed counters without routing", async () => {
            const icd = fabricIcd();
            let callCount = 0;
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {
                callCount++;
            });

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000);
            const result1 = await icd.processCheckIn(payload);
            const result2 = await icd.processCheckIn(payload);

            expect(result1).true;
            expect(result2).true;
            expect(callCount).equal(1);
        });

        it("updates lastOffset after successful processing", async () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000);
            await icd.processCheckIn(payload);

            expect(icd.peerFor(NodeId(11))?.lastOffset).equal(2);
        });

        it("handler errors do not escape processCheckIn", async () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {
                throw new Error("handler failure");
            });

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000);
            const result = await icd.processCheckIn(payload);

            expect(result).true;
            expect(icd.peerFor(NodeId(11))?.lastOffset).equal(2);
        });

        it("removes peers", async () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
            icd.deletePeer(NodeId(11));

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000);
            const result = await icd.processCheckIn(payload);

            expect(result).false;
        });
    });

    describe("controller role — pending key", () => {
        /** A peer whose last Check-In under {@link KEY_A} carried counter 15, with {@link KEY_B} pending. */
        function refreshingPeer(received: FabricIcd.ReceivedCheckIn[] = [], counterStart = 10, lastOffset = 5) {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart, lastOffset }, checkIn => {
                received.push(checkIn);
            });
            icd.setPendingKey(NodeId(11), KEY_B);
            return icd;
        }

        it("keeps decrypting with the current key", async () => {
            const received = new Array<FabricIcd.ReceivedCheckIn>();
            const icd = refreshingPeer(received);

            expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_A, 16, 5000))).true;

            expect(received.map(({ counter }) => counter)).deep.equal([16]);
            expect(icd.peerFor(NodeId(11))?.lastOffset).equal(6);
            expect(icd.peerFor(NodeId(11))?.key).equal(KEY_A);
            expect(icd.peerFor(NodeId(11))?.pendingKey).equal(KEY_B);
        });

        it("promotes the pending key on its first Check-In, counting from the last counter under the old key", async () => {
            const received = new Array<FabricIcd.ReceivedCheckIn>();
            const icd = refreshingPeer(received);

            expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000))).true;

            expect(received.map(({ counter }) => counter)).deep.equal([20]);
            expect(icd.peerFor(NodeId(11))).deep.equal({
                peerNodeId: NodeId(11),
                key: KEY_B,
                counterStart: 15,
                lastOffset: 5,
                pendingKey: undefined,
            });
        });

        it("computes the promotion baseline modulo 2³²", async () => {
            const received = new Array<FabricIcd.ReceivedCheckIn>();
            const icd = refreshingPeer(received, 0xfffffff0, 0x20);

            expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 0x13, 5000))).true;

            expect(received.map(({ counter }) => counter)).deep.equal([0x13]);
            expect(icd.peerFor(NodeId(11))?.lastOffset).equal(3);
            expect(icd.peerFor(NodeId(11))?.counterStart).equal(0x10);
        });

        it("rejects a replay and an earlier counter under the promoted key", async () => {
            const received = new Array<FabricIcd.ReceivedCheckIn>();
            const icd = refreshingPeer(received);
            const promoting = await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000);
            await icd.processCheckIn(promoting);

            expect(await icd.processCheckIn(promoting)).true;
            expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 18, 5000))).true;

            expect(received.length).equal(1);
            expect(icd.peerFor(NodeId(11))?.lastOffset).equal(5);
        });

        for (const counter of [15, 12]) {
            it(`does not promote the pending key with counter ${counter}, not after the old key's last counter 15`, async () => {
                const received = new Array<FabricIcd.ReceivedCheckIn>();
                const icd = refreshingPeer(received);

                expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, counter, 5000))).true;

                expect(received).deep.equal([]);
                expect(icd.peerFor(NodeId(11))).deep.include({ key: KEY_A, pendingKey: KEY_B, lastOffset: 5 });
                expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000))).true;
                expect(received.map(({ counter }) => counter)).deep.equal([20]);
                expect(icd.peerFor(NodeId(11))?.lastOffset).equal(5);
            });
        }

        it("stops decrypting with the old key once the pending key is promoted", async () => {
            const icd = refreshingPeer();
            await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000));

            expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_A, 30, 5000))).false;
        });

        describe("confirmKey", () => {
            it("replaces the key with the pending one at the reported start", () => {
                const icd = refreshingPeer();
                expect(icd.confirmKey(NodeId(11), KEY_B, 17)).true;

                expect(icd.peerFor(NodeId(11))).deep.include({
                    key: KEY_B,
                    pendingKey: undefined,
                    counterStart: 17,
                    lastOffset: 0,
                });
            });

            it("measures the last counter of a key a Check-In promoted from the reported start", async () => {
                const icd = refreshingPeer();
                await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000));
                expect(icd.confirmKey(NodeId(11), KEY_B, 17)).true;

                expect(icd.peerFor(NodeId(11))).deep.include({ key: KEY_B, counterStart: 17, lastOffset: 3 });
                expect(await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000))).true;
                expect(icd.peerFor(NodeId(11))?.lastOffset).equal(3);
            });

            it("keeps the Check-In baseline when the reported start lies after the last counter", async () => {
                const icd = refreshingPeer();
                await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 20, 5000));
                expect(icd.confirmKey(NodeId(11), KEY_B, 25)).true;

                expect(icd.peerFor(NodeId(11))).deep.include({ key: KEY_B, counterStart: 15, lastOffset: 5 });
            });

            it("measures across the 2³² wrap from the reported start", async () => {
                const icd = refreshingPeer([], 0xfffffff0, 0x10);
                await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_B, 2, 5000));
                expect(icd.confirmKey(NodeId(11), KEY_B, 0xfffffffe)).true;

                expect(icd.peerFor(NodeId(11))).deep.include({ counterStart: 0xfffffffe, lastOffset: 4 });
            });

            it("ignores a key that is neither current nor pending", () => {
                const icd = refreshingPeer();
                expect(icd.confirmKey(NodeId(11), Bytes.fromHex("00112233445566778899aabbccddeeff"), 12)).false;

                expect(icd.peerFor(NodeId(11))).deep.include({
                    key: KEY_A,
                    pendingKey: KEY_B,
                    counterStart: 10,
                    lastOffset: 5,
                });
            });
        });

        it("answers refreshNeeded from the current key's last offset", async () => {
            const icd = refreshingPeer([], 10, 0x7fffffff);
            expect(icd.refreshNeeded(NodeId(11))).false;

            await icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_A, (10 + 0x80000000) >>> 0, 5000));
            expect(icd.refreshNeeded(NodeId(11))).true;

            icd.confirmKey(NodeId(11), KEY_B, 0x80000010);
            expect(icd.refreshNeeded(NodeId(11))).false;
            expect(fabricIcd().refreshNeeded(NodeId(11))).false;
        });

        it("rethrows an error that is not a failed decryption", async () => {
            class BrokenCrypto extends StandardCrypto {
                override signHmac(): never {
                    throw new InternalError("crypto broken");
                }
            }
            const icd = new FabricIcd(new BrokenCrypto());
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});

            await expect(icd.processCheckIn(await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 5000))).rejectedWith(
                InternalError,
            );
        });

        it("refuses a pending key for an unregistered peer", () => {
            expect(() => fabricIcd().setPendingKey(NodeId(11), KEY_B)).throws(ImplementationError);
        });
    });

    describe("controller role — wakefulness", () => {
        before(MockTime.enable);
        after(MockTime.disable);

        it("wakefulnessFor returns an IcdPeerWakefulness after addPeer", () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});

            expect(icd.wakefulnessFor(NodeId(11))).instanceof(IcdPeerWakefulness);
        });

        it("processCheckIn wakes the matching peer for the threshold the Check-In carries", async () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});

            const wakefulness = icd.wakefulnessFor(NodeId(11))!;
            wakefulness.requiresAwait = true;
            expect(wakefulness.awake.value).false;

            const payload = await CheckInMessage.encodeIcd(crypto, KEY_A, 12, 20_000);
            await icd.processCheckIn(payload);
            await MockTime.advance(Seconds(15));

            expect(wakefulness.awake.value).true;
            wakefulness.close();
        });

        it("keeps a peer's wakefulness when the peer is registered again", () => {
            const icd = fabricIcd();
            const fed = new Array<NodeId>();
            icd.peerFed.on(nodeId => {
                fed.push(nodeId);
            });
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
            const wakefulness = icd.wakefulnessFor(NodeId(11));

            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_B, counterStart: 20, lastOffset: 0 }, () => {});

            expect(icd.wakefulnessFor(NodeId(11))).equal(wakefulness);
            expect(icd.peerFor(NodeId(11))?.key).equal(KEY_B);
            expect(fed).deep.equal([NodeId(11)]);
        });

        it("suspends the wakefulness of a peer whose registration is deleted", () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
            const wakefulness = icd.wakefulnessFor(NodeId(11));
            if (wakefulness === undefined) {
                throw new InternalError("peer not fed");
            }
            wakefulness.requiresAwait = true;

            icd.deletePeer(NodeId(11));

            expect(icd.peerFor(NodeId(11))).undefined;
            expect(icd.wakefulnessFor(NodeId(11))).undefined;
            expect(wakefulness.awake.value).true;
            expect(wakefulness.requiresAwait).true;
        });

        it("gives a removed peer a fresh wakefulness when its node ID registers again", () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
            const removed = icd.wakefulnessFor(NodeId(11));
            removed!.requiresAwait = true;
            removed!.noteActive();

            icd.removePeer(NodeId(11));
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_B, counterStart: 0, lastOffset: 0 }, () => {});

            const fresh = icd.wakefulnessFor(NodeId(11));
            expect(fresh).not.equal(removed);
            fresh!.requiresAwait = true;
            expect(fresh!.nextCheckInDue).undefined;
            expect(removed!.nextCheckInDue).undefined;
        });

        it("resumes the same wakefulness when a deleted peer registers again, and announces it", () => {
            const icd = fabricIcd();
            const fed = new Array<NodeId>();
            icd.peerFed.on(nodeId => {
                fed.push(nodeId);
            });
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
            const wakefulness = icd.wakefulnessFor(NodeId(11));
            wakefulness!.requiresAwait = true;
            icd.deletePeer(NodeId(11));

            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});

            expect(icd.wakefulnessFor(NodeId(11))).equal(wakefulness);
            expect(wakefulness!.awake.value).false;
            expect(fed).deep.equal([NodeId(11), NodeId(11)]);
        });

        it("wakefulnessFor returns undefined for unknown peer", () => {
            const icd = fabricIcd();
            expect(icd.wakefulnessFor(NodeId(99))).undefined;
        });

        it("close cancels peer wakefulness timers and clears peers", async () => {
            const icd = fabricIcd();
            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});
            const wakefulness = icd.wakefulnessFor(NodeId(11))!;
            wakefulness.requiresAwait = true;
            wakefulness.noteActive(); // arms the availability-expiry timer
            expect(wakefulness.available.value).true;

            icd.close();

            expect(icd.hasPeers).false;
            expect(icd.wakefulnessFor(NodeId(11))).undefined;

            // The expiry timer was cancelled: advancing well past the window fires no leaked callback, so the value
            // is frozen rather than flipping to false.
            await MockTime.advance(Seconds(600));
            expect(wakefulness.available.value).true;
        });

        it("peerFed emits the peer node ID on addPeer", () => {
            const icd = fabricIcd();
            const fed = new Array<NodeId>();
            icd.peerFed.on(nodeId => {
                fed.push(nodeId);
            });

            icd.addPeer({ peerNodeId: NodeId(11), key: KEY_A, counterStart: 10, lastOffset: 0 }, () => {});

            expect(fed).deep.equal([NodeId(11)]);
        });
    });
});
