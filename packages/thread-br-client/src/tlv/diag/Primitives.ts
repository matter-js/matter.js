/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/general";
import { ThreadDiagError } from "../../diagnostic/errors.js";

/**
 * Small fixed-size primitive Network Diagnostic TLVs.
 *
 * | TLV | Type | Layout |
 * |-----|------|--------|
 * | ExtMacAddress    | 0  | 8-byte EUI-64, network byte order |
 * | Address16        | 1  | uint16 BE — RLOC16 |
 * | BatteryLevel     | 14 | uint8 (0..100 percent) |
 * | SupplyVoltage    | 15 | uint16 BE millivolts |
 * | ChannelPages     | 17 | variable-length byte array of supported channel pages |
 * | MaxChildTimeout  | 19 | uint32 BE seconds |
 * | Eui64            | 23 | 8-byte EUI-64 (factory-assigned, distinct from ExtMacAddress) |
 *
 * Layouts mirror OpenThread `network_diagnostic_tlvs.hpp` typedefs and the
 * `Client::GetNextDiagTlv` parser.
 */

function eui64Decode(value: Bytes, name: string): Bytes {
    const buf = Bytes.of(value);
    if (buf.length !== 8) {
        throw new ThreadDiagError(`${name} TLV must be 8 bytes, got ${buf.length}`);
    }
    return buf.slice();
}

function eui64Encode(addr: Bytes, name: string): Bytes {
    const buf = Bytes.of(addr);
    if (buf.length !== 8) {
        throw new InternalError(`${name} must be 8 bytes, got ${buf.length}`);
    }
    return buf.slice();
}

export namespace ExtMacAddress {
    export function decode(value: Bytes): Bytes {
        return eui64Decode(value, "ExtMacAddress");
    }

    export function encode(addr: Bytes): Bytes {
        return eui64Encode(addr, "ExtMacAddress");
    }
}

export namespace Eui64 {
    export function decode(value: Bytes): Bytes {
        return eui64Decode(value, "Eui64");
    }

    export function encode(addr: Bytes): Bytes {
        return eui64Encode(addr, "Eui64");
    }
}

export namespace Address16 {
    export function decode(value: Bytes): number {
        const buf = Bytes.of(value);
        if (buf.length !== 2) {
            throw new ThreadDiagError(`Address16 TLV must be 2 bytes, got ${buf.length}`);
        }
        return (buf[0] << 8) | buf[1];
    }

    export function encode(rloc16: number): Bytes {
        if (!Number.isInteger(rloc16) || rloc16 < 0 || rloc16 > 0xffff) {
            throw new InternalError(`Address16 out of range: ${rloc16}`);
        }
        return new Uint8Array([(rloc16 >> 8) & 0xff, rloc16 & 0xff]);
    }
}

export namespace BatteryLevel {
    export function decode(value: Bytes): number {
        const buf = Bytes.of(value);
        if (buf.length !== 1) {
            throw new ThreadDiagError(`BatteryLevel TLV must be 1 byte, got ${buf.length}`);
        }
        return buf[0];
    }

    export function encode(percent: number): Bytes {
        if (!Number.isInteger(percent) || percent < 0 || percent > 0xff) {
            throw new InternalError(`BatteryLevel out of range: ${percent}`);
        }
        return new Uint8Array([percent]);
    }
}

export namespace SupplyVoltage {
    export function decode(value: Bytes): number {
        const buf = Bytes.of(value);
        if (buf.length !== 2) {
            throw new ThreadDiagError(`SupplyVoltage TLV must be 2 bytes, got ${buf.length}`);
        }
        return (buf[0] << 8) | buf[1];
    }

    export function encode(millivolts: number): Bytes {
        if (!Number.isInteger(millivolts) || millivolts < 0 || millivolts > 0xffff) {
            throw new InternalError(`SupplyVoltage out of range: ${millivolts}`);
        }
        return new Uint8Array([(millivolts >> 8) & 0xff, millivolts & 0xff]);
    }
}

export namespace MaxChildTimeout {
    export function decode(value: Bytes): number {
        const buf = Bytes.of(value);
        if (buf.length !== 4) {
            throw new ThreadDiagError(`MaxChildTimeout TLV must be 4 bytes, got ${buf.length}`);
        }
        return ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
    }

    export function encode(seconds: number): Bytes {
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 0xffffffff) {
            throw new InternalError(`MaxChildTimeout out of range: ${seconds}`);
        }
        return new Uint8Array([
            (seconds >>> 24) & 0xff,
            (seconds >>> 16) & 0xff,
            (seconds >>> 8) & 0xff,
            seconds & 0xff,
        ]);
    }
}

export namespace ChannelPages {
    export function decode(value: Bytes): number[] {
        return Array.from(Bytes.of(value));
    }

    export function encode(pages: ReadonlyArray<number>): Bytes {
        const out = new Uint8Array(pages.length);
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            if (!Number.isInteger(p) || p < 0 || p > 0xff) {
                throw new InternalError(`ChannelPages entry out of range: ${p}`);
            }
            out[i] = p;
        }
        return out;
    }
}
