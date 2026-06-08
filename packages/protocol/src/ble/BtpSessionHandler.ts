/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, Diagnostic, Endian, Logger, MatterError, Observable, Time } from "@matter/general";
import { BtpCodec } from "../codec/BtpCodec.js";
import { BleDisconnectedError } from "./Ble.js";
import { MatterBle } from "./BleConsts.js";

export class BtpMatterError extends MatterError {}
export class BtpProtocolError extends BtpMatterError {}
export class BtpFlowError extends BtpMatterError {}

const MAXIMUM_SEQUENCE_NUMBER = 255;

const logger = Logger.get("BtpSessionHandler");

export class BtpSessionHandler {
    private currentIncomingSegmentedMsgLength: number | undefined;
    private currentIncomingSegmentedPayload: Bytes | undefined;
    private prevIncomingSequenceNumber = 255; // Incoming Sequence Number received. Set to 255 to start at 0
    private prevIncomingAckNumber = -1; // Previous ackNumber received
    private readonly ackReceiveTimer = Time.getTimer("BTP ack timeout", MatterBle.BTP_ACK_TIMEOUT, () =>
        this.btpAckTimeoutTriggered(),
    );

    private sequenceNumber = 0; // Sequence number is set to 0 already for the handshake, next sequence number is 1
    private prevAckedSequenceNumber = -1; // Previous (outgoing) Acked Sequence Number
    private readonly queuedOutgoingMatterMessages = new Array<DataReader<Endian.Little>>();
    private sendInProgress = false;
    private readonly sendAckTimer = Time.getTimer("BTP send timeout", MatterBle.BTP_SEND_ACK_TIMEOUT, () =>
        this.btpSendAckTimeoutTriggered(),
    );
    private isActive = true;
    private idleTimeout = Time.getTimer("Central Device Idle Timer", MatterBle.BTP_CONN_IDLE_TIMEOUT, async () => {
        logger.info("Central Device Connection Idle Timer expired, closing BTP session");
        await this.close();
    });
    readonly #closed = Observable<[]>();

    /** Emitted exactly once when the session transitions to closed. */
    get closed() {
        return this.#closed;
    }

    /** Factory method to create a new BTPSessionHandler from a received handshake request */
    static async createFromHandshakeRequest(
        maxDataSize: number | undefined,
        handshakeRequestPayload: Bytes,
        writeBleCallback: (data: Bytes) => Promise<void>,
        disconnectBleCallback: () => Promise<void>,
        handleMatterMessagePayload: (data: Bytes) => Promise<void>,
    ): Promise<BtpSessionHandler> {
        // Decode handshake request
        const handshakeRequest = BtpCodec.decodeBtpHandshakeRequest(handshakeRequestPayload);

        const {
            versions,
            attMtu: handshakeMtu, // Number excluding 3 header bytes
            clientWindowSize,
        } = handshakeRequest;
        logger.debug(`Received BTP handshake request:`, Diagnostic.dict({ maxDataSize, ...handshakeRequest }));

        // Verify handshake request and choose the highest supported version for both parties
        const version = MatterBle.BTP_SUPPORTED_VERSIONS.find(version => versions.includes(version));
        if (version === undefined) {
            await disconnectBleCallback();
            throw new BtpProtocolError(`No supported BTP version found in ${versions}`);
        }

        let attMtu = MatterBle.MINIMUM_ATT_MTU;
        if (maxDataSize !== undefined) {
            if (maxDataSize > MatterBle.MINIMUM_ATT_MTU) {
                if (handshakeMtu <= MatterBle.MINIMUM_ATT_MTU) {
                    attMtu = Math.min(maxDataSize, MatterBle.MAXIMUM_BTP_MTU);
                } else {
                    attMtu = Math.min(handshakeMtu, maxDataSize, MatterBle.MAXIMUM_BTP_MTU);
                }
            }
        }

        const fragmentSize = attMtu; // The attMtu is the maximum size of a single ATT packet, so use as fragmentSize
        const windowSize = Math.min(MatterBle.BTP_MAXIMUM_WINDOW_SIZE, clientWindowSize);

        // Generate and send out handshake response
        const handshakeResponse = BtpCodec.encodeBtpHandshakeResponse({
            version,
            attMtu,
            windowSize,
        });

        logger.debug(
            `Sending BTP handshake response:`,
            Diagnostic.dict({
                version,
                attMtu,
                windowSize,
            }),
        );

        const btpSession = new BtpSessionHandler(
            "peripheral",
            version,
            fragmentSize,
            windowSize,
            writeBleCallback,
            disconnectBleCallback,
            handleMatterMessagePayload,
        );

        await writeBleCallback(handshakeResponse);

        return btpSession;
    }

    static async createAsCentral(
        handshakeResponsePayload: Bytes,
        writeBleCallback: (data: Bytes) => Promise<void>,
        disconnectBleCallback: () => Promise<void>,
        handleMatterMessagePayload: (data: Bytes) => Promise<void>,
    ) {
        const handshakeRequest = BtpCodec.decodeBtpHandshakeResponsePayload(handshakeResponsePayload);

        logger.debug("Handshake request", Diagnostic.dict(handshakeRequest));

        const { version, attMtu: handshakeMtu, windowSize } = handshakeRequest;
        const fragmentSize = Math.min(handshakeMtu, MatterBle.MAXIMUM_BTP_MTU);

        return new BtpSessionHandler(
            "central",
            version,
            fragmentSize,
            windowSize,
            writeBleCallback,
            disconnectBleCallback,
            handleMatterMessagePayload,
        );
    }

    /**
     * Creates a new BTP session handler
     *
     * @param role The role of the BTP session handler
     * @param btpVersion The BTP protocol version to use
     * @param fragmentSize The fragment size to use for the messages
     * @param clientWindowSize The client window size to use
     * @param writeBleCallback Callback to write data to the BLE transport
     * @param disconnectBleCallback Callback to disconnect the BLE transport
     * @param handleMatterMessagePayload Callback to handle a Matter message payload
     */
    constructor(
        private readonly role: "central" | "peripheral",
        btpVersion: number,
        private readonly fragmentSize: number,
        private readonly clientWindowSize: number,
        private readonly writeBleCallback: (data: Bytes) => Promise<void>,
        private readonly disconnectBleCallback: () => Promise<void>,
        private readonly handleMatterMessagePayload: (data: Bytes) => Promise<void>,
    ) {
        if (btpVersion !== 4) {
            throw new BtpProtocolError(`Unsupported BTP version ${btpVersion}`);
        }
        if (role === "peripheral") {
            // No sequenced packet has been received yet (the handshake request is unsequenced), so there is
            // nothing to acknowledge until the first fragment arrives.
            this.prevAckedSequenceNumber = this.prevIncomingSequenceNumber;
            this.ackReceiveTimer.start();
        } else {
            this.sendAckTimer.start();
            this.prevIncomingSequenceNumber = 0;
            this.prevIncomingAckNumber = -1;
            this.sequenceNumber = -1; // First sequence number needs to be 0
        }
    }

    /**
     * Handle incoming data from the transport layer and hand over completely received matter messages to the
     * ExchangeManager layer
     *
     * @param data ByteArray containing the data
     */
    public async handleIncomingBleData(data: Bytes) {
        if (!this.isActive) {
            logger.debug(`BTP session is not active, ignoring incoming BLE data`);
            return;
        }
        try {
            if (data.byteLength > this.fragmentSize) {
                // Apple seems to interpret the ATT_MTU as the maximum size of a single ATT packet
                if (data.byteLength > this.fragmentSize + 3) {
                    throw new BtpProtocolError(
                        `Received data ${data.byteLength} bytes exceeds fragment size of ${this.fragmentSize} bytes`,
                    );
                } else {
                    logger.warn(
                        `Received data ${data.byteLength} bytes exceeds fragment size of ${this.fragmentSize} bytes, still accepting`,
                    );
                }
            }
            const btpPacket = BtpCodec.decodeBtpPacket(data);
            logger.debug(`Received BTP packet: ${Diagnostic.json(btpPacket)}`);
            const {
                header: {
                    hasAckNumber,
                    isHandshakeRequest,
                    hasManagementOpcode,
                    isEndingSegment,
                    isBeginningSegment,
                    isContinuingSegment,
                },
                payload: { ackNumber, sequenceNumber, messageLength, segmentPayload },
            } = btpPacket;

            if (isHandshakeRequest || hasManagementOpcode) {
                throw new BtpProtocolError("BTP packet must not be a handshake request or have a management opcode.");
            }
            if (segmentPayload.byteLength === 0 && !hasAckNumber) {
                throw new BtpProtocolError("BTP packet must have a segment payload or an ack number.");
            }

            if (sequenceNumber !== (this.prevIncomingSequenceNumber + 1) % 256) {
                logger.debug(
                    `sequenceNumber : ${sequenceNumber}, prevClientSequenceNumber : ${this.prevIncomingSequenceNumber}`,
                );
                throw new BtpProtocolError("Expected and actual BTP packets sequence number does not match");
            }
            this.prevIncomingSequenceNumber = sequenceNumber;

            if (!this.sendAckTimer.isRunning) {
                this.sendAckTimer.start();
            }

            if (hasAckNumber && ackNumber !== undefined) {
                // A valid ack falls within the outstanding (sent-but-unacknowledged) interval
                // (prevIncomingAckNumber, sequenceNumber], compared as a wrap-safe modular distance.
                const outstanding = this.modularDistance(this.prevIncomingAckNumber, this.sequenceNumber);
                if (this.modularDistance(this.prevIncomingAckNumber, ackNumber) > outstanding) {
                    throw new BtpProtocolError(
                        `Invalid Ack Number, Ack Number: ${ackNumber}, Sequence Number: ${this.sequenceNumber}, Previous AckNumber: ${this.prevIncomingAckNumber}`,
                    );
                }

                // for valid ack, stop timer and update prevIncomingAckNumber
                this.ackReceiveTimer.stop();
                this.prevIncomingAckNumber = ackNumber;

                // if still waiting for ack for sequence number restart timer
                if (ackNumber !== this.sequenceNumber) {
                    this.ackReceiveTimer.start();
                }
            }

            // Set or add the payload to the current incoming segmented payload
            if (isBeginningSegment) {
                if (this.currentIncomingSegmentedPayload !== undefined) {
                    throw new BtpProtocolError(
                        `BTP message flow error! New beginning packet was received without previous message being completed.`,
                    );
                }
                this.currentIncomingSegmentedMsgLength = messageLength;
                this.currentIncomingSegmentedPayload = segmentPayload;
            } else if (isContinuingSegment || isEndingSegment) {
                if (this.currentIncomingSegmentedPayload === undefined) {
                    throw new BtpProtocolError(`BTP Continuing or ending packet received without beginning packet.`);
                }
                if (segmentPayload.byteLength === 0) {
                    throw new BtpProtocolError(`BTP Continuing or ending packet received without payload.`);
                }
                const reassembledLength = this.currentIncomingSegmentedPayload.byteLength + segmentPayload.byteLength;
                if (
                    this.currentIncomingSegmentedMsgLength !== undefined &&
                    reassembledLength > this.currentIncomingSegmentedMsgLength
                ) {
                    throw new BtpProtocolError(
                        `BTP reassembled length ${reassembledLength} exceeds declared message length ${this.currentIncomingSegmentedMsgLength}`,
                    );
                }
                this.currentIncomingSegmentedPayload = Bytes.concat(
                    this.currentIncomingSegmentedPayload,
                    segmentPayload,
                );
            }

            if (isEndingSegment) {
                if (
                    this.currentIncomingSegmentedMsgLength === undefined ||
                    this.currentIncomingSegmentedPayload === undefined
                ) {
                    throw new BtpProtocolError("BTP beginning packet missing but ending packet received.");
                }
                if (this.currentIncomingSegmentedPayload.byteLength !== this.currentIncomingSegmentedMsgLength) {
                    throw new BtpProtocolError(
                        `BTP packet payload length does not match message length: ${this.currentIncomingSegmentedPayload.byteLength} !== ${this.currentIncomingSegmentedMsgLength}`,
                    );
                }

                const payloadToProcess = this.currentIncomingSegmentedPayload;
                this.currentIncomingSegmentedMsgLength = undefined;
                this.currentIncomingSegmentedPayload = undefined; // resetting current segment Payload to empty byte array

                // Hand over the resulting Matter message to ExchangeManager via the callback
                await this.handleMatterMessagePayload(payloadToProcess);
            }

            // A received ack may have reopened the remote window, so flush any queued fragments that were
            // previously held back; the ack pending for this packet piggybacks on them.
            await this.processSendQueue();

            // Otherwise, if nothing is queued to piggyback on and our receive window has run low, ack proactively.
            await this.sendImmediateAckIfWindowLow();
        } catch (error) {
            logger.warn(`Error while handling incoming BTP data:`, error);
            await this.close();

            // If no BTP protocol error, rethrow
            BtpProtocolError.accept(error);
        }
    }

    /**
     * Send a Matter message to the transport layer, but before that encode it into a BTP packet and potentially split
     * it into multiple segments. This Method is indirectly called by the ExchangeManager layer when a Matter message
     * should be sent.
     *
     * @param data ByteArray containing the Matter message
     */
    public async sendMatterMessage(data: Bytes) {
        if (!this.isActive) {
            throw new BtpFlowError("BTP session is not active");
        }
        logger.debug(`Got Matter message to send via BLE transport: ${Bytes.toHex(data)}`);

        if (data.byteLength === 0) {
            throw new BtpFlowError("BTP packet must not be empty");
        }
        const dataReader = new DataReader(data, Endian.Little);
        this.queuedOutgoingMatterMessages.push(dataReader);
        await this.processSendQueue();
    }

    private async processSendQueue() {
        if (this.sendInProgress) return;

        if (this.queuedOutgoingMatterMessages.length === 0) return;

        this.sendInProgress = true;

        while (this.queuedOutgoingMatterMessages.length > 0) {
            //checks if last ack number sent < ack number to be sent
            const hasAckNumber = this.prevIncomingSequenceNumber !== this.prevAckedSequenceNumber;

            // §4.19.4.7: stop if the remote receive window is full, or if only the reserved last slot is free
            // and this data fragment would not carry an acknowledgement to fill it.
            if (!this.canSend(hasAckNumber)) {
                break;
            }

            if (hasAckNumber) {
                this.sendAckTimer.stop();
            }

            const currentProcessedMessage = this.queuedOutgoingMatterMessages[0];
            const remainingMessageLength = currentProcessedMessage.remainingBytesCount;

            logger.debug(
                "Sending BTP fragment: ",
                Diagnostic.dict({
                    fullMessageLength: currentProcessedMessage.length,
                    remainingLengthInBytes: remainingMessageLength,
                }),
            );

            const isBeginningSegment = remainingMessageLength === currentProcessedMessage.length;

            // Calculate Header Size - faster than encoding and checking length
            const btpHeaderLength = 2 + (isBeginningSegment ? 2 : 0) + (hasAckNumber ? 1 : 0); // 2(flags, sequenceNumber) + 2(beginning) + 1(ackNumber)

            const isEndingSegment = remainingMessageLength <= this.fragmentSize - btpHeaderLength;

            const packetHeader = {
                isHandshakeRequest: false,
                hasManagementOpcode: false,
                hasAckNumber,
                isBeginningSegment,
                isContinuingSegment: !isBeginningSegment,
                isEndingSegment,
            };

            logger.debug(
                `Take up to ${
                    this.fragmentSize - btpHeaderLength
                } bytes from Rest of message: ${remainingMessageLength}`,
            );

            const segmentPayload = currentProcessedMessage.readByteArray(this.fragmentSize - btpHeaderLength);

            const btpPacket = {
                header: packetHeader,
                payload: {
                    ackNumber: hasAckNumber ? this.prevIncomingSequenceNumber : undefined,
                    sequenceNumber: this.getNextSequenceNumber(),
                    messageLength: packetHeader.isBeginningSegment ? remainingMessageLength : undefined, // remainingMessageLength if the fill length on beginning packet
                    segmentPayload,
                },
            };

            logger.debug(`Sending BTP packet: ${Diagnostic.json(btpPacket)}`);
            const packet = BtpCodec.encodeBtpPacket(btpPacket);
            logger.debug(`Sending BTP packet raw: ${Bytes.toHex(packet)}`);

            try {
                await this.writeBleCallback(packet);
            } catch (error) {
                // Only silently absorb BleDisconnectedError (expected during peripheral disconnect).
                // Clear the queue to avoid malformed state from partially-consumed DataReaders.
                // Any other error is unexpected and is rethrown so the session can handle it.
                BleDisconnectedError.accept(error);
                logger.debug("BTP packet send failed because BLE is disconnected", Diagnostic.errorMessage(error));
                this.queuedOutgoingMatterMessages.length = 0;
                this.sendInProgress = false;
                return;
            }
            // Update ACK bookkeeping only after the packet was sent successfully
            if (hasAckNumber) {
                this.prevAckedSequenceNumber = this.prevIncomingSequenceNumber;
            }

            if (!this.ackReceiveTimer.isRunning) {
                this.ackReceiveTimer.start(); // starts the timer
            }
            if (this.role === "central") {
                // Restart idle timer when sending unique data
                if (this.idleTimeout.isRunning) {
                    this.idleTimeout.stop();
                }
                this.idleTimeout.start();
            }

            // Remove the message from the queue if it is the last segment
            if (isEndingSegment) {
                this.queuedOutgoingMatterMessages.shift();
            }
        }
        this.sendInProgress = false;
    }

    /**
     * Close the BTP session. This method is called when the BLE transport is disconnected and so the BTP session gets closed.
     */
    public async close() {
        this.sendAckTimer.stop();
        this.ackReceiveTimer.stop();
        this.idleTimeout.stop();
        if (this.isActive) {
            logger.debug(`Closing BTP session`);
            this.isActive = false;
            try {
                await this.disconnectBleCallback();
            } finally {
                // Session is logically closed regardless of transport-level cleanup failure.
                // Downstream consumers (e.g. PASE force-close on BLE loss) must observe this.
                this.#closed.emit();
            }
        }
    }

    /**
     * If this timer expires and the peer has a pending acknowledgement, the peer SHALL immediately send that
     * acknowledgement
     */
    private async btpSendAckTimeoutTriggered() {
        if (!this.isActive) return;
        await this.sendStandaloneAck();
    }

    /**
     * §4.19.4.8: send a pending acknowledgement immediately, ahead of the send-ack timer, once our receive window
     * has shrunk to the immediate-ack threshold. Skipped when an outgoing message is queued, since that fragment
     * will piggyback the acknowledgement.
     */
    private async sendImmediateAckIfWindowLow() {
        if (this.queuedOutgoingMatterMessages.length > 0 || this.sendInProgress) return;
        if (this.localWindowFreeSlots() > MatterBle.BTP_IMMEDIATE_ACK_WINDOW_THRESHOLD) return;
        await this.sendStandaloneAck();
    }

    /** Send a stand-alone acknowledgement packet if one is pending. */
    private async sendStandaloneAck() {
        if (this.prevIncomingSequenceNumber === this.prevAckedSequenceNumber) return;
        logger.debug(`Sending BTP ACK for sequence number ${this.prevIncomingSequenceNumber}`);
        const btpPacket = {
            header: {
                isHandshakeRequest: false,
                hasManagementOpcode: false,
                hasAckNumber: true,
                isBeginningSegment: false,
                isContinuingSegment: false,
                isEndingSegment: false,
            },
            payload: {
                ackNumber: this.prevIncomingSequenceNumber,
                sequenceNumber: this.getNextSequenceNumber(),
            },
        };
        const packet = BtpCodec.encodeBtpPacket(btpPacket);
        try {
            await this.writeBleCallback(packet);
        } catch (error) {
            // Only silently absorb BleDisconnectedError (expected during peripheral disconnect).
            // Any other error is unexpected and is rethrown so the session can handle it.
            BleDisconnectedError.accept(error);
            logger.debug("BTP ACK send failed because BLE is disconnected", Diagnostic.errorMessage(error));
            return;
        }
        this.sendAckTimer.stop();
        this.prevAckedSequenceNumber = this.prevIncomingSequenceNumber;
        if (!this.ackReceiveTimer.isRunning) {
            this.ackReceiveTimer.start(); // starts the timer
        }
    }

    /**
     * If a peer’s acknowledgement-received timer expires, or if a peer receives an invalid acknowledgement,
     * the peer SHALL close the BTP session and report an error to the application.
     */
    private async btpAckTimeoutTriggered() {
        if (this.prevIncomingAckNumber !== this.sequenceNumber) {
            logger.warn("Acknowledgement for the sent sequence number was not received ... disconnect");
            await this.close();
        }
    }

    /**
     * Increments sequence number for the packets and round it off to 0 when it reaches the maximum limit.
     */
    getNextSequenceNumber() {
        this.sequenceNumber++;
        if (this.sequenceNumber > MAXIMUM_SEQUENCE_NUMBER) {
            this.sequenceNumber = 0;
        }
        return this.sequenceNumber;
    }

    /**
     * Wrap-safe forward distance between two sequence numbers (modulo 256). The -1 "nothing yet" sentinels map
     * to 255, so callers must keep those sentinels distinct from a real sequence number 255 (true today because
     * sequence numbers start at 0 and a session never has 256 outstanding packets).
     */
    private modularDistance(from: number, to: number): number {
        return (((to - from) % 256) + 256) % 256;
    }

    /**
     * Free slots remaining in the remote peer's receive window: the negotiated window size minus the number of
     * sent-but-unacknowledged packets. Gates our sending (§4.19.4.7). Mirrors CHIP's mRemoteReceiveWindowSize.
     */
    private remoteWindowFreeSlots(): number {
        return this.clientWindowSize - this.modularDistance(this.prevIncomingAckNumber, this.sequenceNumber);
    }

    /**
     * Free slots remaining in our own receive window: the negotiated window size minus the number of
     * received-but-unacknowledged packets. Drives proactive acknowledgement (§4.19.4.8). Mirrors CHIP's
     * mLocalReceiveWindowSize.
     */
    private localWindowFreeSlots(): number {
        return (
            this.clientWindowSize - this.modularDistance(this.prevAckedSequenceNumber, this.prevIncomingSequenceNumber)
        );
    }

    /**
     * Whether a packet may be sent now without violating the remote receive window rules. A packet carrying an
     * acknowledgement may use the last open slot; a data-only packet must leave it free (§4.19.4.7).
     */
    private canSend(carriesAck: boolean): boolean {
        const free = this.remoteWindowFreeSlots();
        if (free <= 0) return false;
        if (free <= MatterBle.BTP_WINDOW_NO_ACK_SEND_THRESHOLD && !carriesAck) return false;
        return true;
    }
}
