/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConditionElement } from "../elements/index.js";
import { Model } from "./Model.js";

export class ConditionModel extends Model<ConditionElement> implements ConditionElement {
    override tag: ConditionElement.Tag = ConditionElement.Tag;

    constructor(definition: Model.Definition<ConditionModel>) {
        super(definition);
    }

    static Tag = ConditionElement.Tag;
}

ConditionModel.register();
