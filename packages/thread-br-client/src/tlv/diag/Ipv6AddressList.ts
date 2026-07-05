/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/general";
import { ThreadDiagError } from "../../diagnostic/errors.js";

/**
 * Decoded IPv6 Address List TLV (Network Diagnostic TLV type 8).
 *
 * Concatenation of zero or more 16-byte IPv6 addresses, in interface-list
 * order. Source: OpenThread `network_diagnostic.cpp` `Server::AppendIp6AddressList`
 * and `Client::ParseIp6AddrList`.
 *
 * Each entry is the 16-byte network-order address; rendering to text form
 * is the responsibility of higher layers.
 */
export const IPV6_ADDRESS_BYTES = 16;

export namespace Ipv6AddressList {
    export function decode(value: Bytes): Bytes[] {
        const buf = Bytes.of(value);
        if (buf.length % IPV6_ADDRESS_BYTES !== 0) {
            throw new ThreadDiagError(
                `IPv6 address list TLV length ${buf.length} not a multiple of ${IPV6_ADDRESS_BYTES}`,
            );
        }
        const out = new Array<Uint8Array>();
        for (let offset = 0; offset < buf.length; offset += IPV6_ADDRESS_BYTES) {
            out.push(buf.slice(offset, offset + IPV6_ADDRESS_BYTES));
        }
        return out;
    }

    export function encode(addresses: ReadonlyArray<Bytes>): Bytes {
        const out = new Uint8Array(addresses.length * IPV6_ADDRESS_BYTES);
        for (let i = 0; i < addresses.length; i++) {
            const addr = Bytes.of(addresses[i]);
            if (addr.length !== IPV6_ADDRESS_BYTES) {
                throw new InternalError(`IPv6 address must be ${IPV6_ADDRESS_BYTES} bytes, got ${addr.length}`);
            }
            out.set(addr, i * IPV6_ADDRESS_BYTES);
        }
        return out;
    }
}
