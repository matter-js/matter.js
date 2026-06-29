/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Network Diagnostic TLV type identifiers.
 *
 * Numeric values are authoritative per OpenThread `include/openthread/netdiag.h`
 * (BSD-3, https://github.com/openthread/openthread) and `src/core/thread/network_diagnostic_tlvs.hpp`.
 *
 * Note this registry is intentionally separate from {@link MeshCopTlvType}; the
 * MeshCoP and Network Diagnostic TLV namespaces share the basic length-prefix
 * framing but assign different meanings to the same numeric type bytes (e.g.
 * MeshCoP `VENDOR_NAME` is 33, Network Diagnostic `VendorName` is 25).
 */
export const NetworkDiagTlvType = {
    EXT_MAC_ADDRESS: 0,
    ADDRESS16: 1,
    MODE: 2,
    TIMEOUT: 3,
    CONNECTIVITY: 4,
    ROUTE64: 5,
    LEADER_DATA: 6,
    NETWORK_DATA: 7,
    IPV6_ADDRESS_LIST: 8,
    MAC_COUNTERS: 9,
    BATTERY_LEVEL: 14,
    SUPPLY_VOLTAGE: 15,
    CHILD_TABLE: 16,
    CHANNEL_PAGES: 17,
    TYPE_LIST: 18,
    MAX_CHILD_TIMEOUT: 19,
    EUI64: 23,
    VERSION: 24,
    VENDOR_NAME: 25,
    VENDOR_MODEL: 26,
    VENDOR_SW_VERSION: 27,
    THREAD_STACK_VERSION: 28,
    CHILD: 29,
    CHILD_IPV6_ADDRESS_LIST: 30,
    ROUTER_NEIGHBOR: 31,
    ANSWER: 32,
    QUERY_ID: 33,
    MLE_COUNTERS: 34,
    VENDOR_APP_URL: 35,
    NON_PREFERRED_CHANNELS: 36,
    ENHANCED_ROUTE: 37,
    BR_STATE: 38,
    BR_IF_ADDRS: 39,
    BR_LOCAL_OMR_PREFIX: 40,
    BR_DHCP6_PD_OMR_PREFIX: 41,
    BR_LOCAL_ON_LINK_PREFIX: 42,
    BR_FAVORED_ON_LINK_PREFIX: 43,
} as const;

export type NetworkDiagTlvTypeKey = keyof typeof NetworkDiagTlvType;
export type NetworkDiagTlvTypeValue = (typeof NetworkDiagTlvType)[NetworkDiagTlvTypeKey];

export const NetworkDiagTlvTypeName: Record<number, NetworkDiagTlvTypeKey> = (() => {
    const out: Record<number, NetworkDiagTlvTypeKey> = {};
    for (const [key, value] of Object.entries(NetworkDiagTlvType) as Array<
        [NetworkDiagTlvTypeKey, NetworkDiagTlvTypeValue]
    >) {
        out[value] = key;
    }
    return out;
})();
