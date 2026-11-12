/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "aggregator",
    leaf: false,
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(AggregatorEndpoint, { number: endpoint });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
