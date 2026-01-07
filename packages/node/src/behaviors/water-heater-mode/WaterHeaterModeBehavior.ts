/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterHeaterMode } from "#clusters/water-heater-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WaterHeaterModeInterface } from "./WaterHeaterModeInterface.js";
import { Identity } from "#general";

/**
 * WaterHeaterModeBehavior is the base class for objects that support interaction with {@link WaterHeaterMode.Cluster}.
 */
export const WaterHeaterModeBehaviorConstructor = ClusterBehavior
    .withInterface<WaterHeaterModeInterface>()
    .for(WaterHeaterMode.Cluster);

export interface WaterHeaterModeBehaviorConstructor extends Identity<typeof WaterHeaterModeBehaviorConstructor> {}
export const WaterHeaterModeBehavior: WaterHeaterModeBehaviorConstructor = WaterHeaterModeBehaviorConstructor;
export interface WaterHeaterModeBehavior extends InstanceType<WaterHeaterModeBehaviorConstructor> {}
export namespace WaterHeaterModeBehavior {
    export interface State extends InstanceType<typeof WaterHeaterModeBehavior.State> {}
}
