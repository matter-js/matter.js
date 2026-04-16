/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterModel } from "./MatterModel.js";
import type { Model } from "./Model.js";

/**
 * Encapsulates parent/root state and tree operations for a {@link Model}.
 *
 * Replaces the three per-instance closures (adopt, reroot, disown) that were previously passed to ChildList, reducing
 * per-model allocation from 3 closures to 1 object.
 */
export class ModelTreePosition {
    #owner: Model;
    #parent: Model | undefined;
    #root: MatterModel | undefined;

    constructor(owner: Model) {
        this.#owner = owner;
    }

    get parent() {
        return this.#parent;
    }

    get root() {
        return this.#root;
    }

    /**
     * Adopt a child into this owner's tree.  Removes from previous parent if necessary.
     */
    adopt(child: Model) {
        const childPos = child.treePosition;
        if (childPos.#parent === this.#owner) {
            return;
        }

        if (childPos.#parent) {
            const position = childPos.#parent.children.indexOf(child);
            if (position !== -1) {
                childPos.#parent.children.splice(position, 1);
            }
        }

        childPos.#parent = this.#owner;
    }

    /**
     * Update the root reference for a child.  Returns true if the root changed.
     */
    reroot(child: Model, sharesRoot: boolean): boolean {
        const root = sharesRoot ? this.#owner.root : undefined;
        const childPos = child.treePosition;

        if (childPos.#root === root) {
            return false;
        }

        childPos.#root = root;
        return true;
    }

    /**
     * Disown a child from this owner.  Returns true if the child was actually owned.
     */
    disown(child: Model): boolean {
        const childPos = child.treePosition;
        if (childPos.#parent === this.#owner) {
            childPos.#parent = undefined;
            return true;
        }
        return false;
    }
}
