/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ModeSelect } from "@matter/types/clusters/mode-select";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ModeSelectBehavior is the base class for objects that support interaction with {@link ModeSelect.Cluster}.
 *
 * This class does not have optional features of ModeSelect.Cluster enabled. You can enable additional features using
 * ModeSelectBehavior.with.
 */
export const ModeSelectBehaviorConstructor = ClusterBehavior.for(ModeSelect);

export interface ModeSelectBehaviorConstructor extends Identity<typeof ModeSelectBehaviorConstructor> {}
export const ModeSelectBehavior: ModeSelectBehaviorConstructor = ModeSelectBehaviorConstructor;
export interface ModeSelectBehavior extends InstanceType<ModeSelectBehaviorConstructor> {}
export namespace ModeSelectBehavior { export interface State extends InstanceType<typeof ModeSelectBehavior.State> {} }
