/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";

/**
 * Definitions for the PowerSourceConfiguration cluster.
 *
 * This cluster is used to describe the configuration and capabilities of a Device’s power system. It provides an
 * ordering overview as well as linking to the one or more endpoints each supporting a Power Source cluster.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.6
 */
export declare namespace PowerSourceConfiguration {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x002e;

    /**
     * Textual cluster identifier.
     */
    export const name: "PowerSourceConfiguration";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the PowerSourceConfiguration cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link PowerSourceConfiguration} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This list shall contain the set of all power sources capable of participating in the power system of this
         * Node. Each entry in the list shall be the endpoint number of an endpoint having a Power Source cluster, which
         * corresponds to a physical power source. The endpoint number shall be unique within the list.
         *
         * The order of power sources on a Node is defined by the Order attribute of its associated Power Source cluster
         * provided on the endpoint. List entries shall be sorted in increasing order, that is, an entry with a lower
         * order shall have a lower index than any entry with a higher order. Multiple entries may have the same order,
         * there are no restrictions on their relative sorting.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.6.4.1
         */
        sources: EndpointNumber[];
    }

    /**
     * Attributes that may appear in {@link PowerSourceConfiguration}.
     */
    export interface Attributes {
        /**
         * This list shall contain the set of all power sources capable of participating in the power system of this
         * Node. Each entry in the list shall be the endpoint number of an endpoint having a Power Source cluster, which
         * corresponds to a physical power source. The endpoint number shall be unique within the list.
         *
         * The order of power sources on a Node is defined by the Order attribute of its associated Power Source cluster
         * provided on the endpoint. List entries shall be sorted in increasing order, that is, an entry with a lower
         * order shall have a lower index than any entry with a higher order. Multiple entries may have the same order,
         * there are no restrictions on their relative sorting.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.6.4.1
         */
        sources: EndpointNumber[];
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link PowerSourceConfiguration}.
     */
    export const Cluster: typeof PowerSourceConfiguration;

    /**
     * @deprecated Use {@link PowerSourceConfiguration}.
     */
    export const Complete: typeof PowerSourceConfiguration;

    export const Typing: PowerSourceConfiguration;
}

/**
 * @deprecated Use {@link PowerSourceConfiguration}.
 */
export declare const PowerSourceConfigurationCluster: typeof PowerSourceConfiguration;

export interface PowerSourceConfiguration extends ClusterTyping {
    Attributes: PowerSourceConfiguration.Attributes;
    Components: PowerSourceConfiguration.Components;
}
