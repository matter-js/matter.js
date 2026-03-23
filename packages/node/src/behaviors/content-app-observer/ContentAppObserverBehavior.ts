/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentAppObserver } from "@matter/types/clusters/content-app-observer";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ContentAppObserverBehavior is the base class for objects that support interaction with
 * {@link ContentAppObserver.Cluster}.
 */
export const ContentAppObserverBehaviorConstructor = ClusterBehavior.for(ContentAppObserver);

export interface ContentAppObserverBehaviorConstructor extends Identity<typeof ContentAppObserverBehaviorConstructor> {}
export const ContentAppObserverBehavior: ContentAppObserverBehaviorConstructor = ContentAppObserverBehaviorConstructor;
export interface ContentAppObserverBehavior extends InstanceType<ContentAppObserverBehaviorConstructor> {}
export namespace ContentAppObserverBehavior {
    export interface State extends InstanceType<typeof ContentAppObserverBehavior.State> {}
}
