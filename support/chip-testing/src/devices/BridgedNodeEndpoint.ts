/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { BridgedNodeEndpoint } from "@matter/main/endpoints/bridged-node";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "bridged-node",
    leaf: false,
    async create(parent: Endpoint, endpoint: EndpointNumber, _numbers, label?: string) {
        const ep = new Endpoint(BridgedNodeEndpoint, {
            number: endpoint,
            bridgedDeviceBasicInformation: {
                reachable: true,
                nodeLabel: label ?? `Bridged Node ${endpoint}`,
                uniqueId: `bridged-node-unique-id-${endpoint}`,
            },
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
