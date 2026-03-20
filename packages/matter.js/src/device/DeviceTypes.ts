/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { capitalize } from "@matter/general";
import { Matter } from "@matter/model";
import { ClusterId, DeviceTypeId } from "@matter/types";

/**
 * General device classification categories.
 */
export enum DeviceClasses {
    /** Node device type. */
    Node = "Node",

    /**
     * Utility device type.
     * A Utility device type supports configuration and settings.
     */
    Utility = "Utility",

    /**
     * Application device type.
     * Application devices types are typically the most datatype endpoints on a node and in the network.
     */
    App = "App",

    /**
     * Simple device type.
     * A Simple device type supports local control that is persistent, independent, and unsupervised.
     */
    Simple = "Simple",

    /**
     * Dynamic device type.
     * A Dynamic device type supports intelligent and supervisory services, such as commissioning,
     * monitoring, trend analysis, scheduling and central management. A dynamic device type is an
     * application device type.
     */
    Dynamic = "Dynamic",

    /** There exists a client application cluster on the endpoint. */
    Client = "Client",

    /** There exists a server application cluster on the endpoint. */
    Server = "Server",

    /** The device type is composed of 2 or more device types. */
    Composed = "Composed",

    /** Composed device type that is composed of 2 or more endpoints with the same device type. */
    Multiple = "Multiple",

    /** The endpoint is an Initiator for Zigbee EZ-Mode Finding & Binding. */
    "EZInitiator" = "EZ-Initiator",

    /** The endpoint is a Target for Zigbee EZ-Mode Finding & Binding. */
    "EZTarget" = "EZ-Target",

    /**
     * The endpoint represents a Bridged Device, for which information about the state of
     * its power source is available to the Bridge
     */
    BridgedPowerSourceInfo = "BridgedPowerSourceInfo",
}

export interface DeviceTypeDefinition {
    name: string;
    code: DeviceTypeId;
    deviceClass: DeviceClasses;
    superSet?: string;
    revision: number;
    requiredServerClusters: ClusterId[];
    optionalServerClusters: ClusterId[];
    requiredClientClusters: ClusterId[];
    optionalClientClusters: ClusterId[];
    unknown: boolean;
}

export const DeviceTypeDefinition = ({
    name,
    code,
    deviceClass,
    superSet,
    revision,
    requiredServerClusters = [],
    optionalServerClusters = [],
    requiredClientClusters = [],
    optionalClientClusters = [],
    unknown = false,
}: {
    name: string;
    code: number;
    deviceClass: DeviceClasses;
    superSet?: string;
    revision: number;
    requiredServerClusters?: ClusterId[];
    optionalServerClusters?: ClusterId[];
    requiredClientClusters?: ClusterId[];
    optionalClientClusters?: ClusterId[];
    unknown?: boolean;
}): DeviceTypeDefinition => ({
    name,
    code: DeviceTypeId(code),
    deviceClass,
    superSet,
    revision,
    requiredServerClusters,
    optionalServerClusters,
    requiredClientClusters,
    optionalClientClusters,
    unknown,
});

/**
 * @deprecated These definitions will not be updated beyond Matter 1.1, use getDeviceTypeDefinitionFromModelByCode
 *   instead.
 */
export const DeviceTypes: { [key: string]: DeviceTypeDefinition } = {};

export const UnknownDeviceType = (code: number, revision: number) =>
    DeviceTypeDefinition({
        code,
        name: `Unknown Device Type ${code}`,
        deviceClass: DeviceClasses.Simple,
        revision,
        unknown: true,
    });

/** @deprecated Use getDeviceTypeDefinitionFromModelByCode instead. */
export function getDeviceTypeDefinitionByCode(code: number): DeviceTypeDefinition | undefined {
    return getDeviceTypeDefinitionFromModelByCode(code);
}

/** Cache of all device types dynamically generated from model. */
const DynamicDeviceType: { [key: string]: DeviceTypeDefinition } = {};

export function getDeviceTypeDefinitionFromModelByCode(code: number): DeviceTypeDefinition | undefined {
    if (DynamicDeviceType[code] !== undefined) {
        return DynamicDeviceType[code];
    }

    const device = Matter.deviceTypes(code);
    if (device === undefined) {
        return undefined;
    }

    const deviceDetails = {
        name: `MA-${device.name.toLowerCase()}`,
        revision: 0,
        code: device.id,
        deviceClass: capitalize(device.classification as string) as DeviceClasses,
        superSet: device.type
            ?.replace(/([A-Z])/g, "_$1")
            .substring(1)
            .toUpperCase(),
        requiredServerClusters: new Array<ClusterId>(),
        optionalServerClusters: new Array<ClusterId>(),
        requiredClientClusters: new Array<ClusterId>(),
        optionalClientClusters: new Array<ClusterId>(),
    };

    device.requirements.forEach(req => {
        if (req.id === undefined) {
            return;
        }
        if (req.name === "Descriptor") {
            const deviceTypeList = req.requirements.find(r => r.element === "attribute" && r.name === "DeviceTypeList");
            if (deviceTypeList) {
                deviceDetails.revision = deviceTypeList.default[0].revision;
            }
        } else if (req.element === "serverCluster") {
            if (req.isMandatory) {
                deviceDetails.requiredServerClusters.push(ClusterId(req.id));
            } else {
                deviceDetails.optionalServerClusters.push(ClusterId(req.id));
            }
        } else if (req.element === "clientCluster") {
            if (req.isMandatory) {
                deviceDetails.requiredClientClusters.push(ClusterId(req.id));
            } else {
                deviceDetails.optionalClientClusters.push(ClusterId(req.id));
            }
        }
    });

    if (
        deviceDetails.revision === 0 ||
        (deviceDetails.requiredClientClusters.length === 0 &&
            deviceDetails.requiredServerClusters.length === 0 &&
            deviceDetails.optionalClientClusters.length === 0 &&
            deviceDetails.optionalServerClusters.length === 0)
    ) {
        return undefined;
    }

    DynamicDeviceType[code] = DeviceTypeDefinition(deviceDetails);

    return DynamicDeviceType[code];
}
