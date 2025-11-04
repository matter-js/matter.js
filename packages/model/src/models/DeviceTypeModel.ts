/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "../common/DeviceClassification.js";
import { DeviceTypeElement } from "../elements/index.js";
import { FieldModel } from "./FieldModel.js";
import { Model } from "./Model.js";
import { RequirementModel } from "./RequirementModel.js";

export class DeviceTypeModel extends Model<DeviceTypeElement, DeviceTypeModel.Child> implements DeviceTypeElement {
    override tag: DeviceTypeElement.Tag = DeviceTypeElement.Tag;
    classification?: DeviceClassification;

    get requirements() {
        return this.all(RequirementModel);
    }

    get revision() {
        return (
            this?.get(RequirementModel, "Descriptor")?.get(RequirementModel, "DeviceTypeList")?.default[0].revision ?? 1
        );
    }

    constructor(definition: Model.Definition<DeviceTypeModel>, ...children: Model.ChildDefinition<DeviceTypeModel>[]) {
        super(definition, ...children);

        this.classification = definition.classification as DeviceClassification;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            classification: this.classification,
            ...extra,
        });
    }

    override get id() {
        return super.id as number;
    }

    override set id(id: number) {
        super.id = id;
    }

    static Tag = DeviceTypeElement.Tag;
}

DeviceTypeModel.register();

export namespace DeviceTypeModel {
    export type Child = RequirementModel | FieldModel;
}
