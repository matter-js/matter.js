/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DiagnosticLogs } from "#clusters/diagnostic-logs";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { DiagnosticLogsInterface } from "./DiagnosticLogsInterface.js";
import { Identity } from "#general";

/**
 * DiagnosticLogsBehavior is the base class for objects that support interaction with {@link DiagnosticLogs.Cluster}.
 */
export const DiagnosticLogsBehaviorConstructor = ClusterBehavior
    .withInterface<DiagnosticLogsInterface>()
    .for(DiagnosticLogs.Cluster);

export interface DiagnosticLogsBehaviorConstructor extends Identity<typeof DiagnosticLogsBehaviorConstructor> {}
export const DiagnosticLogsBehavior: DiagnosticLogsBehaviorConstructor = DiagnosticLogsBehaviorConstructor;
export interface DiagnosticLogsBehavior extends InstanceType<DiagnosticLogsBehaviorConstructor> {}
export namespace DiagnosticLogsBehavior {
    export interface State extends InstanceType<typeof DiagnosticLogsBehavior.State> {}
}
