/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "#aspects/Conformance.js";
import { ModelIndex } from "#logic/ModelIndex.js";
import { ModelTraversal } from "#logic/ModelTraversal.js";
import { describeList } from "@matter/general";
import { Access } from "../aspects/Access.js";
import { Quality } from "../aspects/Quality.js";
import { SchemaImplementationError } from "../common/errors.js";
import { ElementTag, FeatureSet, Metatype } from "../common/index.js";
import { ClusterElement } from "../elements/index.js";
import { ClusterRevision, FeatureMap } from "../standard/elements/definitions.js";
import { AttributeModel } from "./AttributeModel.js";
import { CommandModel } from "./CommandModel.js";
import { DatatypeModel } from "./DatatypeModel.js";
import { EventModel } from "./EventModel.js";
import { FieldModel } from "./FieldModel.js";
import { Model } from "./Model.js";
import { ScopeModel } from "./ScopeModel.js";

export class ClusterModel
    extends ScopeModel<ClusterElement, ClusterModel.Child>
    implements ClusterElement, Conformance.FeatureContext
{
    override tag: ClusterElement.Tag = ClusterElement.Tag;
    #attributes?: ScopeModel.Members<AttributeModel>;
    #commands?: ScopeModel.Members<CommandModel>;
    #events?: ScopeModel.Members<EventModel>;
    #datatypes?: ScopeModel.Members<DatatypeModel>;
    #fields?: ScopeModel.Members<FieldModel>;
    classification?: ClusterElement.Classification;
    bindable?: boolean;

    #quality: Quality;

    get diagnostics() {
        return this.effectiveQuality.diagnostics;
    }

    get quality(): Quality {
        return this.#quality;
    }
    set quality(definition: Quality | Quality.Definition) {
        this.#quality = Quality.create(definition);
    }
    get effectiveQuality(): Quality {
        return new ModelTraversal().findAspect(this, "quality", Quality) ?? this.#quality;
    }

    /**
     * Whether a Binding entry may direct a client of this cluster: the {@link bindable} of this cluster or, where
     * unset, of the closest cluster it derives from that sets it; `true` when none does.
     */
    get effectiveBindable(): boolean {
        return this.#inherited(cluster => cluster.bindable) ?? true;
    }

    /**
     * The {@link classification} of this cluster or, where unset, of the closest cluster it derives from that sets it;
     * undefined when none does.
     *
     * @see {@link MatterSpecification.v161.Core} § 7.10.8
     */
    get effectiveClassification(): ClusterElement.Classification | undefined {
        return this.#inherited(cluster => cluster.classification);
    }

    #inherited<T>(read: (cluster: ClusterModel) => T | undefined): T | undefined {
        let value: T | undefined;
        new ModelTraversal().visitInheritance(this, model => {
            if (model instanceof ClusterModel) {
                value = read(model);
                if (value !== undefined) {
                    return false;
                }
            }
        });
        return value;
    }

    get attributes(): ModelIndex<AttributeModel> {
        return (this.#attributes = this.membersOfType(AttributeModel, this.#attributes)).index;
    }

    get commands(): ModelIndex<CommandModel> {
        return (this.#commands = this.membersOfType(CommandModel, this.#commands)).index;
    }

    get events(): ModelIndex<EventModel> {
        return (this.#events = this.membersOfType(EventModel, this.#events)).index;
    }

    get datatypes(): ModelIndex<DatatypeModel> {
        return (this.#datatypes = this.membersOfType(DatatypeModel, this.#datatypes)).index;
    }

    /**
     * The cluster's own status codes, if it defines any.
     *
     * Status code range 0x02 - 0x10 is reserved for cluster-scoped codes, so a value of the global "status" type in
     * such a cluster carries either these codes or the global ones.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.10
     */
    get statusCodes() {
        const codes = this.datatypes("StatusCodeEnum");
        return codes?.children.length ? codes : undefined;
    }

    /**
     * Fields on a cluster are not part of the standard Matter data model.  They are used for internal extensions that
     * should not be served via the Matter protocol.
     */
    get fields(): ModelIndex<FieldModel> {
        return (this.#fields = this.membersOfType(FieldModel, this.#fields)).index;
    }

    /**
     * Attributes and fields, for treating a cluster as a struct.
     */
    get properties() {
        return this.scope.membersOf(this, {
            tags: [ElementTag.Attribute, ElementTag.Field],
        }) as ModelIndex<AttributeModel | FieldModel>;
    }

    get conformant() {
        return new ClusterModel.Conformant(this);
    }

    get pics() {
        return this.hasLocalResource ? this.localResource.pics : undefined;
    }

    set pics(pics: string | undefined) {
        if (pics || this.hasLocalResource) {
            this.localResource.pics = pics;
        }
    }

    /**
     * Get attributes, commands and events whether inherited or defined directly in this model.
     */
    get allAces() {
        return this.scope.membersOf(this, {
            tags: [ElementTag.Attribute, ElementTag.Command, ElementTag.Event],
        }) as ModelIndex<AttributeModel | CommandModel | EventModel>;
    }

    get revision() {
        let revision = 1;
        const revisionAttr = this.attributes(ClusterRevision.id);
        if (typeof revisionAttr?.default === "number") {
            revision = revisionAttr.default;
        }
        return revision;
    }

    get features() {
        // Do not use scope (e.g. via this.fields) because features are an input to scope computation
        const features = new Map<string, FieldModel>();
        new ModelTraversal().visitInheritance(this.featureMap, model => {
            for (const child of model.children) {
                if (child.tag !== "field") {
                    continue;
                }
                if (features.has(child.name)) {
                    continue;
                }
                features.set(child.name, child as FieldModel);
            }
        });
        return [...features.values()];
    }

    get featureMap() {
        // Do not use scope because featureMap is an input to scope computation
        return (new ModelTraversal().findMember(this, FeatureMap.id, [ElementTag.Attribute]) ??
            new AttributeModel(FeatureMap)) as AttributeModel;
    }

    get definedFeatures(): FeatureSet {
        return new FeatureSet(this.features.map(feature => feature.name));
    }

    /**
     * Features the implementation supports.
     *
     * A feature's `default` conveys the specification's fallback value and never implies support.
     */
    get supportedFeatures(): FeatureSet {
        const supported = {} as { [name: string]: boolean | undefined };
        for (const feature of this.features) {
            if (feature.effectiveIsSupported) {
                supported[feature.name] = true;
            }
        }
        return new FeatureSet(supported);
    }

    /**
     * Features the specification mandates without condition.
     *
     * These are not an application choice.  A server implementation supports them regardless of selection; a client
     * defers to the features its peer reports.
     */
    get unconditionalFeatures(): FeatureSet {
        const features = new FeatureSet();
        for (const feature of this.features) {
            if (feature.effectiveConformance.ast.type === Conformance.Flag.Mandatory) {
                features.add(feature.name);
            }
        }
        return features;
    }

    set supportedFeatures(features: FeatureSet.Definition | undefined) {
        const all = this.features;
        const { features: selected, unresolved } = FeatureSet.resolve(all, new FeatureSet(features));

        if (unresolved.length) {
            throw new SchemaImplementationError(
                this,
                `Cannot set unknown feature${unresolved.length > 1 ? "s" : ""} ${describeList("and", ...unresolved)}`,
            );
        }

        let featureMap = this.featureMap;

        if (featureMap.parent !== this) {
            featureMap = featureMap.clone();
            this.children.push(featureMap);
        }

        // Taking ownership of the feature map shadows the models resolved above, so resolve again
        for (let feature of this.features) {
            const isSupported = selected.has(feature.name);

            if (feature.effectiveIsSupported === isSupported) {
                continue;
            }

            if (feature.parent !== featureMap) {
                feature = feature.clone();
                featureMap.children.push(feature);
            }

            feature.operationalIsSupported = isSupported;
        }
    }

    get effectiveMetatype() {
        return Metatype.object;
    }

    get effectiveAccess() {
        return Access.Default;
    }

    constructor(definition: ClusterModel.Definition, ...children: Model.ChildDefinition<ClusterModel>[]) {
        super(definition, ...children);

        this.#quality = Quality.create(definition.quality);
        this.classification = definition.classification as ClusterElement.Classification;
        this.bindable = definition.bindable;
        if (!(definition instanceof Model)) {
            this.pics = definition.pics;
        }
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            quality: this.quality.valueOf(),
            classification: this.classification,
            bindable: this.bindable,
            ...extra,
        });
    }

    static Tag = ClusterElement.Tag;
}

ClusterModel.register();

export namespace ClusterModel {
    export type Definition = Model.Definition<ClusterModel> & { supportedFeatures?: FeatureSet.Definition };

    export type Child =
        | DatatypeModel
        | AttributeModel
        | CommandModel
        | EventModel

        // Fields are not cluster children in canonical schema but we allow them as private values in operational schema
        | FieldModel;

    /**
     * A conformant view of {@link ClusterModel} child indices properties.
     */
    export class Conformant {
        #model: ClusterModel;

        constructor(model: ClusterModel) {
            this.#model = model;
        }

        /**
         * The cluster's conformant attributes.
         */
        get attributes() {
            return this.#model.scope.membersOf(this.#model, {
                tags: [ElementTag.Attribute],
                conformance: "conformant",
            }) as ModelIndex<AttributeModel>;
        }

        /**
         * The cluster's conformant properties (includes fields and attributes).
         *
         * This offers compatibility with the equivalent field for ValueModel.  It is useful when treating a cluster as
         * a struct.
         */
        get properties() {
            return this.#model.scope.membersOf(this.#model, {
                tags: [ElementTag.Attribute, ElementTag.Field],
                conformance: "conformant",
            }) as ModelIndex<AttributeModel | FieldModel>;
        }

        /**
         * The cluster's conformant fields.
         *
         * Fields are not formally allowed on clusters but we allow for extensions that should not be served via the
         * Matter protocol.
         *
         * This is primarily here to allow simplified access to fields in contexts where a variable is typed as a
         * ClusterModel or ValueModel.
         */
        get fields() {
            return this.#model.scope.membersOf(this.#model, {
                tags: [ElementTag.Field],
                conformance: "conformant",
            }) as ModelIndex<FieldModel>;
        }

        /**
         * The cluster's conformant commands.
         */
        get commands() {
            return this.#model.scope.membersOf(this.#model, {
                tags: [ElementTag.Command],
                conformance: "conformant",
            }) as ModelIndex<CommandModel>;
        }

        /**
         * The cluster's conformant events.
         */
        get events() {
            return this.#model.scope.membersOf(this.#model, {
                tags: [ElementTag.Event],
                conformance: "conformant",
            }) as ModelIndex<EventModel>;
        }
    }
}
