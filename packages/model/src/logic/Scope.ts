/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { SchemaImplementationError } from "#common/errors.js";
import { FeatureSet } from "#common/FeatureSet.js";
import { ImplementationError } from "#general";
import { ModelTraversal } from "./ModelTraversal.js";

// These must be types to avoid circular references
import type { ClusterModel, Model, ScopeModel, ValueModel } from "#models/index.js";
import { ModelIndex, MutableModelIndex } from "./ModelIndex.js";

const DEFAULT_TAGS = new Set([ElementTag.Field, ElementTag.Attribute]);
const GLOBAL_IDS = new Set([0xfffd, 0xfffc, 0xfffb, 0xfffa, 0xfff9, 0xfff8]);

const cache = new WeakMap<Model, Scope>();

/**
 * Tracks extensions for a scope to models in parent scopes.
 *
 * A child model with the same {tag, name, type} tuple in a derived scope is a semantic extension of the model in the
 * parent scope even if it does not explicitly inherit from the parent via {@link Model#type}.  We refer to the implicit
 * base class as a *shadow* and the implicit child class as an *extension*.
 *
 * Note that "type" in above tuple includes either undefined, the model's own name, or extension of the exact same type
 * in both the shadow and the extension.  In the former case the shadow is implicit; in the latter case it is explicit.
 *
 * This utility provideds optimized lookup of extensions present in a particular scope.
 *
 * If the scope is frozen the analysis is cached.
 *
 * TODO - there is remaining ambiguity in shadow selection, fine for now but could be eliminated with conformance
 *
 * TODO - currently we only consider shadows at scope root but shadows of nested children is possible with this approach
 */
export interface Scope {
    /**
     * The model analyzed.
     */
    owner: Model;

    /**
     * Determine if the model is a shadow.
     */
    isShadow(model?: Model): boolean;

    /**
     * Retrieve the extension for an element if it is a shadow.
     */
    extensionOf<T extends Model>(model?: T): undefined | T;

    /**
     * Obtain canonical definition for model.  If the input model is a shadow returns the extension, otherwise returns
     * the input model.
     */
    modelFor<T extends Model>(model: T): T;

    /**
     * Identify members (child properties) of the designated model in this scope.
     */
    membersOf<T extends Model>(parent: T, options?: Scope.MemberOptions): ModelIndex<Model.ChildOf<T>>;
}

/**
 * Obtain the scope for a model.
 *
 * By default, if {@link subject} is not a {@link ScopeModel} the scope returned is for the nearest owning
 * {@link ScopeModel}.
 */
export function Scope(subject: Model, options: Scope.ScopeOptions = {}) {
    let owner: Model;

    if ((subject as ScopeModel).isScope || options.forceOwner) {
        owner = subject as ScopeModel;
    } else {
        const scope = new ModelTraversal().findScope(subject);

        if (scope === undefined) {
            throw new SchemaImplementationError(subject, `No parent scope`);
        }

        owner = scope;
    }

    const useCache = options.forceCache || Object.isFrozen(owner);

    let deconflictedMemberCache: Map<Model, Map<ElementTag, Set<Model>>> | undefined;
    let conformantMemberCache: Map<Model, Map<ElementTag, Set<Model>>> | undefined;

    let { featureNames, supportedFeatures } = owner as ClusterModel;
    if (!featureNames) {
        featureNames = new FeatureSet();
    }
    if (!supportedFeatures) {
        supportedFeatures = new FeatureSet();
    }

    if (useCache && !options.disableCache) {
        const cached = cache.get(owner);
        if (cached) {
            return cached;
        }
        deconflictedMemberCache = new Map();
        conformantMemberCache = new Map();
    }

    let shadows: undefined | WeakMap<Model /* shadow */, Model[] /* canonical */>;
    const canonicalIdentityLevels = {} as Record<string, { level: number; models: Model[] }>;
    let level = 0;

    new ModelTraversal().visitInheritance(owner, scope => {
        level++;

        for (const model of scope.children) {
            for (const identity of [`n${model.tag}␜${model.name}␜${model.discriminator ?? ""}`]) {
                const canonical = canonicalIdentityLevels[identity];
                if (canonical === undefined) {
                    canonicalIdentityLevels[identity] = {
                        level,
                        models: [model],
                    };
                } else if (canonical.level === level) {
                    canonical.models.push(model);
                } else {
                    if (!shadows) {
                        shadows = new WeakMap();
                    }
                    shadows.set(model, canonical.models);
                }
            }
        }
    });

    const result: Scope = {
        owner,
        isShadow: shadows ? model => shadows!.has(model as ValueModel) : () => false,
        extensionOf: shadows
            ? <T extends Model>(model?: T) => shadows!.get(model as unknown as ValueModel)?.[0] as T | undefined
            : <T extends Model>(model?: T) => model,
        modelFor: shadows
            ? <T extends Model>(model: T) =>
                  (shadows!.get(model as unknown as ValueModel)?.[0] as T | undefined) ?? model
            : <T extends Model>(model: T) => model,
        membersOf,
    };

    function membersOf<T extends Model>(parent: T, options: Scope.MemberOptions = {}) {
        const { conformance: conformanceMode } = options;
        let { tags = DEFAULT_TAGS } = options;
        if (Array.isArray(tags)) {
            tags = new Set(tags);
        }
        const allMembers = findAllMembers(parent, tags, result);

        if (parent.tag === ElementTag.Cluster && tags.has(ElementTag.Attribute)) {
            injectGlobalAttributes(
                owner as ClusterModel,
                allMembers as unknown as MutableModelIndex<ClusterModel.Child>,
            );
        }

        if (!conformanceMode || conformanceMode === "ignore") {
            return allMembers;
        }

        const conformantOnly = conformanceMode === "conformant";

        if (!conformantOnly && conformanceMode !== "deconflicted") {
            throw new ImplementationError(`Invalid member conformance mode ${conformanceMode}`);
        }

        return filterWithConformance(
            parent,
            tags,
            allMembers,
            featureNames,
            supportedFeatures,
            conformantOnly,
            conformantOnly ? deconflictedMemberCache : conformantMemberCache,
        );
    }

    if (useCache) {
        cache.set(owner, result);
    }

    return result;
}

export namespace Scope {
    /**
     * Configuration for scope creation.
     */
    export interface ScopeOptions {
        /**
         * Force the result to cache regardless of whether model is frozen.
         */
        forceCache?: boolean;

        /**
         * Disable loading of model from cache.  Will still write to cache if {@link forceCache} is true.
         */
        disableCache?: boolean;

        /**
         * Force the input model as an owner even if it is not a {@link ScopeOwner}.
         */
        forceOwner?: boolean;
    }

    /**
     * Return all members regardless of conformance.
     */
    export const IgnoreConformance = "ignore";

    /**
     * Use conformance to resolve conflicts but otherwise return all members.  Useful to detect errors in input that may
     * contain non-conformant values.
     */
    export const DeconflictedConformance = "deconflicted";

    /**
     * Only return conformant members.
     */
    export const ConformantConformance = "conformant";

    /**
     * Determines how to apply conformance when selecting members.
     */
    export type ConformanceMode =
        | typeof IgnoreConformance
        | typeof DeconflictedConformance
        | typeof ConformantConformance;

    export interface MemberOptions {
        /**
         * Conformance filtering mode.
         */
        conformance?: ConformanceMode;

        /**
         * Applicable tags.  Defaults to "field" and "attribute".
         */
        tags?: Set<ElementTag> | ElementTag[];
    }
}

/**
 * Selects all candidate members for a model.
 */
function findAllMembers<T extends Model>(parent: T, tags: Set<ElementTag>, scope: Scope) {
    const members = new MutableModelIndex<Model.ChildOf<T>>();

    // This is a map of identity (based on tag + id/name + discriminator) to a priority based on inheritance depth
    const defined = {} as Record<string, number | undefined>;

    const visited = new Set<Model>();

    const traversal = new ModelTraversal();

    let level = 0;
    const childSearchVisitor = (model: Model) => {
        // If the model has an extension that we haven't yet visited, we need to move search to the extension.  This
        // occurs if e.g. an attribute extends an attribute in a base cluster that references a datatype that is
        // extended in the extended cluster
        const extension = scope.modelFor(model);
        if (extension !== model && !visited.has(extension)) {
            traversal.visitInheritance(extension, childSearchVisitor);
            return false;
        }

        visited.add(model);

        level++;
        for (const child of model.children) {
            if (!tags.has(child.tag)) {
                continue;
            }

            // Omit shadows
            const nameIdentity = `s␜${child.tag}␜${child.name}␜${child.discriminator ?? ""}`;
            const nameLevel = defined[nameIdentity];
            if (nameLevel !== undefined && nameLevel < level) {
                continue;
            }

            // Mark the level in which we saw these members
            defined[nameIdentity] = level;

            // Found a member
            members.push(child as Model.ChildOf<T>);
        }
    };
    traversal.visitInheritance(parent, childSearchVisitor);

    return members;
}

/**
 * We consider the standard set of "global" attributes members of all clusters.  This injects those members that are
 * not otherwise defined in the cluster.
 */
function injectGlobalAttributes(scope: ClusterModel, members: ClusterModel.Child[]) {
    const missingGlobalIds = new Set(GLOBAL_IDS);
    for (const m of members) {
        if (m.tag === ElementTag.Attribute && m.id) {
            missingGlobalIds.delete(m.id);
        }
    }

    if (missingGlobalIds.size) {
        const root = new ModelTraversal().findRoot(scope);
        if (root) {
            for (const id of missingGlobalIds) {
                const global = root.children.select(id, [ElementTag.Attribute]);
                if (global) {
                    members.push(global);
                }
            }
        }
    }
}

/**
 * Filter selected members as follows:
 *
 *   - If the member is deprecated, ignore it
 *
 *   - If there is only a single member of a given name, select that member
 *
 *   - If there are multiple members with the same name but there is no cluster, throw an error
 *
 *   - If there are multiple members with the same name, use conformance to select the member that is applicable based
 *     on active features in the provided cluster
 *
 *   - If there are multiple applicable members based on conformance the definitions conflict; and throw an error
 *
 * If the model is frozen we cache the return value.
 *
 * Note that "active" in this case does not imply the member is conformant, only that conflicts are resolved.
 *
 * Note 2 - members may not be differentiated with conformance rules that rely on field values in this way. That will
 * probably never be necessary and would require an entirely different (more complicated) structure.
 */
function filterWithConformance<T extends Model>(
    parent: T,
    tags: Set<ElementTag>,
    members: Model[],
    features: FeatureSet,
    supportedFeatures: FeatureSet,
    conformantOnly: boolean,
    cache?: Map<Model, Map<ElementTag, Set<Model>>>,
) {
    const tagsToCollect = new Set<ElementTag>(tags);
    const result = new MutableModelIndex<Model.ChildOf<T>>();
    const cached = cache ? (cache.get(parent) ?? new Map()) : undefined;

    if (cache && cached) {
        for (const tag of tagsToCollect) {
            const cachedMembers = cached.get(tag);
            if (cachedMembers) {
                result.push(...cachedMembers);
                tagsToCollect.delete(tag);
            }
        }
        if (tagsToCollect.size === 0) {
            return result;
        }
    }

    const selectedMembers = {} as Record<string, Record<string, Model>>;
    for (const tag of tagsToCollect) {
        selectedMembers[tag] = {};
    }
    for (const member of members) {
        const { conformance, tag } = member as ValueModel;
        if (!tagsToCollect.has(tag)) {
            continue; // Entry belongs to a tag likely already in the result because was cached
        }

        if (!conformance) {
            throw new ImplementationError(
                `Conformance filtering invoked on ${member} which does not support conformance`,
            );
        }

        if (conformantOnly && !conformance.applicabilityOf(features, supportedFeatures)) {
            continue;
        }

        const other = selectedMembers[tag][member.name];
        if (other !== undefined) {
            if (!conformantOnly && !conformance.applicabilityOf(features, supportedFeatures)) {
                continue;
            }

            const { conformance: otherConformance } = other as ValueModel;
            if (!otherConformance) {
                throw new ImplementationError(
                    `Conformance filtering invoked on ${other} which does not support conformance`,
                );
            }

            if (otherConformance.applicabilityOf(features, supportedFeatures)) {
                throw new SchemaImplementationError(
                    parent,
                    `There are multiple definitions of "${member.name}" that cannot be differentiated by conformance`,
                );
            }

            // This member takes precedence and will overwrite below
        }

        selectedMembers[tag][member.name] = member;
    }

    for (const tag in selectedMembers) {
        const tagResult = Object.values(selectedMembers[tag]) as Model.ChildOf<T>[];
        if (tagResult.length) {
            result.push(...tagResult);
            if (cached) {
                cached.set(tag as ElementTag, new Set(tagResult));
            }
        }
    }
    if (cache && cached) {
        cache.set(parent, cached);
    }

    return result;
}
