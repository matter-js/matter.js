/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AirQuality } from "#clusters/air-quality";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * AirQualityBehavior is the base class for objects that support interaction with {@link AirQuality.Cluster}.
 */
export const AirQualityBehaviorConstructor = ClusterBehavior.for(AirQuality.Cluster);

export interface AirQualityBehaviorConstructor extends Identity<typeof AirQualityBehaviorConstructor> {}
export const AirQualityBehavior: AirQualityBehaviorConstructor = AirQualityBehaviorConstructor;
export interface AirQualityBehavior extends InstanceType<AirQualityBehaviorConstructor> {}
export namespace AirQualityBehavior { export interface State extends InstanceType<typeof AirQualityBehavior.State> {} }
