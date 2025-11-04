/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AccountLogin } from "#clusters/account-login";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const AccountLoginClientConstructor = ClientBehavior(AccountLogin.Complete);
export interface AccountLoginClient extends InstanceType<typeof AccountLoginClientConstructor> {}
export interface AccountLoginClientConstructor extends Identity<typeof AccountLoginClientConstructor> {}
export const AccountLoginClient: AccountLoginClientConstructor = AccountLoginClientConstructor;
