/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ColorControl } from "@matter/types/clusters/color-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ColorControlClientConstructor = ClientBehavior(ColorControl);
export interface ColorControlClient extends InstanceType<typeof ColorControlClientConstructor> {}
export interface ColorControlClientConstructor extends Identity<typeof ColorControlClientConstructor> {}
export const ColorControlClient: ColorControlClientConstructor = ColorControlClientConstructor;
