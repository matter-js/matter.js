/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { JointFabricDatastore } from "#clusters/joint-fabric-datastore";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { JointFabricDatastoreInterface } from "./JointFabricDatastoreInterface.js";
import { Identity } from "#general";

/**
 * JointFabricDatastoreBehavior is the base class for objects that support interaction with
 * {@link JointFabricDatastore.Cluster}.
 */
export const JointFabricDatastoreBehaviorConstructor = ClusterBehavior
    .withInterface<JointFabricDatastoreInterface>()
    .for(JointFabricDatastore.Cluster);

export interface JointFabricDatastoreBehaviorConstructor extends Identity<typeof JointFabricDatastoreBehaviorConstructor> {}
export const JointFabricDatastoreBehavior: JointFabricDatastoreBehaviorConstructor = JointFabricDatastoreBehaviorConstructor;
export interface JointFabricDatastoreBehavior extends InstanceType<JointFabricDatastoreBehaviorConstructor> {}
export namespace JointFabricDatastoreBehavior {
    export interface State extends InstanceType<typeof JointFabricDatastoreBehavior.State> {}
}
