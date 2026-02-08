/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "../aspects/index.js";
import { ConditionRequirementElement } from "../elements/index.js";
import { Model } from "./Model.js";

export class ConditionRequirementModel
    extends Model<ConditionRequirementElement>
    implements ConditionRequirementElement
{
    override tag: ConditionRequirementElement.Tag = ConditionRequirementElement.Tag;
    declare condition: string;
    declare deviceTypeId?: number;
    declare deviceTypeName?: string;
    declare location?: string;

    #conformance: Conformance;

    get conformance(): Conformance {
        return this.#conformance;
    }
    set conformance(definition: Conformance | Conformance.Definition) {
        this.#conformance = Conformance.create(definition);
    }

    constructor(definition: Model.Definition<ConditionRequirementModel>) {
        super(definition);

        this.condition = definition.condition;
        this.deviceTypeId = definition.deviceTypeId;
        this.deviceTypeName = definition.deviceTypeName;
        this.location = definition.location;
        this.#conformance = Conformance.create(definition.conformance);
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            condition: this.condition,
            deviceTypeId: this.deviceTypeId,
            deviceTypeName: this.deviceTypeName,
            location: this.location,
            conformance: this.#conformance.valueOf(),
            ...extra,
        });
    }

    static Tag = ConditionRequirementElement.Tag;
}

ConditionRequirementModel.register();
