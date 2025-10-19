/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvalidMetadataError } from "#decoration/errors.js";
import { InternalError } from "#general";
import { FieldModel } from "#models/FieldModel.js";
import type { Model } from "#models/Model.js";
import type { ClassSemantics } from "./ClassSemantics.js";
import { Semantics } from "./Semantics.js";

/**
 * Decorator metadata associated with a specific class field.
 */
export class FieldSemantics extends Semantics {
    constructor(owner: ClassSemantics, name: string) {
        super();

        this.mutableModel = new FieldModel({ name, parent: owner.mutableModel });
    }

    protected override createModel(): Model {
        // We create our model unconditionally so this shouldn't happen
        throw new InternalError("Unexpected FieldSemantics.createModel");
    }

    protected override integrateModel(model: Model): Model {
        if (this.localModel === undefined) {
            return model;
        }
        this.mutableModel.operationalBase = model;
        return this.mutableModel;
    }

    static override of(source: FieldSemantics.Source) {
        if (source.kind === "class") {
            throw new InvalidMetadataError(
                `Cannot retrieve field semantics for class decorator ${source.name ?? "of anonymous class"}`,
            );
        }
        return Semantics.classOf(source).fieldFor(source.name);
    }
}

export namespace FieldSemantics {
    export type Source = DecoratorContext;
}
