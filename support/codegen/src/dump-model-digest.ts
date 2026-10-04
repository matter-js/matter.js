/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Emits a digest of the model matter.js currently ships, for a generator to compare its own output against.
//
// This runs as its own process on purpose. Loading the shipped model installs it as the traversal fallback root and
// freezes its resources, so a generator that loaded it would resolve new references against the old model and fail
// when it tried to write.

import { MatterModel } from "#model";
import { digestOf } from "#util/model-digest.js";
import "@matter/model/resources";

process.stdout.write(JSON.stringify(digestOf(MatterModel.standard)));
