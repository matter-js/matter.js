/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MeshCoP TLV type identifiers (Thread 1.4 spec §8.10 plus the Agners' Python
 * reference parser https://gist.github.com/agners/0338576e0003318b63ec1ea75adc90f9).
 *
 * Used to decode operational dataset blobs and to drive both the named-accessor
 * mapping and reverse lookup for diagnostics.
 */
export const MeshCopTlvType = {
    CHANNEL: 0,
    PANID: 1,
    EXTPANID: 2,
    NETWORK_NAME: 3,
    PSKC: 4,
    NETWORK_KEY: 5,
    NETWORK_KEY_SEQUENCE: 6,
    MESH_LOCAL_PREFIX: 7,
    STEERING_DATA: 8,
    BORDER_AGENT_LOCATOR: 9,
    COMMISSIONER_ID: 10,
    COMMISSIONER_SESSION_ID: 11,
    SECURITY_POLICY: 12,
    GET: 13,
    ACTIVE_TIMESTAMP: 14,
    COMMISSIONER_UDP_PORT: 15,
    STATE: 16,
    JOINER_DTLS_ENCAPSULATION: 17,
    JOINER_UDP_PORT: 18,
    JOINER_IID: 19,
    JOINER_ROUTER_LOCATOR: 20,
    JOINER_ROUTER_KEK: 21,
    DURATION: 23,
    PROVISIONING_URL: 32,
    VENDOR_NAME: 33,
    VENDOR_MODEL: 34,
    VENDOR_SW_VERSION: 35,
    VENDOR_DATA: 36,
    VENDOR_STACK_VERSION: 37,
    UDP_ENCAPSULATION: 48,
    IPV6_ADDRESS: 49,
    PENDING_TIMESTAMP: 51,
    DELAY_TIMER: 52,
    CHANNEL_MASK: 53,
    COUNT: 54,
    PERIOD: 55,
    SCAN_DURATION: 56,
    ENERGY_LIST: 57,
    THREAD_DOMAIN_NAME: 59,
    WAKEUP_CHANNEL: 74,
    DISCOVERY_REQUEST: 128,
    DISCOVERY_RESPONSE: 129,
    JOINER_ADVERTISEMENT: 241,
} as const;

export type MeshCopTlvTypeKey = keyof typeof MeshCopTlvType;
export type MeshCopTlvTypeValue = (typeof MeshCopTlvType)[MeshCopTlvTypeKey];

export const MeshCopTlvTypeName: Record<number, MeshCopTlvTypeKey> = (() => {
    const out: Record<number, MeshCopTlvTypeKey> = {};
    for (const [key, value] of Object.entries(MeshCopTlvType) as Array<[MeshCopTlvTypeKey, MeshCopTlvTypeValue]>) {
        out[value] = key;
    }
    return out;
})();
