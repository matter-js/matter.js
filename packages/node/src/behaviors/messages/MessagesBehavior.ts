/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Messages } from "#clusters/messages";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { MessagesInterface } from "./MessagesInterface.js";
import { Identity } from "#general";

/**
 * MessagesBehavior is the base class for objects that support interaction with {@link Messages.Cluster}.
 */
export const MessagesBehaviorConstructor = ClusterBehavior
    .withInterface<MessagesInterface>()
    .for(Messages.Cluster);

export interface MessagesBehaviorConstructor extends Identity<typeof MessagesBehaviorConstructor> {}
export const MessagesBehavior: MessagesBehaviorConstructor = MessagesBehaviorConstructor;
export interface MessagesBehavior extends InstanceType<MessagesBehaviorConstructor> {}
export namespace MessagesBehavior { export interface State extends InstanceType<typeof MessagesBehavior.State> {} }
