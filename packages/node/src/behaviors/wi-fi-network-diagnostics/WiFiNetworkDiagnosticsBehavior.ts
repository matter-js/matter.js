/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WiFiNetworkDiagnostics } from "#clusters/wi-fi-network-diagnostics";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WiFiNetworkDiagnosticsInterface } from "./WiFiNetworkDiagnosticsInterface.js";
import { Identity } from "#general";

/**
 * WiFiNetworkDiagnosticsBehavior is the base class for objects that support interaction with
 * {@link WiFiNetworkDiagnostics.Cluster}.
 *
 * This class does not have optional features of WiFiNetworkDiagnostics.Cluster enabled. You can enable additional
 * features using WiFiNetworkDiagnosticsBehavior.with.
 */
export const WiFiNetworkDiagnosticsBehaviorConstructor = ClusterBehavior
    .withInterface<WiFiNetworkDiagnosticsInterface>()
    .for(WiFiNetworkDiagnostics.Cluster);

export interface WiFiNetworkDiagnosticsBehaviorConstructor extends Identity<typeof WiFiNetworkDiagnosticsBehaviorConstructor> {}
export const WiFiNetworkDiagnosticsBehavior: WiFiNetworkDiagnosticsBehaviorConstructor = WiFiNetworkDiagnosticsBehaviorConstructor;
export interface WiFiNetworkDiagnosticsBehavior extends InstanceType<WiFiNetworkDiagnosticsBehaviorConstructor> {}
export namespace WiFiNetworkDiagnosticsBehavior {
    export interface State extends InstanceType<typeof WiFiNetworkDiagnosticsBehavior.State> {}
}
