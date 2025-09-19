/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, DataWriter, Endian } from "#general";
import { GeneralStatusCode, Schema, VendorId } from "#types";

export type ProtocolStatusMessage<T> = {
    generalStatus: GeneralStatusCode;
    protocolId: number;
    vendorId: VendorId;
    protocolStatus: T;
    protocolData?: Bytes;
};

export abstract class ProtocolStatusMessageSchema<T extends ProtocolStatusMessage<any>> extends Schema<T> {
    #protocolId: number;
    #vendorId: number;
    #protocolSpecificDataAllowed: boolean;

    constructor(protocol: number | { protocolId: number; vendorId: number }, protocolSpecificDataAllowed = true) {
        super();
        if (typeof protocol === "number") {
            this.#protocolId = protocol;
            this.#vendorId = 0;
        } else {
            this.#protocolId = protocol.protocolId;
            this.#vendorId = protocol.vendorId;
        }
        this.#protocolSpecificDataAllowed = protocolSpecificDataAllowed;
    }

    override encode(message: Omit<T, "protocolId" | "vendorId">): Bytes {
        return super.encode({ ...message, protocolId: this.#protocolId, vendorId: this.#vendorId } as T);
    }

    encodeInternal({ generalStatus, protocolStatus, protocolId, protocolData, vendorId }: T) {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt16(generalStatus);
        writer.writeUInt32((vendorId << 16) | protocolId);
        writer.writeUInt16(protocolStatus);
        if (this.#protocolSpecificDataAllowed && protocolData !== undefined && protocolData.byteLength > 0) {
            writer.writeByteArray(protocolData);
        }
        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes) {
        const reader = new DataReader(bytes, Endian.Little);
        const generalStatus = reader.readUInt16();
        const vendorProtocolId = reader.readUInt32();
        const protocolStatus = reader.readUInt16();
        const protocolData = reader.remainingBytesCount > 0 ? reader.remainingBytes : undefined;

        const protocolId = vendorProtocolId & 0xffff;
        const vendorId = VendorId(vendorProtocolId >>> 16);
        return {
            generalStatus,
            protocolId,
            protocolStatus,
            protocolData,
            vendorId,
        } as unknown as T;
    }
}
