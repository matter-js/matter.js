/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommissionerControl } from "#clusters/commissioner-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { CommissionerControlInterface } from "./CommissionerControlInterface.js";
import { Identity } from "#general";

/**
 * CommissionerControlBehavior is the base class for objects that support interaction with
 * {@link CommissionerControl.Cluster}.
 */
export const CommissionerControlBehaviorConstructor = ClusterBehavior
    .withInterface<CommissionerControlInterface>()
    .for(CommissionerControl.Cluster);

export interface CommissionerControlBehaviorConstructor extends Identity<typeof CommissionerControlBehaviorConstructor> {}
export const CommissionerControlBehavior: CommissionerControlBehaviorConstructor = CommissionerControlBehaviorConstructor;
export interface CommissionerControlBehavior extends InstanceType<CommissionerControlBehaviorConstructor> {}
export namespace CommissionerControlBehavior {
    export interface State extends InstanceType<typeof CommissionerControlBehavior.State> {}
}
