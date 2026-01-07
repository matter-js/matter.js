/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { MockEndpoint } from "../endpoint/mock-endpoint.js";
import { MockServerNode } from "../node/mock-server-node.js";

export const BridgedLightDevice = OnOffLightDevice.with(BridgedDeviceBasicInformationServer);

export async function createBridge<T extends AggregatorEndpoint>(
    definition: T | Endpoint.Configuration<T>,
    options?: MockEndpoint.Options<T>,
): Promise<MockEndpoint<T>> {
    const config = Endpoint.configurationFor(definition, options);
    const bridge = await MockEndpoint.create(config);

    const node = bridge.owner as MockServerNode;
    await node.start();

    return bridge;
}
