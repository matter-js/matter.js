/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access } from "../aspects/Access.js";
import { AttributeElement } from "../elements/index.js";
import { Model } from "./Model.js";
import { PropertyModel } from "./PropertyModel.js";

// Full set of global IDs per core spec 1.3
export const GLOBAL_IDS = new Set([0xfffd, 0xfffc, 0xfffb, 0xfffa, 0xfff9, 0xfff8]);

export class AttributeModel extends PropertyModel<AttributeElement> implements AttributeElement {
    override tag: AttributeElement.Tag = AttributeElement.Tag;

    get readable() {
        return this.effectiveAccess.readable;
    }

    get writable() {
        return !this.fixed && this.effectiveAccess.writable;
    }

    /**
     * Whether the attribute holds fabric-scoped data, with fabric-scoped (`F`) or fabric-sensitive (`S`) access.
     */
    get fabricScoped() {
        const { fabric } = this.effectiveAccess;
        return fabric === Access.Fabric.Scoped || fabric === Access.Fabric.Sensitive;
    }

    /**
     * Whether the attribute is fabric-sensitive; a read returns only the accessing fabric's entries of its list.
     *
     * @see {@link MatterSpecification.v161.Core} § 7.6.5
     */
    get fabricSensitive() {
        return this.effectiveAccess.fabricSensitive;
    }

    get fixed() {
        return !!this.effectiveQuality.fixed;
    }

    get changesOmitted() {
        return this.effectiveQuality.changesOmitted;
    }

    override get requiredFields() {
        return { ...super.requiredFields, id: this.id };
    }

    constructor(definition: Model.Definition<AttributeModel>, ...children: Model.ChildDefinition<AttributeModel>[]) {
        super(definition, ...children);
    }

    static isGlobal(model: Model) {
        return model instanceof AttributeModel && GLOBAL_IDS.has(model.id);
    }

    static get globalIds() {
        return GLOBAL_IDS;
    }

    static Tag = AttributeElement.Tag;
    static requiresId = true;
}

AttributeModel.register();
