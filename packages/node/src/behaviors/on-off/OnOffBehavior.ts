/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOff } from "#clusters/on-off";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OnOffInterface } from "./OnOffInterface.js";
import { Identity } from "#general";

/**
 * OnOffBehavior is the base class for objects that support interaction with {@link OnOff.Cluster}.
 *
 * This class does not have optional features of OnOff.Cluster enabled. You can enable additional features using
 * OnOffBehavior.with.
 */
export const OnOffBehaviorConstructor = ClusterBehavior
    .withInterface<OnOffInterface>()
    .for(OnOff.Cluster);

export interface OnOffBehaviorConstructor extends Identity<typeof OnOffBehaviorConstructor> {}
export const OnOffBehavior: OnOffBehaviorConstructor = OnOffBehaviorConstructor;
export interface OnOffBehavior extends InstanceType<OnOffBehaviorConstructor> {}
export namespace OnOffBehavior { export interface State extends InstanceType<typeof OnOffBehavior.State> {} }
