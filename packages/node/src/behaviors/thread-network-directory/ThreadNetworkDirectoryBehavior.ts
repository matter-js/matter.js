/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadNetworkDirectory } from "@matter/types/clusters/thread-network-directory";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ThreadNetworkDirectoryBehavior is the base class for objects that support interaction with
 * {@link ThreadNetworkDirectory.Cluster}.
 */
export const ThreadNetworkDirectoryBehaviorConstructor = ClusterBehavior.for(ThreadNetworkDirectory);

export interface ThreadNetworkDirectoryBehaviorConstructor extends Identity<typeof ThreadNetworkDirectoryBehaviorConstructor> {}
export const ThreadNetworkDirectoryBehavior: ThreadNetworkDirectoryBehaviorConstructor = ThreadNetworkDirectoryBehaviorConstructor;
export interface ThreadNetworkDirectoryBehavior extends InstanceType<ThreadNetworkDirectoryBehaviorConstructor> {}
export namespace ThreadNetworkDirectoryBehavior {
    export interface State extends InstanceType<typeof ThreadNetworkDirectoryBehavior.State> {}
}
