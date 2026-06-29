/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkDiagTlvType } from "../tlv/networkDiagTlvTypes.js";

/** Default diagnostic TLV set: spec §4.9 core topology + identity + health (counters, power, firmware). */
export const DefaultTlvSet: ReadonlyArray<number> = [
    NetworkDiagTlvType.EXT_MAC_ADDRESS,
    NetworkDiagTlvType.ADDRESS16,
    NetworkDiagTlvType.MODE,
    NetworkDiagTlvType.CONNECTIVITY,
    NetworkDiagTlvType.ROUTE64,
    NetworkDiagTlvType.LEADER_DATA,
    NetworkDiagTlvType.IPV6_ADDRESS_LIST,
    NetworkDiagTlvType.CHILD_TABLE,
    NetworkDiagTlvType.VERSION,
    NetworkDiagTlvType.VENDOR_NAME,
    NetworkDiagTlvType.VENDOR_MODEL,
    NetworkDiagTlvType.VENDOR_SW_VERSION,
    NetworkDiagTlvType.TIMEOUT,
    NetworkDiagTlvType.MAC_COUNTERS,
    NetworkDiagTlvType.MLE_COUNTERS,
    NetworkDiagTlvType.BATTERY_LEVEL,
    NetworkDiagTlvType.SUPPLY_VOLTAGE,
    NetworkDiagTlvType.MAX_CHILD_TIMEOUT,
    NetworkDiagTlvType.EUI64,
    NetworkDiagTlvType.THREAD_STACK_VERSION,
];
