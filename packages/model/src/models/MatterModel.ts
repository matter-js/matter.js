/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { Specification } from "#common/Specification.js";
import { MatterElement } from "../elements/index.js";
import { ModelTraversal } from "../logic/ModelTraversal.js";
import { AttributeModel } from "./AttributeModel.js";
import type { InternalChildren } from "./Children.js";
import { ClusterModel } from "./ClusterModel.js";
import { DatatypeModel } from "./DatatypeModel.js";
import { DeviceTypeModel } from "./DeviceTypeModel.js";
import { FabricModel } from "./FabricModel.js";
import { FieldModel } from "./FieldModel.js";
import { Globals } from "./Globals.js";
import { Model } from "./Model.js";
import { ResourceBundle } from "./Resource.js";
import { ScopeModel } from "./ScopeModel.js";
import { SemanticNamespaceModel } from "./SemanticNamespaceModel.js";

/**
 * The root of a Matter model.  This is the parent for global models.
 */
export class MatterModel extends ScopeModel<MatterElement, MatterModel.Child> implements MatterElement {
    override tag: MatterElement.Tag = MatterElement.Tag;
    revision?: Specification.Revision;
    #permanentDatatypes?: Record<string, Model>;
    #resources?: ResourceBundle;

    /**
     * The default instance of the canonical MatterModel (also exported directly simply as "Matter").
     */
    static standard: MatterModel = new MatterModel({
        name: "Matter",
        children: Object.values(Globals),
    });

    /**
     * Clusters.
     */
    get clusters() {
        return this.all(ClusterModel);
    }

    /**
     * Device types.
     */
    get deviceTypes() {
        return this.all(DeviceTypeModel);
    }

    /**
     * Semantic tag namespaces.
     */
    get semanticNamespaces() {
        return this.all(SemanticNamespaceModel);
    }

    /**
     * Global datatypes.
     */
    get datatypes() {
        return this.all(FieldModel);
    }

    /**
     * Global attributes.
     */
    get attributes() {
        return this.all(AttributeModel);
    }

    /**
     * Fabrics.
     */
    get fabrics() {
        return this.all(FabricModel);
    }

    /**
     * All sub-cluster global elements from this model.
     *
     * This is the set of utility datatypes required by cluster definitions.
     *
     * The returned elements are clones as we use this to initialize empty models for testing or diagnostic purposes.
     */
    get seedGlobals(): MatterModel.Child[] {
        return this.children.filter(child => child.isSeed).map(child => child.clone());
    }

    /**
     * MatterModel always owns itself.
     */
    override get root() {
        return this;
    }

    /**
     * The set of "permanent" datatypes.
     *
     * These are datatypes owned by this model with the "isSeed" value set.  For performance reasons we disallow
     * overriding these values.
     */
    get permanentDatatypes() {
        if (this.#permanentDatatypes) {
            return this.#permanentDatatypes;
        }

        this.#permanentDatatypes = Object.fromEntries(
            this.children
                .filter(model => model.tag === ElementTag.Datatype && model.isSeed)
                .map(model => [model.name, model]),
        );

        (this.children as InternalChildren<MatterModel.Child>).onNameChanged = (name, model) => {
            if (model === undefined) {
                delete this.#permanentDatatypes![name];
            } else {
                this.#permanentDatatypes![model.name] = model;
            }
        };

        return this.#permanentDatatypes;
    }

    /**
     * The resource pool for the node.
     */
    get resources() {
        return this.#resources ?? ResourceBundle.default;
    }

    set resources(resources: ResourceBundle | undefined) {
        this.#resources = resources;
    }

    constructor(definition?: MatterModel.Definition, ...children: Model.ChildDefinition<MatterModel>[]) {
        if (definition instanceof Model) {
            super(definition, ...children);
            return;
        }

        super(
            {
                name: "Matter",
                children: [],
                ...definition,
            } as MatterElement,
            ...children,
        );

        if (!(definition instanceof Model)) {
            this.revision = definition?.revision;
        }
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            revision: this.revision,
            ...extra,
        });
    }

    static Tag = MatterElement.Tag;
}

MatterModel.register();

export namespace MatterModel {
    export type Child =
        | ClusterModel
        | DeviceTypeModel
        | FieldModel
        | DatatypeModel
        | AttributeModel
        | FabricModel
        | SemanticNamespaceModel;

    export type Definition = Omit<Model.Definition<MatterModel>, "name" | "children"> & {
        name?: string;
        children?: Model.ChildDefinition<MatterModel>[];
    };
}

ModelTraversal.fallbackRoot = MatterModel.standard;
