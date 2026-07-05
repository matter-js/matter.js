/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "@matter/general";
import type { ChildIpv6Addresses } from "../tlv/diag/ChildIpv6AddressList.js";
import type { ChildTableEntry } from "../tlv/diag/ChildTable.js";
import type { Connectivity } from "../tlv/diag/Connectivity.js";
import type { LeaderData } from "../tlv/diag/LeaderData.js";
import type { MacCounters } from "../tlv/diag/MacCounters.js";
import type { MleCounters } from "../tlv/diag/MleCounters.js";
import type { Mode } from "../tlv/diag/Mode.js";
import type { ThreadNetworkData } from "../tlv/diag/NetworkData.js";
import type { Route64 } from "../tlv/diag/Route64.js";
import type { RouterNeighborEntry } from "../tlv/diag/RouterNeighbor.js";

export interface DiagnosticResponse {
    extMacAddress?: Bytes;
    rloc16?: number;
    mode?: Mode;
    timeout?: number;
    connectivity?: Connectivity;
    route64?: Route64;
    leaderData?: LeaderData;
    networkData?: ThreadNetworkData;
    ipv6Addresses?: Bytes[];
    macCounters?: MacCounters;
    batteryLevel?: number;
    supplyVoltage?: number;
    childTable?: ChildTableEntry[];
    childIpv6Addresses?: ChildIpv6Addresses;
    routerNeighbors?: RouterNeighborEntry[];
    channelPages?: number[];
    maxChildTimeout?: number;
    eui64?: Bytes;
    version?: number;
    vendorName?: string;
    vendorModel?: string;
    vendorSwVersion?: string;
    threadStackVersion?: string;
    vendorAppUrl?: string;
    mleCounters?: MleCounters;
    unknown: Array<{ type: number; value: Bytes }>;
}
