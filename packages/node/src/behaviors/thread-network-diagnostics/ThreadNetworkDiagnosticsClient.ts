/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadNetworkDiagnostics } from "#clusters/thread-network-diagnostics";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ThreadNetworkDiagnosticsClientConstructor = ClientBehavior(ThreadNetworkDiagnostics.Complete);
export interface ThreadNetworkDiagnosticsClient extends InstanceType<typeof ThreadNetworkDiagnosticsClientConstructor> {}
export interface ThreadNetworkDiagnosticsClientConstructor extends Identity<typeof ThreadNetworkDiagnosticsClientConstructor> {}
export const ThreadNetworkDiagnosticsClient: ThreadNetworkDiagnosticsClientConstructor = ThreadNetworkDiagnosticsClientConstructor;
