/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { AggregatorDt } from "@matter/model";
import { Endpoint as NodeEndpoint } from "@matter/node";
import { ComposedDevice } from "./ComposedDevice.js";
import { Device } from "./Device.js";
import { getDeviceTypeDefinitionFromModelByCode } from "./DeviceTypes.js";
import { Endpoint, EndpointOptions } from "./Endpoint.js";

/**
 * An Aggregator is a special endpoint that exposes multiple devices as a "bridge" into the matter ecosystem.
 * Devices added must already have the BridgedDeviceBasicInformationCluster configured.
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export class Aggregator extends Endpoint {
    /**
     * Create a new Aggregator instance and optionally directly add devices to it. If this is used the devices must
     * already have the BridgedDeviceBasicInformationCluster added!
     *
     * @param endpoint Underlying ClientEndpoint instance
     * @param devices Array of devices to add
     * @param options Optional Endpoint options
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    constructor(endpoint: NodeEndpoint, devices: Device[] = [], options: EndpointOptions = {}) {
        // Aggregator is a Composed device with an Aggregator device type
        super(endpoint, [getDeviceTypeDefinitionFromModelByCode(AggregatorDt.id)!], options);
        devices.forEach(device => this.addChildEndpoint(device));
    }

    /**
     * Returns all bridged devices added to the Aggregator
     *
     * @returns Array of bridged devices
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getBridgedDevices() {
        return this.getChildEndpoints();
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    removeBridgedDevice(device: Device | ComposedDevice) {
        this.removeChildEndpoint(device);
    }
}
