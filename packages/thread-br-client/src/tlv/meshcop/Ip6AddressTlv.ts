/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { ThreadTlvError } from "../BasicTlvCodec.js";

/**
 * IPv6 Address TLV value codec (MeshCoP TLV type 49).
 *
 * The value is a raw 16-byte IPv6 address — the UDP-proxy target (a mesh-local
 * unicast address or a multicast group) on the request side, and the
 * responder's source address on the reply side. The outer type/length framing
 * is applied by {@link BasicTlv.encode}.
 *
 * Source: Thread spec §8.10 (UDP Proxy) and OpenThread
 * `src/core/meshcop/meshcop_tlvs.hpp` `IPv6AddressTlv` (`kIPv6Address = 49`).
 */
export namespace Ip6AddressTlv {
    export function encode(addr: Bytes): Bytes {
        const buf = Bytes.of(addr);
        assertLength(buf);
        return buf.slice();
    }

    export function decode(bytes: Bytes): Bytes {
        const buf = Bytes.of(bytes);
        assertLength(buf);
        return buf.slice();
    }
}

function assertLength(addr: Uint8Array): void {
    if (addr.length !== 16) {
        throw new ThreadTlvError(`Ip6AddressTlv: address must be 16 bytes, got ${addr.length}`);
    }
}
