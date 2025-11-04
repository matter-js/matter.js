/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FixedLabel } from "#clusters/fixed-label";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const FixedLabelClientConstructor = ClientBehavior(FixedLabel.Complete);
export interface FixedLabelClient extends InstanceType<typeof FixedLabelClientConstructor> {}
export interface FixedLabelClientConstructor extends Identity<typeof FixedLabelClientConstructor> {}
export const FixedLabelClient: FixedLabelClientConstructor = FixedLabelClientConstructor;
