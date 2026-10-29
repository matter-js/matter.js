/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl, ExpiredReferenceError, Val } from "@matter/protocol";
import type { ValReference } from "./ValReference.js";

/**
 * A read-only reference to a value that has no slot in managed state, such as an entry a list method removed or an
 * entry a sort comparator receives.
 *
 * The reference serves the value it was given, not a copy.  A manager over it reads through the same path as over a
 * live reference, with the same authorization and name resolution.  The reference counts as expired, so every write
 * through it or through a reference below it throws {@link ExpiredReferenceError}.
 */
export class ReadOnlyReference implements ValReference {
    readonly primaryKey = "name";
    readonly expired = true;

    subrefs?: Record<number | string, ValReference>;
    owner?: Val;
    location: AccessControl.Location;

    #value: Val;
    #rootOwner: unknown;

    constructor(value: Val, location: AccessControl.Location, rootOwner: unknown) {
        this.#value = value;
        this.location = location;
        this.#rootOwner = rootOwner;
    }

    get value() {
        return this.#value;
    }

    get rootOwner() {
        return this.#rootOwner;
    }

    change() {
        throw new ExpiredReferenceError(this.location);
    }

    refresh() {}

    owns() {
        return false;
    }

    adopt() {}
}
