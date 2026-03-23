/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { PowerSourceConfiguration as PowerSourceConfigurationModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the PowerSourceConfiguration cluster.
 */
export declare namespace PowerSourceConfiguration {
    /**
     * {@link PowerSourceConfiguration} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This list shall contain the set of all power sources capable of participating in the power system of this
             * Node. Each entry in the list shall be the endpoint number of an endpoint having a Power Source cluster,
             * which corresponds to a physical power source. The endpoint number shall be unique within the list.
             *
             * The order of power sources on a Node is defined by the Order attribute of its associated Power Source
             * cluster provided on the endpoint. List entries shall be sorted in increasing order, that is, an entry
             * with a lower order shall have a lower index than any entry with a higher order. Multiple entries may have
             * the same order, there are no restrictions on their relative sorting.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.6.4.1
             */
            readonly sources: EndpointNumber[];
        }
    }

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "PowerSourceConfiguration";
    export const revision: 1;
    export const schema: typeof PowerSourceConfigurationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof PowerSourceConfiguration;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `PowerSourceConfiguration` instead of
     * `PowerSourceConfiguration.Complete`)
     */
    export const Complete: typeof PowerSourceConfiguration;

    export const Typing: PowerSourceConfiguration;
}

export declare const PowerSourceConfigurationCluster: typeof PowerSourceConfiguration;
export interface PowerSourceConfiguration extends ClusterTyping { Attributes: PowerSourceConfiguration.Attributes; Components: PowerSourceConfiguration.Components }
