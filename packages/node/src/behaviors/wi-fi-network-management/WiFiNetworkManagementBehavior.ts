/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WiFiNetworkManagement } from "#clusters/wi-fi-network-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WiFiNetworkManagementInterface } from "./WiFiNetworkManagementInterface.js";
import { Identity } from "#general";

/**
 * WiFiNetworkManagementBehavior is the base class for objects that support interaction with
 * {@link WiFiNetworkManagement.Cluster}.
 */
export const WiFiNetworkManagementBehaviorConstructor = ClusterBehavior
    .withInterface<WiFiNetworkManagementInterface>()
    .for(WiFiNetworkManagement.Cluster);

export interface WiFiNetworkManagementBehaviorConstructor extends Identity<typeof WiFiNetworkManagementBehaviorConstructor> {}
export const WiFiNetworkManagementBehavior: WiFiNetworkManagementBehaviorConstructor = WiFiNetworkManagementBehaviorConstructor;
export interface WiFiNetworkManagementBehavior extends InstanceType<WiFiNetworkManagementBehaviorConstructor> {}
export namespace WiFiNetworkManagementBehavior {
    export interface State extends InstanceType<typeof WiFiNetworkManagementBehavior.State> {}
}
