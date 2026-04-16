/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { JointFabricDatastore } from "@matter/types/clusters/joint-fabric-datastore";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * JointFabricDatastoreBehavior is the base class for objects that support interaction with
 * {@link JointFabricDatastore.Cluster}.
 */
export const JointFabricDatastoreBehaviorConstructor = ClusterBehavior.for(JointFabricDatastore);

export interface JointFabricDatastoreBehaviorConstructor extends Identity<typeof JointFabricDatastoreBehaviorConstructor> {}
export const JointFabricDatastoreBehavior: JointFabricDatastoreBehaviorConstructor = JointFabricDatastoreBehaviorConstructor;
export interface JointFabricDatastoreBehavior extends InstanceType<JointFabricDatastoreBehaviorConstructor> {}
export namespace JointFabricDatastoreBehavior {
    export interface State extends InstanceType<typeof JointFabricDatastoreBehavior.State> {}
}
