/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MediaPlayback } from "#clusters/media-playback";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const MediaPlaybackClientConstructor = ClientBehavior(MediaPlayback.Complete);
export interface MediaPlaybackClient extends InstanceType<typeof MediaPlaybackClientConstructor> {}
export interface MediaPlaybackClientConstructor extends Identity<typeof MediaPlaybackClientConstructor> {}
export const MediaPlaybackClient: MediaPlaybackClientConstructor = MediaPlaybackClientConstructor;
