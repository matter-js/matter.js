/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "../common/DeviceClassification.js";
import { EndpointComposition } from "../common/EndpointComposition.js";
import { DeviceTypeElement } from "../elements/index.js";
import { ModelTraversal } from "../logic/ModelTraversal.js";
import { ConditionModel } from "./ConditionModel.js";
import { FieldModel } from "./FieldModel.js";
import { Model } from "./Model.js";
import { RequirementModel } from "./RequirementModel.js";

export class DeviceTypeModel extends Model<DeviceTypeElement, DeviceTypeModel.Child> implements DeviceTypeElement {
    override tag: DeviceTypeElement.Tag = DeviceTypeElement.Tag;
    classification?: DeviceClassification;

    /**
     * How this device type composes its endpoint's `PartsList`, as this device type declares it.
     * {@link effectiveComposition} answers what applies, inheritance and default included.
     */
    composition?: EndpointComposition;

    /**
     * How this device type composes its endpoint's `PartsList`.
     *
     * A device type that declares nothing takes its base's answer, and the tree pattern where no
     * ancestor declares one either — the specification defines full-family as the exception a device
     * type opts into (§ 9.2.3).
     */
    get effectiveComposition(): EndpointComposition {
        let composition: EndpointComposition | undefined;

        // One traversal rather than a hop-by-hop walk of #base, so a definition that derives from
        // itself through another is caught by the traversal's own cycle detection
        new ModelTraversal().visitInheritance(this, model => {
            if (model instanceof DeviceTypeModel && model.composition !== undefined) {
                composition = model.composition;
                return false;
            }
        });

        return composition ?? EndpointComposition.Tree;
    }

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
        this.composition = definition.composition as EndpointComposition;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            classification: this.classification,
            composition: this.composition,
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
    export type Child = RequirementModel | FieldModel | ConditionModel;
}
