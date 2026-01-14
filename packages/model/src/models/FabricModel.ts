/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricElement } from "../elements/index.js";
import { Model } from "./Model.js";
import { NodeModel } from "./NodeModel.js";

export class FabricModel extends Model<FabricElement, NodeModel> implements FabricElement {
    override tag: FabricElement.Tag = FabricElement.Tag;

    get nodes() {
        return this.children;
    }

    override get id() {
        return super.id;
    }

    override set id(id: number) {
        super.id = id;
    }

    static Tag = FabricElement.Tag;
}

FabricModel.register();
