/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MediaInput } from "@matter/types/clusters/media-input";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * MediaInputBehavior is the base class for objects that support interaction with {@link MediaInput.Cluster}.
 *
 * This class does not have optional features of MediaInput.Cluster enabled. You can enable additional features using
 * MediaInputBehavior.with.
 */
export const MediaInputBehaviorConstructor = ClusterBehavior.for(MediaInput);

export interface MediaInputBehaviorConstructor extends Identity<typeof MediaInputBehaviorConstructor> {}
export const MediaInputBehavior: MediaInputBehaviorConstructor = MediaInputBehaviorConstructor;
export interface MediaInputBehavior extends InstanceType<MediaInputBehaviorConstructor> {}
export namespace MediaInputBehavior { export interface State extends InstanceType<typeof MediaInputBehavior.State> {} }
