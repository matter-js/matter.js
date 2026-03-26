/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FixedLabel } from "@matter/types/clusters/fixed-label";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * FixedLabelBehavior is the base class for objects that support interaction with {@link FixedLabel.Cluster}.
 */
export const FixedLabelBehaviorConstructor = ClusterBehavior.for(FixedLabel);

export interface FixedLabelBehaviorConstructor extends Identity<typeof FixedLabelBehaviorConstructor> {}
export const FixedLabelBehavior: FixedLabelBehaviorConstructor = FixedLabelBehaviorConstructor;
export interface FixedLabelBehavior extends InstanceType<FixedLabelBehaviorConstructor> {}
export namespace FixedLabelBehavior { export interface State extends InstanceType<typeof FixedLabelBehavior.State> {} }
