/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl, ExpiredReferenceError, Val } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";
import {
    memberFallbackKeyFor,
    memberKeyFor,
    memberReadFallbackKeyFor,
    memberSlotOf,
    memberValueOf,
} from "./MemberKeys.js";
import type { ValReference } from "./ValReference.js";

type Container = Record<string | number, Val>;

/**
 * ManagedReference manages a reference to a container property of another reference.
 *
 * The ManagedReference detects when the value changes and clones the container if it is the original copy.
 *
 * This serves the following purposes:
 *
 *   - We can change properties in a container (an array or object) without modifying the original container
 *
 *   - When nested, this effect bubbles so we make copies at all levels in the hierarchy as necessary
 *
 *   - Preserves metadata regarding the state of the value
 *
 * Change detection happens automatically if the value is replaced.  If a subvalue is replaced, the logic replacing the
 * subvalue must update "changed" manually before replacing the subvalue.  For managed structures this is handled by a
 * separate ManagedReference.
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
    #assertWriteOk: (value: Val) => void;
    #clone: ((container: Val) => Val) | undefined;
    #session: AccessControl.Session;
    #expired = false;
    #location: AccessControl.Location;
    #value: unknown;
    #dynamicContainer: Val.Struct | undefined;

    /**
     * @param parent a reference to the container we reference
     * @param name the name (in the case of structs) or index (in case of lists)
     * @param id the lookup ID, used when {@link parent} keys its members by ID
     * @param assertWriteOk enforces ACLs and read-only
     * @param clone clones the container prior to write; undefined if not transactional
     * @param session the access control session
     */
    constructor(
        parent: ValReference<Val.Collection>,
        name: string | number,
        id: number | undefined,
        assertWriteOk: (value: Val) => void,
        clone: (container: Val) => Val,
        session: AccessControl.Session,
    ) {
        this.parent = parent;
        this.#assertWriteOk = assertWriteOk;
        this.#clone = clone;
        this.#session = session;

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

        let dynamicContainer: Val.Struct | undefined;
        if ((parent.value as Val.Dynamic)[Val.properties]) {
            dynamicContainer = (parent.value as Val.Dynamic)[Val.properties](parent.rootOwner, session);
            // A provider is name-keyed regardless of the parent's keying and holds live values, never seeded
            // defaults, so dynamic reads accept the name spelling where container reads must not
            const slot = memberSlotOf(dynamicContainer as Container, key, fallbackKey);
            if (slot !== undefined) {
                this.#value = (dynamicContainer as Container)[slot];
            } else {
                dynamicContainer = undefined;
            }
        }
        this.#dynamicContainer = dynamicContainer;

        if (dynamicContainer === undefined) {
            this.#value = memberValueOf(parent.value as Container, key, readFallbackKey);
        }

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
        return this.parent!.rootOwner;
    }

    get value() {
        // Authorization is unnecessary here because the reference would not exist if access is unauthorized
        // Note that we allow read from expired references
        return this.#value;
    }

    set value(newValue: Val) {
        if (this.#value === newValue) {
            return;
        }

        // Authorization and validation
        this.#assertWriteOk(newValue);

        // Set the value directly before change() so change() doesn't create a useless clone
        this.#replaceValue(newValue);

        // Now use change to complete the update
        this.change(() => {
            this.#writeTo(this.#dynamicContainer ?? (this.parent!.value as Container), newValue);
        });
    }

    get expired() {
        return this.#expired;
    }

    get location() {
        return this.#location;
    }

    set location(loc: AccessControl.Location) {
        this.#location = loc;
    }

    get original() {
        if (!this.parent!.original) {
            return undefined;
        }
        if (this.#dynamicContainer !== undefined) {
            const origProperties = (this.parent!.original as Val.Dynamic)[Val.properties](
                this.parent!.rootOwner,
                this.#session,
            );
            return memberValueOf(origProperties as Container, this.#key, this.#fallbackKey);
        }
        return memberValueOf(this.parent!.original as Container, this.#key, this.#readFallbackKey);
    }

    change(mutator: () => void) {
        if (this.#expired) {
            throw new ExpiredReferenceError(this.location);
        }

        this.parent!.change(() => {
            // In transactions, clone the value if we haven't done so yet
            if (this.#clone && this.#value === this.original) {
                const newValue = this.#clone(this.#value);
                this.#writeTo(this.#dynamicContainer ?? (this.parent!.value as Container), newValue);
                this.#replaceValue(newValue);
            }

            // Apply changes
            mutator();
        });
    }

    refresh() {
        if (this.parent!.expired) {
            this.#expired = true;
            return;
        }
        if (this.parent!.value === undefined || this.parent!.value === null) {
            this.#expired = true;
            this.#replaceValue(undefined);
            return;
        }

        const value =
            this.#dynamicContainer !== undefined
                ? memberValueOf(this.#dynamicContainer as Container, this.#key, this.#fallbackKey)
                : memberValueOf(this.parent!.value as Container, this.#key, this.#readFallbackKey);

        this.#replaceValue(value);
    }

    #writeTo(container: Container, newValue: Val) {
        container[this.#key] = newValue;
        if (this.#fallbackKey !== undefined && this.#fallbackKey in container) {
            delete container[this.#fallbackKey];
        }
    }

    #replaceValue(newValue: Val) {
        this.#value = newValue;

        const subrefs = this.subrefs;
        if (subrefs) {
            for (const key in subrefs) {
                subrefs[key].refresh();
            }
        }
    }
}
