/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentControl } from "#clusters/content-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ContentControlClientConstructor = ClientBehavior(ContentControl.Complete);
export interface ContentControlClient extends InstanceType<typeof ContentControlClientConstructor> {}
export interface ContentControlClientConstructor extends Identity<typeof ContentControlClientConstructor> {}
export const ContentControlClient: ContentControlClientConstructor = ContentControlClientConstructor;
