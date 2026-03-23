/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Messages } from "@matter/types/clusters/messages";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const MessagesClientConstructor = ClientBehavior(Messages);
export interface MessagesClient extends InstanceType<typeof MessagesClientConstructor> {}
export interface MessagesClientConstructor extends Identity<typeof MessagesClientConstructor> {}
export const MessagesClient: MessagesClientConstructor = MessagesClientConstructor;
