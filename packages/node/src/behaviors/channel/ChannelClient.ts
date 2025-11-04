/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Channel } from "#clusters/channel";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ChannelClientConstructor = ClientBehavior(Channel.Complete);
export interface ChannelClient extends InstanceType<typeof ChannelClientConstructor> {}
export interface ChannelClientConstructor extends Identity<typeof ChannelClientConstructor> {}
export const ChannelClient: ChannelClientConstructor = ChannelClientConstructor;
