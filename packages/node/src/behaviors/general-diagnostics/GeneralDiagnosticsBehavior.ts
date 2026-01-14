/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { GeneralDiagnosticsInterface } from "./GeneralDiagnosticsInterface.js";
import { Identity } from "#general";

/**
 * GeneralDiagnosticsBehavior is the base class for objects that support interaction with
 * {@link GeneralDiagnostics.Cluster}.
 *
 * This class does not have optional features of GeneralDiagnostics.Cluster enabled. You can enable additional features
 * using GeneralDiagnosticsBehavior.with.
 */
export const GeneralDiagnosticsBehaviorConstructor = ClusterBehavior
    .withInterface<GeneralDiagnosticsInterface>()
    .for(GeneralDiagnostics.Cluster);

export interface GeneralDiagnosticsBehaviorConstructor extends Identity<typeof GeneralDiagnosticsBehaviorConstructor> {}
export const GeneralDiagnosticsBehavior: GeneralDiagnosticsBehaviorConstructor = GeneralDiagnosticsBehaviorConstructor;
export interface GeneralDiagnosticsBehavior extends InstanceType<GeneralDiagnosticsBehaviorConstructor> {}
export namespace GeneralDiagnosticsBehavior {
    export interface State extends InstanceType<typeof GeneralDiagnosticsBehavior.State> {}
}
