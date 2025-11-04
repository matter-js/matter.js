/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AudioOutput } from "#clusters/audio-output";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const AudioOutputClientConstructor = ClientBehavior(AudioOutput.Complete);
export interface AudioOutputClient extends InstanceType<typeof AudioOutputClientConstructor> {}
export interface AudioOutputClientConstructor extends Identity<typeof AudioOutputClientConstructor> {}
export const AudioOutputClient: AudioOutputClientConstructor = AudioOutputClientConstructor;
