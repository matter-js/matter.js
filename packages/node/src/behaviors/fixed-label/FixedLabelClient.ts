/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FixedLabel } from "@matter/types/clusters/fixed-label";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const FixedLabelClientConstructor = ClientBehavior(FixedLabel);
export interface FixedLabelClient extends InstanceType<typeof FixedLabelClientConstructor> {}
export interface FixedLabelClientConstructor extends Identity<typeof FixedLabelClientConstructor> {}
export const FixedLabelClient: FixedLabelClientConstructor = FixedLabelClientConstructor;
