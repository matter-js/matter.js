/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Pm1ConcentrationMeasurement } from "@matter/types/clusters/pm1-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const Pm1ConcentrationMeasurementClientConstructor = ClientBehavior(Pm1ConcentrationMeasurement);
export interface Pm1ConcentrationMeasurementClient extends InstanceType<typeof Pm1ConcentrationMeasurementClientConstructor> {}
export interface Pm1ConcentrationMeasurementClientConstructor extends Identity<typeof Pm1ConcentrationMeasurementClientConstructor> {}
export const Pm1ConcentrationMeasurementClient: Pm1ConcentrationMeasurementClientConstructor = Pm1ConcentrationMeasurementClientConstructor;
