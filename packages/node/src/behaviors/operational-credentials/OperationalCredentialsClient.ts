/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const OperationalCredentialsClientConstructor = ClientBehavior(OperationalCredentials);
export interface OperationalCredentialsClient extends InstanceType<typeof OperationalCredentialsClientConstructor> {}
export interface OperationalCredentialsClientConstructor extends Identity<typeof OperationalCredentialsClientConstructor> {}
export const OperationalCredentialsClient: OperationalCredentialsClientConstructor = OperationalCredentialsClientConstructor;
