/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoders for the variable-length Network Diagnostic vendor-info TLVs and
 * the related fixed-size primitive TLVs that round out the default request set.
 *
 * | TLV | Type | Layout |
 * |-----|------|--------|
 * | Version              | 24 | uint16 BE  — Thread protocol version |
 * | VendorName           | 25 | UTF-8 string, max 32 bytes |
 * | VendorModel          | 26 | UTF-8 string, max 32 bytes |
 * | VendorSwVersion      | 27 | UTF-8 string, max 16 bytes |
 * | ThreadStackVersion   | 28 | UTF-8 string, max 64 bytes |
 * | VendorAppUrl         | 35 | UTF-8 string, max 96 bytes |
 *
 * String lengths come from OpenThread's `OT_NETWORK_DIAGNOSTIC_MAX_*_TLV_LENGTH`
 * constants in `include/openthread/netdiag.h`. We tolerate over-length on decode
 * (real BRs may vary) but enforce on encode.
 */

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });
const TEXT_ENCODER = new TextEncoder();

function decodeUtf8(value: Uint8Array): string {
    return TEXT_DECODER.decode(value);
}

function encodeUtf8(text: string, maxBytes: number, name: string): Uint8Array {
    const encoded = TEXT_ENCODER.encode(text);
    if (encoded.length > maxBytes) {
        throw new Error(`${name} value too long: ${encoded.length} bytes (max ${maxBytes})`);
    }
    return encoded;
}

export const VENDOR_NAME_MAX = 32;
export const VENDOR_MODEL_MAX = 32;
export const VENDOR_SW_VERSION_MAX = 16;
export const THREAD_STACK_VERSION_MAX = 64;
export const VENDOR_APP_URL_MAX = 96;

export namespace Version {
    export function decode(value: Uint8Array): number {
        if (value.length !== 2) {
            throw new Error(`Version TLV must be 2 bytes, got ${value.length}`);
        }
        return (value[0] << 8) | value[1];
    }

    export function encode(version: number): Uint8Array {
        if (!Number.isInteger(version) || version < 0 || version > 0xffff) {
            throw new Error(`Version TLV out of range: ${version}`);
        }
        return new Uint8Array([(version >> 8) & 0xff, version & 0xff]);
    }
}

export namespace VendorName {
    export function decode(value: Uint8Array): string {
        return decodeUtf8(value);
    }

    export function encode(name: string): Uint8Array {
        return encodeUtf8(name, VENDOR_NAME_MAX, "VendorName");
    }
}

export namespace VendorModel {
    export function decode(value: Uint8Array): string {
        return decodeUtf8(value);
    }

    export function encode(model: string): Uint8Array {
        return encodeUtf8(model, VENDOR_MODEL_MAX, "VendorModel");
    }
}

export namespace VendorSwVersion {
    export function decode(value: Uint8Array): string {
        return decodeUtf8(value);
    }

    export function encode(version: string): Uint8Array {
        return encodeUtf8(version, VENDOR_SW_VERSION_MAX, "VendorSwVersion");
    }
}

export namespace ThreadStackVersion {
    export function decode(value: Uint8Array): string {
        return decodeUtf8(value);
    }

    export function encode(version: string): Uint8Array {
        return encodeUtf8(version, THREAD_STACK_VERSION_MAX, "ThreadStackVersion");
    }
}

export namespace VendorAppUrl {
    export function decode(value: Uint8Array): string {
        return decodeUtf8(value);
    }

    export function encode(url: string): Uint8Array {
        return encodeUtf8(url, VENDOR_APP_URL_MAX, "VendorAppUrl");
    }
}
