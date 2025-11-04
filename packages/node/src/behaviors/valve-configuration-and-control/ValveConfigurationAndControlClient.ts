/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ValveConfigurationAndControl } from "#clusters/valve-configuration-and-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ValveConfigurationAndControlClientConstructor = ClientBehavior(ValveConfigurationAndControl.Complete);
export interface ValveConfigurationAndControlClient extends InstanceType<typeof ValveConfigurationAndControlClientConstructor> {}
export interface ValveConfigurationAndControlClientConstructor extends Identity<typeof ValveConfigurationAndControlClientConstructor> {}
export const ValveConfigurationAndControlClient: ValveConfigurationAndControlClientConstructor = ValveConfigurationAndControlClientConstructor;
