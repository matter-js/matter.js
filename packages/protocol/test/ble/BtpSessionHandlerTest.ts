/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleDisconnectedError } from "#ble/Ble.js";
import { MatterBle } from "#ble/BleConsts.js";
import { BtpFlowError, BtpProtocolError, BtpSessionHandler } from "#ble/BtpSessionHandler.js";
import { BtpCodec } from "#codec/BtpCodec.js";
import { Bytes, createPromise } from "@matter/general";

describe("BtpSessionHandler", () => {
    before(MockTime.enable);

    describe("Test Handshake", () => {
        it("handles a correct Handshake", async () => {
            const handshakeRequest = Bytes.fromHex("656c04000000b90006");
            const { promise: writeBlePromise, resolver } = createPromise<Bytes>();

            let allowClose = false;
            const btpSession = await BtpSessionHandler.createFromHandshakeRequest(
                100,
                handshakeRequest,
                async dataToWrite => {
                    resolver(dataToWrite);
                },
                async () => {
                    if (!allowClose) throw new Error("Should not be called");
                },
                async _matterMessageToHandle => {
                    throw new Error("Should not be called");
                },
            );

            const result = await writeBlePromise;

            expect(result).deep.equal(Bytes.fromHex("656c04640006"));

            allowClose = true;
            await btpSession.close();
        });

        it("handles a zero attMtu in Handshake", async () => {
            const handshakeRequest = Bytes.fromHex("656c04000000000006");
            const { promise: writeBlePromise, resolver } = createPromise<Bytes>();

            let allowClose = false;
            const btpSession = await BtpSessionHandler.createFromHandshakeRequest(
                100,
                handshakeRequest,
                async dataToWrite => {
                    resolver(dataToWrite);
                },
                async () => {
                    if (!allowClose) throw new Error("Should not be called");
                },
                async _matterMessageToHandle => {
                    throw new Error("Should not be called");
                },
            );

            const result = await writeBlePromise;

            expect(result).deep.equal(Bytes.fromHex("656c04640006"));

            allowClose = true;
            await btpSession.close();
        });

        it("handles a undefined maxDataSize in Handshake", async () => {
            const handshakeRequest = Bytes.fromHex("656c04000000000006");
            const { promise: writeBlePromise, resolver } = createPromise<Bytes>();

            let allowClose = false;
            const btpSession = await BtpSessionHandler.createFromHandshakeRequest(
                undefined,
                handshakeRequest,
                async dataToWrite => {
                    resolver(dataToWrite);
                },
                async () => {
                    if (!allowClose) throw new Error("Should not be called");
                },
                async _matterMessageToHandle => {
                    throw new Error("Should not be called");
                },
            );

            const result = await writeBlePromise;

            expect(result).deep.equal(Bytes.fromHex("656c04140006"));

            allowClose = true;
            await btpSession.close();
        });

        it("Client does not share the same supported BTP version", async () => {
            const handshakeRequest = Bytes.fromHex("656c05000000000006");
            const { promise: disconnectBlePromise, resolver: disconnectBleResolver } = createPromise<void>();

            // change to expect().rejects.throw() when no longer using jasmine expect
            let error;
            try {
                const btpSession = await BtpSessionHandler.createFromHandshakeRequest(
                    100,
                    handshakeRequest,
                    () => {
                        throw new Error("Should not be called");
                    },
                    async () => {
                        disconnectBleResolver();
                    },
                    _matterMessageToHandle => {
                        throw new Error("Should not be called");
                    },
                );
                await disconnectBlePromise;

                await btpSession.close();
            } catch (e) {
                error = e;
            }
            expect(error).deep.equal(new BtpProtocolError("No supported BTP version found in 5"));
        });
    });

    describe("Test Matter Message handling", () => {
        let btpSessionHandler: BtpSessionHandler | undefined;

        let onWriteBleCallback = (_dataToWrite: Bytes): Promise<void> => {
            throw new Error("Should not be called");
        };

        let onDisconnectBleCallback = (): Promise<void> => {
            throw new Error("Should not be called");
        };

        let onHandleMatterMessageCallback = async (_matterMessage: Bytes): Promise<void> => {
            throw new Error("Should not be called");
        };

        // Each test gets his own btpSessionHandler with a successfully done handshake
        // callback can be overridden
        beforeEach(async () => {
            const { promise: localWriteBlePromise, resolver: localWriteBleResolver } = createPromise<Bytes>();

            onWriteBleCallback = async (dataToWrite: Bytes) => {
                localWriteBleResolver(dataToWrite);
            };

            const handshakeRequest = Bytes.fromHex("656c04000000b90006");

            btpSessionHandler = await BtpSessionHandler.createFromHandshakeRequest(
                20,
                handshakeRequest,
                async dataToWrite => {
                    await onWriteBleCallback(dataToWrite);
                },
                async () => {
                    await onDisconnectBleCallback();
                },
                async (matterMessage: Bytes) => {
                    await onHandleMatterMessageCallback(matterMessage);
                },
            );

            const result = await localWriteBlePromise;
            expect(result).deep.equal(Bytes.fromHex("656c04140006"));
        });

        afterEach(async () => {
            await btpSessionHandler?.close();
        });

        it("disconnect when incoming message is another handshake", async () => {
            const { promise: disconnectBlePromise, resolver: disconnectBleResolver } = createPromise<void>();

            const matterMessage = Bytes.fromHex("656c04000000b90006");

            onDisconnectBleCallback = async () => {
                disconnectBleResolver();
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage);

            await disconnectBlePromise;
        });

        it("disconnect when incoming message has management opcode", async () => {
            const { promise: disconnectBlePromise, resolver: disconnectBleResolver } = createPromise<void>();

            const matterMessage = Bytes.fromHex("0d6c04000000b90006");

            onDisconnectBleCallback = async () => {
                disconnectBleResolver();
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage);

            await disconnectBlePromise;
        });

        it("handles a correct One segment long Matter Message", async () => {
            const { promise: writeBlePromise, resolver: writeBleResolver } = createPromise<Bytes>();
            const { promise: handleMatterMessagePromise, resolver: handleMatterMessageResolver } =
                createPromise<Bytes>();

            const segmentPayload = Bytes.fromHex("010203040506070809");
            const matterMessage = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: 0,
                    sequenceNumber: 0,
                    messageLength: segmentPayload.byteLength,
                    segmentPayload,
                },
            });

            onHandleMatterMessageCallback = async (matterMessage: Bytes) => {
                handleMatterMessageResolver(matterMessage);
                await btpSessionHandler?.sendMatterMessage(Bytes.fromHex("090807060504030201"));
            };

            onWriteBleCallback = async (dataToWrite: Bytes) => {
                writeBleResolver(dataToWrite);
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage);

            const matterHandlerResult = await handleMatterMessagePromise;
            expect(matterHandlerResult).deep.equal(segmentPayload);

            const result = await writeBlePromise;
            expect(result).deep.equal(Bytes.fromHex("0d00010900090807060504030201"));
        });

        it("received bytes more than fragment size", async () => {
            const { promise: disconnectBlePromise, resolver: disconnectBleResolver } = createPromise<void>();

            const segmentPayload = Bytes.fromHex("01020304050607080901020304050607080901");
            const matterMessage = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: 0,
                    sequenceNumber: 0,
                    messageLength: segmentPayload.byteLength,
                    segmentPayload,
                },
            });

            onDisconnectBleCallback = async () => {
                disconnectBleResolver();
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage);
            await disconnectBlePromise;
        });

        it("Btp packet must not be 0", async () => {
            // change to expect().rejects.throw() when no longer using jasmine expect
            let error;
            try {
                await btpSessionHandler?.sendMatterMessage(Bytes.fromHex(""));
            } catch (e) {
                error = e;
            }
            expect(error).deep.equal(new BtpFlowError("BTP packet must not be empty"));
        });

        it("handles a correct two segment long Matter Message", async () => {
            const { promise: handleMatterMessagePromise, resolver: handleMatterMessageResolver } =
                createPromise<Bytes>();

            const segmentPayload = Bytes.fromHex("01020304050607080901020304050607");
            const segmentPayload1 = Bytes.fromHex("010203040506070809010203040506");
            const promiseResolver = new Array<Bytes>();

            const matterMessage1 = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: false,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: 0,
                    sequenceNumber: 0,
                    messageLength: segmentPayload.byteLength,
                    segmentPayload: segmentPayload1,
                },
            });
            const segmentPayload2 = Bytes.fromHex("07");
            const matterMessage2 = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: false,
                    isEndingSegment: true,
                    isContinuingSegment: true,
                    isBeginningSegment: false,
                },
                payload: {
                    sequenceNumber: 1,
                    segmentPayload: segmentPayload2,
                },
            });

            onHandleMatterMessageCallback = async (matterMessage: Bytes) => {
                handleMatterMessageResolver(matterMessage);
                await btpSessionHandler?.sendMatterMessage(Bytes.fromHex("030201090807060504030201090807060504"));
            };

            onWriteBleCallback = async (dataToWrite: Bytes) => {
                promiseResolver.push(dataToWrite);
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage1);
            await btpSessionHandler?.handleIncomingBleData(matterMessage2);

            const matterHandlerResult = await handleMatterMessagePromise;

            expect(matterHandlerResult).deep.equal(segmentPayload);
            expect(promiseResolver[0]).deep.equal(Bytes.fromHex("0901011200030201090807060504030201090807"));
            expect(promiseResolver[1]).deep.equal(Bytes.fromHex("0602060504"));
        });

        it("triggers timeout as did not send ack within 5 sec", async () => {
            const { promise: writeBlePromise, resolver: writeBleResolver } = createPromise<Bytes>();
            const { promise: handleMatterMessagePromise, resolver: handleMatterMessageResolver } =
                createPromise<Bytes>();

            const segmentPayload = Bytes.fromHex("010203040506070809");
            const matterMessage = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: 0,
                    sequenceNumber: 0,
                    messageLength: segmentPayload.byteLength,
                    segmentPayload,
                },
            });

            onHandleMatterMessageCallback = async (matterMessage: Bytes) => {
                handleMatterMessageResolver(matterMessage);
                MockTime.getTimer("Mock time", 5000, () =>
                    btpSessionHandler?.sendMatterMessage(Bytes.fromHex("090807060504030201")),
                );
            };

            onWriteBleCallback = async (dataToWrite: Bytes) => {
                writeBleResolver(dataToWrite);
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage);
            await MockTime.advance(5000);

            const result = await writeBlePromise;
            const matterHandlerResult = await handleMatterMessagePromise;

            expect(result).deep.equal(Bytes.fromHex("080001"));
            expect(matterHandlerResult).deep.equal(segmentPayload);
        });

        it("triggers timeout as did not receive ack within 15 sec", async () => {
            const { promise: disconnectBlePromise, resolver: disconnectBleResolver } = createPromise<void>();
            const { promise: handleMatterMessagePromise, resolver: handleMatterMessageResolver } =
                createPromise<Bytes>();

            const segmentPayload = Bytes.fromHex("010203040506070809");
            const matterMessage = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: false,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: undefined,
                    sequenceNumber: 0,
                    messageLength: segmentPayload.byteLength,
                    segmentPayload,
                },
            });

            onHandleMatterMessageCallback = async (matterMessage: Bytes) => {
                handleMatterMessageResolver(matterMessage);
                await btpSessionHandler?.sendMatterMessage(Bytes.fromHex("090807060504030201"));
            };

            onDisconnectBleCallback = async () => {
                disconnectBleResolver();
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage); // BLE data coming in

            await handleMatterMessagePromise; // Getting parsed and sent to Matter layer
            await MockTime.advance(15000); // now nothing happens in 15s
            await disconnectBlePromise; // disconnected because of error
        });

        it("payload size and message Length does not match", async () => {
            const { promise: disconnectBlePromise, resolver: disconnectBleResolver } = createPromise<void>();

            const segmentPayload = Bytes.fromHex("010203040506070809");
            const matterMessage = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: 0,
                    sequenceNumber: 0,
                    messageLength: 8,
                    segmentPayload,
                },
            });
            onDisconnectBleCallback = async () => {
                disconnectBleResolver();
            };

            await btpSessionHandler?.handleIncomingBleData(matterMessage);
            await disconnectBlePromise;
        });

        it("handles rounding off sequence numbers", async () => {
            const { promise: writeBlePromise, resolver: writeBleResolver } = createPromise<Bytes>();
            const { promise: handleMatterMessagePromise, resolver: handleMatterMessageResolver } =
                createPromise<Bytes>();

            for (let i = 0; i < 257; i++) {
                const segmentPayload = Bytes.fromHex("010203040506070809");

                const packet = {
                    header: {
                        isHandshakeRequest: false,
                        hasManagementOpcode: false,
                        hasAckNumber: true,
                        isEndingSegment: true,
                        isContinuingSegment: false,
                        isBeginningSegment: true,
                    },
                    payload: {
                        ackNumber: getSequenceNumber(i - 1),
                        sequenceNumber: getSequenceNumber(i - 1),
                        messageLength: segmentPayload.byteLength,
                        segmentPayload,
                    },
                };
                const matterMessage = BtpCodec.encodeBtpPacket(packet);

                onHandleMatterMessageCallback = async (matterMessage: Bytes) => {
                    handleMatterMessageResolver(matterMessage);
                    await btpSessionHandler?.sendMatterMessage(Bytes.fromHex("090807060504030201"));
                };

                onWriteBleCallback = async (dataToWrite: Bytes) => {
                    writeBleResolver(dataToWrite);
                };

                await btpSessionHandler?.handleIncomingBleData(matterMessage);
                const matterHandlerResult = await handleMatterMessagePromise;
                expect(matterHandlerResult).deep.equal(segmentPayload);

                const result = await writeBlePromise;
                expect(result).deep.equal(Bytes.fromHex("0d00010900090807060504030201"));
            }
        });

        it("write failure during sendMatterMessage does not cause unhandled rejection and resets sendInProgress", async () => {
            const { promise: secondWritePromise, resolver: secondWriteResolver } = createPromise<Bytes>();

            let callCount = 0;
            onWriteBleCallback = async (data: Bytes) => {
                callCount++;
                if (callCount === 1) {
                    throw new BleDisconnectedError("Disconnected 19");
                }
                secondWriteResolver(data);
            };

            // First send: write fails internally, sendMatterMessage must not throw
            await btpSessionHandler!.sendMatterMessage(Bytes.fromHex("090807060504030201"));

            // Second send: queue was cleared on failure so this message can be sent cleanly;
            // it also proves sendInProgress was reset
            await btpSessionHandler!.sendMatterMessage(Bytes.fromHex("0102030405060708"));

            const result = await secondWritePromise;
            expect(result).to.exist;
        });

        it("write failure during sendAckTimer does not cause unhandled rejection and does not advance prevAckedSequenceNumber", async () => {
            const segmentPayload = Bytes.fromHex("010203040506070809");
            const incomingMsg = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: {
                    ackNumber: 0,
                    sequenceNumber: 0,
                    messageLength: segmentPayload.byteLength,
                    segmentPayload,
                },
            });

            const { promise: handlePromise, resolver: handleResolver } = createPromise<void>();
            onHandleMatterMessageCallback = async () => {
                handleResolver();
            };

            let writeCount = 0;
            const { promise: finalWritePromise, resolver: finalWriteResolver } = createPromise<Bytes>();
            onWriteBleCallback = async (data: Bytes) => {
                writeCount++;
                if (writeCount === 1) {
                    throw new BleDisconnectedError("Disconnected 19");
                } // ACK timer write fails
                finalWriteResolver(data);
            };

            await btpSessionHandler!.handleIncomingBleData(incomingMsg);
            await handlePromise;

            // Advance time to trigger the sendAckTimer – write fails, must not throw
            await MockTime.advance(MatterBle.BTP_SEND_ACK_TIMEOUT);

            // Now send a Matter message; since prevAckedSequenceNumber was NOT advanced by the
            // failed ACK write, the outgoing packet must still carry the pending hasAckNumber flag
            await btpSessionHandler!.sendMatterMessage(Bytes.fromHex("090807060504030201"));

            const packet = await finalWritePromise;
            const decoded = BtpCodec.decodeBtpPacket(packet);
            expect(decoded.header.hasAckNumber).to.equal(true);
        });
    });

    describe("Test abort paths", () => {
        let btpSessionHandler: BtpSessionHandler | undefined;
        let onDisconnectBleCallback = (): Promise<void> => {
            throw new Error("Should not be called");
        };

        beforeEach(async () => {
            const { promise: writeBlePromise, resolver: writeBleResolver } = createPromise<Bytes>();
            const handshakeRequest = Bytes.fromHex("656c04000000b90006");
            btpSessionHandler = await BtpSessionHandler.createFromHandshakeRequest(
                20,
                handshakeRequest,
                async dataToWrite => writeBleResolver(dataToWrite),
                async () => await onDisconnectBleCallback(),
                async () => {
                    throw new Error("Should not be called");
                },
            );
            await writeBlePromise;
        });

        afterEach(async () => {
            onDisconnectBleCallback = () => Promise.resolve();
            await btpSessionHandler?.close();
        });

        // §4.19.4.6: a received sequence number must equal the previous + 1 (mod 256).
        it("closes the session on a sequence-number increment violation", async () => {
            const { promise: disconnectPromise, resolver: disconnectResolver } = createPromise<void>();
            onDisconnectBleCallback = async () => disconnectResolver();

            const segmentPayload = Bytes.fromHex("010203");
            const packet = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: { ackNumber: 0, sequenceNumber: 5, messageLength: segmentPayload.byteLength, segmentPayload },
            });

            await btpSessionHandler?.handleIncomingBleData(packet);
            await disconnectPromise;
        });

        // §4.19.4.8: a received ack outside the outstanding (sent-but-unacked) interval is invalid.
        it("closes the session on an out-of-window ack number", async () => {
            const { promise: disconnectPromise, resolver: disconnectResolver } = createPromise<void>();
            onDisconnectBleCallback = async () => disconnectResolver();

            const segmentPayload = Bytes.fromHex("010203");
            const packet = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: true,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                // The peripheral has only sent sequence number 0, so an ack for 5 is outside the window.
                payload: { ackNumber: 5, sequenceNumber: 0, messageLength: segmentPayload.byteLength, segmentPayload },
            });

            await btpSessionHandler?.handleIncomingBleData(packet);
            await disconnectPromise;
        });

        // §4.19.4.5: a new beginning segment while a SDU is still being reassembled is a flow error.
        it("closes the session on a beginning segment while reassembly is in progress", async () => {
            const { promise: disconnectPromise, resolver: disconnectResolver } = createPromise<void>();
            onDisconnectBleCallback = async () => disconnectResolver();

            const begin = (sequenceNumber: number) =>
                BtpCodec.encodeBtpPacket({
                    header: {
                        isHandshakeRequest: false,
                        hasManagementOpcode: false,
                        hasAckNumber: true,
                        isEndingSegment: false,
                        isContinuingSegment: false,
                        isBeginningSegment: true,
                    },
                    payload: {
                        ackNumber: 0,
                        sequenceNumber,
                        messageLength: 100,
                        segmentPayload: Bytes.fromHex("0102"),
                    },
                });

            await btpSessionHandler?.handleIncomingBleData(begin(0));
            await btpSessionHandler?.handleIncomingBleData(begin(1));
            await disconnectPromise;
        });

        // §4.19.4.5: a continuing segment without a prior beginning segment is a flow error.
        it("closes the session on a continuing segment without a beginning segment", async () => {
            const { promise: disconnectPromise, resolver: disconnectResolver } = createPromise<void>();
            onDisconnectBleCallback = async () => disconnectResolver();

            const packet = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: false,
                    isContinuingSegment: true,
                    isBeginningSegment: false,
                },
                payload: { ackNumber: 0, sequenceNumber: 0, segmentPayload: Bytes.fromHex("0102") },
            });

            await btpSessionHandler?.handleIncomingBleData(packet);
            await disconnectPromise;
        });

        // §4.19.4.5: the reassembled length must never exceed the declared message length.
        it("closes the session when continuing segments exceed the declared message length", async () => {
            const { promise: disconnectPromise, resolver: disconnectResolver } = createPromise<void>();
            onDisconnectBleCallback = async () => disconnectResolver();

            const begin = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: false,
                    isContinuingSegment: false,
                    isBeginningSegment: true,
                },
                payload: { ackNumber: 0, sequenceNumber: 0, messageLength: 3, segmentPayload: Bytes.fromHex("0102") },
            });
            const overflowing = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: false,
                    isEndingSegment: false,
                    isContinuingSegment: true,
                    isBeginningSegment: false,
                },
                payload: { sequenceNumber: 1, segmentPayload: Bytes.fromHex("030405") }, // 2 + 3 > declared 3
            });

            await btpSessionHandler?.handleIncomingBleData(begin);
            await btpSessionHandler?.handleIncomingBleData(overflowing);
            await disconnectPromise;
        });
    });

    describe("Test send-side flow control", () => {
        // A peripheral that sends before receiving any sequenced fragment must not piggyback an acknowledgement
        // (the 255 sentinel is "expecting 0 next", not a received packet).
        it("does not piggyback an ack when the peripheral sends before receiving any data", async () => {
            const writes = new Array<Bytes>();
            let onWrite = (_: Bytes) => {};
            const peripheral = await BtpSessionHandler.createFromHandshakeRequest(
                20,
                Bytes.fromHex("656c04000000b90006"),
                async data => onWrite(data),
                async () => {},
                async () => {
                    throw new Error("Should not be called");
                },
            );
            onWrite = data => {
                writes.push(data);
            };

            await peripheral.sendMatterMessage(Bytes.fromHex("0102030405"));

            expect(writes.length).equal(1);
            expect(BtpCodec.decodeBtpPacket(writes[0]).header.hasAckNumber).equal(false);

            await peripheral.close();
        });

        // §4.19.4.7: a data-only packet must not consume the remote receive window's reserved last slot;
        // it reopens only after an ack arrives.
        it("reserves the last window slot and resumes sending once an ack reopens the window", async () => {
            const writes = new Array<Bytes>();
            // Central session, negotiated window size 4, large ATT_MTU so each message is a single fragment.
            const central = await BtpSessionHandler.createAsCentral(
                Bytes.fromHex("656c04f40004"),
                async data => {
                    writes.push(data);
                },
                async () => {},
                async () => {
                    throw new Error("Should not be called");
                },
            );

            for (let i = 0; i < 6; i++) {
                await central.sendMatterMessage(Bytes.fromHex("0102030405"));
            }

            // Window size 4: three data fragments go out (seq 0,1,2); the fourth slot is reserved.
            expect(writes.length).equal(3);
            expect(writes.map(w => BtpCodec.decodeBtpPacket(w).payload.sequenceNumber)).deep.equal([0, 1, 2]);

            // Peer acknowledges up to sequence number 2, reopening the window.
            const ack = BtpCodec.encodeBtpPacket({
                header: {
                    isHandshakeRequest: false,
                    hasManagementOpcode: false,
                    hasAckNumber: true,
                    isEndingSegment: false,
                    isContinuingSegment: false,
                    isBeginningSegment: false,
                },
                payload: { ackNumber: 2, sequenceNumber: 1 },
            });
            await central.handleIncomingBleData(ack);

            // Remaining three queued messages now flush (seq 3,4,5).
            expect(writes.length).equal(6);
            expect(writes.slice(3).map(w => BtpCodec.decodeBtpPacket(w).payload.sequenceNumber)).deep.equal([3, 4, 5]);

            await central.close();
        });

        // §4.19.4.8: once our receive window shrinks to <= the immediate-ack threshold, send a stand-alone ack
        // immediately rather than waiting for the send-ack timer.
        it("sends a stand-alone ack immediately when the local receive window runs low", async () => {
            const writes = new Array<Bytes>();
            let onWrite = (_: Bytes) => {};
            const handshakeRequest = Bytes.fromHex("656c04000000b90006"); // window size 6
            const peripheral = await BtpSessionHandler.createFromHandshakeRequest(
                20,
                handshakeRequest,
                async data => onWrite(data),
                async () => {},
                async () => {
                    throw new Error("Should not be called");
                },
            );
            onWrite = data => {
                writes.push(data);
            };

            const continuing = (sequenceNumber: number) =>
                BtpCodec.encodeBtpPacket({
                    header: {
                        isHandshakeRequest: false,
                        hasManagementOpcode: false,
                        hasAckNumber: false,
                        isEndingSegment: false,
                        isContinuingSegment: sequenceNumber !== 0,
                        isBeginningSegment: sequenceNumber === 0,
                    },
                    payload: {
                        sequenceNumber,
                        messageLength: sequenceNumber === 0 ? 100 : undefined,
                        segmentPayload: Bytes.fromHex("0102"),
                    },
                });

            // Window size 6: free slots fall 5,4,3 — above threshold 2, so no ack yet.
            await peripheral.handleIncomingBleData(continuing(0));
            await peripheral.handleIncomingBleData(continuing(1));
            await peripheral.handleIncomingBleData(continuing(2));
            expect(writes.length).equal(0);

            // Fourth packet drops free slots to 2 (<= threshold): an immediate stand-alone ack is emitted.
            await peripheral.handleIncomingBleData(continuing(3));
            expect(writes.length).equal(1);
            const ack = BtpCodec.decodeBtpPacket(writes[0]);
            expect(ack.header.hasAckNumber).equal(true);
            expect(ack.payload.ackNumber).equal(3);
            expect(ack.payload.segmentPayload.byteLength).equal(0);

            await peripheral.close();
        });

        // Regression: a stand-alone ack whose write is still in flight must not let a concurrent data send
        // re-acknowledge the same sequence number (a duplicate ack is rejected by spec-compliant peers).
        it("does not duplicate an acknowledgement when a data send interleaves a pending stand-alone ack", async () => {
            const writes = new Array<Bytes>();
            let hangStandalone = false;
            let releaseStandaloneWrite: (() => void) | undefined;

            let onWrite = (_: Bytes): Promise<void> => Promise.resolve();
            const peripheral = await BtpSessionHandler.createFromHandshakeRequest(
                20,
                Bytes.fromHex("656c04000000b90006"), // window size 6
                async data => onWrite(data),
                async () => {},
                async () => {
                    throw new Error("Should not be called");
                },
            );
            onWrite = data => {
                const decoded = BtpCodec.decodeBtpPacket(data);
                writes.push(data);
                // A stand-alone ack carries no segment payload; hold its write open to force the interleave.
                if (hangStandalone && decoded.payload.segmentPayload.byteLength === 0) {
                    return new Promise<void>(resolve => {
                        releaseStandaloneWrite = resolve;
                    });
                }
                return Promise.resolve();
            };

            const continuing = (sequenceNumber: number) =>
                BtpCodec.encodeBtpPacket({
                    header: {
                        isHandshakeRequest: false,
                        hasManagementOpcode: false,
                        hasAckNumber: false,
                        isEndingSegment: false,
                        isContinuingSegment: sequenceNumber !== 0,
                        isBeginningSegment: sequenceNumber === 0,
                    },
                    payload: {
                        sequenceNumber,
                        messageLength: sequenceNumber === 0 ? 100 : undefined,
                        segmentPayload: Bytes.fromHex("0102"),
                    },
                });

            // Drop the local receive window to the immediate-ack threshold without completing a message.
            await peripheral.handleIncomingBleData(continuing(0));
            await peripheral.handleIncomingBleData(continuing(1));
            await peripheral.handleIncomingBleData(continuing(2));
            expect(writes.length).equal(0);

            // The fourth packet triggers a stand-alone ack whose write we hold open.
            hangStandalone = true;
            const incoming = peripheral.handleIncomingBleData(continuing(3));
            await Promise.resolve();
            expect(writes.length).equal(1); // the stand-alone ack (still in flight)
            expect(BtpCodec.decodeBtpPacket(writes[0]).payload.ackNumber).equal(3);

            // While the ack write is pending, send a data message: it must not re-ack sequence number 3.
            const sending = peripheral.sendMatterMessage(Bytes.fromHex("0a0b0c"));
            await Promise.resolve();

            const dataPacket = BtpCodec.decodeBtpPacket(writes[writes.length - 1]);
            expect(dataPacket.payload.segmentPayload.byteLength).greaterThan(0); // it is the data packet
            expect(dataPacket.header.hasAckNumber).equal(false);

            releaseStandaloneWrite?.();
            await incoming;
            await sending;

            await peripheral.close();
        });

        // §4.19.4.6 + the window guard: outstanding packets that span the 255 -> 0 wrap must be counted by
        // modular distance, so the window neither over-sends nor stalls across the boundary.
        it("transfers many messages correctly while sequence numbers wrap", async () => {
            let peripheral: BtpSessionHandler;
            let central: BtpSessionHandler;
            const received = new Array<Bytes>();
            let centralClosed = false;
            let peripheralClosed = false;

            const { promise: responsePromise, resolver: responseResolver } = createPromise<Bytes>();
            let peripheralReady = false;
            peripheral = await BtpSessionHandler.createFromHandshakeRequest(
                244,
                BtpCodec.encodeBtpHandshakeRequest({ versions: [4], attMtu: 247, clientWindowSize: 8 }),
                async data => {
                    if (!peripheralReady) {
                        responseResolver(data);
                    } else {
                        await central.handleIncomingBleData(data);
                    }
                },
                async () => {
                    peripheralClosed = true;
                },
                async message => {
                    received.push(message);
                },
            );
            const handshakeResponse = await responsePromise;
            peripheralReady = true;

            central = await BtpSessionHandler.createAsCentral(
                handshakeResponse,
                async data => await peripheral.handleIncomingBleData(data),
                async () => {
                    centralClosed = true;
                },
                async () => {
                    throw new Error("Should not be called");
                },
            );

            // Send enough single-fragment messages that the central's sequence number wraps past 255.
            const messages = new Array<Bytes>();
            for (let i = 0; i < 270; i++) {
                const message = Bytes.fromHex("aa" + i.toString(16).padStart(4, "0"));
                messages.push(message);
                await central.sendMatterMessage(message);
            }

            expect(centralClosed).equal(false);
            expect(peripheralClosed).equal(false);
            expect(received.length).equal(messages.length);
            expect(received).deep.equal(messages);

            await central.close();
            await peripheral.close();
        });
    });

    // A single message whose fragment count exceeds the window must stall mid-message and resume once the
    // peer acks, without losing or duplicating any fragment.
    it("resumes a single multi-fragment message that stalls mid-message", async () => {
        let peripheral: BtpSessionHandler;
        let central: BtpSessionHandler;
        const received = new Array<Bytes>();
        let peripheralReady = false;
        const { promise: responsePromise, resolver: responseResolver } = createPromise<Bytes>();

        peripheral = await BtpSessionHandler.createFromHandshakeRequest(
            23, // small ATT_MTU => small fragment size => many fragments per message
            BtpCodec.encodeBtpHandshakeRequest({ versions: [4], attMtu: 23, clientWindowSize: 4 }),
            async data => {
                if (!peripheralReady) {
                    responseResolver(data);
                } else {
                    await central.handleIncomingBleData(data);
                }
            },
            async () => {},
            async message => {
                received.push(message);
            },
        );
        const handshakeResponse = await responsePromise;
        peripheralReady = true;

        central = await BtpSessionHandler.createAsCentral(
            handshakeResponse,
            async data => await peripheral.handleIncomingBleData(data),
            async () => {},
            async () => {
                throw new Error("Should not be called");
            },
        );

        const message = Bytes.fromHex("aabbccdd".repeat(50)); // 200 bytes, far exceeds window * fragment size
        await central.sendMatterMessage(message);

        expect(received.length).equal(1);
        expect(received[0]).deep.equal(message);

        await central.close();
        await peripheral.close();
    });

    describe("Test ATT_MTU fragment derivation", () => {
        // §4.19.3.1.4: the BTP segment size is the negotiated ATT_MTU minus the 3-byte GATT header,
        // clamped to the supported range.
        it("derives the segment size as ATT_MTU - 3 within the supported range", () => {
            expect(MatterBle.btpSegmentSizeFromAttMtu(100)).equal(97);
            expect(MatterBle.btpSegmentSizeFromAttMtu(247)).equal(MatterBle.MAXIMUM_BTP_MTU);
            expect(MatterBle.btpSegmentSizeFromAttMtu(500)).equal(MatterBle.MAXIMUM_BTP_MTU);
            expect(MatterBle.btpSegmentSizeFromAttMtu(23)).equal(MatterBle.MINIMUM_ATT_MTU);
            expect(MatterBle.btpSegmentSizeFromAttMtu(10)).equal(MatterBle.MINIMUM_ATT_MTU);
            expect(MatterBle.btpSegmentSizeFromAttMtu(0)).equal(MatterBle.MINIMUM_ATT_MTU);
        });
    });
});

function getSequenceNumber(sequenceNumber: number) {
    sequenceNumber++;
    if (sequenceNumber > 255) {
        sequenceNumber = 0;
    }
    return sequenceNumber;
}
