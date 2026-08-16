/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "#intermediate-models";
import {
    AnyElement,
    ClusterModel,
    CommandModel,
    ElementTag,
    EventModel,
    FieldValue,
    Metatype,
    Model,
    RequirementElement,
    ValueModel,
} from "#model";
import { ValidationModels } from "./build-models.js";
import { DataModel, DmCluster, DmElement } from "./data-model.js";
import { canonicalizeValue } from "./values.js";

/**
 * Why a difference between our model and CHIP's is reported.
 */
export enum Category {
    /** A difference we cannot explain; the scrape or the translation of it is wrong */
    Mismatch = "mismatch",

    /** A difference introduced by a LocalMatter override, so intentional */
    Override = "override",

    /** A difference in an area where CHIP's model is known to carry less information than ours */
    Tolerated = "tolerated",
}

export interface Finding {
    category: Category;
    path: string;
    property: string;
    chip?: string;
    matter?: string;

    /** The LocalMatter override responsible, if we can identify one */
    override?: string;
}

interface ElementContext {
    /** The element defines an entry of an enum or a bit of a bitmap */
    inValueTable?: boolean;

    /** The element defines a cluster feature */
    isFeature?: boolean;
}

/** Attributes at or above this ID are global; CHIP does not repeat them in cluster definitions */
const GLOBAL_ATTRIBUTE_ID = 0xfff8;

const FABRIC_INDEX = "FabricIndex";

export function compareModels(models: ValidationModels, dm: DataModel) {
    return new Comparison(models, dm).run();
}

class Comparison {
    readonly #models: ValidationModels;
    readonly #dm: DataModel;
    readonly #bases: Map<string, DmCluster>;
    readonly #globalDatatypes: Set<string>;
    readonly #findings = new Array<Finding>();

    constructor(models: ValidationModels, dm: DataModel) {
        this.#models = models;
        this.#dm = dm;
        // A cluster with an ID of its own may still serve as the base of another, as operational state does
        this.#bases = new Map(
            [...dm.clusters, ...dm.baseClusters].map(cluster => [canonicalize(cluster.name), cluster]),
        );
        this.#globalDatatypes = new Set(dm.globals.map(datatype => canonicalize(datatype.name)));
    }

    run() {
        this.#compareClusters();
        this.#compareDeviceTypes();
        this.#compareNamespaces();
        this.#compareGlobals();
        return this.#findings;
    }

    #compareClusters() {
        const { merged, unmodified } = this.#models;
        const seen = new Set<number>();

        for (const chip of this.#dm.clusters) {
            seen.add(chip.id);

            const cluster = merged.clusters(chip.id);
            if (cluster === undefined) {
                this.#absent([chip.name], "cluster", unmodified.clusters(chip.id));
                continue;
            }

            const path = [cluster.name];
            const shadow = unmodified.clusters(chip.id);

            this.#value(path, "name", canonicalize(chip.name), canonicalize(cluster.name), shadowName(shadow));
            this.#value(path, "revision", `${chip.revision}`, `${cluster.revision}`, shadowRevision(shadow));
            this.#value(
                path,
                "classification",
                chip.classification,
                resolvedClassification(cluster),
                resolvedClassification(shadow),
            );

            this.#members(path, this.#effectiveChildren(chip), cluster, shadow);
        }

        for (const cluster of merged.clusters) {
            if (cluster.id !== undefined && !seen.has(cluster.id)) {
                this.#extra([cluster.name], "cluster", unmodified.clusters(cluster.id) === undefined);
            }
        }
    }

    /** Resolve the CHIP inheritance chain; CHIP states only the delta in a derived cluster */
    #effectiveChildren(cluster: DmCluster) {
        const children = new Map<string, DmElement>();
        const visited = new Set<DmCluster>();

        for (let current: DmCluster | undefined = cluster; current !== undefined && !visited.has(current);) {
            visited.add(current);
            for (const child of current.children) {
                const key = `${child.tag}:${canonicalize(child.name)}`;
                if (!children.has(key)) {
                    children.set(key, child);
                } else if (current !== cluster) {
                    children.set(key, inherit(children.get(key)!, child));
                }
            }

            current = current.base === undefined ? undefined : this.#bases.get(canonicalize(current.base));
        }

        return [...children.values()];
    }

    #members(path: string[], chipChildren: DmElement[], cluster: ClusterModel, shadow?: ClusterModel) {
        const features = new Map(cluster.features.map(feature => [canonicalize(feature.name), feature]));
        const shadowFeatures = new Map((shadow?.features ?? []).map(f => [canonicalize(f.name), f]));

        const members = new Map<string, Model>();
        const shadowMembers = new Map<string, Model>();
        for (const member of cluster.allAces) {
            members.set(memberKey(member), member);
        }
        for (const datatype of cluster.datatypes) {
            members.set(memberKey(datatype), datatype);
        }
        if (shadow !== undefined) {
            for (const member of shadow.allAces) {
                shadowMembers.set(memberKey(member), member);
            }
            for (const datatype of shadow.datatypes) {
                shadowMembers.set(memberKey(datatype), datatype);
            }
        }

        const seen = new Set<string>();

        for (const chip of chipChildren) {
            if (chip.tag === ElementTag.Field) {
                const key = canonicalize(chip.name);
                seen.add(`feature:${key}`);
                const feature = features.get(key);
                if (feature === undefined) {
                    this.#absent([...path, chip.name], "feature", shadowFeatures.get(key));
                    continue;
                }
                this.#element([...path, feature.name], chip, feature, shadowFeatures.get(key), { isFeature: true });
                continue;
            }

            const key = chipKey(chip);
            seen.add(key);
            const member = members.get(key);
            if (member === undefined) {
                // CHIP repeats a global data type in every cluster that uses it; we define it once
                if (chip.tag === ElementTag.Datatype && this.#models.merged.datatypes(chip.name) !== undefined) {
                    continue;
                }
                this.#absent([...path, chip.name], chip.tag, shadowMembers.get(key));
                continue;
            }

            this.#element([...path, member.name], chip, member, shadowMembers.get(key));
        }

        for (const [key, feature] of features) {
            if (!seen.has(`feature:${key}`)) {
                this.#extra([...path, feature.name], "feature", !shadowFeatures.has(key));
            }
        }

        for (const [key, member] of members) {
            if (seen.has(key) || isGlobal(member)) {
                continue;
            }
            if (member.name === FABRIC_INDEX) {
                this.#report(Category.Tolerated, [...path, member.name], member.tag, "absent", "present");
                continue;
            }
            if (member.tag === ElementTag.Datatype && this.#globalDatatypes.has(canonicalize(member.name))) {
                continue;
            }
            this.#extra([...path, member.name], member.tag, !shadowMembers.has(key));
        }
    }

    #element(path: string[], chip: DmElement, model: Model, shadow?: Model, context: ElementContext = {}) {
        this.#value(path, "name", canonicalize(chip.name), canonicalize(model.name), shadowName(shadow));

        if (chip.tag !== ElementTag.Datatype || chip.type !== undefined) {
            this.#type(path, "type", typeName(chip.type), model, shadow);
        }

        if (chip.priority !== undefined) {
            this.#value(
                path,
                "priority",
                canonicalize(chip.priority),
                canonicalize(priorityOf(model)),
                canonicalize(priorityOf(shadow)),
            );
        }

        this.#value(path, "id", hex(chip.id), hex(model.id), shadow === undefined ? undefined : hex(shadow.id));

        this.#aspect(path, "conformance", chip, model, shadow, context);
        this.#aspect(path, "constraint", chip, model, shadow);
        this.#access(path, chip, model, shadow);
        this.#aspect(path, "quality", chip, model, shadow);

        if (model instanceof ValueModel) {
            this.#default(path, chip, model, shadow);

            if (chip.entryType !== undefined) {
                this.#type(
                    path,
                    "entry type",
                    typeName(chip.entryType),
                    model.listEntry,
                    shadow instanceof ValueModel ? shadow.listEntry : undefined,
                );
            }
        }

        if (chip.children.length && model instanceof ValueModel) {
            this.#fields(path, chip, model, shadow instanceof ValueModel ? shadow : undefined);
        }
    }

    #fields(path: string[], chip: DmElement, model: ValueModel, shadow?: ValueModel) {
        const metatype = model.effectiveMetatype;
        const inValueTable = metatype === Metatype.enum || metatype === Metatype.bitmap;
        const fields = new Map([...model.members].map(field => [canonicalize(field.name), field]));
        const shadowFields = new Map([...(shadow?.members ?? [])].map(field => [canonicalize(field.name), field]));
        const seen = new Set<string>();

        for (const chipField of chip.children) {
            const key = canonicalize(chipField.name);
            seen.add(key);

            const field = fields.get(key);
            if (field === undefined) {
                this.#absent([...path, chipField.name], chipField.tag, shadowFields.get(key));
                continue;
            }

            this.#element([...path, field.name], chipField, field, shadowFields.get(key), { inValueTable });
        }

        for (const [key, field] of fields) {
            if (seen.has(key)) {
                continue;
            }

            // CHIP omits the fabric index of a fabric scoped value because the specification implies it
            if (field.name === FABRIC_INDEX) {
                this.#report(Category.Tolerated, [...path, field.name], field.tag, "absent", "present");
                continue;
            }

            this.#extra([...path, field.name], field.tag, !shadowFields.has(key));
        }
    }

    #compareDeviceTypes() {
        const { merged, unmodified } = this.#models;
        const seen = new Set<number>();

        for (const chip of this.#dm.deviceTypes) {
            const key = chip.id ?? chip.name;
            if (chip.id !== undefined) {
                seen.add(chip.id);
            }

            const deviceType = merged.deviceTypes(key);
            const shadow = unmodified.deviceTypes(key);

            if (deviceType === undefined) {
                this.#absent([chip.name], "deviceType", shadow);
                continue;
            }

            const path = [deviceType.name];

            this.#value(path, "name", canonicalize(chip.name), canonicalize(deviceType.name), shadowName(shadow));
            this.#value(
                path,
                "revision",
                `${chip.revision}`,
                `${deviceType.revision}`,
                shadow === undefined ? undefined : `${shadow.revision}`,
            );
            this.#value(path, "classification", chip.classification, deviceType.classification, shadow?.classification);

            this.#requirements(path, chip.children, deviceType, shadow);
        }

        for (const deviceType of merged.deviceTypes) {
            if (deviceType.id !== undefined && !seen.has(deviceType.id)) {
                this.#extra([deviceType.name], "deviceType", unmodified.deviceTypes(deviceType.id) === undefined);
            }
        }
    }

    #requirements(path: string[], chipChildren: DmElement[], model: Model, shadow?: Model, cluster?: ClusterModel) {
        const requirements = new Map(model.children.filter(isRequirement).map(child => [requirementKey(child), child]));
        const shadowRequirements = new Map(
            (shadow?.children ?? []).filter(isRequirement).map(child => [requirementKey(child), child]),
        );
        const seen = new Set<string>();

        for (const chip of chipChildren) {
            const keys = this.#requirementKeys(chip, cluster);
            const key = keys.find(candidate => requirements.has(candidate)) ?? keys[0];
            seen.add(key);

            const requirement = requirements.get(key);
            if (requirement === undefined) {
                this.#absent([...path, `${chip.name} (${chip.element})`], "requirement", shadowRequirements.get(key));
                continue;
            }

            const requirementPath = [...path, requirement.name];
            const shadowRequirement = shadowRequirements.get(key);

            if (isClusterRequirement(chip)) {
                this.#value(requirementPath, "id", hex(chip.id), hex(requirement.id));
            }
            this.#aspect(requirementPath, "conformance", chip, requirement, shadowRequirement);
            this.#aspect(requirementPath, "constraint", chip, requirement, shadowRequirement);

            if (chip.children.length) {
                this.#requirements(
                    requirementPath,
                    chip.children,
                    requirement,
                    shadowRequirement,
                    this.#models.merged.clusters(chip.id ?? chip.name),
                );
            }
        }

        for (const [key, requirement] of requirements) {
            if (seen.has(key)) {
                continue;
            }

            if (isImplicitRequirement(requirement)) {
                this.#report(Category.Tolerated, [...path, requirement.name], "requirement", "absent", "present");
                continue;
            }

            this.#extra([...path, requirement.name], "requirement", !shadowRequirements.has(key));
        }
    }

    /**
     * Keys a CHIP requirement may match.
     *
     * CHIP identifies a required feature by its code where we use the name the specification gives the feature in the
     * device type table, which is the feature's title in upper case.
     */
    #requirementKeys(chip: DmElement, cluster?: ClusterModel) {
        const keys = [`${chip.element}:${canonicalize(chip.name)}`];

        if (chip.element === RequirementElement.ElementType.Feature && cluster !== undefined) {
            const feature = cluster.features.find(
                candidate => canonicalize(candidate.name) === canonicalize(chip.name),
            );
            if (feature?.title !== undefined) {
                keys.push(`${chip.element}:${canonicalize(feature.title)}`);
            }
        }

        return keys;
    }

    #compareNamespaces() {
        const { merged, unmodified } = this.#models;

        for (const chip of this.#dm.namespaces) {
            const namespace = merged.semanticNamespaces.find(candidate => candidate.id === chip.id);
            const shadow = unmodified.semanticNamespaces.find(candidate => candidate.id === chip.id);

            if (namespace === undefined) {
                this.#absent([chip.name], "semanticNamespace", shadow);
                continue;
            }

            const path = [namespace.name];
            const tags = new Map(namespace.children.map(tag => [canonicalize(tag.name), tag]));
            const shadowTags = new Map((shadow?.children ?? []).map(tag => [canonicalize(tag.name), tag]));

            this.#value(
                path,
                "name",
                canonicalize(chip.name),
                namespaceName(namespace.name),
                shadow === undefined ? undefined : namespaceName(shadow.name),
            );

            const seen = new Set<string>();

            for (const chipTag of chip.children) {
                const key = canonicalize(chipTag.name);
                seen.add(key);

                const tag = tags.get(key);
                if (tag === undefined) {
                    this.#absent([...path, chipTag.name], "semanticTag", shadowTags.get(key));
                    continue;
                }
                this.#value([...path, tag.name], "id", hex(chipTag.id), hex(tag.id));
            }

            for (const [key, tag] of tags) {
                if (!seen.has(key)) {
                    this.#extra([...path, tag.name], "semanticTag", !shadowTags.has(key));
                }
            }
        }
    }

    #compareGlobals() {
        const { merged, unmodified } = this.#models;

        for (const chip of this.#dm.globals) {
            const datatype = merged.datatypes(chip.name);
            if (datatype === undefined) {
                this.#absent([chip.name], "datatype", unmodified.datatypes(chip.name));
                continue;
            }

            this.#element([datatype.name], chip, datatype, unmodified.datatypes(chip.name));
        }
    }

    /**
     * Compare the type of a value.
     *
     * Where the specification names a type we define, CHIP often states the primitive the type builds on.  Our name
     * carries strictly more information so this is not a divergence.
     */
    #type(path: string[], property: string, chipType: string | undefined, model?: Model, shadow?: Model) {
        if (chipType === undefined || model === undefined) {
            return;
        }

        const type = typeName(resolvedType(model));
        if (type === chipType) {
            return;
        }

        if (model instanceof ValueModel && canonicalize(model.metabase?.name) === chipType) {
            this.#report(Category.Tolerated, path, property, chipType, type);
            return;
        }

        this.#value(path, property, chipType, type, shadow === undefined ? undefined : typeName(resolvedType(shadow)));
    }

    /**
     * Compare the default value.
     *
     * CHIP writes an explicit null default for nullable values where the specification's prose leaves the default
     * implicit, so a null default we do not carry is not a defect.
     */
    #default(path: string[], chip: DmElement, model: ValueModel, shadow?: Model) {
        const chipDefault = defaultKey(chip.default, model);
        if (chipDefault === undefined) {
            return;
        }

        const value = defaultKey(resolvedDefault(model), model);

        if (chipDefault === "null" && value === undefined && model.effectiveQuality.nullable) {
            this.#report(Category.Tolerated, path, "default", chipDefault, value);
            return;
        }

        this.#value(path, "default", chipDefault, value, defaultKey(resolvedDefault(shadow), model));
    }

    /**
     * Compare access facet by facet.
     *
     * CHIP states only the facets the specification lists for an element while our model inherits the remainder from
     * the cluster, so a facet CHIP leaves open carries no information.
     */
    #access(path: string[], chip: DmElement, model: Model, shadow?: Model) {
        const chipAccess = chip.access;
        if (chipAccess === undefined) {
            return;
        }

        const access = accessOf(model);
        const shadowAccess = accessOf(shadow);

        if (chipAccess.rw !== undefined) {
            this.#value(path, "access rw", chipAccess.rw, access?.rw, shadowAccess?.rw);
        }

        if (chipAccess.readPriv !== undefined) {
            this.#value(path, "access read privilege", chipAccess.readPriv, access?.readPriv, shadowAccess?.readPriv);
        }

        if (chipAccess.writePriv !== undefined) {
            this.#value(
                path,
                "access write privilege",
                chipAccess.writePriv,
                access?.writePriv,
                shadowAccess?.writePriv,
            );
        }

        // We mark a fabric scoped structure by its fabric index field rather than on the structure itself
        if (chip.tag === ElementTag.Datatype && accessOf(model)?.fabric === undefined) {
            if (chipAccess.fabric !== undefined) {
                this.#report(Category.Tolerated, path, "access fabric", chipAccess.fabric, "absent");
            }
        } else if (chipAccess.fabric === undefined) {
            // CHIP omits the fabric facet on elements the specification marks fabric scoped only in prose
            if (access?.fabric !== undefined) {
                this.#report(Category.Tolerated, path, "access fabric", "absent", access.fabric);
            }
        } else {
            this.#value(path, "access fabric", chipAccess.fabric, access?.fabric, shadowAccess?.fabric);
        }

        this.#value(
            path,
            "access timed",
            chipAccess.timed ? "T" : "not timed",
            access?.timed ? "T" : "not timed",
            shadowAccess === undefined ? undefined : shadowAccess.timed ? "T" : "not timed",
        );
    }

    #aspect(
        path: string[],
        property: string,
        chip: DmElement,
        model: Model,
        shadow?: Model,
        context: ElementContext = {},
    ) {
        const chipValue = normalizeAspect(chip[property as "conformance"]?.toString(), property);
        if (chipValue === undefined) {
            return;
        }

        const matterValue = normalizeAspect(effectiveAspect(model, property), property);
        if (chipValue === matterValue) {
            return;
        }

        // Feature, bit and status code tables carry a conformance column only sometimes.  We read it where it exists,
        // so an unconditional conformance CHIP states for an element we leave open is CHIP's own inference
        if (
            property === "conformance" &&
            matterValue === undefined &&
            ((context.inValueTable && chipValue === "m") || (context.isFeature && chipValue === "o"))
        ) {
            this.#report(Category.Tolerated, path, property, chipValue, matterValue);
            return;
        }

        if (property === "quality" && isToleratedQuality(chipValue, matterValue)) {
            this.#report(Category.Tolerated, path, property, chipValue, matterValue);
            return;
        }

        this.#value(
            path,
            property,
            chipValue,
            matterValue,
            normalizeAspect(effectiveAspect(shadow, property), property),
        );
    }

    #value(path: string[], property: string, chip?: string, matter?: string, unmodified?: string) {
        if (chip === undefined || chip === matter) {
            return;
        }

        const category = unmodified !== undefined && unmodified === chip ? Category.Override : Category.Mismatch;
        this.#report(category, path, property, chip, matter);
    }

    #absent(path: string[], property: string, unmodified?: unknown) {
        this.#report(
            unmodified === undefined ? Category.Mismatch : Category.Override,
            path,
            property,
            "present",
            "absent",
        );
    }

    #extra(path: string[], property: string, addedByOverride?: boolean) {
        this.#report(addedByOverride ? Category.Override : Category.Mismatch, path, property, "absent", "present");
    }

    #report(category: Category, path: string[], property: string, chip?: string, matter?: string) {
        this.#findings.push({
            category,
            path: path.join("."),
            property,
            chip,
            matter,
            override: category === Category.Override ? describeOverride(path) : undefined,
        });
    }
}

function memberKey(model: Model) {
    if (model instanceof CommandModel) {
        return `${model.tag}:${model.isRequest ? "request" : "response"}:${model.id}`;
    }
    if (model.id === undefined) {
        return `${model.tag}:${canonicalize(model.name)}`;
    }
    return `${model.tag}:${model.id}`;
}

function chipKey(chip: DmElement) {
    if (chip.tag === ElementTag.Command) {
        return `${chip.tag}:${chip.direction ?? "request"}:${chip.id}`;
    }
    if (chip.id === undefined) {
        return `${chip.tag}:${canonicalize(chip.name)}`;
    }
    return `${chip.tag}:${chip.id}`;
}

function requirementKey(model: Model) {
    return `${(model as { element?: string }).element}:${canonicalize(model.name)}`;
}

function isRequirement(model: Model): model is Model {
    return model.tag === ElementTag.Requirement;
}

/**
 * Requirements CHIP does not state at the device type.
 *
 * Every device type has a descriptor, and CHIP models the device types a composed device type contains outside of its
 * cluster requirements.
 */
function isClusterRequirement(chip: DmElement) {
    return (
        chip.element === RequirementElement.ElementType.ServerCluster ||
        chip.element === RequirementElement.ElementType.ClientCluster
    );
}

function isImplicitRequirement(model: Model) {
    const element = (model as { element?: string }).element;
    return (
        element === RequirementElement.ElementType.DeviceType ||
        element === RequirementElement.ElementType.Condition ||
        model.name === "Descriptor"
    );
}

function isGlobal(model: Model) {
    return model.tag === ElementTag.Attribute && model.id !== undefined && model.id >= GLOBAL_ATTRIBUTE_ID;
}

/** Merge a derived CHIP element over the base element it refines */
function inherit(derived: DmElement, base: DmElement): DmElement {
    return {
        ...base,
        ...Object.fromEntries(Object.entries(derived).filter(([, value]) => value !== undefined)),
        children: derived.children.length ? derived.children : base.children,
    } as DmElement;
}

/**
 * The type of a value.
 *
 * A model that refines an inherited value states no type of its own; our effective type is then the name it shares
 * with the inherited definition, so we follow the shadow to the definition that states the actual type.
 */
function resolvedType(model: Model, depth = 0): string | undefined {
    if (model.type !== undefined) {
        return model.type;
    }

    if (!(model instanceof ValueModel)) {
        return;
    }

    const shadow = depth < 8 ? model.shadow : undefined;
    return shadow === undefined ? model.effectiveType : resolvedType(shadow, depth + 1);
}

/**
 * Reduce a default to a comparable form.
 *
 * CHIP names the enum entry a default refers to where we hold its value, and states temperatures and percentages in
 * the encoded units where we hold the value the specification prints.
 */
function defaultKey(value: FieldValue | undefined, model: Model) {
    if (value === undefined) {
        return;
    }

    if (model instanceof ValueModel) {
        const name = FieldValue.referenced(value);
        const member = name === undefined ? undefined : model.member(name);
        if (member?.id !== undefined) {
            return `${member.id}`;
        }

        const numeric = FieldValue.numericValue(value, resolvedType(model));
        if (typeof numeric === "number") {
            return `${numeric}`;
        }
    }

    return canonicalizeValue(value);
}

function resolvedDefault(model?: Model, depth = 0): FieldValue | undefined {
    if (!(model instanceof ValueModel) || depth > 8) {
        return;
    }

    return model.default ?? resolvedDefault(model.shadow, depth + 1);
}

/** Classification is a property of the cluster family, stated once on the base cluster */
function resolvedClassification(cluster?: ClusterModel, depth = 0): string | undefined {
    if (cluster === undefined || depth > 8) {
        return;
    }

    return cluster.classification ?? resolvedClassification(cluster.base as ClusterModel | undefined, depth + 1);
}

function effectiveAspect(model: Model | undefined, property: string) {
    if (model === undefined) {
        return;
    }

    // Only value models resolve aspects through inheritance; others carry the aspect directly
    const properties = model as unknown as Record<string, unknown>;
    const value =
        properties[`effective${property.slice(0, 1).toUpperCase()}${property.slice(1)}`] ?? properties[property];

    return value === undefined ? undefined : `${value}`;
}

/** Aspects differ only in case and spacing between CHIP and our scrape of the specification's prose */
function normalizeAspect(text?: string, property?: string) {
    if (text === undefined) {
        return;
    }

    let normalized = text.toLowerCase().replace(/\s+/g, "");

    if (property === "conformance") {
        // A condition name loses its punctuation ("Wi-Fi" and "WiFi" name the same condition)
        normalized = normalized.replace(/-/g, "");
    }

    if (property === "constraint") {
        // CHIP computes powers and drops the unit of a percentage; an unconstrained list entry states nothing
        normalized = normalized
            .replace(/(\d+)\^(\d+)/g, (_match, base, exponent) => `${Math.pow(Number(base), Number(exponent))}`)
            .replace(/%/g, "")
            .replace(/\[all\]/g, "");
    }

    return normalized === "" ? undefined : normalized;
}

/** CHIP does not model the "reportable" quality */
function isToleratedQuality(chip: string, matter?: string) {
    return matter !== undefined && matter.replace(/p/g, "") === chip;
}

/** We disambiguate a namespace from the cluster of the same name with a suffix */
function namespaceName(name: string) {
    return canonicalize(name.replace(/Namespace$/, ""));
}

function accessOf(model?: Model) {
    return model instanceof ValueModel ? model.effectiveAccess : undefined;
}

function priorityOf(model?: Model) {
    return model instanceof EventModel ? model.priority : undefined;
}

/** Our type names carry the defining scope where CHIP relies on a single global namespace */
function typeName(type?: string) {
    return type === undefined ? undefined : canonicalize(type.slice(type.lastIndexOf(".") + 1));
}

function canonicalize(name: string): string;
function canonicalize(name: string | undefined): string | undefined;

function canonicalize(name?: string) {
    return name === undefined ? undefined : name.toLowerCase().replace(/[^a-z\d]/g, "");
}

function hex(id?: number) {
    return id === undefined ? undefined : `0x${id.toString(16)}`;
}

function shadowName(model?: { name: string }) {
    return model === undefined ? undefined : canonicalize(model.name);
}

function shadowRevision(cluster?: ClusterModel) {
    return cluster === undefined ? undefined : `${cluster.revision}`;
}

/**
 * Identify the override responsible for a divergence.
 *
 * Overrides are addressed by name, so we walk {@link LocalMatter} using the path of the divergent element.
 */
function describeOverride(path: string[]) {
    let element: AnyElement | undefined = LocalMatter as AnyElement;
    const matched = new Array<string>();

    for (const segment of path) {
        const children: AnyElement[] = (element as { children?: AnyElement[] }).children ?? [];
        const next = children.find(child => canonicalize(child.name) === canonicalize(segment));
        if (next === undefined) {
            break;
        }
        element = next;
        matched.push(next.name);
    }

    if (!matched.length) {
        return;
    }

    const gating = new Array<string>();
    if ((element as { asOf?: string }).asOf !== undefined) {
        gating.push(`asOf ${(element as { asOf?: string }).asOf}`);
    }
    if ((element as { until?: string }).until !== undefined) {
        gating.push(`until ${(element as { until?: string }).until}`);
    }

    return `LocalMatter.${matched.join(".")}${gating.length ? ` (${gating.join(", ")})` : ""}`;
}
