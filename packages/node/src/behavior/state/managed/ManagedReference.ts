/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl, ExpiredReferenceError, Val } from "#protocol";

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
 *
 * @param parent a reference to the container we reference
 * @param primaryKey the preferred key for lookup
 * @param name the name (in the case of structs) or index (in case of lists)
 * @param id the lookup ID in the case of structs
 * @param assertWriteOk enforces ACLs and read-only
 * @param clone clones the container prior to write; undefined if not transactional
 * @param session the access control session
 *
 * @returns a reference to the property
 */
export function ManagedReference(
    parent: Val.Reference<Val.Collection>,
    primaryKey: "name" | "id",
    name: string | number,
    id: number | undefined,
    assertWriteOk: (value: Val) => void,
    clone: (container: Val) => Val,
    session: AccessControl.Session,
) {
    let expired = false;
    let location = {
        ...parent.location,
        path: parent.location.path.at(name),
    };

    const key = primaryKey === "id" ? (id ?? name) : name;
    const altKey = primaryKey === "id" ? (key === name ? undefined : name) : id;
    let value: unknown;

    let dynamicContainer: Val.Struct | undefined;
    if ((parent.value as Val.Dynamic)[Val.properties]) {
        dynamicContainer = (parent.value as Val.Dynamic)[Val.properties](parent.rootOwner, session);
        if (key in (dynamicContainer as Container)) {
            value = (dynamicContainer as Container)[key];
        } else if (altKey !== undefined && altKey in (dynamicContainer as Container)) {
            value = (dynamicContainer as Container)[altKey];
        } else {
            dynamicContainer = undefined;
        }
    }
    if (dynamicContainer === undefined) {
        if (key in (parent.value as Container)) {
            value = (parent.value as Container)[key];
        } else if (altKey !== undefined) {
            value = (parent.value as Container)[altKey];
        }
    }

    const reference: Val.Reference = {
        primaryKey,
        parent,

        get rootOwner() {
            return parent.rootOwner;
        },

        get value() {
            // Authorization is unnecessary here because the reference would not exist if access is unauthorized

            // Note that we allow read from expired references
            return value;
        },

        get expired() {
            return expired;
        },

        get location() {
            return location;
        },

        set location(loc: AccessControl.Location) {
            location = loc;
        },

        set value(newValue: Val) {
            if (value === newValue) {
                return;
            }

            // Authorization and validation
            assertWriteOk(newValue);

            // Set the value directly before change() so change() doesn't create a useless clone
            replaceValue(newValue);

            // Now use change to complete the update
            this.change(() => {
                if (dynamicContainer) {
                    (dynamicContainer as Container)[key] = newValue;
                    if (altKey !== undefined && altKey in dynamicContainer) {
                        delete (dynamicContainer as Container)[altKey];
                    }
                } else {
                    (parent.value as Container)[key] = newValue;
                    if (altKey !== undefined && altKey in parent.value) {
                        delete (parent.value as Container)[altKey];
                    }
                }
            });
        },

        get original() {
            if (!parent.original) {
                return undefined;
            }
            if (dynamicContainer !== undefined) {
                const origProperties = (parent.original as Val.Dynamic)[Val.properties](parent.rootOwner, session);
                if (key in (origProperties as Container)) {
                    return (origProperties as Container)[key];
                }
                if (altKey !== undefined) {
                    return (origProperties as Container)[altKey];
                }
            } else {
                if (key in parent.original) {
                    return (parent.original as Container)[key];
                }
                if (altKey !== undefined) {
                    return (parent.original as Container)[altKey];
                }
            }
        },

        change(mutator: () => void) {
            if (expired) {
                throw new ExpiredReferenceError(this.location);
            }

            parent.change(() => {
                // In transactions, clone the value if we haven't done so yet
                if (clone && value === this.original) {
                    const newValue = clone(value);
                    if (dynamicContainer !== undefined) {
                        (dynamicContainer as Container)[key] = newValue;
                        if (altKey !== undefined && altKey in dynamicContainer) {
                            delete (dynamicContainer as Container)[altKey];
                        }
                    } else {
                        (parent.value as Container)[key] = newValue;
                        if (altKey !== undefined && altKey in (parent.value as Container)) {
                            delete (parent.value as Container)[altKey];
                        }
                    }
                    replaceValue(newValue);
                }

                // Apply changes
                mutator();
            });
        },

        refresh() {
            if (parent.expired) {
                expired = true;
                return;
            }
            if (parent.value === undefined || parent.value === null) {
                expired = true;
                replaceValue(undefined);
                return;
            }

            let value;
            if (dynamicContainer !== undefined) {
                if (key in dynamicContainer) {
                    value = (dynamicContainer as Container)[key];
                } else if (altKey !== undefined && altKey in dynamicContainer) {
                    value = (dynamicContainer as Container)[altKey];
                }
            } else {
                if (key in parent.value) {
                    value = (parent.value as Container)[key];
                } else if (altKey !== undefined && altKey in parent.value) {
                    value = (parent.value as Container)[altKey];
                }
            }

            replaceValue(value);
        },
    };

    if (!parent.subrefs) {
        parent.subrefs = {};
    }
    parent.subrefs[key] = reference;

    return reference;

    function replaceValue(newValue: Val) {
        value = newValue;

        const subrefs = reference.subrefs;
        if (subrefs) {
            for (const key in subrefs) {
                subrefs[key].refresh();
            }
        }
    }
}
