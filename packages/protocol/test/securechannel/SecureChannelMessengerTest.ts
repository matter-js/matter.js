/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SecureChannelMessenger } from "#securechannel/SecureChannelMessenger.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Bytes, DataReadError, Millis, UnexpectedDataError } from "@matter/general";
import {
    SECURE_CHANNEL_PROTOCOL_ID,
    SecureMessageType,
    TlvField,
    TlvObject,
    TlvUInt8,
    ValidationOutOfBoundsError,
} from "@matter/types";

/** A messenger over an MRP session, reporting what reached the wire. */
function setup() {
    const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
    channel.isReliable = false; // MRP applies, so the R flag is meaningful
    const session = new ProtocolMocks.NodeSession({ channel });

    const sent = new Array<Message>();
    (session.channel as any).send = async (message: Message): Promise<void> => {
        sent.push(message);
    };

    const exchange = MessageExchange.initiate(
        {
            session,
            localSessionParameters: SessionParameters(SessionParameters.defaults),
            localAdditionalMrpDelay: Millis(0),
            localFixedMrpBackoff: Millis(0),
            async peerLost() {},
            retry() {},
        },
        1,
        SECURE_CHANNEL_PROTOCOL_ID,
    );

    return { messenger: new SecureChannelMessenger(exchange), sent };
}

describe("SecureChannelMessenger", () => {
    describe("status reports that must not be reliable", () => {
        it("sends Busy with the R flag clear", async () => {
            const { messenger, sent } = setup();

            await messenger.sendBusy(Millis(500));

            expect(sent.length).equals(1);
            expect(sent[0].payloadHeader.requiresAck).equals(false);
        });

        it("sends CloseSession with the R flag clear", async () => {
            const { messenger, sent } = setup();

            await messenger.sendCloseSession();

            expect(sent.length).equals(1);
            expect(sent[0].payloadHeader.requiresAck).equals(false);
        });
    });

    describe("decode", () => {
        class DecodingMessenger extends SecureChannelMessenger {
            decodeForTest = this.decode.bind(this);
        }
        const decoder = () => new DecodingMessenger(setup().messenger.exchange);

        const TlvBounded = TlvObject({ value: TlvField(1, TlvUInt8.bound({ max: 10 })) });
        const decodeAs = (value: number) => ({
            payload: TlvObject({ value: TlvField(1, TlvUInt8) }).encode({ value }),
            payloadHeader: { messageType: SecureMessageType.Sigma2 },
        });

        it("returns the decoded payload", () => {
            expect(decoder().decodeForTest(TlvBounded, decodeAs(10))).deep.equal({ value: 10 });
        });

        it("reports a schema violation as UnexpectedDataError naming message and field", () => {
            let error: unknown;
            try {
                decoder().decodeForTest(TlvBounded, decodeAs(11));
            } catch (e) {
                error = e;
            }

            expect(error).instanceOf(UnexpectedDataError);
            expect(error).property("cause").instanceOf(ValidationOutOfBoundsError);
            expect(error).property("message").contains("Malformed Sigma2 field value from peer");
        });

        it("passes other decode errors through unchanged", () => {
            expect(() =>
                decoder().decodeForTest(TlvBounded, {
                    payload: Bytes.fromHex("15"),
                    payloadHeader: { messageType: SecureMessageType.Sigma2 },
                }),
            ).throw(DataReadError);
        });
    });
});
