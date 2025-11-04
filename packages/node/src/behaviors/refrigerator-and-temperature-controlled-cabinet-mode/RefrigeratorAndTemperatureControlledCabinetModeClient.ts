/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    RefrigeratorAndTemperatureControlledCabinetMode
} from "#clusters/refrigerator-and-temperature-controlled-cabinet-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const RefrigeratorAndTemperatureControlledCabinetModeClientConstructor = ClientBehavior(
    RefrigeratorAndTemperatureControlledCabinetMode.Complete
);
export interface RefrigeratorAndTemperatureControlledCabinetModeClient extends InstanceType<typeof RefrigeratorAndTemperatureControlledCabinetModeClientConstructor> {}
export interface RefrigeratorAndTemperatureControlledCabinetModeClientConstructor extends Identity<typeof RefrigeratorAndTemperatureControlledCabinetModeClientConstructor> {}
export const RefrigeratorAndTemperatureControlledCabinetModeClient: RefrigeratorAndTemperatureControlledCabinetModeClientConstructor = RefrigeratorAndTemperatureControlledCabinetModeClientConstructor;
