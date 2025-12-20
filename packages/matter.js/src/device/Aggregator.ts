/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { BridgedDeviceBasicInformationCluster } from "#clusters";
import { ImplementationError } from "#general";
import { Endpoint as NodeEndpoint } from "#node";
import { ClusterServer } from "../cluster/server/ClusterServer.js";
import { AttributeInitialValues } from "../cluster/server/ClusterServerTypes.js";
import { ComposedDevice } from "./ComposedDevice.js";
import { Device } from "./Device.js";
import { DeviceTypes } from "./DeviceTypes.js";
import { Endpoint, EndpointOptions } from "./Endpoint.js";

/**
 * An Aggregator is a special endpoint that exposes multiple devices as a "bridge" into the matter ecosystem.
 * Use the `addBridgedDevice` or `addBridgedDeviceWithPowerSourceInfo` method to add the devices and provide the details
 * for the "Bridged Device Basic Information Cluster". The BridgedDeviceBasicInformationCluster is then added automatically.
 * If Power source information should be provided you need to also add the needed clusters (PowerSourceConfigurationCluster
 * and PowerSourceCluster) to the device!
 */
export class Aggregator extends Endpoint {
    /**
     * Create a new Aggregator instance and optionally directly add devices to it. If this is used the devices must
     * already have the BridgedDeviceBasicInformationCluster added!
     *
     * @param endpoint Underlying ClientEndpoint instance
     * @param devices Array of devices to add
     * @param options Optional Endpoint options
     */
    constructor(endpoint: NodeEndpoint, devices: Device[] = [], options: EndpointOptions = {}) {
        // Aggregator is a Composed device with an DeviceTypes.AGGREGATOR device type
        super(endpoint, [DeviceTypes.AGGREGATOR], options);
        devices.forEach(device => this.addBridgedDevice(device));
    }

    /**
     * Add a bridged device to the Aggregator. If provided the bridgedBasicInformation is used to automatically add the
     * BridgedDeviceBasicInformationCluster to the device and also handles Reachability event triggering when
     * reachability event changes. If not provided the BridgedDeviceBasicInformationCluster must be already existing
     * on the device!
     *
     * @param device Device instance to add
     * @param bridgedBasicInformation Optional BridgedDeviceBasicInformationCluster attribute values to
     */
    addBridgedDevice(
        device: Device | ComposedDevice,
        bridgedBasicInformation?: AttributeInitialValues<typeof BridgedDeviceBasicInformationCluster.attributes>,
    ): void {
        // Add DeviceTypes.BRIDGED_DEVICE device type to the device exposed via Aggregator
        const deviceTypes = device.getDeviceTypes();
        if (!deviceTypes.includes(DeviceTypes.BRIDGED_NODE)) {
            deviceTypes.push(DeviceTypes.BRIDGED_NODE);
            device.setDeviceTypes(deviceTypes);
        }
        if (bridgedBasicInformation !== undefined) {
            const bridgedBasicInformationCluster = ClusterServer(
                BridgedDeviceBasicInformationCluster,
                bridgedBasicInformation,
                {},
                {
                    reachableChanged: true,
                },
            );
            device.addClusterServer(bridgedBasicInformationCluster);

            bridgedBasicInformationCluster.subscribeReachableAttribute(newValue => {
                bridgedBasicInformationCluster.triggerReachableChangedEvent({ reachableNewValue: newValue });
            });
        } else {
            if (!device.hasClusterServer(BridgedDeviceBasicInformationCluster)) {
                throw new ImplementationError(
                    "BridgedDeviceBasicInformationCluster is required for bridged devices. Please add yourself or provide as second parameter",
                );
            }
        }
        this.addChildEndpoint(device);
    }

    /**
     * Add a bridged device with power source information to the Aggregator. If provided the bridgedBasicInformation is
     * used to automatically add the BridgedDeviceBasicInformationCluster to the device. If not provided the
     * BridgedDeviceBasicInformationCluster must be already existing on the device!
     * The required clusters PowerSourceConfigurationCluster and PowerSourceCluster needs to be added manually to the device!
     *
     * @param device Device instance to add
     * @param bridgedBasicInformation Optional BridgedDeviceBasicInformationCluster attribute values to
     */
    addBridgedDeviceWithPowerSourceInfo(
        device: Device | ComposedDevice,
        bridgedBasicInformation?: AttributeInitialValues<typeof BridgedDeviceBasicInformationCluster.attributes>,
    ): void {
        // Add DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO device type to the device exposed via Aggregator
        const deviceTypes = device.getDeviceTypes();
        if (!deviceTypes.includes(DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO)) {
            deviceTypes.push(DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO);
            device.setDeviceTypes(deviceTypes);
        }
        if (bridgedBasicInformation !== undefined) {
            device.addClusterServer(ClusterServer(BridgedDeviceBasicInformationCluster, bridgedBasicInformation, {}));
        } else {
            if (!device.hasClusterServer(BridgedDeviceBasicInformationCluster)) {
                throw new ImplementationError(
                    "BridgedDeviceBasicInformationCluster is required for bridged devices. Please add yourself or provide as second parameter",
                );
            }
        }
        this.addChildEndpoint(device);
    }

    /**
     * Returns all bridged devices added to the Aggregator
     *
     * @returns Array of bridged devices
     */
    getBridgedDevices() {
        return this.getChildEndpoints();
    }

    removeBridgedDevice(device: Device | ComposedDevice) {
        this.removeChildEndpoint(device);
    }
}
