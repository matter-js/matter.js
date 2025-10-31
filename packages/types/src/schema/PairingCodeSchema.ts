/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, deepCopy, ImplementationError, UnexpectedDataError, Verhoeff } from "#general";
import { VendorId } from "../datatype/VendorId.js";
import { TlvAny } from "../tlv/TlvAny.js";
import { TlvType } from "../tlv/TlvCodec.js";
import { TlvUInt16, TlvUInt32, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvSchema } from "../tlv/TlvSchema.js";
import { TlvByteString, TlvString } from "../tlv/TlvString.js";
import { Base38 } from "./Base38Schema.js";
import {
    BitField,
    BitFieldEnum,
    BitFlag,
    BitmapSchema,
    ByteArrayBitmapSchema,
    TypeFromBitmapSchema,
} from "./BitmapSchema.js";
import { Schema } from "./Schema.js";

/** See {@link MatterSpecification.v13.Core} § 5.1.3.1 Table 38 */
export enum CommissioningFlowType {
    /** When not commissioned, the device always enters commissioning mode upon power-up. */
    Standard = 0,

    /** User action required to enter commissioning mode. */
    UserIntent = 1,

    /** Interaction with a vendor-specified means is needed before commissioning. */
    Custom = 2,
}

/** See {@link MatterSpecification.v13.Core} § 5.1.3.1 Table 39 */
export const DiscoveryCapabilitiesBitmap = {
    /**
     * BLE
     * * Set when device supports BLE for discovery when not commissioned.
     * * Not-Set when device does not support BLE for discovery or is currently commissioned into one or more fabrics.
     */
    ble: BitFlag(1),

    /**
     * On the IP network
     * * Set when device is already on the IP network.
     */
    onIpNetwork: BitFlag(2),

    /**
     * Wi-Fi Public Action Frame
     * * Set when device supports Wi-Fi Public Action Frame for discovery when not commissioned.
     * * Not-Set when device does not support Wi-Fi Public Action Frame for discovery or is currently commissioned into
     *   one or more fabrics.
     */
    wifiPublicActionFrame: BitFlag(3),
};
export const DiscoveryCapabilitiesSchema = BitmapSchema(DiscoveryCapabilitiesBitmap);

/** See {@link MatterSpecification.v13.Core} § 5.1.3.1 Table 38 */
const QrCodeDataSchema = ByteArrayBitmapSchema({
    version: BitField(0, 3),
    vendorId: BitField(3, 16),
    productId: BitField(19, 16),
    flowType: BitFieldEnum<CommissioningFlowType>(35, 2),
    discoveryCapabilities: BitField(37, 8),
    discriminator: BitField(45, 12),
    passcode: BitField(57, 27),
});

export type QrCodeData = TypeFromBitmapSchema<typeof QrCodeDataSchema> & {
    /**
     * See {@link MatterSpecification.v13.Core} § 5.1.5
     * Variable length TLV data. Zero length if TLV is not included. This data is byte-aligned.
     * All elements SHALL be housed within an anonymous top-level structure container.
     */
    tlvData?: Bytes;
};

/**
 * Default field definition that can be enhanced with manufacturer specific Fields for the TlvSchema to use.
 * See {@link MatterSpecification.v13.Core} § 5.1.5
 */
export const QrCodeTlvDataDefaultFields = {
    /** Device Serial # */
    serialNumber: TlvOptionalField(0x00, TlvAny), // can be TlvString with up to 32 bytes or Unsigned Int up to 8 bytes
    pbkdfIterations: TlvOptionalField(0x01, TlvUInt32.bound({ min: 1000, max: 100_000 })), // Or could also be UInt 16?
    pbkdfSalt: TlvOptionalField(0x02, TlvByteString.bound({ minLength: 16, maxLength: 32 })),

    /**
     * Number of devices that are expected to be onboarded using this payload when using the Enhanced Commissioning
     * Method
     */
    numberOfDevices: TlvOptionalField(0x03, TlvUInt8.bound({ min: 1 })),

    /**
     * Time, in seconds, during which the device(s) are expected to be commissionable using the Enhanced Commissioning
     * Method
     */
    commissioningTimeout: TlvOptionalField(0x04, TlvUInt16),
};

const PREFIX = "MT:";

class QrPairingCodeSchema extends Schema<QrCodeData[], string> {
    protected encodeInternal(payloadData: QrCodeData[]): string {
        if (payloadData.length === 0) throw new ImplementationError("Provided Payload data is empty");
        return (
            PREFIX +
            payloadData
                .map(payloadData => {
                    const { tlvData } = payloadData;
                    const data =
                        tlvData !== undefined && tlvData.byteLength > 0
                            ? Bytes.of(Bytes.concat(QrCodeDataSchema.encode(payloadData), tlvData))
                            : QrCodeDataSchema.encode(payloadData);
                    return Base38.encode(data);
                })
                .join("*")
        );
    }

    protected decodeInternal(encoded: string): QrCodeData[] {
        if (!encoded.startsWith(PREFIX)) throw new UnexpectedDataError("The pairing code should start with MT:");
        return encoded
            .slice(PREFIX.length)
            .split("*")
            .map(encodedData => {
                const data = Bytes.of(Base38.decode(encodedData));
                return {
                    ...QrCodeDataSchema.decode(data.slice(0, 11)),
                    tlvData: data.length > 11 ? data.slice(11) : undefined, // TlvData (if any) is after the fixed-length data
                };
            });
    }

    /**
     * Decodes the TLV data from the QR code payload.
     * This method especially also handles that an encoded serialNumber can be UTF-8-String or a Unsigned Integer.
     *
     * @param data Encoded TLV data
     * @param schema The schema to use for decoding the TLV data, by default a schema with the QrCodeTlvDataDefaultFields is used
     */
    decodeTlvData(data: Bytes, schema: TlvSchema<any> = TlvObject(QrCodeTlvDataDefaultFields)) {
        const decoded = schema.decode(data);
        if (decoded.serialNumber !== undefined) {
            if (
                !Array.isArray(decoded.serialNumber) ||
                decoded.serialNumber.length !== 1 ||
                decoded.serialNumber[0].typeLength === undefined ||
                decoded.serialNumber[0].value === undefined
            ) {
                throw new UnexpectedDataError("Invalid serial number TLV data");
            }
            switch (decoded.serialNumber[0].typeLength.type) {
                case TlvType.Utf8String:
                case TlvType.UnsignedInt:
                    decoded.serialNumber = decoded.serialNumber[0].value;
                    break;
                default:
                    throw new UnexpectedDataError("Invalid serial number TLV data");
            }
        }
        return decoded;
    }

    /**
     * Encodes the TLV data for the QR code payload.
     * This method especially also handles that an encoded serialNumber can be UTF-8-String or a Unsigned Integer.
     *
     * @param data Data object to encode
     * @param schema The schema to use for encoding the TLV data, by default a schema with the QrCodeTlvDataDefaultFields is used
     */
    encodeTlvData(data: Record<string, any>, schema: TlvSchema<any> = TlvObject(QrCodeTlvDataDefaultFields)) {
        const dataToEncode = deepCopy(data);
        if ("serialNumber" in dataToEncode && dataToEncode.serialNumber !== undefined) {
            switch (typeof dataToEncode.serialNumber) {
                case "string":
                    dataToEncode.serialNumber = TlvString.encodeTlv(dataToEncode.serialNumber);
                    break;
                case "number":
                    dataToEncode.serialNumber = TlvUInt8.encodeTlv(dataToEncode.serialNumber);
                    break;
                default:
                    throw new ImplementationError("Invalid serial number data");
            }
        }
        return schema.encode(dataToEncode);
    }
}

export const QrPairingCodeCodec = new QrPairingCodeSchema();

export type ManualPairingData = {
    discriminator?: number;
    shortDiscriminator?: number;
    passcode: number;
    vendorId?: VendorId;
    productId?: number;
};

/** See {@link MatterSpecification.v10.Core} § 5.1.4.1 Table 38/39/40 */
class ManualPairingCodeSchema extends Schema<ManualPairingData, string> {
    protected encodeInternal({ discriminator, passcode, vendorId, productId }: ManualPairingData): string {
        if (discriminator === undefined) throw new UnexpectedDataError("discriminator is required");
        if (discriminator > 4095) throw new UnexpectedDataError("discriminator value must be less than 4096");
        let result = "";
        const hasVendorProductIds = vendorId !== undefined && productId !== undefined;
        result += (discriminator >> 10) | (hasVendorProductIds ? 1 << 2 : 0);
        result += (((discriminator & 0x300) << 6) | (passcode & 0x3fff)).toString().padStart(5, "0");
        result += (passcode >> 14).toString().padStart(4, "0");
        if (hasVendorProductIds) {
            result += vendorId.toString().padStart(5, "0");
            result += productId.toString().padStart(5, "0");
        }
        result += new Verhoeff().computeChecksum(result);
        return result;
    }

    protected decodeInternal(encoded: string): ManualPairingData {
        encoded = encoded.replace(/\D/g, ""); // we SHALL be robust against other characters
        if (encoded.length !== 11 && encoded.length !== 21) {
            throw new UnexpectedDataError("Invalid pairing code");
        }
        if (new Verhoeff().computeChecksum(encoded.slice(0, -1)) !== parseInt(encoded.slice(-1))) {
            throw new UnexpectedDataError("Invalid checksum");
        }
        const hasVendorProductIds = !!(parseInt(encoded[0]) & (1 << 2));
        const shortDiscriminator = ((parseInt(encoded[0]) & 0x03) << 2) | ((parseInt(encoded.slice(1, 6)) >> 14) & 0x3);
        const passcode = (parseInt(encoded.slice(1, 6)) & 0x3fff) | (parseInt(encoded.slice(6, 10)) << 14);
        let vendorId: VendorId | undefined;
        let productId: number | undefined;
        if (hasVendorProductIds) {
            vendorId = VendorId(parseInt(encoded.slice(10, 15)));
            productId = parseInt(encoded.slice(15, 20));
        }
        return { shortDiscriminator, passcode, vendorId, productId };
    }
}

export const ManualPairingCodeCodec = new ManualPairingCodeSchema();
