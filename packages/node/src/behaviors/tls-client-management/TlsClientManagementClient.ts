/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlsClientManagement } from "@matter/types/clusters/tls-client-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const TlsClientManagementClientConstructor = ClientBehavior(TlsClientManagement);
export interface TlsClientManagementClient extends InstanceType<typeof TlsClientManagementClientConstructor> {}
export interface TlsClientManagementClientConstructor extends Identity<typeof TlsClientManagementClientConstructor> {}
export const TlsClientManagementClient: TlsClientManagementClientConstructor = TlsClientManagementClientConstructor;
