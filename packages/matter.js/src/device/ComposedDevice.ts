/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { BridgedDeviceBasicInformationCluster } from "#clusters";
import { ImplementationError } from "#general";
import { Endpoint as NodeEndpoint } from "#node";
import { Device } from "./Device.js";
import { DeviceTypeDefinition } from "./DeviceTypes.js";
import { Endpoint, EndpointOptions } from "./Endpoint.js";

/**
 * A ComposedDevice is a special endpoint that allows to combine multiple sub devices and expose this as one device
 * (e.g. a fan and a light).
 */
export class ComposedDevice extends Endpoint {
    /**
     * Creates a new ComposedDevice.
     *
     * @param endpoint Underlying ClientEndpoint instance
     * @param definition DeviceTypeDefinitions of the composed device
     * @param devices Array with devices that should be combined into one device that are directly added.
     * @param options Optional Endpoint options
     */
    constructor(
        endpoint: NodeEndpoint,
        definition: DeviceTypeDefinition,
        devices: Device[] = [],
        options: EndpointOptions = {},
    ) {
        super(endpoint, [definition], options);
        devices.forEach(device => this.addDevice(device));
    }

    /**
     * Add a sub-device to the composed device.
     * @param device Device instance to add
     */
    addDevice(device: Device) {
        this.addChildEndpoint(device);
    }

    /**
     * Get all sub-devices of the composed device.
     *
     * @returns Array with all sub-devices
     */
    getDevices() {
        return this.getChildEndpoints();
    }

    /**
     * Verify that the required clusters exists on the device.
     */
    override verifyRequiredClusters() {
        // TODO find out what to really check here and how ... most likely we need to verify that the added sub devices
        //      somehow match with the device types of the composed device?!
        //      For now we do not check this
        return;
    }

    /**
     * Set the reachability of the Composed device exposed via the bridge.
     *
     * @param reachable true if reachable, false otherwise
     */
    setBridgedDeviceReachability(reachable: boolean) {
        const bridgedBasicInformationCluster = this.getClusterServer(BridgedDeviceBasicInformationCluster);
        if (bridgedBasicInformationCluster === undefined) {
            throw new ImplementationError(
                "The reachability flag can only be set for bridged devices this way. To set the reachability flag for a non-bridged device or for the bridget itself please set it on the CommissioningServer!",
            );
        }
        bridgedBasicInformationCluster.setReachableAttribute(reachable);
    }
}
