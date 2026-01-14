/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentAppObserver } from "#clusters/content-app-observer";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ContentAppObserverInterface } from "./ContentAppObserverInterface.js";
import { Identity } from "#general";

/**
 * ContentAppObserverBehavior is the base class for objects that support interaction with
 * {@link ContentAppObserver.Cluster}.
 */
export const ContentAppObserverBehaviorConstructor = ClusterBehavior
    .withInterface<ContentAppObserverInterface>()
    .for(ContentAppObserver.Cluster);

export interface ContentAppObserverBehaviorConstructor extends Identity<typeof ContentAppObserverBehaviorConstructor> {}
export const ContentAppObserverBehavior: ContentAppObserverBehaviorConstructor = ContentAppObserverBehaviorConstructor;
export interface ContentAppObserverBehavior extends InstanceType<ContentAppObserverBehaviorConstructor> {}
export namespace ContentAppObserverBehavior {
    export interface State extends InstanceType<typeof ContentAppObserverBehavior.State> {}
}
