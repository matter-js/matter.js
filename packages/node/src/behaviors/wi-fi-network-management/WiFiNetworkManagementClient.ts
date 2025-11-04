/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WiFiNetworkManagement } from "#clusters/wi-fi-network-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const WiFiNetworkManagementClientConstructor = ClientBehavior(WiFiNetworkManagement.Complete);
export interface WiFiNetworkManagementClient extends InstanceType<typeof WiFiNetworkManagementClientConstructor> {}
export interface WiFiNetworkManagementClientConstructor extends Identity<typeof WiFiNetworkManagementClientConstructor> {}
export const WiFiNetworkManagementClient: WiFiNetworkManagementClientConstructor = WiFiNetworkManagementClientConstructor;
