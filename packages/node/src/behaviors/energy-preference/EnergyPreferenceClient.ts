/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyPreference } from "@matter/types/clusters/energy-preference";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const EnergyPreferenceClientConstructor = ClientBehavior(EnergyPreference);
export interface EnergyPreferenceClient extends InstanceType<typeof EnergyPreferenceClientConstructor> {}
export interface EnergyPreferenceClientConstructor extends Identity<typeof EnergyPreferenceClientConstructor> {}
export const EnergyPreferenceClient: EnergyPreferenceClientConstructor = EnergyPreferenceClientConstructor;
