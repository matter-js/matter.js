/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Conformance } from "#aspects/Conformance.js";
import type { DefinitionError } from "#common/DefinitionError.js";
import type { ElementTag } from "#common/ElementTag.js";
import type { Specification } from "#common/Specification.js";
import { CrossReference } from "./CrossReference.js";
import type { Model } from "./Model.js";
import type { RequirementModel } from "./RequirementModel.js";

/**
 * Model specification details.
 *
 * Model resources are a parallel data model that is not required for operational purposes.  If loaded, the model
 * provides additional metadata about elements.
 *
 * You can load resources for the standard data model using `import "@matter/model/resources"`.
 */
export class Resource {
    errors?: DefinitionError[];
    asOf?: Specification.Revision;
    until?: Specification.Revision;
    matchTo?: {
        id?: string | number;
        name?: string;
    };
    pics?: string;
    description?: string;
    xref?: Specification.CrossReference;
    details?: string;

    constructor(resources?: Resource.Definition) {
        if (!resources) {
            return;
        }

        this.description = resources.description;
        this.details = resources.details;
        this.xref = resources.xref ? CrossReference.get(resources.xref) : undefined;
        this.errors = resources.errors;
        this.asOf = resources.asOf;
        this.until = resources.until;
        this.matchTo = resources.matchTo;
        this.pics = resources.pics;
    }
}

/**
 * A pool of loaded resources.
 *
 * Resources are indexed logically via a (tag, name) tuple in the context of the parent and if necessary for
 * discrimination, conformance.  Models that do not have their own resource definition installed will search this
 * pool to fulfill resource properties.
 */
export class ResourceBundle {
    /**
     * Resource location is relatively expensive because it searches parent hierarchy.  So we cache nodes here.
     *
     * If new resources are added, which is uncommon, we clear the cache.
     */
    #cache?: WeakMap<Model, IndexNode | false>;

    #index: IndexNode = {
        resource: undefined,
        children: undefined,
        discriminated: undefined,
    };

    get(model: Model) {
        const cached = this.#cache?.get(model);
        if (cached === false) {
            return;
        }
        if (cached) {
            return cached?.resource;
        }

        const node = this.#findNode(model);

        if (!this.#cache) {
            this.#cache = new WeakMap();
        }
        this.#cache.set(model, node ?? false);

        return node?.resource;
    }

    add(resource: Resource.Named) {
        this.#addNode(resource, this.#index);

        // Clear cache as resources have changed
        this.#cache = undefined;
    }

    #addNode(item: Resource.Named, owner: IndexNode) {
        const key = `${item.tag}:${item.name}`;

        let node = owner.children?.get(key);
        if (!node) {
            node = {};
            if (!owner.children) {
                owner.children = new Map();
            }
            owner.children.set(key, node);
        }

        if (item.discriminator) {
            if (node.discriminated) {
                let node2 = node.discriminated.get(item.discriminator);
                if (node2) {
                    node = node2;
                } else {
                    node2 = {};
                    node.discriminated.set(item.discriminator, node2);
                    node = node2;
                }
            } else {
                const node2 = {};
                node.discriminated = new Map();
                node.discriminated.set(item.discriminator, node2);
                node = node2;
            }
        }

        node.resource = new Resource(item);
        Object.freeze(node.resource);

        if (item.children) {
            for (const child of item.children) {
                this.#addNode(child, node);
            }
        }
    }

    #findNode(model: Model): IndexNode | undefined {
        let parent;

        if (!model.parent || model.parent === model.root) {
            parent = this.#index;
        } else {
            parent = this.#findNode(model.parent);
        }

        if (!parent) {
            return;
        }

        const key = `${model.tag}:${model.name}`;
        const node = parent.children?.get(key);

        if (!node) {
            return;
        }

        if (node.discriminated) {
            return node.discriminated?.get(Resource.discriminatorFor(model));
        }

        return node;
    }

    static readonly default = new ResourceBundle();
}

interface IndexNode {
    resource?: Readonly<Resource>;
    discriminated?: Map<string | undefined, IndexNode>;
    children?: Map<string, IndexNode>;
}

export namespace Resource {
    export interface Named extends Definition {
        tag: `${ElementTag}`;
        name: string;
        discriminator?: string;
        children?: Named[];
    }

    export type Definition = Omit<Resource, "xref"> & { xref?: CrossReference.Definition };

    export function add(named: Named) {
        ResourceBundle.default.add(named);
    }

    export function discriminatorFor(model: Model) {
        if (model.tag === "requirement") {
            return `${(model as RequirementModel).conformance ?? ""}:${(model as RequirementModel).element}`;
        }
        if ("conformance" in model && (model.conformance as Conformance).isEmpty === false) {
            return `${model.conformance}`;
        }
    }
}
