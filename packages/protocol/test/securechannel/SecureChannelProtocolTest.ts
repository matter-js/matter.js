/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { CheckInMessage } from "#icd/CheckInMessage.js";
import { FabricIcd } from "#icd/FabricIcd.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SecureChannelProtocol } from "#securechannel/SecureChannelProtocol.js";
import { SessionManager } from "#session/SessionManager.js";
import { Bytes, MemoryStorageDriver, StandardCrypto, StorageContext } from "@matter/general";
import { NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "@matter/types";

const crypto = new StandardCrypto();
const KEY = Bytes.fromHex("d90e13180d00baadd20cf5ed4913d3ff");

/**
 * Builds the minimal context needed to construct SecureChannelProtocol (which internally creates a CaseServer).
 * CaseServer only stores its args, so we just need a ready SessionManager.
 */
function setup() {
    const storage = new MemoryStorageDriver();
    storage.initialize();
    const fabrics = new FabricManager(crypto);
    const sessions = new SessionManager({
        fabrics,
        storage: new StorageContext(storage, ["sessions"]),
    });
    const protocol = new SecureChannelProtocol(sessions, fabrics);
    return { fabrics, sessions, protocol };
}

function fakeCheckInMessage(payload: Bytes): Message {
    return {
        packetHeader: { messageId: 42 },
        payloadHeader: {
            protocolId: SECURE_CHANNEL_PROTOCOL_ID,
            messageType: SecureMessageType.IcdCheckInMessage,
            exchangeId: 1,
            isInitiatorMessage: false,
            requiresAck: false,
            ackedMessageId: undefined,
        },
        payload,
    } as unknown as Message;
}

describe("SecureChannelProtocol — ICD Check-In routing", () => {
    it("routes a check-in to the owning fabric peer", async () => {
        const { fabrics, protocol } = setup();

        const fabric = new ProtocolMocks.Fabric();
        const received = new Array<FabricIcd.ReceivedCheckIn>();
        fabric.icd.addPeer({ peerNodeId: NodeId(11), key: KEY, counterStart: 10, lastOffset: 0 }, checkIn => {
            received.push(checkIn);
        });
        fabrics.addFabric(fabric);

        let sendCalled = false;
        const exchange = new ProtocolMocks.Exchange();
        exchange.channel.send = async () => {
            sendCalled = true;
        };

        const payload = await CheckInMessage.encodeIcd(crypto, KEY, 12, 5000);
        const message = fakeCheckInMessage(payload);

        await protocol.onNewExchange(exchange, message);

        expect(received).deep.equal([
            { peerNodeId: NodeId(11), counter: 12, activeModeThreshold: 5000, refreshNeeded: false },
        ]);
        expect(sendCalled).false;
        expect(exchange.closed.value).true;
    });

    it("silently drops a check-in matching no peer", async () => {
        const { fabrics, protocol } = setup();

        // Fabric with icdActive = false (icd never touched)
        const fabric = new ProtocolMocks.Fabric();
        fabrics.addFabric(fabric);

        let sendCalled = false;
        const exchange = new ProtocolMocks.Exchange();
        exchange.channel.send = async () => {
            sendCalled = true;
        };

        const payload = await CheckInMessage.encodeIcd(crypto, KEY, 12, 5000);
        const message = fakeCheckInMessage(payload);

        await protocol.onNewExchange(exchange, message);

        expect(sendCalled).false;
        expect(exchange.closed.value).true;
    });
});
