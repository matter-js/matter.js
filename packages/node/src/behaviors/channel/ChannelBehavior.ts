/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Channel } from "#clusters/channel";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ChannelInterface } from "./ChannelInterface.js";
import { Identity } from "#general";

/**
 * ChannelBehavior is the base class for objects that support interaction with {@link Channel.Cluster}.
 *
 * This class does not have optional features of Channel.Cluster enabled. You can enable additional features using
 * ChannelBehavior.with.
 */
export const ChannelBehaviorConstructor = ClusterBehavior
    .withInterface<ChannelInterface>()
    .for(Channel.Cluster);

export interface ChannelBehaviorConstructor extends Identity<typeof ChannelBehaviorConstructor> {}
export const ChannelBehavior: ChannelBehaviorConstructor = ChannelBehaviorConstructor;
export interface ChannelBehavior extends InstanceType<ChannelBehaviorConstructor> {}
export namespace ChannelBehavior { export interface State extends InstanceType<typeof ChannelBehavior.State> {} }
