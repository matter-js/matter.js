/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { UserLabel } from "#clusters/user-label";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const UserLabelClientConstructor = ClientBehavior(UserLabel.Complete);
export interface UserLabelClient extends InstanceType<typeof UserLabelClientConstructor> {}
export interface UserLabelClientConstructor extends Identity<typeof UserLabelClientConstructor> {}
export const UserLabelClient: UserLabelClientConstructor = UserLabelClientConstructor;
