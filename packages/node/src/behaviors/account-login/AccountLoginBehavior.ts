/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AccountLogin } from "@matter/types/clusters/account-login";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * AccountLoginBehavior is the base class for objects that support interaction with {@link AccountLogin.Cluster}.
 */
export const AccountLoginBehaviorConstructor = ClusterBehavior.for(AccountLogin);

export interface AccountLoginBehaviorConstructor extends Identity<typeof AccountLoginBehaviorConstructor> {}
export const AccountLoginBehavior: AccountLoginBehaviorConstructor = AccountLoginBehaviorConstructor;
export interface AccountLoginBehavior extends InstanceType<AccountLoginBehaviorConstructor> {}
export namespace AccountLoginBehavior { export interface State extends InstanceType<typeof AccountLoginBehavior.State> {} }
