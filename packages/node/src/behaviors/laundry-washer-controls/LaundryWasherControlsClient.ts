/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LaundryWasherControls } from "@matter/types/clusters/laundry-washer-controls";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const LaundryWasherControlsClientConstructor = ClientBehavior(LaundryWasherControls);
export interface LaundryWasherControlsClient extends InstanceType<typeof LaundryWasherControlsClientConstructor> {}
export interface LaundryWasherControlsClientConstructor extends Identity<typeof LaundryWasherControlsClientConstructor> {}
export const LaundryWasherControlsClient: LaundryWasherControlsClientConstructor = LaundryWasherControlsClientConstructor;
