/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AccessControl } from "#clusters/access-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { AccessControlInterface } from "./AccessControlInterface.js";
import { Identity } from "#general";

/**
 * AccessControlBehavior is the base class for objects that support interaction with {@link AccessControl.Cluster}.
 *
 * This class does not have optional features of AccessControl.Cluster enabled. You can enable additional features using
 * AccessControlBehavior.with.
 */
export const AccessControlBehaviorConstructor = ClusterBehavior
    .withInterface<AccessControlInterface>()
    .for(AccessControl.Cluster);

export interface AccessControlBehaviorConstructor extends Identity<typeof AccessControlBehaviorConstructor> {}
export const AccessControlBehavior: AccessControlBehaviorConstructor = AccessControlBehaviorConstructor;
export interface AccessControlBehavior extends InstanceType<AccessControlBehaviorConstructor> {}
export namespace AccessControlBehavior {
    export interface State extends InstanceType<typeof AccessControlBehavior.State> {}
}
