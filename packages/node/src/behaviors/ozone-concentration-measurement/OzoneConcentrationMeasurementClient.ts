/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OzoneConcentrationMeasurement } from "#clusters/ozone-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OzoneConcentrationMeasurementClientConstructor = ClientBehavior(OzoneConcentrationMeasurement.Complete);
export interface OzoneConcentrationMeasurementClient extends InstanceType<typeof OzoneConcentrationMeasurementClientConstructor> {}
export interface OzoneConcentrationMeasurementClientConstructor extends Identity<typeof OzoneConcentrationMeasurementClientConstructor> {}
export const OzoneConcentrationMeasurementClient: OzoneConcentrationMeasurementClientConstructor = OzoneConcentrationMeasurementClientConstructor;
