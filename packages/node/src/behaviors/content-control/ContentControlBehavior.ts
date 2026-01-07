/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentControl } from "#clusters/content-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ContentControlInterface } from "./ContentControlInterface.js";
import { Identity } from "#general";

/**
 * ContentControlBehavior is the base class for objects that support interaction with {@link ContentControl.Cluster}.
 *
 * This class does not have optional features of ContentControl.Cluster enabled. You can enable additional features
 * using ContentControlBehavior.with.
 */
export const ContentControlBehaviorConstructor = ClusterBehavior
    .withInterface<ContentControlInterface>()
    .for(ContentControl.Cluster);

export interface ContentControlBehaviorConstructor extends Identity<typeof ContentControlBehaviorConstructor> {}
export const ContentControlBehavior: ContentControlBehaviorConstructor = ContentControlBehaviorConstructor;
export interface ContentControlBehavior extends InstanceType<ContentControlBehaviorConstructor> {}
export namespace ContentControlBehavior {
    export interface State extends InstanceType<typeof ContentControlBehavior.State> {}
}
