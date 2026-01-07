/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AudioOutput } from "#clusters/audio-output";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { AudioOutputInterface } from "./AudioOutputInterface.js";
import { Identity } from "#general";

/**
 * AudioOutputBehavior is the base class for objects that support interaction with {@link AudioOutput.Cluster}.
 *
 * This class does not have optional features of AudioOutput.Cluster enabled. You can enable additional features using
 * AudioOutputBehavior.with.
 */
export const AudioOutputBehaviorConstructor = ClusterBehavior
    .withInterface<AudioOutputInterface>()
    .for(AudioOutput.Cluster);

export interface AudioOutputBehaviorConstructor extends Identity<typeof AudioOutputBehaviorConstructor> {}
export const AudioOutputBehavior: AudioOutputBehaviorConstructor = AudioOutputBehaviorConstructor;
export interface AudioOutputBehavior extends InstanceType<AudioOutputBehaviorConstructor> {}
export namespace AudioOutputBehavior { export interface State extends InstanceType<typeof AudioOutputBehavior.State> {} }
