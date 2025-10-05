/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "#model";
import { DeviceTypeId } from "#types";
import { SupportedBehaviors } from "../properties/SupportedBehaviors.js";

/**
 * An EndpointType defines functionality for an endpoint.
 */
export interface EndpointType {
    name: string;
    deviceType: DeviceTypeId;
    deviceRevision: number;
    deviceClass: DeviceClassification;
    behaviors: SupportedBehaviors;
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
        requirements: options.requirements ?? {},
    } as unknown as EndpointType.For<T>;
}

export namespace EndpointType {
    export const UNKNOWN_DEVICE_TYPE = DeviceTypeId(-1, false);
    export const UNKNOWN_DEVICE_REVISION = -1;

    /**
     * An endpoint type with no behaviors or requirements.
     */
    export interface Empty extends Omit<EndpointType, "behaviors" | "requirements"> {
        behaviors: {};
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
    }
}
