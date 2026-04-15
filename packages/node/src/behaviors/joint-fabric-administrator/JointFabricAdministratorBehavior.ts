/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { JointFabricAdministrator } from "@matter/types/clusters/joint-fabric-administrator";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * JointFabricAdministratorBehavior is the base class for objects that support interaction with
 * {@link JointFabricAdministrator.Cluster}.
 */
export const JointFabricAdministratorBehaviorConstructor = ClusterBehavior.for(JointFabricAdministrator);

export interface JointFabricAdministratorBehaviorConstructor extends Identity<typeof JointFabricAdministratorBehaviorConstructor> {}
export const JointFabricAdministratorBehavior: JointFabricAdministratorBehaviorConstructor = JointFabricAdministratorBehaviorConstructor;
export interface JointFabricAdministratorBehavior extends InstanceType<JointFabricAdministratorBehaviorConstructor> {}
export namespace JointFabricAdministratorBehavior {
    export interface State extends InstanceType<typeof JointFabricAdministratorBehavior.State> {}
}
