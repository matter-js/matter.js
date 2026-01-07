/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import {
    ClusterModel,
    CommandModel,
    DatatypeModel,
    ElementTag,
    EventModel,
    FieldModel,
    MatterModel,
    Metatype,
    Model,
    Scope,
    ValueModel,
} from "#model";
import { camelize } from "../util/string.js";

/**
 * Defines the names and locations for objects in a specific scope.
 *
 * We compute this information before interacting with the scope so we can resolve any name collisions in deference to
 * the most logical definition.
 *
 * We do not worry about Tlv* prefixed names as these are not prone to collision.
 */
export interface GeneratorScope {
    /**
     * The model that defines this scope.
     */
    owner: Model;

    /**
     * The associated model scope.
     */
    scope: Scope;

    /**
     * Obtain the name to use for an in-scope model.
     *
     * Throws an error if the model is not assessed as in-scope.
     *
     * @param model the model to name
     * @param tlv structs have both Name and TlvName defined; this selects the latter
     * @param specific if true retrieves the name for this specific model rather than any canonical override
     */
    nameFor(model: Model, tlv?: boolean, specific?: boolean): string;

    /**
     * Obtain the location of a model's definition.
     *
     * Throws an error if the model is not referenced in this scope.
     *
     * @param model the model whose location we load
     * @param specific if true retrieves the name for this specific model rather than any canonical override
     */
    locationOf(model: Model, specific?: boolean): GeneratorScope.Location;

    /**
     * Obtain the canonical model for a definition.
     *
     * This is the input model unless the model is redefined in a derived scope in which case it is the override.
     */
    canonicalModelFor<T extends Model>(model: T): T;

    /**
     * Given a model, find the canonical model that defines fields for the model.  This will be the generated model we
     * need to reference.
     */
    definingModelFor(model: ValueModel): ValueModel | undefined;
}

export namespace GeneratorScope {
    /**
     * The canonical location of a model.
     */
    export interface Location {
        /**
         * The scope that owns the defining model.
         */
        scope: Model;

        /**
         * The defining model.
         */
        definition: Model;

        /**
         * True iff the model is owned by this scope.
         */
        isLocal: boolean;

        /**
         * True iff the model is owned by the root Matter element.
         */
        isGlobal: boolean;
    }
}

const cache = new WeakMap<Scope, GeneratorScope>();

/**
 * Obtain the codegen scope for a model.
 *
 * Scopes are cached so this should not be used with models that may mutate.
 */
export function GeneratorScope(model: Model | GeneratorScope): GeneratorScope {
    if (!(model instanceof Model)) {
        return model;
    }

    let rootModel = model;
    while (rootModel.parent && rootModel.parent.tag !== ElementTag.Matter) {
        rootModel = rootModel.parent;
    }

    const owner = Scope(rootModel, { forceOwner: true, forceCache: true });

    let result = cache.get(owner);
    if (result === undefined) {
        cache.set(owner, (result = allocateScope(owner)));
    }
    return result;
}

function allocateScope(scope: Scope): GeneratorScope {
    const { locations, names } = assignNames(scope);
    const { owner } = scope;

    return {
        owner,
        scope,

        nameFor(model: Model, tlv: boolean, specific = false) {
            const { definition: definer } = this.locationOf(model, specific);
            const name = names.get(definer);
            if (name === undefined) {
                throw new InternalError(`No name assigned to ${model} in scope ${owner}`);
            }
            if (tlv) {
                return `Tlv${name}`;
            }
            return name;
        },

        locationOf(model: Model, specific = false) {
            if (!specific) {
                model = scope.modelFor(model);
            }
            const location = locations.get(model);
            if (location === undefined) {
                throw new InternalError(`No location identified for ${model} from scope ${owner}`);
            }
            return location;
        },

        canonicalModelFor<T extends Model>(model: T) {
            return scope.extensionOf(model) ?? model;
        },

        definingModelFor(model: ValueModel): ValueModel | undefined {
            let result: ValueModel | undefined;
            model.forEachAncestor(model => {
                if (model instanceof ValueModel) {
                    result = this.canonicalModelFor(model).definingModel;
                    if (result) {
                        result = this.canonicalModelFor(result);
                        return false;
                    }
                }
            });
            return result;
        },
    };
}

enum Priority {
    LocalNamespace,
    Enum,
    Struct,
    Bitmap,
    OtherNamespace,
    Global,
    Attribute,
    Command,
    Event,
}

type ModelsByPriority = Array<Set<Model> | undefined>;
class Locations extends Map<Model, GeneratorScope.Location> {}
type Names = Map<Model, string>;

interface BackingData {
    names: Names;
    locations: Locations;
}

function assignNames(scope: Scope): BackingData {
    const locations = identifyNamedModels(scope);
    const priorities = assignPriorities(locations);
    const names = assignNamesByPriority(priorities);
    return { names, locations };
}

function identifyNamedModels(scope: Scope): Locations {
    const locations = new Locations();
    const { owner } = scope;

    locations.set(scope.owner, {
        definition: owner,
        scope: owner,
        isLocal: true,
        isGlobal: true,
    });

    const base = owner.base;
    if (base instanceof ClusterModel || (base instanceof ValueModel && !base.metatype)) {
        locations.set(base, {
            definition: base,
            scope: base,
            isLocal: false,
            isGlobal: true,
        });
    }

    // Visit all direct descendents and identify locations
    owner.visit(define);

    // For clusters, also visit inherited attributes, commands and events
    if (owner instanceof ClusterModel) {
        const aces = owner.allAces;
        for (const ace of aces) {
            if (ace.parent === owner) {
                continue;
            }

            ace.visit(define);
        }
    }

    return locations;

    /**
     * Set the location for a model and, if the model is not local, its scope
     */
    function define(model: Model, specific = false) {
        if (!(model instanceof ValueModel)) {
            return;
        }

        const metatype = model.effectiveMetatype;
        switch (metatype) {
            case Metatype.array:
                const entry = model.listEntry;
                if (entry) {
                    // If entry is in another scope we won't see it when visiting
                    define(entry);
                }
                break;

            case Metatype.object:
            case Metatype.enum:
            case Metatype.bitmap:
                // Defines a type (if it has fields)
                break;

            default:
                return;
        }

        let definer = model.definingModel;
        if (!definer) {
            // Not a reference
            return;
        }

        if (!specific) {
            const extension = scope.extensionOf(definer);
            if (extension === model) {
                // The model is the definer even if it doesn't provide fields of its own
                definer = model;
            } else if (extension) {
                // Only the extension appears in the file
                define(extension);
                return;
            }
        }

        if (locations.has(definer)) {
            // Already defined
            return;
        }

        let modelScope: Model | undefined = definer.owner(ClusterModel) ?? definer.owner(MatterModel);
        if (modelScope === undefined) {
            throw new InternalError(`Model ${definer} does not appear to be part of a proper hierarchy`);
        }

        const location: GeneratorScope.Location = {
            definition: definer,
            scope: modelScope,
            isLocal: modelScope === owner,
            isGlobal: modelScope.tag === ElementTag.Matter,
        };

        locations.set(definer, location);

        // The model is not defined locally but we need to import any subtree that references shadowed elements.
        if (definer instanceof ValueModel && !specific && referencesShadows(definer)) {
            location.isLocal = true;
            modelScope = owner;

            // Now localize any sub-references
            definer.members.forEach(m => define(m));
        }

        if (modelScope instanceof ClusterModel && modelScope !== owner) {
            locations.set(modelScope, {
                definition: modelScope,
                scope: modelScope,
                isLocal: false,
                isGlobal: true,
            });
        }

        // For enums any base that contributes values must be defined as well as it will be referenced in the type
        if (metatype === Metatype.enum) {
            const { base } = definer;
            if (base && base.metatype === undefined) {
                define(base, true);
            }
        }
    }

    /**
     * Search the model's structure for references to elements that shadow elements defined in the target scope.  If
     * this occurs then we must import types for the subtree so we can redefine them.
     */
    function referencesShadows(model: Model) {
        const visited = new Set();
        return (
            model.visit(descendent => {
                // Avoid revisiting models
                if (visited.has(descendent)) {
                    return;
                }
                visited.add(descendent);

                // If the descendent is a shadow then we've found a shadow reference.  Only consider for independent
                // datatypes for now
                if (scope.isShadow(descendent)) {
                    return false;
                }

                // Not a reference if there is no base
                const base = descendent.base;
                if (!base) {
                    return;
                }

                // Check the base's subtree
                if (referencesShadows(base)) {
                    return false;
                }
            }) === false
        );
    }
}

function assignPriorities(locations: Locations): ModelsByPriority {
    const priorities = Array<Set<Model> | undefined>();

    function collect(priority: Priority, model: Model) {
        let slot = priorities[priority];
        if (slot === undefined) {
            slot = priorities[priority] = new Set();
        }
        slot.add(model);
    }

    for (const [model, { definition: definer, isLocal, isGlobal }] of locations) {
        if (definer instanceof DatatypeModel || definer instanceof FieldModel) {
            const definingNamespace = definer.owner(ClusterModel) ?? definer.owner(MatterModel);
            if (definingNamespace === undefined) {
                throw new InternalError(`Model ${definer} does not appear to be part of a proper hierarchy`);
            }

            if (isLocal) {
                switch ((model as ValueModel).effectiveMetatype) {
                    case Metatype.object:
                        collect(Priority.Struct, definer);
                        break;

                    case Metatype.enum:
                        collect(Priority.Enum, definer);
                        break;

                    case Metatype.bitmap:
                        collect(Priority.Bitmap, definer);
                        break;
                }
            } else {
                if (isGlobal) {
                    collect(Priority.Global, definer);
                } else {
                    collect(Priority.OtherNamespace, definingNamespace);
                }
            }
        } else {
            switch (model.tag) {
                case ElementTag.Attribute:
                    collect(Priority.Attribute, definer);
                    break;

                case ElementTag.Event:
                    collect(Priority.Event, definer);
                    break;

                case ElementTag.Command:
                    collect(Priority.Command, definer);
                    break;

                case ElementTag.Cluster:
                    collect(isLocal ? Priority.LocalNamespace : Priority.OtherNamespace, definer);
            }
        }
    }

    return priorities;
}

function assignNamesByPriority(priorities: ModelsByPriority): Names {
    const names = new Map<Model, string>();
    const assigned = new Set<string>();

    function assign(model: Model) {
        let name = camelize(model.name, true);

        // Determine preferred name
        if (model instanceof DatatypeModel) {
            name = name.replace(/(?:Enum|Struct|Bitmap)$/, "");
        } else if (model instanceof CommandModel) {
            name = name.replace(/(?:Request|Response)$/, "");
            if (model.isRequest) {
                name += "Request";
            } else {
                name += "Response";
            }
        } else if (model instanceof EventModel) {
            if (!name.endsWith("Event")) {
                name += "Event";
            }
        } else if (model instanceof ClusterModel) {
            name = name.replace(/Cluster$/, "");
        }

        // We reserve "Type", plus it's ambiguous
        if (name === "Type") {
            name = `${model.parent?.name}Type`;
        }

        // If the preferred name is unavailable, find a logical fallback
        if (assigned.has(name)) {
            switch (model.tag) {
                case ElementTag.Attribute:
                    name += "Attribute";
                    break;

                case ElementTag.Field:
                    if (model.parent && model.name !== "Type") {
                        name = `${model.parent.name}${name}`;
                    }
                    break;

                case ElementTag.Cluster:
                    name += "Namespace";
                    break;

                case ElementTag.Datatype:
                    switch ((model as DatatypeModel).effectiveMetatype) {
                        case Metatype.object:
                            name += "Struct";
                            break;

                        case Metatype.enum:
                            name += "Enum";
                            break;

                        case Metatype.bitmap:
                            name += "Bitmap";
                            break;
                    }
            }
        }

        // If the logical fallback is unavailable, just start enumerating (this unlikely, hopefully never happens)
        if (assigned.has(name)) {
            let next = 2;
            while (true) {
                const candidate = `${name}${next}`;
                if (assigned.has(candidate)) {
                    next++;
                } else {
                    name = candidate;
                    break;
                }
            }
        }

        names.set(model, name);
        assigned.add(name);
    }

    for (const models of priorities) {
        if (!models) {
            continue;
        }

        for (const model of models) {
            assign(model);
        }
    }

    return names;
}
