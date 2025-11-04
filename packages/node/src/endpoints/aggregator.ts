/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PartsBehavior } from "../behavior/system/parts/PartsBehavior.js";
import { IndexBehavior } from "../behavior/system/index/IndexBehavior.js";
import { ActionsServer as BaseActionsServer } from "../behaviors/actions/ActionsServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    CommissionerControlServer as BaseCommissionerControlServer
} from "../behaviors/commissioner-control/CommissionerControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This device type aggregates endpoints as a collection. Clusters on the endpoint indicating this device type provide
 * functionality for the collection of descendant endpoints present in the PartsList of the endpoint’s descriptor, for
 * example the Actions cluster.
 *
 * The purpose of this device type is to aggregate functionality for a collection of endpoints. The definition of the
 * collection or functionality is not defined here.
 *
 * When using this device type as a collection of bridged nodes, please see the "Bridge" section in the System Model
 * specification.
 *
 * @see {@link MatterSpecification.v142.Device} § 11.2
 */
export interface AggregatorEndpoint extends Identity<typeof AggregatorEndpointDefinition> {}

export namespace AggregatorRequirements {
    /**
     * The Actions cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ActionsServer} for convenience.
     */
    export const ActionsServer = BaseActionsServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The CommissionerControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CommissionerControlServer} for convenience.
     */
    export const CommissionerControlServer = BaseCommissionerControlServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Parts: PartsBehavior, Index: IndexBehavior },
        optional: { Actions: ActionsServer, Identify: IdentifyServer, CommissionerControl: CommissionerControlServer }
    };
}

export const AggregatorEndpointDefinition = MutableEndpoint({
    name: "Aggregator",
    deviceType: 0xe,
    deviceRevision: 2,
    requirements: AggregatorRequirements,
    behaviors: SupportedBehaviors(
        AggregatorRequirements.server.mandatory.Parts,
        AggregatorRequirements.server.mandatory.Index
    )
});

export const AggregatorEndpoint: AggregatorEndpoint = AggregatorEndpointDefinition;
