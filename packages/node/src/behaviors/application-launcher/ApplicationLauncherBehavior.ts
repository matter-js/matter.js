/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ApplicationLauncher } from "#clusters/application-launcher";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ApplicationLauncherInterface } from "./ApplicationLauncherInterface.js";
import { Identity } from "#general";

/**
 * ApplicationLauncherBehavior is the base class for objects that support interaction with
 * {@link ApplicationLauncher.Cluster}.
 *
 * This class does not have optional features of ApplicationLauncher.Cluster enabled. You can enable additional features
 * using ApplicationLauncherBehavior.with.
 */
export const ApplicationLauncherBehaviorConstructor = ClusterBehavior
    .withInterface<ApplicationLauncherInterface>()
    .for(ApplicationLauncher.Cluster);

export interface ApplicationLauncherBehaviorConstructor extends Identity<typeof ApplicationLauncherBehaviorConstructor> {}
export const ApplicationLauncherBehavior: ApplicationLauncherBehaviorConstructor = ApplicationLauncherBehaviorConstructor;
export interface ApplicationLauncherBehavior extends InstanceType<ApplicationLauncherBehaviorConstructor> {}
export namespace ApplicationLauncherBehavior {
    export interface State extends InstanceType<typeof ApplicationLauncherBehavior.State> {}
}
