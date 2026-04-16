/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommissionerControl } from "@matter/types/clusters/commissioner-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * CommissionerControlBehavior is the base class for objects that support interaction with
 * {@link CommissionerControl.Cluster}.
 */
export const CommissionerControlBehaviorConstructor = ClusterBehavior.for(CommissionerControl);

export interface CommissionerControlBehaviorConstructor extends Identity<typeof CommissionerControlBehaviorConstructor> {}
export const CommissionerControlBehavior: CommissionerControlBehaviorConstructor = CommissionerControlBehaviorConstructor;
export interface CommissionerControlBehavior extends InstanceType<CommissionerControlBehaviorConstructor> {}
export namespace CommissionerControlBehavior {
    export interface State extends InstanceType<typeof CommissionerControlBehavior.State> {}
}
