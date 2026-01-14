/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointElement } from "../elements/index.js";
import { Model } from "./Model.js";

export class EndpointModel extends Model<EndpointModel, never> implements EndpointElement {
    override tag: EndpointElement.Tag = EndpointElement.Tag;

    get deviceTypes() {
        return this.children;
    }

    override get id() {
        return super.id;
    }

    override set id(id: number) {
        super.id = id;
    }

    static Tag = EndpointElement.Tag;
}

EndpointModel.register();
