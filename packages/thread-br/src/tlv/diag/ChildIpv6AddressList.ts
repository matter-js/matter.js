/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoded Child IPv6 Address List TLV (Network Diagnostic TLV type 30).
 *
 * Layout per OpenThread `include/openthread/netdiag.h` `otNetworkDiagChildEntry`
 * and `src/core/thread/network_diagnostic.cpp`:
 *
 *   [0..1]  uint16-be  RLOC16 of the child
 *   [2..]   bytes[N*16] N IPv6 addresses, each 16 bytes, network byte order
 */
export interface ChildIpv6Addresses {
    rloc16: number;
    addresses: Uint8Array[];
}

const RLOC16_BYTES = 2;
const IPV6_ADDRESS_BYTES = 16;

export namespace ChildIpv6AddressList {
    export function decode(value: Uint8Array): ChildIpv6Addresses {
        if (value.length < RLOC16_BYTES) {
            return { rloc16: 0, addresses: [] };
        }

        const rloc16 = (value[0] << 8) | value[1];
        const addressPayload = value.subarray(RLOC16_BYTES);
        const addressCount = Math.floor(addressPayload.length / IPV6_ADDRESS_BYTES);

        const addresses = new Array<Uint8Array>();
        for (let i = 0; i < addressCount; i++) {
            addresses.push(addressPayload.slice(i * IPV6_ADDRESS_BYTES, (i + 1) * IPV6_ADDRESS_BYTES));
        }

        return { rloc16, addresses };
    }
}
