/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadNetworkDirectory } from "@matter/types/clusters/thread-network-directory";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ThreadNetworkDirectoryClientConstructor = ClientBehavior(ThreadNetworkDirectory);
export interface ThreadNetworkDirectoryClient extends InstanceType<typeof ThreadNetworkDirectoryClientConstructor> {}
export interface ThreadNetworkDirectoryClientConstructor extends Identity<typeof ThreadNetworkDirectoryClientConstructor> {}
export const ThreadNetworkDirectoryClient: ThreadNetworkDirectoryClientConstructor = ThreadNetworkDirectoryClientConstructor;
