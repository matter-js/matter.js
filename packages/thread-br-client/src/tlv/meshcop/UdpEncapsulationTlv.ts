/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/general";
import { ThreadTlvError } from "../BasicTlvCodec.js";

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
    payload: Bytes;
}

export namespace UdpEncapsulationTlv {
    export function encode({ sourcePort, destinationPort, payload }: UdpEncapsulation): Bytes {
        assertPort(sourcePort, "sourcePort");
        assertPort(destinationPort, "destinationPort");
        const payloadBytes = Bytes.of(payload);
        const out = new Uint8Array(4 + payloadBytes.length);
        out[0] = (sourcePort >> 8) & 0xff;
        out[1] = sourcePort & 0xff;
        out[2] = (destinationPort >> 8) & 0xff;
        out[3] = destinationPort & 0xff;
        out.set(payloadBytes, 4);
        return out;
    }

    export function decode(bytes: Bytes): UdpEncapsulation {
        const buf = Bytes.of(bytes);
        if (buf.length < 4) {
            throw new ThreadTlvError(`UdpEncapsulationTlv: value must be at least 4 bytes, got ${buf.length}`);
        }
        return {
            sourcePort: (buf[0] << 8) | buf[1],
            destinationPort: (buf[2] << 8) | buf[3],
            payload: buf.slice(4),
        };
    }
}

function assertPort(port: number, name: string): void {
    if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
        throw new InternalError(`UdpEncapsulationTlv: ${name} out of range: ${port}`);
    }
}
