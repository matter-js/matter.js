/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ContentAppObserver } from "#clusters/content-app-observer";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ContentAppObserverClientConstructor = ClientBehavior(ContentAppObserver.Complete);
export interface ContentAppObserverClient extends InstanceType<typeof ContentAppObserverClientConstructor> {}
export interface ContentAppObserverClientConstructor extends Identity<typeof ContentAppObserverClientConstructor> {}
export const ContentAppObserverClient: ContentAppObserverClientConstructor = ContentAppObserverClientConstructor;
