/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { Endpoint } from "@matter/main";
import { EndpointNumber } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";
import type { EndpointNumberAllocator } from "./EndpointNumberAllocator.js";

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

    /**
     * False for a device that only structures others.  CHIP's all-devices app leaves the aggregator and the bridged node
     * out of "*", so these two set it.
     */
    leaf?: boolean;

    /**
     * Adds the device on {@link endpoint} as a part of {@link parent}, which is the server node for a device without
     * `parent=`. A device with child endpoints numbers them from {@link numbers}. {@link label} is the NodeLabel of a
     * bridged node, undefined for every other device.
     */
    create(
        parent: Endpoint,
        endpoint: EndpointNumber,
        numbers: EndpointNumberAllocator,
        label?: string,
    ): Promise<EndpointHandle>;
}

const registry = new Map<string, DeviceTypeEntry>();

export function registerDeviceType(entry: DeviceTypeEntry): void {
    if (registry.has(entry.name)) {
        throw new ImplementationError(`Device type "${entry.name}" already registered`);
    }
    registry.set(entry.name, entry);
}

export function getDeviceType(name: string): DeviceTypeEntry | undefined {
    return registry.get(name);
}

export function listDeviceTypes(): string[] {
    return [...registry.keys()].sort();
}

/** The device types "*" selects. */
export function listLeafDeviceTypes(): string[] {
    return listDeviceTypes().filter(name => registry.get(name)?.leaf !== false);
}
