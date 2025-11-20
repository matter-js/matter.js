/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import type { Fabric } from "#protocol";

class MockFabricImplementation {
    fabricIndex;

    constructor(id = 1) {
        this.fabricIndex = id;
    }
}

export const MockFabric = MockFabricImplementation as unknown as new (id?: number) => Fabric;

export const MockEndpointType = MutableEndpoint({
    name: "MyEndpoint",
    deviceType: 1,
    deviceRevision: 1,
}).with(DescriptorServer);
