/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ColorControl } from "#clusters/color-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ColorControlInterface } from "./ColorControlInterface.js";
import { Identity } from "#general";

/**
 * ColorControlBehavior is the base class for objects that support interaction with {@link ColorControl.Cluster}.
 *
 * This class does not have optional features of ColorControl.Cluster enabled. You can enable additional features using
 * ColorControlBehavior.with.
 */
export const ColorControlBehaviorConstructor = ClusterBehavior
    .withInterface<ColorControlInterface>()
    .for(ColorControl.Cluster);

export interface ColorControlBehaviorConstructor extends Identity<typeof ColorControlBehaviorConstructor> {}
export const ColorControlBehavior: ColorControlBehaviorConstructor = ColorControlBehaviorConstructor;
export interface ColorControlBehavior extends InstanceType<ColorControlBehaviorConstructor> {}
export namespace ColorControlBehavior { export interface State extends InstanceType<typeof ColorControlBehavior.State> {} }
