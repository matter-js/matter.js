/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DerObject, X520 } from "#general";
import { FabricId, NodeId, VendorId } from "#types";

const YEAR_S = 365 * 24 * 60 * 60;
const EPOCH_OFFSET_S = 10957 * 24 * 60 * 60;

// TODO replace usage of Date by abstraction

export function matterToJsDate(date: number) {
    return date === 0 ? X520.NON_WELL_DEFINED_DATE : new Date((date + EPOCH_OFFSET_S) * 1000);
}

export function jsToMatterDate(date: Date, addYears = 0) {
    return date.getTime() === X520.NON_WELL_DEFINED_DATE.getTime()
        ? 0
        : Math.floor(date.getTime() / 1000) - EPOCH_OFFSET_S + addYears * YEAR_S;
}

function intTo16Chars(value: bigint | number) {
    const byteArray = new Uint8Array(8);
    const dataView = Bytes.dataViewOf(byteArray);
    dataView.setBigUint64(0, typeof value === "bigint" ? value : BigInt(value));
    return Bytes.toHex(byteArray).toUpperCase();
}

function uInt16To8Chars(value: number) {
    const byteArray = new Uint8Array(4);
    const dataView = Bytes.dataViewOf(byteArray);
    dataView.setUint32(0, value);
    return Bytes.toHex(byteArray).toUpperCase();
}

function uInt16To4Chars(value: number) {
    const byteArray = new Uint8Array(2);
    const dataView = Bytes.dataViewOf(byteArray);
    dataView.setUint16(0, value);
    return Bytes.toHex(byteArray).toUpperCase();
}

/**
 * Matter specific ASN.1 OIDs
 * @see {@link MatterSpecification.v12.Core} Appendix E
 */

/**
 * Generator function to create a specific ASN field for a Matter OpCert DN with the OID base 1.3.6.1.4.1.37244.1.*.
 * The returned function takes the value and returns the ASN.1 DER object.
 */
const GenericMatterOpCertObject =
    <T>(id: number, valueConverter?: (value: T) => string) =>
    (value: T) => [
        DerObject(`2b0601040182a27c01${id.toString(16).padStart(2, "0")}`, {
            value: (valueConverter ?? intTo16Chars)(value as any),
        }),
    ];

/**
 * Generator function to create a specific ASN field for a Matter AttCert DN with the OID base 1.3.6.1.4.1.37244.2.*.
 * The returned function takes the value and returns the ASN.1 DER object.
 */
const GenericMatterAttCertObject =
    <T>(id: number, valueConverter?: (value: T) => string) =>
    (value: T) => [
        DerObject(`2b0601040182a27c02${id.toString(16).padStart(2, "0")}`, {
            value: (valueConverter ?? intTo16Chars)(value as any),
        }),
    ];

/** matter-node-id = ASN.1 OID 1.3.6.1.4.1.37244.1.1 */
export const NodeId_Matter = GenericMatterOpCertObject<NodeId>(1);

/** matter-firmware-signing-id = ASN.1 OID 1.3.6.1.4.1.37244.1.2 */
export const FirmwareSigningId_Matter = GenericMatterOpCertObject<number>(2);

/** matter-icac-id = ASN.1 OID 1.3.6.1.4.1.37244.1.3 */
export const IcacId_Matter = GenericMatterOpCertObject<bigint | number>(3);

/** matter-rcac-id = ASN.1 OID 1.3.6.1.4.1.37244.1.4 */
export const RcacId_Matter = GenericMatterOpCertObject<bigint | number>(4);

/** matter-fabric-id = ASN.1 OID 1.3.6.1.4.1.37244.1.5 */
export const FabricId_Matter = GenericMatterOpCertObject<FabricId>(5);

/** matter-noc-cat = ASN.1 OID 1.3.6.1.4.1.37244.1.6 */
export const NocCat_Matter = GenericMatterOpCertObject<number>(6, uInt16To8Chars);

/** matter-vvs-id = ASN.1 OID 1.3.6.1.4.1.37244.1.7 */
export const VvsId_Matter = GenericMatterOpCertObject<bigint | number>(7);

/** matter-oid-vid = ASN.1 OID 1.3.6.1.4.1.37244.2.1 */
export const VendorId_Matter = GenericMatterAttCertObject<VendorId>(1, uInt16To4Chars);

/** matter-oid-pid = ASN.1 OID 1.3.6.1.4.1.37244.2.2 */
export const ProductId_Matter = GenericMatterAttCertObject<number>(2, uInt16To4Chars);
