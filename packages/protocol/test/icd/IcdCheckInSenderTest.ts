/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckInMessage } from "#icd/CheckInMessage.js";
import { IcdCheckInSender } from "#icd/IcdCheckInSender.js";
import { Bytes, StandardCrypto } from "@matter/general";
import { FabricIndex, NodeId, SecureMessageType } from "@matter/types";

const crypto = new StandardCrypto();
const KEY = Bytes.fromHex("5a6b7c8d9e0f00112233445566778899");

describe("IcdCheckInSender", () => {
    it("sends a decodable 0x50 to the resolved address", async () => {
        const sent = new Array<{ messageType: number; payload: Bytes }>();
        const sender = new IcdCheckInSender({
            crypto,
            resolveAddress: async () => ({ type: "udp", ip: "fe80::1", port: 5540 }),
            sendUnsecured: async (_address, messageType, payload) => {
                sent.push({ messageType, payload });
                return true;
            },
        });

        const ok = await sender.send({
            fabricIndex: FabricIndex(1),
            peerNodeId: NodeId(0x1122334455667788n),
            key: KEY,
            counter: 42,
            activeModeThreshold: 4000,
        });

        expect(ok).equals(true);
        expect(sent.length).equals(1);
        expect(sent[0].messageType).equals(SecureMessageType.IcdCheckInMessage);
        const decoded = await CheckInMessage.decodeIcd(crypto, KEY, sent[0].payload);
        expect(decoded.counter).equals(42);
        expect(decoded.activeModeThreshold).equals(4000);
    });

    it("returns false and sends nothing when the address is unresolvable", async () => {
        let sends = 0;
        const sender = new IcdCheckInSender({
            crypto,
            resolveAddress: async () => undefined,
            sendUnsecured: async () => {
                sends++;
                return true;
            },
        });
        const ok = await sender.send({
            fabricIndex: FabricIndex(1),
            peerNodeId: NodeId(0x1n),
            key: KEY,
            counter: 1,
            activeModeThreshold: 4000,
        });
        expect(ok).equals(false);
        expect(sends).equals(0);
    });

    it("returns false when the send fails", async () => {
        const sender = new IcdCheckInSender({
            crypto,
            resolveAddress: async () => ({ type: "udp", ip: "fe80::1", port: 5540 }),
            sendUnsecured: async () => false,
        });
        const ok = await sender.send({
            fabricIndex: FabricIndex(1),
            peerNodeId: NodeId(0x1n),
            key: KEY,
            counter: 1,
            activeModeThreshold: 4000,
        });
        expect(ok).equals(false);
    });

    it("returns false (best-effort) when a collaborator throws", async () => {
        const sender = new IcdCheckInSender({
            crypto,
            resolveAddress: async () => ({ type: "udp", ip: "fe80::1", port: 5540 }),
            sendUnsecured: async () => {
                throw new Error("transport blew up");
            },
        });
        const ok = await sender.send({
            fabricIndex: FabricIndex(1),
            peerNodeId: NodeId(0x1n),
            key: KEY,
            counter: 1,
            activeModeThreshold: 4000,
        });
        expect(ok).equals(false);
    });
});
