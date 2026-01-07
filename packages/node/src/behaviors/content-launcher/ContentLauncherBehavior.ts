/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentLauncher } from "#clusters/content-launcher";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ContentLauncherInterface } from "./ContentLauncherInterface.js";
import { Identity } from "#general";

/**
 * ContentLauncherBehavior is the base class for objects that support interaction with {@link ContentLauncher.Cluster}.
 *
 * This class does not have optional features of ContentLauncher.Cluster enabled. You can enable additional features
 * using ContentLauncherBehavior.with.
 */
export const ContentLauncherBehaviorConstructor = ClusterBehavior
    .withInterface<ContentLauncherInterface>()
    .for(ContentLauncher.Cluster);

export interface ContentLauncherBehaviorConstructor extends Identity<typeof ContentLauncherBehaviorConstructor> {}
export const ContentLauncherBehavior: ContentLauncherBehaviorConstructor = ContentLauncherBehaviorConstructor;
export interface ContentLauncherBehavior extends InstanceType<ContentLauncherBehaviorConstructor> {}
export namespace ContentLauncherBehavior {
    export interface State extends InstanceType<typeof ContentLauncherBehavior.State> {}
}
