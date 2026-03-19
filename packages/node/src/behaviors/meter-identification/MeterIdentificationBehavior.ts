/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MeterIdentification } from "@matter/types/clusters/meter-identification";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * MeterIdentificationBehavior is the base class for objects that support interaction with
 * {@link MeterIdentification.Cluster}.
 *
 * This class does not have optional features of MeterIdentification.Cluster enabled. You can enable additional features
 * using MeterIdentificationBehavior.with.
 */
export const MeterIdentificationBehaviorConstructor = ClusterBehavior.for(MeterIdentification.Cluster);

export interface MeterIdentificationBehaviorConstructor extends Identity<typeof MeterIdentificationBehaviorConstructor> {}
export const MeterIdentificationBehavior: MeterIdentificationBehaviorConstructor = MeterIdentificationBehaviorConstructor;
export interface MeterIdentificationBehavior extends InstanceType<MeterIdentificationBehaviorConstructor> {}
export namespace MeterIdentificationBehavior {
    export interface State extends InstanceType<typeof MeterIdentificationBehavior.State> {}
}
