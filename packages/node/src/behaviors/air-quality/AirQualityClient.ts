/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AirQuality } from "#clusters/air-quality";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const AirQualityClientConstructor = ClientBehavior(AirQuality.Complete);
export interface AirQualityClient extends InstanceType<typeof AirQualityClientConstructor> {}
export interface AirQualityClientConstructor extends Identity<typeof AirQualityClientConstructor> {}
export const AirQualityClient: AirQualityClientConstructor = AirQualityClientConstructor;
