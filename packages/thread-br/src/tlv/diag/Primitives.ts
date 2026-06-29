/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

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

function eui64Decode(value: Uint8Array, name: string): Uint8Array {
    if (value.length !== 8) {
        throw new Error(`${name} TLV must be 8 bytes, got ${value.length}`);
    }
    return value.slice();
}

function eui64Encode(addr: Uint8Array, name: string): Uint8Array {
    if (addr.length !== 8) {
        throw new Error(`${name} must be 8 bytes, got ${addr.length}`);
    }
    return addr.slice();
}

export namespace ExtMacAddress {
    export function decode(value: Uint8Array): Uint8Array {
        return eui64Decode(value, "ExtMacAddress");
    }

    export function encode(addr: Uint8Array): Uint8Array {
        return eui64Encode(addr, "ExtMacAddress");
    }
}

export namespace Eui64 {
    export function decode(value: Uint8Array): Uint8Array {
        return eui64Decode(value, "Eui64");
    }

    export function encode(addr: Uint8Array): Uint8Array {
        return eui64Encode(addr, "Eui64");
    }
}

export namespace Address16 {
    export function decode(value: Uint8Array): number {
        if (value.length !== 2) {
            throw new Error(`Address16 TLV must be 2 bytes, got ${value.length}`);
        }
        return (value[0] << 8) | value[1];
    }

    export function encode(rloc16: number): Uint8Array {
        if (!Number.isInteger(rloc16) || rloc16 < 0 || rloc16 > 0xffff) {
            throw new Error(`Address16 out of range: ${rloc16}`);
        }
        return new Uint8Array([(rloc16 >> 8) & 0xff, rloc16 & 0xff]);
    }
}

export namespace BatteryLevel {
    export function decode(value: Uint8Array): number {
        if (value.length !== 1) {
            throw new Error(`BatteryLevel TLV must be 1 byte, got ${value.length}`);
        }
        return value[0];
    }

    export function encode(percent: number): Uint8Array {
        if (!Number.isInteger(percent) || percent < 0 || percent > 0xff) {
            throw new Error(`BatteryLevel out of range: ${percent}`);
        }
        return new Uint8Array([percent]);
    }
}

export namespace SupplyVoltage {
    export function decode(value: Uint8Array): number {
        if (value.length !== 2) {
            throw new Error(`SupplyVoltage TLV must be 2 bytes, got ${value.length}`);
        }
        return (value[0] << 8) | value[1];
    }

    export function encode(millivolts: number): Uint8Array {
        if (!Number.isInteger(millivolts) || millivolts < 0 || millivolts > 0xffff) {
            throw new Error(`SupplyVoltage out of range: ${millivolts}`);
        }
        return new Uint8Array([(millivolts >> 8) & 0xff, millivolts & 0xff]);
    }
}

export namespace MaxChildTimeout {
    export function decode(value: Uint8Array): number {
        if (value.length !== 4) {
            throw new Error(`MaxChildTimeout TLV must be 4 bytes, got ${value.length}`);
        }
        return ((value[0] << 24) | (value[1] << 16) | (value[2] << 8) | value[3]) >>> 0;
    }

    export function encode(seconds: number): Uint8Array {
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 0xffffffff) {
            throw new Error(`MaxChildTimeout out of range: ${seconds}`);
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
    export function decode(value: Uint8Array): number[] {
        return Array.from(value);
    }

    export function encode(pages: ReadonlyArray<number>): Uint8Array {
        const out = new Uint8Array(pages.length);
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            if (!Number.isInteger(p) || p < 0 || p > 0xff) {
                throw new Error(`ChannelPages entry out of range: ${p}`);
            }
            out[i] = p;
        }
        return out;
    }
}
