/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeElement } from "../elements/index.js";
import { Children } from "./Children.js";
import type { EndpointModel } from "./EndpointModel.js";
import { Model } from "./Model.js";

export class NodeModel extends Model<NodeElement> implements NodeElement {
    override tag: NodeElement.Tag = NodeElement.Tag;

    override get children(): Children<EndpointModel> {
        return super.children as Children<EndpointModel>;
    }

    override set children(children: Children.InputIterable<EndpointModel>) {
        super.children = children;
    }

    get endpoints() {
        return this.children;
    }

    override get id() {
        return super.id;
    }

    override set id(id: number) {
        super.id = id;
    }

    static Tag = NodeElement.Tag;
}

NodeModel.register();
