/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DiagnosticLogs } from "#clusters/diagnostic-logs";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const DiagnosticLogsClientConstructor = ClientBehavior(DiagnosticLogs.Complete);
export interface DiagnosticLogsClient extends InstanceType<typeof DiagnosticLogsClientConstructor> {}
export interface DiagnosticLogsClientConstructor extends Identity<typeof DiagnosticLogsClientConstructor> {}
export const DiagnosticLogsClient: DiagnosticLogsClientConstructor = DiagnosticLogsClientConstructor;
