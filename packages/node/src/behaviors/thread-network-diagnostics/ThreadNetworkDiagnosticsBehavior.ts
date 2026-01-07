/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadNetworkDiagnostics } from "#clusters/thread-network-diagnostics";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ThreadNetworkDiagnosticsInterface } from "./ThreadNetworkDiagnosticsInterface.js";
import { Identity } from "#general";

/**
 * ThreadNetworkDiagnosticsBehavior is the base class for objects that support interaction with
 * {@link ThreadNetworkDiagnostics.Cluster}.
 *
 * This class does not have optional features of ThreadNetworkDiagnostics.Cluster enabled. You can enable additional
 * features using ThreadNetworkDiagnosticsBehavior.with.
 */
export const ThreadNetworkDiagnosticsBehaviorConstructor = ClusterBehavior
    .withInterface<ThreadNetworkDiagnosticsInterface>()
    .for(ThreadNetworkDiagnostics.Cluster);

export interface ThreadNetworkDiagnosticsBehaviorConstructor extends Identity<typeof ThreadNetworkDiagnosticsBehaviorConstructor> {}
export const ThreadNetworkDiagnosticsBehavior: ThreadNetworkDiagnosticsBehaviorConstructor = ThreadNetworkDiagnosticsBehaviorConstructor;
export interface ThreadNetworkDiagnosticsBehavior extends InstanceType<ThreadNetworkDiagnosticsBehaviorConstructor> {}
export namespace ThreadNetworkDiagnosticsBehavior {
    export interface State extends InstanceType<typeof ThreadNetworkDiagnosticsBehavior.State> {}
}
