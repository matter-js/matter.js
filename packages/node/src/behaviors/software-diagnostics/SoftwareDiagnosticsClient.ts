/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SoftwareDiagnostics } from "#clusters/software-diagnostics";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const SoftwareDiagnosticsClientConstructor = ClientBehavior(SoftwareDiagnostics.Complete);
export interface SoftwareDiagnosticsClient extends InstanceType<typeof SoftwareDiagnosticsClientConstructor> {}
export interface SoftwareDiagnosticsClientConstructor extends Identity<typeof SoftwareDiagnosticsClientConstructor> {}
export const SoftwareDiagnosticsClient: SoftwareDiagnosticsClientConstructor = SoftwareDiagnosticsClientConstructor;
