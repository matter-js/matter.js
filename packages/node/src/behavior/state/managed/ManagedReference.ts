/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl, ExpiredReferenceError, Val } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";
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
    primaryKey;
    parent;
    subrefs?: Record<number | string, ValReference>;
    owner?: Val;
    supervisionConfig?: Supervision.Config;

    #key: string | number;
    #altKey: string | number | undefined;
    #assertWriteOk: (value: Val) => void;
    #clone: ((container: Val) => Val) | undefined;
    #session: AccessControl.Session;
    #expired = false;
    #location: AccessControl.Location;
    #value: unknown;
    #dynamicContainer: Val.Struct | undefined;

    /**
     * @param parent a reference to the container we reference
     * @param primaryKey the preferred key for lookup
     * @param name the name (in the case of structs) or index (in case of lists)
     * @param id the lookup ID in the case of structs
     * @param assertWriteOk enforces ACLs and read-only
     * @param clone clones the container prior to write; undefined if not transactional
     * @param session the access control session
     */
    constructor(
        parent: ValReference<Val.Collection>,
        primaryKey: "name" | "id",
        name: string | number,
        id: number | undefined,
        assertWriteOk: (value: Val) => void,
        clone: (container: Val) => Val,
        session: AccessControl.Session,
    ) {
        this.primaryKey = primaryKey;
        this.parent = parent;
        this.#assertWriteOk = assertWriteOk;
        this.#clone = clone;
        this.#session = session;

        this.#location = {
            ...parent.location,
            path: parent.location.path.at(name),
        };

        const key = primaryKey === "id" ? (id ?? name) : name;
        const altKey = primaryKey === "id" ? (key === name ? undefined : name) : id;
        this.#key = key;
        this.#altKey = altKey;

        let dynamicContainer: Val.Struct | undefined;
        if ((parent.value as Val.Dynamic)[Val.properties]) {
            dynamicContainer = (parent.value as Val.Dynamic)[Val.properties](parent.rootOwner, session);
            if (key in (dynamicContainer as Container)) {
                this.#value = (dynamicContainer as Container)[key];
            } else if (altKey !== undefined && altKey in (dynamicContainer as Container)) {
                this.#value = (dynamicContainer as Container)[altKey];
            } else {
                dynamicContainer = undefined;
            }
        }
        this.#dynamicContainer = dynamicContainer;

        if (dynamicContainer === undefined) {
            if (key in (parent.value as Container)) {
                this.#value = (parent.value as Container)[key];
            } else if (altKey !== undefined) {
                this.#value = (parent.value as Container)[altKey];
            }
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
            if (this.#dynamicContainer) {
                (this.#dynamicContainer as Container)[this.#key] = newValue;
                if (this.#altKey !== undefined && this.#altKey in this.#dynamicContainer) {
                    delete (this.#dynamicContainer as Container)[this.#altKey];
                }
            } else {
                (this.parent!.value as Container)[this.#key] = newValue;
                if (this.#altKey !== undefined && this.#altKey in this.parent!.value) {
                    delete (this.parent!.value as Container)[this.#altKey];
                }
            }
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
            if (this.#key in (origProperties as Container)) {
                return (origProperties as Container)[this.#key];
            }
            if (this.#altKey !== undefined) {
                return (origProperties as Container)[this.#altKey];
            }
        } else {
            if (this.#key in this.parent!.original) {
                return (this.parent!.original as Container)[this.#key];
            }
            if (this.#altKey !== undefined) {
                return (this.parent!.original as Container)[this.#altKey];
            }
        }
    }

    change(mutator: () => void) {
        if (this.#expired) {
            throw new ExpiredReferenceError(this.location);
        }

        this.parent!.change(() => {
            // In transactions, clone the value if we haven't done so yet
            if (this.#clone && this.#value === this.original) {
                const newValue = this.#clone(this.#value);
                if (this.#dynamicContainer !== undefined) {
                    (this.#dynamicContainer as Container)[this.#key] = newValue;
                    if (this.#altKey !== undefined && this.#altKey in this.#dynamicContainer) {
                        delete (this.#dynamicContainer as Container)[this.#altKey];
                    }
                } else {
                    (this.parent!.value as Container)[this.#key] = newValue;
                    if (this.#altKey !== undefined && this.#altKey in (this.parent!.value as Container)) {
                        delete (this.parent!.value as Container)[this.#altKey];
                    }
                }
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

        let value;
        if (this.#dynamicContainer !== undefined) {
            if (this.#key in this.#dynamicContainer) {
                value = (this.#dynamicContainer as Container)[this.#key];
            } else if (this.#altKey !== undefined && this.#altKey in this.#dynamicContainer) {
                value = (this.#dynamicContainer as Container)[this.#altKey];
            }
        } else {
            if (this.#key in this.parent!.value) {
                value = (this.parent!.value as Container)[this.#key];
            } else if (this.#altKey !== undefined && this.#altKey in this.parent!.value) {
                value = (this.parent!.value as Container)[this.#altKey];
            }
        }

        this.#replaceValue(value);
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
