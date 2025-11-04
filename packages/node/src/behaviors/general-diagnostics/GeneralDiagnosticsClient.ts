/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const GeneralDiagnosticsClientConstructor = ClientBehavior(GeneralDiagnostics.Complete);
export interface GeneralDiagnosticsClient extends InstanceType<typeof GeneralDiagnosticsClientConstructor> {}
export interface GeneralDiagnosticsClientConstructor extends Identity<typeof GeneralDiagnosticsClientConstructor> {}
export const GeneralDiagnosticsClient: GeneralDiagnosticsClientConstructor = GeneralDiagnosticsClientConstructor;
