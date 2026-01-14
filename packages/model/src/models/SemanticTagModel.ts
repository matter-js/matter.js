/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticTagElement } from "../elements/index.js";
import { Model } from "./Model.js";

export class SemanticTagModel extends Model<SemanticTagElement, never> implements SemanticTagElement {
    override tag: SemanticTagElement.Tag = SemanticTagElement.Tag;

    static Tag = SemanticTagElement.Tag;
}

SemanticTagModel.register();
