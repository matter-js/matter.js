/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Messages } from "@matter/types/clusters/messages";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * MessagesBehavior is the base class for objects that support interaction with {@link Messages.Cluster}.
 */
export const MessagesBehaviorConstructor = ClusterBehavior.for(Messages);

export interface MessagesBehaviorConstructor extends Identity<typeof MessagesBehaviorConstructor> {}
export const MessagesBehavior: MessagesBehaviorConstructor = MessagesBehaviorConstructor;
export interface MessagesBehavior extends InstanceType<MessagesBehaviorConstructor> {}
export namespace MessagesBehavior { export interface State extends InstanceType<typeof MessagesBehavior.State> {} }
