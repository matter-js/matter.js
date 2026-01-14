/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OperationalCredentials } from "#clusters/operational-credentials";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OperationalCredentialsInterface } from "./OperationalCredentialsInterface.js";
import { Identity } from "#general";

/**
 * OperationalCredentialsBehavior is the base class for objects that support interaction with
 * {@link OperationalCredentials.Cluster}.
 */
export const OperationalCredentialsBehaviorConstructor = ClusterBehavior
    .withInterface<OperationalCredentialsInterface>()
    .for(OperationalCredentials.Cluster);

export interface OperationalCredentialsBehaviorConstructor extends Identity<typeof OperationalCredentialsBehaviorConstructor> {}
export const OperationalCredentialsBehavior: OperationalCredentialsBehaviorConstructor = OperationalCredentialsBehaviorConstructor;
export interface OperationalCredentialsBehavior extends InstanceType<OperationalCredentialsBehaviorConstructor> {}
export namespace OperationalCredentialsBehavior {
    export interface State extends InstanceType<typeof OperationalCredentialsBehavior.State> {}
}
