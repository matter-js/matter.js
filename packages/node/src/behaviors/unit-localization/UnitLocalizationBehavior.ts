/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { UnitLocalization } from "#clusters/unit-localization";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * UnitLocalizationBehavior is the base class for objects that support interaction with
 * {@link UnitLocalization.Cluster}.
 *
 * This class does not have optional features of UnitLocalization.Cluster enabled. You can enable additional features
 * using UnitLocalizationBehavior.with.
 */
export const UnitLocalizationBehaviorConstructor = ClusterBehavior.for(UnitLocalization.Cluster);

export interface UnitLocalizationBehaviorConstructor extends Identity<typeof UnitLocalizationBehaviorConstructor> {}
export const UnitLocalizationBehavior: UnitLocalizationBehaviorConstructor = UnitLocalizationBehaviorConstructor;
export interface UnitLocalizationBehavior extends InstanceType<UnitLocalizationBehaviorConstructor> {}
export namespace UnitLocalizationBehavior {
    export interface State extends InstanceType<typeof UnitLocalizationBehavior.State> {}
}
