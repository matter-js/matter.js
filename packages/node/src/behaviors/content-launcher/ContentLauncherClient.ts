/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentLauncher } from "#clusters/content-launcher";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ContentLauncherClientConstructor = ClientBehavior(ContentLauncher.Complete);
export interface ContentLauncherClient extends InstanceType<typeof ContentLauncherClientConstructor> {}
export interface ContentLauncherClientConstructor extends Identity<typeof ContentLauncherClientConstructor> {}
export const ContentLauncherClient: ContentLauncherClientConstructor = ContentLauncherClientConstructor;
