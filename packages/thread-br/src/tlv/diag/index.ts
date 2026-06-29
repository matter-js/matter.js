/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

// Each TLV decoder file exports an `interface` and a same-named `namespace`.
// Declaration merging means a single re-export carries both the type and the
// value (decode/encode functions) under one identifier.

export { ChildIpv6AddressList } from "./ChildIpv6AddressList.js";
export type { ChildIpv6Addresses } from "./ChildIpv6AddressList.js";

export { ChildTable } from "./ChildTable.js";
export type { ChildTableEntry } from "./ChildTable.js";

export { Connectivity } from "./Connectivity.js";
export type { ParentPriority } from "./Connectivity.js";

export { Ipv6AddressList } from "./Ipv6AddressList.js";

export { LeaderData } from "./LeaderData.js";

export { MacCounters } from "./MacCounters.js";

export { MleCounters } from "./MleCounters.js";

export { Mode } from "./Mode.js";

export { NetworkData } from "./NetworkData.js";
export type {
    BorderRouterEntry,
    HasRouteEntry,
    NetworkDataEntry,
    NetworkDataPrefix,
    NetworkDataServer,
    NetworkDataService,
    ThreadNetworkData,
} from "./NetworkData.js";

export {
    Address16,
    BatteryLevel,
    ChannelPages,
    Eui64,
    ExtMacAddress,
    MaxChildTimeout,
    SupplyVoltage,
} from "./Primitives.js";

export { Route64 } from "./Route64.js";
export type { Route64Entry } from "./Route64.js";

export { RouterNeighbor } from "./RouterNeighbor.js";
export type { RouterNeighborEntry } from "./RouterNeighbor.js";

export { Timeout } from "./Timeout.js";

export { ThreadStackVersion, VendorAppUrl, VendorModel, VendorName, VendorSwVersion, Version } from "./VendorInfo.js";
