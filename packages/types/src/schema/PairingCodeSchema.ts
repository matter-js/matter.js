/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    CRYPTO_PBKDF_ITERATIONS_MAX,
    CRYPTO_PBKDF_ITERATIONS_MIN,
    deepCopy,
    ImplementationError,
    UnexpectedDataError,
    Verhoeff,
} from "@matter/general";
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

/** See {@link MatterSpecification.v16.Core} §5.1.3.2. */
export const MATTER_QR_CODE_SINGLE_PAYLOAD_MAX_LENGTH = 255;

/** See {@link MatterSpecification.v16.Core} §5.1.3.2. */
export const MATTER_QR_CODE_ALL_PAYLOAD_MAX_LENGTH = 4296;

/** See {@link MatterSpecification.v16.Core} § 5.1.3.1 Table 59 */
export enum CommissioningFlowType {
    /** When not commissioned, the device always enters commissioning mode upon power-up. */
    Standard = 0,

    /** User action required to enter commissioning mode. */
    UserIntent = 1,

    /** Interaction with a vendor-specified means is needed before commissioning. */
    Custom = 2,
}

/** See {@link MatterSpecification.v16.Core} § 5.1.3.1 Table 60 */
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

    /**
     * NFC Transport Layer (NTL)
     * * Set when device supports the NFC Transport Layer for discovery when not commissioned.
     * * Not-Set when device does not support the NFC Transport Layer for discovery or is currently commissioned into
     *   one or more fabrics.
     */
    nfc: BitFlag(4),
};
export const DiscoveryCapabilitiesSchema = BitmapSchema(DiscoveryCapabilitiesBitmap);

/** See {@link MatterSpecification.v16.Core} § 5.1.3.1 Table 59 */
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
     * See {@link MatterSpecification.v16.Core} § 5.1.5
     * Variable length TLV data. Zero length if TLV is not included. This data is byte-aligned.
     * All elements SHALL be housed within an anonymous top-level structure container.
     */
    tlvData?: Bytes;
};

/**
 * Default field definition that can be enhanced with manufacturer specific Fields for the TlvSchema to use.
 * See {@link MatterSpecification.v16.Core} § 5.1.5
 */
export const QrCodeTlvDataDefaultFields = {
    /** Device Serial # */
    serialNumber: TlvOptionalField(0x00, TlvAny), // can be TlvString with up to 32 bytes or Unsigned Int up to 8 bytes
    pbkdfIterations: TlvOptionalField(
        0x01,
        TlvUInt32.bound({ min: CRYPTO_PBKDF_ITERATIONS_MIN, max: CRYPTO_PBKDF_ITERATIONS_MAX }),
    ),
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

/**
 * Inclusive lower bound of the valid passcode range `0x0000001..0x5F5E0FE`.
 * See {@link MatterSpecification.v16.Core} § 5.1.1.6.
 */
export const PASSCODE_MIN = 0x0000001;

/**
 * Inclusive upper bound of the valid passcode range `0x0000001..0x5F5E0FE`.
 * See {@link MatterSpecification.v16.Core} § 5.1.1.6.
 */
export const PASSCODE_MAX = 0x5f5e0fe;

/**
 * Trivial/insecure passcodes that SHALL NOT be used for PASE.
 * See {@link MatterSpecification.v16.Core} § 5.1.7.1.
 */
export const INVALID_PASSCODES: readonly number[] = [
    0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
];

/**
 * Returns true when the passcode is a valid setup passcode: within the {@link PASSCODE_MIN}..{@link PASSCODE_MAX} range
 * and not one of the {@link INVALID_PASSCODES}. Mirrors CHIP's `PayloadContents::IsValidSetupPIN`.
 *
 * The onboarding codecs round-trip arbitrary 27-bit passcodes; use this to validate a decoded payload at parse time
 * rather than deferring to the PASE layer. See {@link MatterSpecification.v16.Core} § 5.1.1.6 / § 5.1.7.1.
 */
export function isValidPasscode(passcode: number): boolean {
    return (
        Number.isInteger(passcode) &&
        passcode >= PASSCODE_MIN &&
        passcode <= PASSCODE_MAX &&
        !INVALID_PASSCODES.includes(passcode)
    );
}

/** Throws {@link UnexpectedDataError} when {@link isValidPasscode} returns false. */
export function assertValidPasscode(passcode: number): void {
    if (!isValidPasscode(passcode)) {
        throw new UnexpectedDataError(`Invalid passcode ${passcode}`);
    }
}

const PREFIX = "MT:";

/**
 * Asserts the PBKDF parameter set is both-or-neither per § 5.1.5 Table 63 note `*`: the iteration count (tag 0x01) and
 * salt (tag 0x02) are present together or not at all.
 */
function assertPbkdfBothOrNeither(data: { pbkdfIterations?: unknown; pbkdfSalt?: unknown }): void {
    if ((data.pbkdfIterations === undefined) !== (data.pbkdfSalt === undefined)) {
        throw new UnexpectedDataError("PBKDF iteration count and salt must both be present or both absent");
    }
}

/**
 * Asserts every top-level onboarding-payload TLV tag is either a Matter-common tag (0x00–0x04) or a
 * manufacturer-specific tag (0x80–0xFF); tags 0x05–0x7F are reserved. See § 5.1.5.1 and Table 63.
 */
function assertValidOnboardingTlvTags(data: Bytes): void {
    let depth = 0;
    for (const { tag, typeLength } of TlvAny.decode(data)) {
        if (typeLength.type === TlvType.EndOfContainer) {
            depth--;
            continue;
        }
        if (depth === 1) {
            if (tag?.profile !== undefined || tag?.id === undefined) {
                throw new UnexpectedDataError(
                    "Onboarding payload top-level TLV elements must use context-specific tags",
                );
            }
            if (tag.id > 0x04 && tag.id < 0x80) {
                throw new UnexpectedDataError(
                    `Reserved onboarding payload TLV tag 0x${tag.id.toString(16).padStart(2, "0").toUpperCase()}: manufacturer-specific tags must use 0x80–0xFF`,
                );
            }
        }
        if (
            typeLength.type === TlvType.Structure ||
            typeLength.type === TlvType.Array ||
            typeLength.type === TlvType.List
        ) {
            depth++;
        }
    }
}

class QrPairingCodeSchema extends Schema<QrCodeData[], string> {
    /** Rejects reserved versions (§ 5.1.3.1) and invalid passcodes (§ 5.1.1.6 / § 5.1.7.1). */
    override validate(payloadData: QrCodeData[]): void {
        for (const { version, passcode } of payloadData) {
            if (version !== 0) {
                throw new UnexpectedDataError(`Unsupported onboarding payload version ${version}`);
            }
            assertValidPasscode(passcode);
        }
    }

    protected encodeInternal(payloadData: QrCodeData[]): string {
        if (payloadData.length === 0) throw new ImplementationError("Provided Payload data is empty");
        const result =
            PREFIX +
            payloadData
                .map(payloadData => {
                    const { tlvData } = payloadData;
                    const data =
                        tlvData !== undefined && tlvData.byteLength > 0
                            ? Bytes.of(Bytes.concat(QrCodeDataSchema.encode(payloadData), tlvData))
                            : QrCodeDataSchema.encode(payloadData);
                    const result = Base38.encode(data);
                    if (result.length > MATTER_QR_CODE_SINGLE_PAYLOAD_MAX_LENGTH) {
                        throw new UnexpectedDataError(
                            `Encoded pairing code is too long: ${result.length} characters (max ${MATTER_QR_CODE_SINGLE_PAYLOAD_MAX_LENGTH})`,
                        );
                    }
                    return result;
                })
                .join("*");
        if (result.length > MATTER_QR_CODE_ALL_PAYLOAD_MAX_LENGTH) {
            throw new UnexpectedDataError(
                `Encoded pairing code is too long: ${result.length} characters (max ${MATTER_QR_CODE_ALL_PAYLOAD_MAX_LENGTH})`,
            );
        }
        return result;
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
        assertValidOnboardingTlvTags(data);
        const decoded = schema.decode(data);
        assertPbkdfBothOrNeither(decoded);
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
        assertPbkdfBothOrNeither(data);
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
        const encoded = schema.encode(dataToEncode);
        assertValidOnboardingTlvTags(encoded);
        return encoded;
    }
}

export const QrPairingCodeCodec = new QrPairingCodeSchema();

export type ManualPairingData = {
    discriminator?: number;
    shortDiscriminator?: number;
    passcode: number;
    vendorId?: VendorId;
    productId?: number;

    /**
     * Commissioning flow type. When set to anything other than {@link CommissioningFlowType.Standard}, Vendor ID and
     * Product ID SHALL be present. See {@link MatterSpecification.v13.Core} § 5.1.4.1.2.
     */
    flowType?: CommissioningFlowType;
};

/** See {@link MatterSpecification.v16.Core} § 5.1.4.1 Table 62/63/64 */
class ManualPairingCodeSchema extends Schema<ManualPairingData, string> {
    /**
     * Rejects an invalid passcode (§ 5.1.1.6 / § 5.1.7.1) and a non-standard commissioning flow missing VID/PID
     * (§ 5.1.4.1.2).
     */
    override validate({ passcode, flowType, vendorId, productId }: ManualPairingData): void {
        assertValidPasscode(passcode);
        if (
            flowType !== undefined &&
            flowType !== CommissioningFlowType.Standard &&
            (vendorId === undefined || productId === undefined)
        ) {
            throw new UnexpectedDataError("Vendor ID and Product ID are required for non-standard commissioning flows");
        }
    }

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
        // First digit 8 or 9 cannot occur in a v1 code and marks a future format. See § 5.1.4.1.2.
        if (parseInt(encoded[0]) >= 8) {
            throw new UnexpectedDataError(`Unsupported onboarding payload version (first digit ${encoded[0]})`);
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
