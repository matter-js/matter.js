/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single Thread Border Router record discovered via mDNS.
 *
 * The extended address (xa) is the 64-bit Thread MAC of the border agent and serves as
 * the primary key. It is the same value as ThreadNetworkDiagnostics.NeighborTable.extAddress
 * for a BR that is itself a Thread router, which is what allows the dashboard to join
 * BRs onto external-device entries seen in commissioned-node neighbor tables.
 */
export interface BorderRouterEntry {
    /** 16-char uppercase hex of the 64-bit Thread MAC. Primary key. */
    extAddressHex: string;
    /** 16-char uppercase hex of the extended PAN ID, when known. */
    extendedPanIdHex?: string;
    /** Friendly Thread network name (`_meshcop` TXT "nn"). */
    networkName?: string;
    /** Vendor name (`_meshcop` TXT "vn"). */
    vendorName?: string;
    /** Model name (`_meshcop` TXT "mn"). */
    modelName?: string;
    /** mDNS hostname from the SRV target, e.g. "Kuche.local.". */
    hostname?: string;
    /** Sorted IPv4 + IPv6 addresses resolved from the SRV target's A/AAAA records. */
    addresses: string[];
    /** Service port from the `_meshcop` SRV record. */
    meshcopPort?: number;
    /** Service port from the `_trel` SRV record. */
    trelPort?: number;
    /** Thread version, e.g. "1.3.0" (`_meshcop` TXT "tv"). */
    threadVersion?: string;
    /** Software/firmware version of the Border Router (`_meshcop` TXT "sv"). Vendor-extension. */
    swVersion?: string;
    /** MeshCoP TXT record format version (`_meshcop` TXT "rv"). */
    recordVersion?: string;
    /** Border agent ID hex (`_meshcop` TXT "dd" or "ai"); not always present. */
    borderAgentIdHex?: string;
    /** Raw 4-byte state bitmap as hex (`_meshcop` TXT "sb"). Flag parsing left to dashboard. */
    stateBitmapHex?: string;
    /** Active timestamp as hex (`_meshcop` TXT "at"). */
    activeTimestampHex?: string;
    /** Partition ID as hex (`_meshcop` TXT "pt"). */
    partitionIdHex?: string;
    /** Vendor-specific data domain name (`_meshcop` TXT "dn"). */
    domainName?: string;
    /** Which mDNS source(s) contributed to this entry. */
    sources: ("meshcop" | "trel")[];
    /** Epoch milliseconds of the most recent record install or update. */
    lastSeen: number;
}
