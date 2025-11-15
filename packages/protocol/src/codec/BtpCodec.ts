/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, DataWriter, Endian } from "#general";
import { BleError } from "../ble/Ble.js";
import { BtpProtocolError } from "../ble/BtpSessionHandler.js";

export interface BtpHandshakeRequest {
    versions: number[];
    attMtu: number;
    clientWindowSize: number;
}

export interface BtpHandshakeResponse {
    version: number;
    attMtu: number;
    windowSize: number;
}

export interface BtpPacketPayload {
    ackNumber?: number;
    sequenceNumber: number;
    messageLength?: number;
    segmentPayload?: Bytes;
}

export interface DecodedBtpPacketPayload extends BtpPacketPayload {
    segmentPayload: Bytes;
}

export interface BtpHeader {
    isHandshakeRequest: boolean;
    hasManagementOpcode: boolean;
    hasAckNumber: boolean;
    isEndingSegment: boolean;
    isContinuingSegment: boolean;
    isBeginningSegment: boolean;
}

export interface BtpPacket {
    header: BtpHeader;
    payload: BtpPacketPayload;
}

export interface DecodedBtpPacket {
    header: BtpHeader;
    payload: DecodedBtpPacketPayload;
}

export enum BtpHeaderBits {
    HandshakeBit = 0b01000000,
    ManagementMsg = 0b00100000,
    AckMsg = 0b00001000,
    EndSegment = 0b00000100,
    ContinuingSegment = 0b00000010,
    BeginSegment = 0b00000001,
}

export enum BtpOpcode {
    HandshakeManagementOpcode = 0x6c,
}

const HANDSHAKE_HEADER = 0b01100101;

export class BtpCodec {
    static decodeBtpHandshakeRequest(data: Bytes): BtpHandshakeRequest {
        const reader = new DataReader(data, Endian.Little);
        return this.decodeHandshakeRequestPayload(reader);
    }

    static decodeBtpPacket(data: Bytes): DecodedBtpPacket {
        const reader = new DataReader(data, Endian.Little);

        const header = this.decodeBtpPacketHeader(reader);

        return {
            header,
            payload: this.decodeBtpPacketPayload(reader, header),
        };
    }

    static encodeBtpPacket({ header, payload }: BtpPacket): Bytes {
        return Bytes.concat(this.encodeBtpPacketHeader(header), this.encodeBtpPacketPayload(header, payload));
    }

    static encodeBtpHandshakeRequest({ versions, attMtu, clientWindowSize }: BtpHandshakeRequest): Bytes {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(HANDSHAKE_HEADER);
        writer.writeUInt8(BtpOpcode.HandshakeManagementOpcode);
        writer.writeUInt8((versions[1] << 4) | versions[0]);
        writer.writeUInt8((versions[3] << 4) | versions[2]);
        writer.writeUInt8((versions[5] << 4) | versions[4]);
        writer.writeUInt8((versions[7] << 4) | versions[6]);
        writer.writeUInt16(attMtu);
        writer.writeUInt8(clientWindowSize);
        return writer.toByteArray();
    }

    static encodeBtpHandshakeResponse({ version, attMtu, windowSize }: BtpHandshakeResponse): Bytes {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(HANDSHAKE_HEADER);
        writer.writeUInt8(BtpOpcode.HandshakeManagementOpcode);
        writer.writeUInt8(version & 0x0f); //reserved bit and final version
        writer.writeUInt16(attMtu);
        writer.writeUInt8(windowSize);
        return writer.toByteArray();
    }

    private static decodeBtpPacketPayload(
        reader: DataReader<Endian.Little>,
        header: BtpHeader,
    ): DecodedBtpPacketPayload {
        const { hasAckNumber, isBeginningSegment } = header;
        const ackNumber = hasAckNumber ? reader.readUInt8() : undefined;
        const sequenceNumber = reader.readUInt8();
        const messageLength = isBeginningSegment ? reader.readUInt16() : undefined;
        const segmentPayload = reader.remainingBytes;

        return { ackNumber, sequenceNumber, messageLength, segmentPayload };
    }

    private static encodeBtpPacketPayload(
        { hasAckNumber, isBeginningSegment, isContinuingSegment, isEndingSegment }: BtpHeader,
        { ackNumber, sequenceNumber, messageLength, segmentPayload }: BtpPacketPayload,
    ): Bytes {
        const writer = new DataWriter(Endian.Little);

        // Validate Header against Payload fields to make sure they match together
        if (!hasAckNumber && ackNumber !== undefined) {
            throw new BtpProtocolError("Ack number shouldn't be set because header flag is not set.");
        }
        if (hasAckNumber && ackNumber === undefined) {
            throw new BtpProtocolError("Ack number needs to be set because header flag is set.");
        }
        if (isBeginningSegment && isContinuingSegment) {
            throw new BtpProtocolError("Beginning and continuing segment flags can't be set at the same time.");
        }
        if (isEndingSegment && !isContinuingSegment && !isBeginningSegment) {
            throw new BtpProtocolError("Ending segment flag can't be set without continuing segment flag.");
        }
        if (
            (isBeginningSegment || isContinuingSegment) &&
            (segmentPayload === undefined || segmentPayload.byteLength === 0)
        ) {
            throw new BtpProtocolError("Payload needs to be set because header flag indicates a message with payload.");
        }
        if (isBeginningSegment && messageLength === undefined) {
            throw new BtpProtocolError("Message length needs to be set because packet is a beginning segment.");
        }
        if (!isBeginningSegment && messageLength !== undefined) {
            throw new BtpProtocolError(
                "Message length shouldn't be set because the package is not a beginning segment.",
            );
        }

        if (ackNumber !== undefined) {
            writer.writeUInt8(ackNumber);
        }

        writer.writeUInt8(sequenceNumber);

        if (messageLength !== undefined) {
            writer.writeUInt16(messageLength);
        }

        if (segmentPayload !== undefined) {
            writer.writeByteArray(segmentPayload);
        }
        return writer.toByteArray();
    }

    private static decodeHandshakeRequestPayload(reader: DataReader<Endian.Little>): BtpHandshakeRequest {
        const header = reader.readUInt8();
        const opcode = reader.readUInt8();
        let version = reader.readUInt8();

        if (header !== HANDSHAKE_HEADER) {
            throw new BtpProtocolError("Header for expected BTP Handshake Request is incorrect.");
        }
        if (opcode !== BtpOpcode.HandshakeManagementOpcode) {
            throw new BtpProtocolError("Management Opcode for BTP Handshake Request is incorrect.");
        }

        const ver: number[] = [];
        ver[1] = (version & 0xf0) >> 4;
        ver[0] = version & 0x0f;

        version = reader.readUInt8();
        ver[3] = (version & 0xf0) >> 4;
        ver[2] = version & 0x0f;

        version = reader.readUInt8();
        ver[5] = (version & 0xf0) >> 4;
        ver[4] = version & 0x0f;

        version = reader.readUInt8();
        ver[7] = (version & 0xf0) >> 4;
        ver[6] = version & 0x0f;

        const versions = ver.filter(v => v !== 0);
        if (versions.length === 0) {
            throw new BtpProtocolError("No valid version provided.");
        }

        const attMtu = reader.readUInt16();
        const clientWindowSize = reader.readUInt8();

        return { versions, attMtu, clientWindowSize };
    }

    static decodeBtpHandshakeResponsePayload(data: Bytes): BtpHandshakeResponse {
        const reader = new DataReader(data, Endian.Little);
        const header = reader.readUInt8();
        if (header !== HANDSHAKE_HEADER) {
            throw new BtpProtocolError("Header for expected BTP Handshake Request is incorrect.");
        }

        const opcode = reader.readUInt8();
        if (opcode !== BtpOpcode.HandshakeManagementOpcode) {
            throw new BtpProtocolError("Management Opcode for BTP Handshake Request is incorrect.");
        }

        const version = reader.readUInt8() & 0x0f;
        const attMtu = reader.readUInt16();
        const windowSize = reader.readUInt8();
        return { version, attMtu, windowSize };
    }

    private static decodeBtpPacketHeader(reader: DataReader<Endian.Little>): BtpHeader {
        const headerBits = reader.readUInt8();
        const isHandshakeRequest = (headerBits & BtpHeaderBits.HandshakeBit) !== 0;
        const hasManagementOpcode = (headerBits & BtpHeaderBits.ManagementMsg) !== 0;
        const hasAckNumber = (headerBits & BtpHeaderBits.AckMsg) !== 0;
        const isEndingSegment = (headerBits & BtpHeaderBits.EndSegment) !== 0;
        const isContinuingSegment = (headerBits & BtpHeaderBits.ContinuingSegment) !== 0;
        const isBeginningSegment = (headerBits & BtpHeaderBits.BeginSegment) !== 0;

        if (hasManagementOpcode) {
            throw new BtpProtocolError("Management Opcode for BTPHandshake Request is not expected");
        }

        return {
            isHandshakeRequest,
            hasManagementOpcode,
            hasAckNumber,
            isEndingSegment,
            isContinuingSegment,
            isBeginningSegment,
        };
    }

    private static encodeBtpPacketHeader({
        isHandshakeRequest,
        hasManagementOpcode,
        hasAckNumber,
        isEndingSegment,
        isContinuingSegment,
        isBeginningSegment,
    }: BtpHeader): Bytes {
        const writer = new DataWriter(Endian.Little);

        if (isHandshakeRequest || hasManagementOpcode) {
            throw new BtpProtocolError("Please use the specific methods to encode a Handshake packet");
        }

        const header =
            // (isHandshakeRequest ? BtpHeaderBits.HandshakeBit : 0) | ... but always false here
            // (hasManagementOpcode ? BtpHeaderBits.ManagementMsg : 0) | ... but alw<ys false here
            (hasAckNumber ? BtpHeaderBits.AckMsg : 0) |
            (isEndingSegment ? BtpHeaderBits.EndSegment : 0) |
            (isContinuingSegment ? BtpHeaderBits.ContinuingSegment : 0) |
            (isBeginningSegment ? BtpHeaderBits.BeginSegment : 0);

        writer.writeUInt8(header);
        return writer.toByteArray();
    }

    static encodeBleAdvertisementData(
        discriminator: number,
        vendorId: number,
        productId: number,
        hasAdditionalAdvertisementData = false,
        isExtendedAnnouncement = false,
    ) {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(0x02);
        writer.writeUInt8(0x01);
        writer.writeUInt8(0x06);
        writer.writeUInt8(0x0b);
        writer.writeUInt8(0x16);
        writer.writeUInt16(0xfff6);
        writer.writeUInt8(0x00);
        writer.writeUInt16(discriminator);
        writer.writeUInt16(isExtendedAnnouncement ? 0 : vendorId);
        writer.writeUInt16(isExtendedAnnouncement ? 0 : productId);
        writer.writeUInt8((hasAdditionalAdvertisementData ? 1 : 0) | (isExtendedAnnouncement ? 2 : 0));
        return writer.toByteArray();
    }

    static decodeBleAdvertisementData(data: Bytes) {
        const reader = new DataReader(data, Endian.Little);
        if (
            reader.readUInt8() !== 0x02 ||
            reader.readUInt8() !== 0x01 ||
            reader.readUInt8() !== 0x06 ||
            reader.readUInt8() !== 0x0b ||
            reader.readUInt8() !== 0x16
        ) {
            throw new BleError("Invalid BLE advertisement data");
        }
        const serviceUuid = reader.readUInt16();
        if (serviceUuid !== 0xfff6) {
            throw new BleError("Invalid BLE advertisement data");
        }
        const { discriminator, vendorId, productId, hasAdditionalAdvertisementData } =
            this.decodeBleAdvertisementServiceData(reader.remainingBytes);
        return { discriminator, vendorId, productId, hasAdditionalAdvertisementData };
    }

    static decodeBleAdvertisementServiceData(data: Bytes) {
        const reader = new DataReader(data, Endian.Little);
        if (reader.readUInt8() !== 0x00) {
            throw new BleError("Invalid BLE advertisement data");
        }
        const discriminator = reader.readUInt16();
        const vendorId = reader.readUInt16();
        const productId = reader.readUInt16();
        const hasAdditionalAdvertisementData = !!reader.readUInt8();
        return { discriminator, vendorId, productId, hasAdditionalAdvertisementData };
    }
}
