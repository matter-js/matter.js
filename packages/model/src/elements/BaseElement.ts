/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CrossReference } from "#models/CrossReference.js";
import { ElementTag, Specification } from "../common/index.js";

/**
 * Per the Matter specification, an element is a data construct that supports an instance of data.
 *
 * Elements as defined by this package are a static data structure.  Each element has a corresponding "Model" that is a
 * proper class with runtime functionality related to the element.
 */
export interface BaseElement {
    /**
     * The ID of the element per Matter specification, either global or
     * context-specific.  A "machine appropriate" semantic differentiator.
     */
    id?: number;

    /**
     * The key used for storing this element.  A "human appropriate" semantic
     * differentiator.
     */
    name: string;

    /**
     * If an element derives from another element, the name of the parent
     * element goes here.
     */
    type?: string;

    /**
     * A short summary of the element.
     */
    description?: string;

    /**
     * A paragraph summary of the element.
     */
    details?: string;

    /**
     * Reference to Matter specification document.
     */
    xref?: CrossReference.Definition;

    /**
     * Child elements.
     */
    children?: BaseElement[];

    /**
     * Is this a global element?  Global elements are available in-scope for every cluster.
     */
    isGlobal?: boolean;

    /**
     * Is this a "seed" element?  These are global types and cluster elements defined in the core specification, without
     * which we are fairly incapacitated.
     */
    isSeed?: boolean;

    /**
     * The first Matter specification in which this element appears.
     */
    asOf?: Specification.Revision;

    /**
     * The Matter specification revision in which this element was removed.
     */
    until?: Specification.Revision;

    /**
     * Force match to other elements with the specified name or ID.
     */
    matchTo?: BaseElement.MatchDirective;
}

export function BaseElement(tag: ElementTag, definition: BaseElement, children: BaseElement[]) {
    const result: any = { tag: tag };
    for (const [k, v] of Object.entries(definition)) {
        if (v !== undefined) {
            result[k] = v;
        }
    }
    if (children.length) {
        if (!result.children) {
            result.children = children;
        } else {
            result.children.push(...children);
        }
    }
    return result as BaseElement;
}

export namespace BaseElement {
    export type ElementForProperties<P> = P extends Properties<infer T> ? T : never;

    /**
     * Element with optional tag; used for factory functions and constructors.
     */
    export type Properties<T extends BaseElement = BaseElement> = T extends { tag: `${ElementTag}` }
        ? Omit<T, "tag"> & Partial<Pick<T, "tag">>
        : T;

    /**
     * An explicit ID and/or name that override normal matching heuristics.
     */
    export interface MatchDirective {
        id?: string | number;
        name?: string;
    }
}
