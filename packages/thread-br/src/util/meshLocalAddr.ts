/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Realm-local all-Thread-nodes multicast address (`ff03::1`).
 */
export const ALL_THREAD_NODES_REALM_LOCAL: Uint8Array = realmLocal(0x01);

/**
 * Realm-local all-Thread-routers multicast address (`ff03::2`). Diagnostic
 * multicast queries (`MGMT_DIAG_GET.qry`) target this group.
 */
export const ALL_THREAD_ROUTERS_REALM_LOCAL: Uint8Array = realmLocal(0x02);

/**
 * Derive the mesh-local IPv6 address of a node from its RLOC16.
 *
 * Layout: `mlPrefix(8) || 0x0000 00FF FE00 || rloc16(2 BE)` — the well-known
 * Thread RLOC interface identifier with the locator in the low 16 bits.
 */
export function deriveMeshLocalAddress(mlPrefix: Uint8Array, rloc16: number): Uint8Array {
    if (mlPrefix.length !== 8) {
        throw new Error(`deriveMeshLocalAddress: mlPrefix must be 8 bytes, got ${mlPrefix.length}`);
    }
    if (!Number.isInteger(rloc16) || rloc16 < 0 || rloc16 > 0xffff) {
        throw new Error(`deriveMeshLocalAddress: rloc16 out of range: ${rloc16}`);
    }
    const addr = new Uint8Array(16);
    addr.set(mlPrefix, 0);
    addr[11] = 0xff;
    addr[12] = 0xfe;
    addr[14] = (rloc16 >> 8) & 0xff;
    addr[15] = rloc16 & 0xff;
    return addr;
}

/**
 * Format a 16-byte IPv6 address as colon-separated hextets with leading zeros
 * trimmed. No `::` compression — for logs, where unambiguity beats brevity.
 */
export function formatIp6(addr: Uint8Array): string {
    if (addr.length !== 16) {
        throw new Error(`formatIp6: address must be 16 bytes, got ${addr.length}`);
    }
    const groups = new Array<string>();
    for (let i = 0; i < 16; i += 2) {
        groups.push(((addr[i] << 8) | addr[i + 1]).toString(16));
    }
    return groups.join(":");
}

function realmLocal(lastByte: number): Uint8Array {
    const addr = new Uint8Array(16);
    addr[0] = 0xff;
    addr[1] = 0x03;
    addr[15] = lastByte;
    return addr;
}
