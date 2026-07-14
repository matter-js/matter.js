/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerConnection } from "#peer/PeerConnection.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { MRP } from "#protocol/MRP.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Abort, Bytes, Millis, Observable, Seconds } from "@matter/general";
import { SECURE_CHANNEL_PROTOCOL_ID } from "@matter/types";

/**
 * The establishment-unresponsive signal fires once per CASE establishment attempt when the current
 * (re)transmission has retransmitted past the MRP budget ({@link MRP.MAX_TRANSMISSIONS}), meaning the peer is likely
 * unresponsive.  The underlying unbounded retransmission behavior is unchanged; this only observes it.
 */
describe("PeerConnection establishment progress", () => {
    describe("establishmentUnresponsiveDetector", () => {
        it("does not fire while the retransmission count stays within the MRP budget", () => {
            let fired = 0;
            const detect = PeerConnection.establishmentUnresponsiveDetector(() => fired++);

            for (let count = 0; count <= MRP.MAX_TRANSMISSIONS; count++) {
                detect(count);
                expect(fired).equals(0);
            }
        });

        it("fires exactly once when the count first exceeds the budget and not again while climbing", () => {
            let fired = 0;
            const detect = PeerConnection.establishmentUnresponsiveDetector(() => fired++);

            for (let count = 0; count <= MRP.MAX_TRANSMISSIONS; count++) {
                detect(count);
            }
            expect(fired).equals(0);

            detect(MRP.MAX_TRANSMISSIONS + 1);
            expect(fired).equals(1);

            detect(MRP.MAX_TRANSMISSIONS + 2);
            detect(MRP.MAX_TRANSMISSIONS + 3);
            expect(fired).equals(1);
        });

        it("re-arms when the counter resets to zero for a fresh attempt", () => {
            let fired = 0;
            const detect = PeerConnection.establishmentUnresponsiveDetector(() => fired++);

            detect(MRP.MAX_TRANSMISSIONS + 1);
            expect(fired).equals(1);

            detect(0);
            for (let count = 1; count <= MRP.MAX_TRANSMISSIONS; count++) {
                detect(count);
                expect(fired).equals(1);
            }

            detect(MRP.MAX_TRANSMISSIONS + 1);
            expect(fired).equals(2);
        });

        it("keeps an independent latch per detector instance", () => {
            let firedA = 0;
            let firedB = 0;
            const detectA = PeerConnection.establishmentUnresponsiveDetector(() => firedA++);
            const detectB = PeerConnection.establishmentUnresponsiveDetector(() => firedB++);

            detectA(MRP.MAX_TRANSMISSIONS + 1);
            expect(firedA).equals(1);
            expect(firedB).equals(0);

            detectB(MRP.MAX_TRANSMISSIONS + 1);
            expect(firedA).equals(1);
            expect(firedB).equals(1);
        });
    });

    describe("driven by a real never-acked exchange", () => {
        before(() => MockTime.enable());
        afterEach(() => MockTime.reset());

        function makeExchange(onSend: MessageExchange.SendNotifier) {
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false; // engage MRP so the send retransmits while unacked
            const session = new ProtocolMocks.NodeSession({ channel });
            return MessageExchange.initiate(
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
                { onSend },
            );
        }

        it("fires once after retransmitting past the MRP budget and never while within it", async () => {
            MockTime.reset();

            let fired = 0;
            const unresponsive = Observable<[]>();
            unresponsive.on(() => {
                fired++;
            });
            const detect = PeerConnection.establishmentUnresponsiveDetector(() => unresponsive.emit());

            const counts = new Array<number>();
            const exchange = makeExchange((_message, retransmission) => {
                counts.push(retransmission);
                detect(retransmission);
            });

            using abort = new Abort();
            // Unbounded retransmission mirrors PeerConnection's `maxInitialRetransmissions: Infinity`.
            const sendPromise = exchange.send(1, Bytes.empty, {
                requiresAck: true,
                maxRetransmissions: Infinity,
                abort,
            });

            for (let i = 0; i < 20; i++) {
                await MockTime.advance(Seconds(60));
                await MockTime.yield3();

                const maxCount = Math.max(...counts, 0);
                if (maxCount <= MRP.MAX_TRANSMISSIONS) {
                    expect(fired).equals(0);
                } else {
                    break;
                }
            }

            expect(Math.max(...counts, 0)).greaterThan(MRP.MAX_TRANSMISSIONS);
            expect(fired).equals(1);

            abort();
            await sendPromise.catch(() => {});
            await exchange.destroy();
        });
    });
});
