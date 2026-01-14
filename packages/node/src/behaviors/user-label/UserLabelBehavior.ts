/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { UserLabel } from "#clusters/user-label";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * UserLabelBehavior is the base class for objects that support interaction with {@link UserLabel.Cluster}.
 */
export const UserLabelBehaviorConstructor = ClusterBehavior.for(UserLabel.Cluster);

export interface UserLabelBehaviorConstructor extends Identity<typeof UserLabelBehaviorConstructor> {}
export const UserLabelBehavior: UserLabelBehaviorConstructor = UserLabelBehaviorConstructor;
export interface UserLabelBehavior extends InstanceType<UserLabelBehaviorConstructor> {}
export namespace UserLabelBehavior { export interface State extends InstanceType<typeof UserLabelBehavior.State> {} }
