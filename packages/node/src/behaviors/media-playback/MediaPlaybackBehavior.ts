/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MediaPlayback } from "@matter/types/clusters/media-playback";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * MediaPlaybackBehavior is the base class for objects that support interaction with {@link MediaPlayback.Cluster}.
 *
 * This class does not have optional features of MediaPlayback.Cluster enabled. You can enable additional features using
 * MediaPlaybackBehavior.with.
 */
export const MediaPlaybackBehaviorConstructor = ClusterBehavior.for(MediaPlayback);

export interface MediaPlaybackBehaviorConstructor extends Identity<typeof MediaPlaybackBehaviorConstructor> {}
export const MediaPlaybackBehavior: MediaPlaybackBehaviorConstructor = MediaPlaybackBehaviorConstructor;
export interface MediaPlaybackBehavior extends InstanceType<MediaPlaybackBehaviorConstructor> {}
export namespace MediaPlaybackBehavior {
    export interface State extends InstanceType<typeof MediaPlaybackBehavior.State> {}
}
