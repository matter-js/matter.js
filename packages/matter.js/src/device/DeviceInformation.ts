/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BasicInformation,
    Descriptor,
    IcdManagement,
    NetworkCommissioning,
    PowerSource,
    ThreadNetworkDiagnostics,
} from "#clusters";
import { RetransmissionLimitReachedError } from "#protocol";
import { Logger, Seconds, SupportedStorageTypes } from "@matter/general";
import { InteractionClient, PhysicalDeviceProperties, SupportedAttributeClient } from "@matter/protocol";
import { EndpointNumber, GlobalAttributes, NodeId, TypeFromPartialBitSchema, TypeFromSchema } from "@matter/types";
import { Endpoint } from "./Endpoint.js";

const logger = Logger.get("DeviceInformation");

export type DeviceMetaInformation = PhysicalDeviceProperties & {
    dataRevision: number;
};

export type DeviceBasicInformation = Record<string, SupportedStorageTypes>;

export type DeviceInformationData = {
    basicInformation?: Record<string, SupportedStorageTypes>;
    deviceMeta?: DeviceMetaInformation;
};

export const DEVICE_DATA_REVISION = 1;

const GlobalAttributeKeys = Object.keys(GlobalAttributes({}));

export class DeviceInformation {
    #basicInformation?: DeviceBasicInformation;
    #deviceMeta?: DeviceMetaInformation;

    constructor(
        readonly nodeId: NodeId,
        data: DeviceInformationData,
    ) {
        this.#basicInformation = data.basicInformation;
        this.#deviceMeta = data.deviceMeta;
    }

    get meta() {
        return this.#deviceMeta;
    }

    get basicInformation() {
        return this.#basicInformation;
    }

    get valid() {
        return (
            this.#basicInformation !== undefined &&
            this.#deviceMeta !== undefined &&
            this.#deviceMeta?.dataRevision === DEVICE_DATA_REVISION
        );
    }

    async enhanceDeviceDetailsFromCache(rootEndpoint: Endpoint) {
        const basicInformationData = {} as Record<string, SupportedStorageTypes>;
        const deviceData: DeviceMetaInformation = {
            ethernetConnected: false,
            wifiConnected: false,
            threadConnected: false,
            rootEndpointServerList: [] as number[],
            isMainsPowered: false,
            isBatteryPowered: false,
            isIntermittentlyConnected: false,
            isThreadSleepyEndDevice: false,
            dataRevision: DEVICE_DATA_REVISION,
        };

        const basicInformationClient = rootEndpoint.getClusterClient(BasicInformation.Cluster);
        if (basicInformationClient !== undefined) {
            for (const attributeName of Object.keys(basicInformationClient.attributes)) {
                if (
                    GlobalAttributeKeys.includes(attributeName) ||
                    !basicInformationClient.isAttributeSupportedByName(attributeName)
                ) {
                    continue;
                }
                const attribute = (basicInformationClient.attributes as any)[attributeName];
                if (attribute instanceof SupportedAttributeClient) {
                    try {
                        basicInformationData[attributeName] = await attribute.get(false, false);
                    } catch (error) {
                        RetransmissionLimitReachedError.reject(error);
                        logger.info(`Error while getting attribute ${attributeName} for node ${this.nodeId}: ${error}`);
                    }
                }
            }
        } else {
            logger.info(`No basic information cluster found for node ${this.nodeId}`);
        }

        const descriptorClient = rootEndpoint.getClusterClient(Descriptor.Cluster);
        if (descriptorClient !== undefined) {
            const serverList = await descriptorClient.getServerListAttribute(false, false);
            deviceData.rootEndpointServerList = serverList;
            if (serverList.includes(IcdManagement.Cluster.id)) {
                deviceData.isIntermittentlyConnected = true;
            }
        } else {
            logger.info(`No descriptor cluster found for node ${this.nodeId}`);
        }

        const threadNetworkDiagnosticClient = rootEndpoint.getClusterClient(ThreadNetworkDiagnostics.Cluster);
        if (threadNetworkDiagnosticClient !== undefined) {
            const routingRole = await threadNetworkDiagnosticClient.getRoutingRoleAttribute(false, false);
            if (routingRole === ThreadNetworkDiagnostics.RoutingRole.SleepyEndDevice) {
                deviceData.isThreadSleepyEndDevice = true;
            }
        }

        await this.#collectEndpointStates(rootEndpoint, deviceData);

        this.#basicInformation = basicInformationData;
        this.#deviceMeta = deviceData;
    }

    async #collectEndpointStates(endpoint: Endpoint, deviceData: DeviceMetaInformation) {
        const networkCluster = endpoint.getClusterClient(NetworkCommissioning.Complete);
        if (networkCluster !== undefined) {
            if (await networkCluster.getInterfaceEnabledAttribute(false, false)) {
                const networks = await networkCluster.getNetworksAttribute(false, false);
                if (networks) {
                    if (networks.some(network => network.connected)) {
                        const features = networkCluster.supportedFeatures;
                        if (features.ethernetNetworkInterface) {
                            deviceData.ethernetConnected = true;
                        } else if (features.wiFiNetworkInterface) {
                            deviceData.wifiConnected = true;
                        } else if (features.threadNetworkInterface) {
                            deviceData.threadConnected = true;
                        }
                    }
                }
            }
        }

        if (!deviceData.isBatteryPowered) {
            // Only query if PowerSource with Battery not already found
            const powerSourceCluster = endpoint.getClusterClient(PowerSource.Complete);
            if (powerSourceCluster !== undefined) {
                const features = powerSourceCluster.supportedFeatures;
                if (
                    features.battery ||
                    !features.wired ||
                    powerSourceCluster.isAttributeSupportedByName("batChargeLevel") // We saw devices with wrong features
                ) {
                    const status = await powerSourceCluster.getStatusAttribute(false, false);
                    if (
                        status === PowerSource.PowerSourceStatus.Active ||
                        status === PowerSource.PowerSourceStatus.Unspecified
                    ) {
                        deviceData.isBatteryPowered = true;
                    }
                }
            }
        }
        for (const childEndpoint of endpoint.getChildEndpoints()) {
            await this.#collectEndpointStates(childEndpoint, deviceData);
        }
    }

    async enhanceDeviceDetailsFromRemote(interactionClient: InteractionClient) {
        const readData = await interactionClient.getMultipleAttributes({
            attributes: [
                { endpointId: EndpointNumber(0), clusterId: BasicInformation.Cluster.id },
                {
                    endpointId: EndpointNumber(0),
                    clusterId: Descriptor.Cluster.id,
                    attributeId: Descriptor.Cluster.attributes.serverList.id,
                },
                {
                    clusterId: NetworkCommissioning.Cluster.id,
                    attributeId: NetworkCommissioning.Complete.attributes.featureMap.id,
                },
                {
                    clusterId: NetworkCommissioning.Cluster.id,
                    attributeId: NetworkCommissioning.Complete.attributes.networks.id,
                },
                {
                    clusterId: NetworkCommissioning.Cluster.id,
                    attributeId: NetworkCommissioning.Complete.attributes.interfaceEnabled.id,
                },
                {
                    clusterId: PowerSource.Cluster.id,
                    attributeId: PowerSource.Complete.attributes.featureMap.id,
                },
                {
                    clusterId: PowerSource.Cluster.id,
                    attributeId: PowerSource.Complete.attributes.status.id,
                },
                {
                    endpointId: EndpointNumber(0),
                    clusterId: ThreadNetworkDiagnostics.Cluster.id,
                    attributeId: ThreadNetworkDiagnostics.Cluster.attributes.routingRole.id,
                },
            ],
        });
        const basicInformationData = {} as Record<string, SupportedStorageTypes>;
        const deviceData: DeviceMetaInformation = {
            ethernetConnected: false,
            wifiConnected: false,
            threadConnected: false,
            rootEndpointServerList: [] as number[],
            isMainsPowered: false,
            isBatteryPowered: false,
            isIntermittentlyConnected: false,
            isThreadSleepyEndDevice: false,
            dataRevision: DEVICE_DATA_REVISION,
        };
        const networkData = new Map<
            EndpointNumber,
            {
                type?: TypeFromPartialBitSchema<typeof NetworkCommissioning.Complete.features>;
                enabled?: boolean;
                connected?: boolean;
            }
        >();
        const powerSourceData = new Map<
            EndpointNumber,
            { features?: TypeFromPartialBitSchema<typeof PowerSource.Complete.features>; status?: number }
        >();
        for (const {
            path: { endpointId, clusterId, attributeId, attributeName },
            value,
        } of readData) {
            switch (clusterId) {
                case BasicInformation.Cluster.id:
                    if (!GlobalAttributeKeys.includes(attributeName)) {
                        basicInformationData[attributeName] = value;
                    }
                    break;
                case Descriptor.Cluster.id:
                    if (attributeId === Descriptor.Cluster.attributes.serverList.id) {
                        deviceData.rootEndpointServerList = value;
                        if (value.includes(IcdManagement.Cluster.id)) {
                            deviceData.isIntermittentlyConnected = true;
                        }
                    }
                    break;
                case NetworkCommissioning.Cluster.id:
                    const networkEntry = networkData.get(endpointId) ?? {};
                    if (attributeId === NetworkCommissioning.Complete.attributes.featureMap.id) {
                        networkEntry.type = value;
                    } else if (attributeId === NetworkCommissioning.Complete.attributes.interfaceEnabled.id) {
                        networkEntry.enabled = value;
                    } else if (attributeId === NetworkCommissioning.Complete.attributes.networks.id) {
                        networkEntry.connected = (
                            value as TypeFromSchema<typeof NetworkCommissioning.TlvNetworkInfo>[]
                        ).some(network => network.connected);
                    }
                    networkData.set(endpointId, networkEntry);
                    break;
                case PowerSource.Cluster.id:
                    const powerSourceEntry = powerSourceData.get(endpointId) ?? {};
                    if (attributeId === PowerSource.Complete.attributes.featureMap.id) {
                        powerSourceEntry.features = value;
                    } else if (attributeId === PowerSource.Complete.attributes.status.id) {
                        powerSourceEntry.status = value;
                    }
                    powerSourceData.set(endpointId, powerSourceEntry);
                    break;
                case ThreadNetworkDiagnostics.Cluster.id:
                    if (attributeId === ThreadNetworkDiagnostics.Cluster.attributes.routingRole.id) {
                        if (value === ThreadNetworkDiagnostics.RoutingRole.SleepyEndDevice) {
                            deviceData.isThreadSleepyEndDevice = true;
                        }
                    }
                    break;
            }
        }

        if (networkData.size === 0) {
            // No Network cluster, so Custom Network, assume ethernet for now
            deviceData.ethernetConnected = true;
        } else {
            for (const { type, enabled, connected } of networkData.values()) {
                if (!type || !enabled || !connected) continue;
                if (type.ethernetNetworkInterface) {
                    deviceData.ethernetConnected = true;
                } else if (type.wiFiNetworkInterface) {
                    deviceData.wifiConnected = true;
                } else if (type.threadNetworkInterface) {
                    deviceData.threadConnected = true;
                }
            }
        }
        for (const { features, status } of powerSourceData.values()) {
            if (features?.battery && status === PowerSource.PowerSourceStatus.Active) {
                deviceData.isBatteryPowered = true;
            }
        }
        this.#basicInformation = basicInformationData;
        this.#deviceMeta = deviceData;
    }

    determineSubscriptionParameters({
        subscribeMinIntervalFloorSeconds,
        subscribeMaxIntervalCeilingSeconds,
    }: {
        subscribeMinIntervalFloorSeconds?: number;
        subscribeMaxIntervalCeilingSeconds?: number;
    }) {
        const { minIntervalFloor, maxIntervalCeiling } = PhysicalDeviceProperties.subscriptionIntervalBoundsFor({
            properties: this.#deviceMeta,
            description: `Node ${this.nodeId}`,
            request: {
                minIntervalFloor: subscribeMinIntervalFloorSeconds && Seconds(subscribeMinIntervalFloorSeconds),
                maxIntervalCeiling: subscribeMaxIntervalCeilingSeconds && Seconds(subscribeMaxIntervalCeilingSeconds),
            },
        });

        return {
            minIntervalFloorSeconds: Seconds.of(minIntervalFloor),
            maxIntervalCeilingSeconds: Seconds.of(maxIntervalCeiling),
        };
    }

    toStorageData(): DeviceInformationData {
        return {
            basicInformation: this.#basicInformation,
            deviceMeta: this.#deviceMeta,
        };
    }
}
