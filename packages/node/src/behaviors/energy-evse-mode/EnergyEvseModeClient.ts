/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyEvseMode } from "@matter/types/clusters/energy-evse-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const EnergyEvseModeClientConstructor = ClientBehavior(EnergyEvseMode.Complete);
export interface EnergyEvseModeClient extends InstanceType<typeof EnergyEvseModeClientConstructor> {}
export interface EnergyEvseModeClientConstructor extends Identity<typeof EnergyEvseModeClientConstructor> {}
export const EnergyEvseModeClient: EnergyEvseModeClientConstructor = EnergyEvseModeClientConstructor;
