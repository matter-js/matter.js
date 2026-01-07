/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    TlvArray,
    TlvByteString,
    TlvField,
    TlvObject,
    TlvOptionalField,
    TlvString,
    TlvUInt16,
    TlvUInt32,
    TlvUInt8,
    TlvVendorId,
} from "#types";

/** Definitions for Matter Certification Declaration */
export namespace CertificationDeclaration {
    export const TlvDc = TlvObject({
        formatVersion: TlvField(0, TlvUInt16),
        vendorId: TlvField(1, TlvVendorId),
        produceIdArray: TlvField(2, TlvArray(TlvUInt16, { minLength: 1, maxLength: 100 })),
        deviceTypeId: TlvField(3, TlvUInt32),
        certificateId: TlvField(4, TlvString.bound({ length: 19 })),
        securityLevel: TlvField(5, TlvUInt8),
        securityInformation: TlvField(6, TlvUInt16),
        versionNumber: TlvField(7, TlvUInt16),
        certificationType: TlvField(8, TlvUInt8),
        dacOriginVendorId: TlvOptionalField(9, TlvVendorId),
        dacOriginProductId: TlvOptionalField(10, TlvUInt16),
        authorizedPaaList: TlvOptionalField(
            11,
            TlvArray(TlvByteString.bound({ length: 20 }), { minLength: 1, maxLength: 10 }),
        ),
    });
}
