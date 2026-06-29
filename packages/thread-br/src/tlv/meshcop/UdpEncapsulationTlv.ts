/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * UDP Encapsulation TLV value codec (MeshCoP TLV type 48).
 *
 * The value is a 2-byte big-endian source port, a 2-byte big-endian
 * destination port, and the raw encapsulated UDP payload (an inner CoAP
 * message, for the diagnostic UDP-proxy flow). The outer type/length framing
 * is applied by {@link BasicTlv.encode}.
 *
 * Source: Thread spec §8.10 (UDP Proxy) and OpenThread
 * `src/core/meshcop/meshcop_tlvs.hpp` `UdpEncapsulationTlv` (`kUdpEncapsulation
 * = 48`).
 */
export interface UdpEncapsulation {
    sourcePort: number;
    destinationPort: number;
    payload: Uint8Array;
}

export namespace UdpEncapsulationTlv {
    export function encode({ sourcePort, destinationPort, payload }: UdpEncapsulation): Uint8Array {
        assertPort(sourcePort, "sourcePort");
        assertPort(destinationPort, "destinationPort");
        const out = new Uint8Array(4 + payload.length);
        out[0] = (sourcePort >> 8) & 0xff;
        out[1] = sourcePort & 0xff;
        out[2] = (destinationPort >> 8) & 0xff;
        out[3] = destinationPort & 0xff;
        out.set(payload, 4);
        return out;
    }

    export function decode(bytes: Uint8Array): UdpEncapsulation {
        if (bytes.length < 4) {
            throw new Error(`UdpEncapsulationTlv: value must be at least 4 bytes, got ${bytes.length}`);
        }
        return {
            sourcePort: (bytes[0] << 8) | bytes[1],
            destinationPort: (bytes[2] << 8) | bytes[3],
            payload: bytes.slice(4),
        };
    }
}

function assertPort(port: number, name: string): void {
    if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
        throw new Error(`UdpEncapsulationTlv: ${name} out of range: ${port}`);
    }
}
