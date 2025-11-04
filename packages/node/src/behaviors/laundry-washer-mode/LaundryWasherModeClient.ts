/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LaundryWasherMode } from "#clusters/laundry-washer-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const LaundryWasherModeClientConstructor = ClientBehavior(LaundryWasherMode.Complete);
export interface LaundryWasherModeClient extends InstanceType<typeof LaundryWasherModeClientConstructor> {}
export interface LaundryWasherModeClientConstructor extends Identity<typeof LaundryWasherModeClientConstructor> {}
export const LaundryWasherModeClient: LaundryWasherModeClientConstructor = LaundryWasherModeClientConstructor;
