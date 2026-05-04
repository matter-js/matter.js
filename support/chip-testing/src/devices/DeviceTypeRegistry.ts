/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { EndpointNumber } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";

export interface EndpointHandle {
    endpoint: Endpoint;
    /**
     * Returns true if this handler consumed the command. The dispatch loop in
     * AllDevicesTestInstance stops on the first true; void/false lets the
     * next handler try.
     */
    handleBackchannel?(command: BackchannelCommand): Promise<boolean | void>;
}

export interface DeviceTypeEntry {
    name: string;
    create(serverNode: ServerNode, endpoint: EndpointNumber): Promise<EndpointHandle>;
}

const registry = new Map<string, DeviceTypeEntry>();

export function registerDeviceType(entry: DeviceTypeEntry): void {
    if (registry.has(entry.name)) {
        throw new Error(`Device type "${entry.name}" already registered`);
    }
    registry.set(entry.name, entry);
}

export function getDeviceType(name: string): DeviceTypeEntry | undefined {
    return registry.get(name);
}

export function listDeviceTypes(): string[] {
    return [...registry.keys()].sort();
}
