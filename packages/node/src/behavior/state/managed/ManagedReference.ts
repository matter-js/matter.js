/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { AccessControl, Val } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";
import {
    memberFallbackKeyFor,
    memberKeyFor,
    memberReadFallbackKeyFor,
    memberSlotOf,
    memberValueOf,
} from "./MemberKeys.js";
import { ValReference } from "./ValReference.js";

type Container = Record<string | number, Val>;

/**
 * ManagedReference manages a reference to a container property of another reference.
 *
 * The ManagedReference clones the container on write unless the transaction already owns it.
 *
 * This serves the following purposes:
 *
 *   - We can change properties in a container (an array or object) without modifying the original container
 *
 *   - When nested, this effect bubbles so we make copies at all levels in the hierarchy as necessary
 *
 *   - Preserves metadata regarding the state of the value
 *
 * A member reference follows whatever container the parent holds at its key.  A list entry reference is bound to one
 * entry instead, because an index does not identify an entry (see {@link ManagedReference.Binding}):
 *
 * | State   | Cause                                               | {@link value}      | Writes                  |
 * |---------|-----------------------------------------------------|--------------------|-------------------------|
 * | live    | the member holds a container                        | that container     | allowed                 |
 * | absent  | the member, or a container above it, is absent;     | `undefined`/`null` | `PhantomReferenceError` |
 * |         | for an entry, only after another transaction's      |                    |                         |
 * |         | commit                                              |                    |                         |
 * | expired | the owning context exited, a parent is read-only,   | last container     | `ExpiredReferenceError` |
 * |         | or a change in this session moved, removed or       |                    |                         |
 * |         | replaced this entry                                 |                    |                         |
 *
 * "absent" returns to "live" when a container is assigned again.  "expired" is final.
 */
export class ManagedReference implements ValReference {
    readonly primaryKey = "name";
    parent;

    subrefs?: Record<number | string, ValReference>;
    owner?: Val;
    supervisionConfig?: Supervision.Config;

    #key: string | number;
    #fallbackKey: string | number | undefined;
    #readFallbackKey: string | number | undefined;
    #clone: (container: Val) => Val;
    #session: AccessControl.Session;
    #location: AccessControl.Location;
    #value: unknown;
    #dynamicContainer: Val.Struct | undefined;
    #dynamicSource: Val | undefined;
    #binding: ManagedReference.Binding;
    #entry: unknown;
    #copies?: WeakSet<object>;
    #detached = false;

    /**
     * @param parent a reference to the container we reference
     * @param name the name (in the case of structs) or index (in case of lists)
     * @param id the lookup ID, used when {@link parent} keys its members by ID
     * @param clone clones the container prior to write
     * @param session the access control session
     * @param binding what the reference stays bound to when the parent changes
     */
    constructor(
        parent: ValReference<Val.Collection>,
        name: string | number,
        id: number | undefined,
        clone: (container: Val) => Val,
        session: AccessControl.Session,
        binding: ManagedReference.Binding,
    ) {
        this.parent = parent;
        this.#clone = clone;
        this.#session = session;
        this.#binding = binding;

        this.#location = {
            ...parent.location,
            path: parent.location.path.at(name),
        };

        const key = memberKeyFor(parent.primaryKey, name, id);
        const fallbackKey = memberFallbackKeyFor(parent.primaryKey, name, id);
        const readFallbackKey = memberReadFallbackKeyFor(parent.primaryKey, name, id);
        this.#key = key;
        this.#fallbackKey = fallbackKey;
        this.#readFallbackKey = readFallbackKey;

        this.#bindDynamicContainer();
        this.#value =
            this.#dynamicContainer === undefined
                ? memberValueOf(parent.value as Container, key, readFallbackKey)
                : memberValueOf(this.#dynamicContainer as Container, key, fallbackKey);
        this.#entry = this.#value;

        // Propagate supervision config from parent
        if (parent.supervisionConfig) {
            this.supervisionConfig = parent.supervisionConfig.readonlyChild(key);
        }

        if (!parent.subrefs) {
            parent.subrefs = {};
        }
        parent.subrefs[key] = this;
    }

    get rootOwner() {
        return this.parent.rootOwner;
    }

    get value() {
        // Authorization is unnecessary here because the reference would not exist if access is unauthorized
        return this.#value;
    }

    get expired() {
        return this.#detached || this.parent.expired;
    }

    get location() {
        return this.#location;
    }

    set location(loc: AccessControl.Location) {
        this.#location = loc;
    }

    /**
     * A container a `Val.properties` provider serves, and every container below it, is never owned, even when the
     * provider serves a container the transaction cloned for another member.  The provider keeps the value its setter
     * accepted, so a later change must clone it again instead of changing it in place.
     */
    owns(container: Val) {
        return this.#dynamicContainer === undefined && this.parent.owns(container);
    }

    adopt(container: Val) {
        this.parent.adopt(container);
    }

    /**
     * Clones the container unless the transaction {@link owns} it, runs {@link mutator}, then stores the container in
     * the parent.  A dynamic provider's setter therefore receives the container after every change, with the change
     * applied.
     */
    change(mutator: () => void) {
        ValReference.writableContainerOf(this);

        this.parent.change(() => {
            // The parent's change may refresh this reference and expire it
            ValReference.writableContainerOf(this);

            if (!this.owns(this.#value)) {
                const clone = this.#clone(this.#value);
                this.adopt(clone);
                if (this.#binding === "entry" && typeof clone === "object" && clone !== null) {
                    (this.#copies ??= new WeakSet()).add(clone);
                }
                this.#replaceValue(clone, "session");
            }

            mutator();

            this.#writeTo(this.#dynamicContainer ?? (this.parent.value as Container), this.#value);
        }, this.#key);
    }

    refresh(cause: ValReference.RefreshCause) {
        if (this.expired) {
            return;
        }

        if (this.parent.value === undefined || this.parent.value === null) {
            this.#follow(undefined, cause);
            return;
        }

        // A member the parent serves from a provider must stay served for the life of this reference; a reference that
        // found no provider is never asked again, so a parent may not start serving one either
        if (this.#dynamicContainer !== undefined && this.parent.value !== this.#dynamicSource) {
            this.#bindDynamicContainer();
            if (this.#dynamicContainer === undefined) {
                throw new InternalError(`Value at ${this.location.path} no longer serves ${this.#key}`);
            }
        }

        const value =
            this.#dynamicContainer === undefined
                ? memberValueOf(this.parent.value as Container, this.#key, this.#readFallbackKey)
                : memberValueOf(this.#dynamicContainer as Container, this.#key, this.#fallbackKey);

        this.#follow(value, cause);
    }

    /**
     * Take `value` as the referenced value.  An entry reference expires instead when a change in this session put
     * another entry at its index.  It accepts its entry and every copy it made of that entry, because only a rollback
     * puts an earlier copy back.  After another transaction's commit, an entry reference follows its index like a
     * member reference and binds to the entry now there.
     */
    #follow(value: unknown, cause: ValReference.RefreshCause) {
        if (this.#binding === "entry") {
            if (cause === "external") {
                this.#entry = value;
                this.#copies = undefined;
            } else if (!this.#holds(value)) {
                this.#detach();
                return;
            }
        }

        this.#replaceValue(value, cause);
    }

    #holds(value: unknown) {
        if (value === this.#entry) {
            return true;
        }
        return typeof value === "object" && value !== null && !!this.#copies?.has(value);
    }

    /**
     * Stop following the entry.  The reference keeps its last value and is {@link expired}.  It leaves the parent's
     * subrefs, so the next read at its index creates a reference for the entry now there.
     */
    #detach() {
        this.#detached = true;
        delete this.parent.subrefs?.[this.#key];
    }

    /**
     * Bind to the provider the parent serves this member from, if it serves it from one.  A provider belongs to the
     * struct it was derived from, so this runs again whenever the parent replaces that struct.
     */
    #bindDynamicContainer() {
        const parent = this.parent;

        this.#dynamicSource = parent.value;
        this.#dynamicContainer = undefined;

        if (!(parent.value as Val.Dynamic)[Val.properties]) {
            return;
        }

        const container = (parent.value as Val.Dynamic)[Val.properties](parent.rootOwner, this.#session);

        // A provider is name-keyed regardless of the parent's keying and holds live values, never seeded defaults, so
        // dynamic reads accept the name spelling where container reads must not
        if (memberSlotOf(container as Container, this.#key, this.#fallbackKey) === undefined) {
            return;
        }

        this.#dynamicContainer = container;
    }

    #writeTo(container: Container, newValue: Val) {
        container[this.#key] = newValue;
        if (this.#fallbackKey !== undefined && this.#fallbackKey in container) {
            delete container[this.#fallbackKey];
        }
    }

    #replaceValue(newValue: Val, cause: ValReference.RefreshCause) {
        this.#value = newValue;

        const subrefs = this.subrefs;
        if (subrefs) {
            for (const key in subrefs) {
                subrefs[key].refresh(cause);
            }
        }
    }
}

export namespace ManagedReference {
    /**
     * What a reference stays bound to when its parent changes.
     *
     * - `member`: the key.  A struct member is identified by its name, so the reference follows the container the
     *   parent holds there.
     * - `entry`: the entry it was read for, or the entry another transaction's commit put at its index.  An index does
     *   not identify a list entry: a list method, a length change, an assignment at the index or of the whole list puts
     *   another entry there.
     */
    export type Binding = "member" | "entry";
}
