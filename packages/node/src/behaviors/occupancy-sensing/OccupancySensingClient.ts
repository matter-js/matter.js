/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OccupancySensing } from "#clusters/occupancy-sensing";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OccupancySensingClientConstructor = ClientBehavior(OccupancySensing.Complete);
export interface OccupancySensingClient extends InstanceType<typeof OccupancySensingClientConstructor> {}
export interface OccupancySensingClientConstructor extends Identity<typeof OccupancySensingClientConstructor> {}
export const OccupancySensingClient: OccupancySensingClientConstructor = OccupancySensingClientConstructor;
