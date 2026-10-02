/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { Specification } from "#common/Specification.js";
import { MatterElement } from "../elements/index.js";
import { ModelIndex, MutableModelIndex } from "../logic/ModelIndex.js";
import { ModelTraversal } from "../logic/ModelTraversal.js";
import { AttributeModel } from "./AttributeModel.js";
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

interface Members<T extends Model> {
    generation: number;
    index: ModelIndex<T>;
}

/**
 * The root of a Matter model.  This is the parent for global models.
 */
export class MatterModel extends ScopeModel<MatterElement, MatterModel.Child> implements MatterElement {
    override tag: MatterElement.Tag = MatterElement.Tag;
    revision?: Specification.Revision;
    #permanentDatatypes?: { generation: number; byName: Readonly<Record<string, Model>> };
    #clusters?: Members<ClusterModel>;
    #deviceTypes?: Members<DeviceTypeModel>;
    #datatypes?: Members<DatatypeModel>;
    #fields?: Members<FieldModel>;
    #attributes?: Members<AttributeModel>;
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
    get clusters(): ModelIndex<ClusterModel> {
        return (
            this.#inheritedMembersOf(ClusterModel) ??
            (this.#clusters = this.#membersOf(ClusterModel, this.#clusters)).index
        );
    }

    /**
     * Create a copy of this model with clusters added or replaced.
     *
     * A supplied cluster replaces the standard cluster with the same ID (a plain addition loses to the standard entry
     * during lookup) and clusters with new IDs are appended.  Use this to teach a {@link ClientNode} about custom or
     * extended clusters so a controller resolves their elements to real names instead of synthetic `attr$…`/`command$…`.
     */
    withClusters(...clusters: ClusterModel[]): MatterModel {
        const model = this.clone();
        for (const cluster of clusters) {
            const child = cluster.clone();
            const existing = model.clusters(cluster.id);
            const index = existing ? model.children.indexOf(existing) : -1;
            if (index >= 0) {
                model.children.splice(index, 1, child);
            } else {
                model.children.push(child);
            }
        }
        return model;
    }

    /**
     * Device types.
     */
    get deviceTypes(): ModelIndex<DeviceTypeModel> {
        return (
            this.#inheritedMembersOf(DeviceTypeModel) ??
            (this.#deviceTypes = this.#membersOf(DeviceTypeModel, this.#deviceTypes)).index
        );
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
    get datatypes(): ModelIndex<DatatypeModel> {
        return (
            this.#inheritedMembersOf(DatatypeModel) ??
            (this.#datatypes = this.#membersOf(DatatypeModel, this.#datatypes)).index
        );
    }

    /**
     * Global fields.
     */
    get fields(): ModelIndex<FieldModel> {
        return this.#inheritedMembersOf(FieldModel) ?? (this.#fields = this.#membersOf(FieldModel, this.#fields)).index;
    }

    /**
     * Global attributes.
     */
    get attributes(): ModelIndex<AttributeModel> {
        return (
            this.#inheritedMembersOf(AttributeModel) ??
            (this.#attributes = this.#membersOf(AttributeModel, this.#attributes)).index
        );
    }

    /**
     * The members of {@link type} an extension of another matter model reports, which include its base's.  Undefined
     * when this model extends none.
     */
    #inheritedMembersOf<T extends MatterModel.Child>(type: Model.ConcreteType<T>): ModelIndex<T> | undefined {
        if (!this.operationalBase) {
            return;
        }
        const { Tag } = type;
        const isOfType = (model: Model): model is T => model.tag === Tag;
        const members = new Array<T>();
        for (const member of this.scope.membersOf(this, { tags: [Tag] })) {
            if (isOfType(member)) {
                members.push(member);
            }
        }
        return new MutableModelIndex(members);
    }

    /**
     * The children of {@link type}, reusing {@link members} while the children are unchanged.  Without a base these
     * are exactly the members the scope would report, without building the scope.
     */
    #membersOf<T extends MatterModel.Child>(type: Model.ConcreteType<T>, members?: Members<T>): Members<T> {
        const generation = this.childrenGeneration;
        if (members?.generation === generation) {
            return members;
        }
        const { Tag } = type;
        return {
            generation,
            index: new MutableModelIndex(this.children.filter((child): child is T => child.tag === Tag)),
        };
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
    get permanentDatatypes(): Readonly<Record<string, Model>> {
        const generation = this.childrenGeneration;
        if (this.#permanentDatatypes?.generation !== generation) {
            const byName: Record<string, Model> = Object.create(null);
            for (const model of this.children) {
                if (model.tag === ElementTag.Datatype && model.isSeed) {
                    byName[model.name] = model;
                }
            }
            this.#permanentDatatypes = { generation, byName };
        }
        return this.#permanentDatatypes.byName;
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
