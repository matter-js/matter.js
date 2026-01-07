/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticNamespaceElement } from "../elements/index.js";
import { SemanticTagModel } from "../index.js";
import { Model } from "./Model.js";

export class SemanticNamespaceModel
    extends Model<SemanticNamespaceElement, SemanticTagModel>
    implements SemanticNamespaceElement
{
    override tag: SemanticNamespaceElement.Tag = SemanticNamespaceElement.Tag;
    mfgCode?: number;

    get tags() {
        return this.children;
    }

    static Tag = SemanticNamespaceElement.Tag;

    constructor(
        definition: Model.Definition<SemanticNamespaceModel>,
        ...children: Model.ChildDefinition<SemanticNamespaceModel>[]
    ) {
        super(definition, ...children);

        this.mfgCode = definition.mfgCode;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            mfgCode: this.mfgCode,
            ...extra,
        });
    }
}

SemanticNamespaceModel.register();
