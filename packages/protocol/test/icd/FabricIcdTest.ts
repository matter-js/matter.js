/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckInMessage } from "#icd/CheckInMessage.js";
import { FabricIcd } from "#icd/FabricIcd.js";
import { Bytes, StandardCrypto } from "@matter/general";
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
            expect(received).deep.equal([
                { peerNodeId: NodeId(11), counter: 12, activeModeThreshold: 5000, refreshNeeded: false },
            ]);
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
});
