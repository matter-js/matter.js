/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "../../common/index.js";
import { AttributeElement } from "../../elements/index.js";
import { AttributeModel, FieldModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValueValidator } from "./ValueValidator.js";

ModelValidator.validators[AttributeElement.Tag] = class AttributeValidator extends ValueValidator<AttributeModel> {
    override validate() {
        this.validateStructure(true, FieldModel);
        this.#validateSceneType();

        super.validate();
    }

    /**
     * Per {@link MatterSpecification.v16} § 7.7.9 the Scene ("S") quality may only apply to unsigned integer or boolean
     * types of at most 4 bytes, or types derived from these (e.g. enum8, map8).
     */
    #validateSceneType() {
        if (!this.model.effectiveQuality.scene) {
            return;
        }

        // Unresolved type is reported separately as TYPE_UNKNOWN
        const primitive = this.model.primitiveBase;
        if (primitive === undefined) {
            return;
        }

        switch (primitive.metatype) {
            case Metatype.boolean:
                return;

            case Metatype.integer:
                if (primitive.name.startsWith("uint") && (primitive.byteSize ?? 0) <= 4) {
                    return;
                }
                break;
        }

        this.error(
            "INVALID_SCENE_TYPE",
            `Scene quality requires an unsigned integer or boolean type of at most 4 bytes, not ${this.model.effectiveType}`,
        );
    }
};
