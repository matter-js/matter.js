/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SoftwareDiagnostics } from "#clusters/software-diagnostics";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { SoftwareDiagnosticsInterface } from "./SoftwareDiagnosticsInterface.js";
import { Identity } from "#general";

/**
 * SoftwareDiagnosticsBehavior is the base class for objects that support interaction with
 * {@link SoftwareDiagnostics.Cluster}.
 *
 * This class does not have optional features of SoftwareDiagnostics.Cluster enabled. You can enable additional features
 * using SoftwareDiagnosticsBehavior.with.
 */
export const SoftwareDiagnosticsBehaviorConstructor = ClusterBehavior
    .withInterface<SoftwareDiagnosticsInterface>()
    .for(SoftwareDiagnostics.Cluster);

export interface SoftwareDiagnosticsBehaviorConstructor extends Identity<typeof SoftwareDiagnosticsBehaviorConstructor> {}
export const SoftwareDiagnosticsBehavior: SoftwareDiagnosticsBehaviorConstructor = SoftwareDiagnosticsBehaviorConstructor;
export interface SoftwareDiagnosticsBehavior extends InstanceType<SoftwareDiagnosticsBehaviorConstructor> {}
export namespace SoftwareDiagnosticsBehavior {
    export interface State extends InstanceType<typeof SoftwareDiagnosticsBehavior.State> {}
}
