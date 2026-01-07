/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MediaPlayback } from "#clusters/media-playback";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { MediaPlaybackInterface } from "./MediaPlaybackInterface.js";
import { Identity } from "#general";

/**
 * MediaPlaybackBehavior is the base class for objects that support interaction with {@link MediaPlayback.Cluster}.
 *
 * This class does not have optional features of MediaPlayback.Cluster enabled. You can enable additional features using
 * MediaPlaybackBehavior.with.
 */
export const MediaPlaybackBehaviorConstructor = ClusterBehavior
    .withInterface<MediaPlaybackInterface>()
    .for(MediaPlayback.Cluster);

export interface MediaPlaybackBehaviorConstructor extends Identity<typeof MediaPlaybackBehaviorConstructor> {}
export const MediaPlaybackBehavior: MediaPlaybackBehaviorConstructor = MediaPlaybackBehaviorConstructor;
export interface MediaPlaybackBehavior extends InstanceType<MediaPlaybackBehaviorConstructor> {}
export namespace MediaPlaybackBehavior {
    export interface State extends InstanceType<typeof MediaPlaybackBehavior.State> {}
}
