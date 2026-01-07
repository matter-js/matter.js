/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EthernetNetworkDiagnostics } from "#clusters/ethernet-network-diagnostics";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { EthernetNetworkDiagnosticsInterface } from "./EthernetNetworkDiagnosticsInterface.js";
import { Identity } from "#general";

/**
 * EthernetNetworkDiagnosticsBehavior is the base class for objects that support interaction with
 * {@link EthernetNetworkDiagnostics.Cluster}.
 *
 * This class does not have optional features of EthernetNetworkDiagnostics.Cluster enabled. You can enable additional
 * features using EthernetNetworkDiagnosticsBehavior.with.
 */
export const EthernetNetworkDiagnosticsBehaviorConstructor = ClusterBehavior
    .withInterface<EthernetNetworkDiagnosticsInterface>()
    .for(EthernetNetworkDiagnostics.Cluster);

export interface EthernetNetworkDiagnosticsBehaviorConstructor extends Identity<typeof EthernetNetworkDiagnosticsBehaviorConstructor> {}
export const EthernetNetworkDiagnosticsBehavior: EthernetNetworkDiagnosticsBehaviorConstructor = EthernetNetworkDiagnosticsBehaviorConstructor;
export interface EthernetNetworkDiagnosticsBehavior extends InstanceType<EthernetNetworkDiagnosticsBehaviorConstructor> {}
export namespace EthernetNetworkDiagnosticsBehavior {
    export interface State extends InstanceType<typeof EthernetNetworkDiagnosticsBehavior.State> {}
}
