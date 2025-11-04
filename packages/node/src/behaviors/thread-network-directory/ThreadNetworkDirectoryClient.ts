/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadNetworkDirectory } from "#clusters/thread-network-directory";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ThreadNetworkDirectoryClientConstructor = ClientBehavior(ThreadNetworkDirectory.Complete);
export interface ThreadNetworkDirectoryClient extends InstanceType<typeof ThreadNetworkDirectoryClientConstructor> {}
export interface ThreadNetworkDirectoryClientConstructor extends Identity<typeof ThreadNetworkDirectoryClientConstructor> {}
export const ThreadNetworkDirectoryClient: ThreadNetworkDirectoryClientConstructor = ThreadNetworkDirectoryClientConstructor;
