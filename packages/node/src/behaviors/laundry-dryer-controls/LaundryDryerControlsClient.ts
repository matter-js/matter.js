/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LaundryDryerControls } from "#clusters/laundry-dryer-controls";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const LaundryDryerControlsClientConstructor = ClientBehavior(LaundryDryerControls.Complete);
export interface LaundryDryerControlsClient extends InstanceType<typeof LaundryDryerControlsClientConstructor> {}
export interface LaundryDryerControlsClientConstructor extends Identity<typeof LaundryDryerControlsClientConstructor> {}
export const LaundryDryerControlsClient: LaundryDryerControlsClientConstructor = LaundryDryerControlsClientConstructor;
