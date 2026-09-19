/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "@matter/model";
import { DeviceTypeId } from "@matter/types";
import { SupportedBehaviors } from "../properties/SupportedBehaviors.js";
import { SupportedClientClusters } from "../properties/SupportedClientClusters.js";

/**
 * An EndpointType defines functionality for an endpoint.
 */
export interface EndpointType {
    name: string;
    deviceType: DeviceTypeId;
    deviceRevision: number;
    deviceClass: DeviceClassification;
    behaviors: SupportedBehaviors;
    clientClusters: SupportedClientClusters;
    requirements: EndpointType.Requirements;
}

/**
 * Define a new type of endpoint.
 */
export function EndpointType<const T extends EndpointType.Options>(options: T) {
    return {
        ...options,
        deviceClass: options.deviceClass ?? DeviceClassification.Simple,
        behaviors: options.behaviors ?? {},
        clientClusters: options.clientClusters ?? {},
        requirements: options.requirements ?? {},
    } as unknown as EndpointType.For<T>;
}

export namespace EndpointType {
    export const UNKNOWN_DEVICE_TYPE = DeviceTypeId(-1, false);
    export const UNKNOWN_DEVICE_REVISION = -1;

    /**
     * An endpoint type with no behaviors, client clusters, or requirements.
     */
    export interface Empty extends Omit<EndpointType, "behaviors" | "clientClusters" | "requirements"> {
        behaviors: {};
        clientClusters: {};
        requirements: {};
    }

    /**
     * A fully typed {@link EndpointType} defined by {@link EndpointType.Options}.
     */
    export type For<T extends EndpointType.Options> = {
        name: T["name"];
        deviceType: DeviceTypeId;
        deviceRevision: number;
        deviceClass: DeviceClassification;
        behaviors: T["behaviors"] extends SupportedBehaviors ? T["behaviors"] : {};
        clientClusters: T["clientClusters"] extends SupportedClientClusters ? T["clientClusters"] : {};
        requirements: T["requirements"] extends Requirements ? T["requirements"] : {};
    };

    /**
     * Endpoint configuration.
     */
    export interface Options {
        name: string;
        deviceType: number;
        deviceRevision: number;
        deviceClass?: DeviceClassification;
        behaviors?: SupportedBehaviors;
        clientClusters?: SupportedClientClusters;
        requirements?: Requirements;
    }

    /**
     * Standard dependencies for an endpoint per the Matter specification.
     */
    export interface Requirements {
        server?: {
            mandatory?: SupportedBehaviors;
            optional?: SupportedBehaviors;
        };

        client?: {
            mandatory?: SupportedBehaviors;
            optional?: SupportedBehaviors;
        };

        /**
         * Device types this device type requires of its child endpoints per the Matter specification.
         *
         * A device type requiring several endpoints of the same type, such as Battery Storage requiring an AC and a DC
         * Electrical Sensor, states each one separately and the key carries the instance number.
         */
        deviceTypes?: ComposedRequirements<ComposedDeviceType>;

        /**
         * Conditions this device type's requirements are stated against, keyed by condition name.
         *
         * A condition is a named predicate about the node, such as `Ethernet` or `PowerSourceCond`, declared by
         * another device type. It is not a device type in its own right. Nothing evaluates these yet; recording them
         * keeps the specification's statement available to whatever does.
         */
        conditions?: ComposedRequirements<ComposedCondition>;
    }

    export interface ComposedRequirements<T> {
        mandatory?: Record<string, T>;
        optional?: Record<string, T>;
    }

    interface RequirementDetail {
        /** The conformance the specification states, when it is neither plain mandatory nor plain optional */
        conformance?: string;

        /** An instance count such as "min 1", when the specification states one */
        constraint?: string;
    }

    export interface ComposedDeviceType extends RequirementDetail {
        deviceType: number;

        /**
         * What the specification requires of the composed device type beyond its identity — the clusters it must
         * carry and the features, attributes, commands and events those clusters must support.
         *
         * This is what distinguishes two instances of one device type. Battery Storage requires two Electrical
         * Sensors, one measuring AC and one DC, and only these requirements say which is which.
         */
        requires?: ComposedElement[];
    }

    /**
     * An element the specification requires of a composed device type, as the model states it.
     */
    export interface ComposedElement extends RequirementDetail {
        /** The kind of element, such as `serverCluster`, `feature` or `attribute` */
        element: string;

        name: string;
        id?: number;
        requires?: ComposedElement[];
    }

    export interface ComposedCondition extends RequirementDetail {
        /** The device type that declares the condition, such as `RootNode` */
        declaredBy?: string;

        /** The device type the condition applies to, where the specification states an identifier */
        deviceType?: number;
    }
}
