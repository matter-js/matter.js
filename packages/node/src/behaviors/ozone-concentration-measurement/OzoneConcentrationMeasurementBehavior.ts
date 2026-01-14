/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OzoneConcentrationMeasurement } from "#clusters/ozone-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * OzoneConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link OzoneConcentrationMeasurement.Cluster}.
 *
 * OzoneConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link OzoneConcentrationMeasurementBehavior.with}.
 */
export const OzoneConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(OzoneConcentrationMeasurement.Base));

export interface OzoneConcentrationMeasurementBehaviorConstructor extends Identity<typeof OzoneConcentrationMeasurementBehaviorConstructor> {}
export const OzoneConcentrationMeasurementBehavior: OzoneConcentrationMeasurementBehaviorConstructor = OzoneConcentrationMeasurementBehaviorConstructor;
export interface OzoneConcentrationMeasurementBehavior extends InstanceType<OzoneConcentrationMeasurementBehaviorConstructor> {}
export namespace OzoneConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof OzoneConcentrationMeasurementBehavior.State> {}
}
