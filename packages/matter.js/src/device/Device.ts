/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AtLeastOne, HandlerFunction, NamedHandler, NotImplementedError } from "@matter/general";
import { RootNodeDt } from "@matter/model";
import { Endpoint as NodeEndpoint } from "@matter/node";
import { ClusterClientObj, TypedClusterClientObj } from "@matter/protocol";
import { ClusterNamespace, ClusterType, EndpointNumber } from "@matter/types";
import { DeviceClasses, DeviceTypeDefinition, getDeviceTypeDefinitionFromModelByCode } from "./DeviceTypes.js";
import { Endpoint, EndpointOptions } from "./Endpoint.js";

/**
 * Temporary used device class for paired devices until we added a layer to choose the right specialized device class
 * based on the device classes and features of the paired device
 */
export class PairedDevice extends Endpoint {
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
        clusters: ClusterClientObj[] = [],
        endpointId: EndpointNumber,
    ) {
        super(endpoint, definition, { endpointId });
        clusters.forEach(cluster => {
            this.addClusterClient(cluster);
        });
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
        super(endpoint, [getDeviceTypeDefinitionFromModelByCode(RootNodeDt.id)!], { endpointId: EndpointNumber(0) });
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
    getRootClusterClient<const T extends ClusterType>(cluster: T): ClusterClientObj<T> | undefined;
    getRootClusterClient<const N extends ClusterNamespace.Concrete>(
        cluster: N,
    ): TypedClusterClientObj<N["Typing"]> | undefined;
    getRootClusterClient(
        cluster: ClusterType | ClusterNamespace.Concrete,
    ): ClusterClientObj | TypedClusterClientObj | undefined {
        return this.getClusterClient(cluster as ClusterType);
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
}
