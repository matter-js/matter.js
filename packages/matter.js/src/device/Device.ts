/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Binding, BridgedDeviceBasicInformationCluster } from "#clusters";
import { AtLeastOne, HandlerFunction, ImplementationError, NamedHandler, NotImplementedError } from "#general";
import { Endpoint as NodeEndpoint } from "#node";
import { ClusterClientObj } from "#protocol";
import { Cluster, ClusterType, EndpointNumber } from "#types";
import { ClusterServer } from "../cluster/server/ClusterServer.js";
import { ClusterServerHandlers, ClusterServerObj, isClusterServer } from "../cluster/server/ClusterServerTypes.js";
import { DeviceClasses, DeviceTypeDefinition, DeviceTypes } from "./DeviceTypes.js";
import { Endpoint, EndpointOptions } from "./Endpoint.js";
import { isClusterClient } from "./TypeHelpers.js";

/**
 * Utility function to wrap externally registered command handlers into the internal command handler and make sure
 * the custom ones are used if defined
 *
 * @param commandHandler Command handler instance with the registered handlers
 * @param handler Internal handlers instance to wrap the external handler into
 */
export const WrapCommandHandler = <C extends Cluster<any, any, any, any, any>>(
    handler: ClusterServerHandlers<C>,
    commandHandler?: NamedHandler<any>,
): ClusterServerHandlers<C> => {
    if (commandHandler === undefined) {
        return handler;
    }
    const mergedHandler = {} as any;
    for (const key in handler) {
        if (
            key.endsWith("AttributeGetter") ||
            key.endsWith("AttributeSetter") ||
            key.endsWith("AttributeValidator") ||
            key === "initializeClusterServer" ||
            key === "destroyClusterServer"
        ) {
            mergedHandler[key] = (handler as any)[key];
            continue;
        }
        mergedHandler[key] = async (...args: any[]) => {
            if (commandHandler.hasHandler(key)) {
                return await commandHandler.executeHandler(key, ...args);
            }
            return await (handler as any)[key](...args);
        };
    }
    return mergedHandler as ClusterServerHandlers<C>;
};

/**
 * Temporary used device class for paired devices until we added a layer to choose the right specialized device class
 * based on the device classes and features of the paired device
 */
export class PairedDevice extends Endpoint {
    private readonly declineAddingMoreClusters: boolean;
    /**
     * Create a new PairedDevice instance. All data are automatically parsed from the paired device!
     *
     * @param endpoint Underlying ClientEndpoint instance
     * @param definition DeviceTypeDefinitions of the paired device as reported by the device
     * @param clusters Clusters of the paired device as reported by the device
     * @param endpointId Endpoint ID of the paired device as reported by the device
     */
    constructor(
        endpoint: NodeEndpoint,
        definition: AtLeastOne<DeviceTypeDefinition>,
        clusters: (ClusterServerObj | ClusterClientObj)[] = [],
        endpointId: EndpointNumber,
    ) {
        super(endpoint, definition, { endpointId });
        clusters.forEach(cluster => {
            if (isClusterServer(cluster)) {
                this.addClusterServer(cluster);
            } else if (isClusterClient(cluster)) {
                this.addClusterClient(cluster);
            }
        });

        this.declineAddingMoreClusters = true;
    }

    /**
     * Add cluster servers (used internally only!)
     * @deprecated PairedDevice does not support adding additional clusters
     */
    override addClusterServer<const T extends ClusterType>(cluster: ClusterServerObj<T>) {
        if (this.declineAddingMoreClusters) {
            throw new ImplementationError("PairedDevice does not support adding additional clusters");
        }
        return super.addClusterServer(cluster);
    }

    /**
     * Add cluster clients (used internally only!)
     * @deprecated PairedDevice does not support adding additional clusters
     */
    override addClusterClient<const T extends ClusterType>(cluster: ClusterClientObj<T>) {
        if (this.declineAddingMoreClusters) {
            throw new ImplementationError("PairedDevice does not support adding additional clusters");
        }
        return super.addClusterClient(cluster);
    }
}

/**
 * Root endpoint of a device. This is used internally and not needed to be instanced by the user.
 */
export class RootEndpoint extends Endpoint {
    /**
     * Create a new RootEndpoint instance. This is automatically instanced by the CommissioningServer class.
     */
    constructor(endpoint: NodeEndpoint) {
        super(endpoint, [DeviceTypes.ROOT], { endpointId: EndpointNumber(0) });
    }

    /**
     * Get a cluster server from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param cluster ClusterServer to get or undefined if not existing
     */
    getRootClusterServer<const T extends ClusterType>(cluster: T): ClusterServerObj<T> | undefined {
        return this.getClusterServer(cluster);
    }

    /**
     * Add a cluster client to the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param cluster ClusterClient object to add
     */
    addRootClusterClient(cluster: ClusterClientObj) {
        this.addClusterClient(cluster);
    }

    /**
     * Get a cluster client from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param cluster ClusterClient to get or undefined if not existing
     */
    getRootClusterClient<const T extends ClusterType>(cluster: T): ClusterClientObj<T> | undefined {
        return this.getClusterClient(cluster);
    }
}

// TODO Add checks that only allowed clusters are added
// TODO add "get adds dummy instance" when optional and not existing
// TODO add typing support to know which clusters are available based on required clusters from device type def to be used by getClusterServer/Client

/**
 * Base class for all devices. This class should be extended by all devices.
 */
export class Device extends Endpoint {
    protected commandHandler = new NamedHandler<any>();

    /**
     * Create a new Device instance.
     *
     * @param endpoint Underlying ClientEndpoint instance
     * @param definition DeviceTypeDefinitions of the device
     * @param options Optional endpoint options
     */
    constructor(endpoint: NodeEndpoint, definition: DeviceTypeDefinition, options: EndpointOptions = {}) {
        if (definition.deviceClass === DeviceClasses.Node) {
            throw new NotImplementedError("MatterNode devices are not supported");
        }
        super(endpoint, [definition], options);
        if (definition.deviceClass === DeviceClasses.Simple || definition.deviceClass === DeviceClasses.Client) {
            this.addClusterServer(
                ClusterServer(
                    Binding.Cluster,
                    {
                        binding: [],
                    },
                    {},
                ),
            );
        }
    }

    /**
     * Method to add command handlers to the device.
     * The base class do not expose any commands!
     *
     * @param command Command name to add a handler for
     * @param handler Handler function to be executed when the command is received
     */
    addCommandHandler(command: never, handler: HandlerFunction) {
        this.commandHandler.addHandler(command, handler);
    }

    /**
     * Method to remove command handlers from the device.
     * The base class do not expose any commands!
     *
     * @param command Command name to remove the handler from
     * @param handler Handler function to be removed
     */
    removeCommandHandler(command: never, handler: HandlerFunction) {
        this.commandHandler.removeHandler(command, handler);
    }

    /**
     * Execute a command handler. Should only be used internally, but cannot be declared as protected officially
     * because needed public for derived classes.
     *
     * @protected
     * @param command Command name to execute the handler for
     * @param args Arguments to be passed to the handler
     */
    protected async _executeHandler(command: never, ...args: any[]) {
        return await this.commandHandler.executeHandler(command, ...args);
    }

    protected createOptionalClusterServer<const T extends ClusterType>(_cluster: T): ClusterServerObj<T> {
        // TODO: Implement this in upper classes to add optional clusters on the fly
        throw new ImplementationError("createOptionalClusterServer needs to be implemented by derived classes");
    }

    protected createOptionalClusterClient<const T extends ClusterType>(_cluster: T): ClusterClientObj<T> {
        // TODO: Implement this in upper classes to add optional clusters on the fly
        throw new ImplementationError("createOptionalClusterClient needs to be implemented by derived classes");
    }

    override getClusterServer<const T extends ClusterType>(cluster: T): ClusterServerObj<T> | undefined {
        const clusterServer = super.getClusterServer(cluster);
        if (clusterServer !== undefined) {
            return clusterServer;
        }
        for (const deviceType of this.deviceTypes) {
            if (deviceType.optionalServerClusters.includes(cluster.id)) {
                const clusterServer = this.createOptionalClusterServer(cluster);
                this.addClusterServer(clusterServer);
                return clusterServer;
            }
        }
    }

    override getClusterClient<const T extends ClusterType>(cluster: T): ClusterClientObj<T> | undefined {
        const clusterClient = super.getClusterClient(cluster);
        if (clusterClient !== undefined) {
            return clusterClient;
        }
        for (const deviceType of this.deviceTypes) {
            if (deviceType.optionalClientClusters.includes(cluster.id)) {
                const clusterClient = this.createOptionalClusterClient(cluster);
                this.addClusterClient(clusterClient);
            }
        }
    }

    /**
     * Set the reachability of the device exposed via the bridge. If this is a device inside  a composed device the
     * reachability needs to be set there.
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
