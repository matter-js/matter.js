/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "../common/index.js";
import { DatatypeElement } from "../elements/DatatypeElement.js";
import type { Model } from "./Model.js";
import { ValueModel } from "./ValueModel.js";

export class DatatypeModel extends ValueModel<DatatypeElement> implements DatatypeElement {
    override tag: DatatypeElement.Tag = DatatypeElement.Tag;

    override get id() {
        return undefined;
    }

    override set id(_id: undefined) {}

    get definesFields() {
        switch (this.effectiveMetatype) {
            case Metatype.object:
            case Metatype.enum:
            case Metatype.bitmap:
                return !!this.definingModel?.children.length;
        }
        return false;
    }

    static Tag = DatatypeElement.Tag;

    constructor(definition: Model.Definition<DatatypeModel>, ...children: Model.ChildDefinition<DatatypeModel>[]) {
        super(definition, ...children);
        this.metatype = definition.metatype as Metatype | undefined;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            metatype: this.metatype,
            ...extra,
        });
    }
}

DatatypeModel.register();
