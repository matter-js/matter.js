/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TimeFormatLocalization } from "#clusters/time-format-localization";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * TimeFormatLocalizationBehavior is the base class for objects that support interaction with
 * {@link TimeFormatLocalization.Cluster}.
 *
 * This class does not have optional features of TimeFormatLocalization.Cluster enabled. You can enable additional
 * features using TimeFormatLocalizationBehavior.with.
 */
export const TimeFormatLocalizationBehaviorConstructor = ClusterBehavior.for(TimeFormatLocalization.Cluster);

export interface TimeFormatLocalizationBehaviorConstructor extends Identity<typeof TimeFormatLocalizationBehaviorConstructor> {}
export const TimeFormatLocalizationBehavior: TimeFormatLocalizationBehaviorConstructor = TimeFormatLocalizationBehaviorConstructor;
export interface TimeFormatLocalizationBehavior extends InstanceType<TimeFormatLocalizationBehaviorConstructor> {}
export namespace TimeFormatLocalizationBehavior {
    export interface State extends InstanceType<typeof TimeFormatLocalizationBehavior.State> {}
}
