/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ApplicationBasic } from "#clusters/application-basic";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * ApplicationBasicBehavior is the base class for objects that support interaction with
 * {@link ApplicationBasic.Cluster}.
 */
export const ApplicationBasicBehaviorConstructor = ClusterBehavior.for(ApplicationBasic.Cluster);

export interface ApplicationBasicBehaviorConstructor extends Identity<typeof ApplicationBasicBehaviorConstructor> {}
export const ApplicationBasicBehavior: ApplicationBasicBehaviorConstructor = ApplicationBasicBehaviorConstructor;
export interface ApplicationBasicBehavior extends InstanceType<ApplicationBasicBehaviorConstructor> {}
export namespace ApplicationBasicBehavior {
    export interface State extends InstanceType<typeof ApplicationBasicBehavior.State> {}
}
