/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WiFiNetworkDiagnostics } from "#clusters/wi-fi-network-diagnostics";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const WiFiNetworkDiagnosticsClientConstructor = ClientBehavior(WiFiNetworkDiagnostics.Complete);
export interface WiFiNetworkDiagnosticsClient extends InstanceType<typeof WiFiNetworkDiagnosticsClientConstructor> {}
export interface WiFiNetworkDiagnosticsClientConstructor extends Identity<typeof WiFiNetworkDiagnosticsClientConstructor> {}
export const WiFiNetworkDiagnosticsClient: WiFiNetworkDiagnosticsClientConstructor = WiFiNetworkDiagnosticsClientConstructor;
