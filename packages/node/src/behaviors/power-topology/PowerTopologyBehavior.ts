/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerTopology } from "@matter/types/clusters/power-topology";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * PowerTopologyBehavior is the base class for objects that support interaction with {@link PowerTopology.Cluster}.
 *
 * PowerTopology.Cluster requires you to enable one or more optional features. You can do so using
 * {@link PowerTopologyBehavior.with}.
 */
export const PowerTopologyBehaviorConstructor = ClusterBehavior.for(PowerTopology);

export interface PowerTopologyBehaviorConstructor extends Identity<typeof PowerTopologyBehaviorConstructor> {}
export const PowerTopologyBehavior: PowerTopologyBehaviorConstructor = PowerTopologyBehaviorConstructor;
export interface PowerTopologyBehavior extends InstanceType<PowerTopologyBehaviorConstructor> {}
export namespace PowerTopologyBehavior {
    export interface State extends InstanceType<typeof PowerTopologyBehavior.State> {}
}
