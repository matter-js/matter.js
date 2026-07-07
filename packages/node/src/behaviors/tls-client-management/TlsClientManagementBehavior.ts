/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlsClientManagement } from "@matter/types/clusters/tls-client-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * TlsClientManagementBehavior is the base class for objects that support interaction with
 * {@link TlsClientManagement.Cluster}.
 */
export const TlsClientManagementBehaviorConstructor = ClusterBehavior.for(TlsClientManagement);

export interface TlsClientManagementBehaviorConstructor extends Identity<typeof TlsClientManagementBehaviorConstructor> {}
export const TlsClientManagementBehavior: TlsClientManagementBehaviorConstructor = TlsClientManagementBehaviorConstructor;
export interface TlsClientManagementBehavior extends InstanceType<TlsClientManagementBehaviorConstructor> {}
export namespace TlsClientManagementBehavior {
    export interface State extends InstanceType<typeof TlsClientManagementBehavior.State> {}
}
