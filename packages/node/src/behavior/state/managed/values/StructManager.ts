/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, GeneratedClass, ImplementationError, isObject } from "#general";
import type { Schema } from "#model";
import { Access, ElementTag, FieldValue, Metatype, ValueModel } from "#model";
import { AccessControl, PhantomReferenceError, SchemaImplementationError, Val } from "#protocol";
import { FabricIndex } from "#types";
import { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import type { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";
import { Instrumentation } from "../Instrumentation.js";
import { Internal } from "../Internal.js";
import { ManagedReference } from "../ManagedReference.js";
import { NameResolver } from "../NameResolver.js";
import { PrimitiveManager } from "./PrimitiveManager.js";

const AUTHORIZE_READ = Symbol("authorize-read");

/**
 * Internal view of struct.
 */
interface Struct extends Val.Struct {
    [Internal.session]: ValueSupervisor.Session;
    [Internal.reference]: Val.Reference<Val.Struct>;

    /**
     * Direct read authorization.
     */
    [AUTHORIZE_READ](attributeId: number): void;
}

/**
 * For structs we generate a class with accessors for each property in the schema.
 */
export function StructManager(owner: RootSupervisor, schema: Schema): ValueSupervisor.Manage {
    /**
     * These install on the prototype.  We use this for internal methods and ID methods as we don't want them to be
     * enumerable.
     */
    const prototypeDescriptors = {
        // TODO - interferes with Chai deep equal.  Best fix would probably be a custom deep equal assertion but
        // leaving out for now
        // [Symbol.toStringTag]: {
        //     value: name,
        // },

        // TODO - makes Mocha diffs pretty useless.  Best fix is probably customized diff but leaving out for now
        // toString: {
        //     value() {
        //         return serialize(this);
        //     }
        // },

        // AUTHORIZE_READ is effectively a protected method, see StructManager.assertDirectReadAuthorized below
        [AUTHORIZE_READ]: {
            value(this: Struct, attributeId: number) {
                const access = propertyAccessControls[attributeId];

                if (access === undefined) {
                    throw new ImplementationError(`Direct read of unknown property ${attributeId}`);
                }

                access.authorizeRead(this[Internal.session], this[Internal.reference].location);
            },
        },
    } as PropertyDescriptorMap;

    /**
     * These we define on the instance so they appear as normal object properties.
     */
    const instanceDescriptors = {} as PropertyDescriptorMap;

    const propertyAccessControls = {} as Record<number, AccessControl>;
    let hasFabricIndex = false;
    const isCluster = schema.tag === ElementTag.Cluster;

    // Scan the schema and configure each member (field or attribute) as a property
    for (const member of owner.membersOf(schema)) {
        const name = camelize(member.name);

        const { access, descriptor } = configureProperty(owner, member);

        instanceDescriptors[name] = descriptor;
        if (member.id !== undefined) {
            prototypeDescriptors[member.id] = { ...descriptor, enumerable: false };
            propertyAccessControls[member.id] = access;
        }

        if (member.name === "FabricIndex") {
            hasFabricIndex = true;
        }
    }

    let name = schema.name;
    if (schema.tag === ElementTag.Cluster && !name.endsWith("$State")) {
        name = `${name}$State`;
    }

    const Wrapper = GeneratedClass({
        name,

        initialize(this: Struct, ref: Val.Reference, session: ValueSupervisor.Session) {
            Object.defineProperties(this, {
                [Internal.reference]: {
                    value: ref as Val.Reference<Val.Struct>,
                },
                [Internal.session]: {
                    value: session,
                },
            });

            // Only objects are acceptable
            if (!isObject(ref.value)) {
                throw new SchemaImplementationError(
                    ref.location,
                    `Cannot manage ${typeof ref.value} because it is not a struct`,
                );
            }

            // If we have a fabric index, update the context
            if (hasFabricIndex) {
                const owningFabric = ref.value.fabricIndex as FabricIndex | undefined;
                ref.location = { ...ref.location, owningFabric };
            }

            // Sadly we can't place instance descriptors on our prototype because then simple JS patterns that rely on
            // enumerating own properties (e.g. spread) won't work.  At least we can reuse the accessors so they should
            // get JITed
            //
            // The "protocol" optimization for clusters omits these fields as the attribute protocol is ID only.
            // Currently outer layers do not support ID keys for fields
            if (!isCluster || !session.protocol) {
                Object.defineProperties(this, instanceDescriptors);
            }
        },

        instanceDescriptors: prototypeDescriptors,
    }) as new (value: Val, session: AccessControl.Session) => Val.Struct;

    Instrumentation.instrumentStruct(Wrapper);

    return (reference, session) => {
        reference.owner = new Wrapper(reference, session);
        return reference.owner;
    };
}

export namespace StructManager {
    /**
     * If a struct is referenced as a whole, fields for which the session are unauthorized are simply omitted.
     *
     * This function instead throws an error for unauthorized access.  It must be invoked before direct property reads.
     *
     * @deprecated remove with old API
     *
     * @param struct a managed struct
     * @param attributeId the AttributeId to read
     */
    export function assertDirectReadAuthorized(struct: Val.Struct, attributeId: number) {
        if (!(struct as Struct)?.[AUTHORIZE_READ]) {
            throw new ImplementationError("Cannot authorize read of unmanaged value");
        }
        return (struct as Struct)[AUTHORIZE_READ](attributeId);
    }
}

function configureProperty(supervisor: RootSupervisor, schema: ValueModel) {
    const name = camelize(schema.name);
    const id = schema.id;

    const { access, manage, validate } = supervisor.get(schema);

    const fabricScopedList =
        schema.effectiveAccess.fabric === Access.Fabric.Scoped && schema.effectiveMetatype === Metatype.array;

    // We generally do not deal with default values.  If the schema defines a default it is assigned before the manager
    // is created.  The one exception is for field references.  These we must look up dynamically at runtime because the
    // value should always track the referenced value
    let defaultReader: ((val: Val) => Val) | undefined;
    if (typeof FieldValue.referenced(schema.default) === "string") {
        defaultReader = NameResolver(supervisor, schema.parent, camelize(FieldValue.referenced(schema.default)!));
    }

    const descriptor: PropertyDescriptor = {
        enumerable: true,

        set(this: Struct, value: Val) {
            access.authorizeWrite(this[Internal.session], this[Internal.reference].location);

            // We allow attribute/field name or id as key.  If name is present id is ignored
            const pk = this[Internal.reference].primaryKey;
            let key = pk === "id" ? (id ?? name) : name;
            let storedKey: undefined | number | string;
            if (key in this[Internal.reference].value) {
                storedKey = key;
            } else if (pk === "id") {
                if (name in this[Internal.reference].value) {
                    storedKey = name;
                }
            } else if (id !== undefined) {
                if (id in this[Internal.reference].value) {
                    storedKey = id;
                }
            }

            const oldValue = storedKey === undefined ? undefined : this[Internal.reference].value[storedKey];

            const self = this;

            this[Internal.reference].change(() => {
                const struct = this[Internal.reference].value;

                // Identify the target.  Usually just "struct" except when struct supports Val.Dynamic
                let target;
                if (Val.properties in struct) {
                    const properties = (struct as Val.Dynamic)[Val.properties](
                        this[Internal.reference].rootOwner,
                        this[Internal.session],
                    );
                    if (name in properties) {
                        key = storedKey = name;
                        target = properties;
                    } else {
                        target = struct;
                    }
                } else {
                    target = struct;
                }

                // Unwrap if incoming value is managed
                if (value && (value as Internal.Collection)[Internal.reference]) {
                    value = (value as Internal.Collection)[Internal.reference].value;
                }

                // Modify the value
                if (fabricScopedList && Array.isArray(value) && Array.isArray(oldValue)) {
                    // In the case of fabric-scoped write to established list we use the managed proxy to perform update
                    // as it will sort through values and only modify those with correct fabricIndex
                    const proxy = self[name] as Val.List;
                    for (let i = 0; i < value.length; i++) {
                        proxy[i] = value[i];
                    }
                    proxy.length = value.length;
                } else {
                    // Direct assignment
                    target[key] = value;
                    if (storedKey !== undefined && storedKey !== key) {
                        delete target[storedKey];
                    }
                }

                if (!this[Internal.session].acceptInvalid && validate) {
                    // Note: We validate fully for nested structs but *not* for the current struct.  This is because
                    // choice conformance may be violated temporarily as individual fields change.
                    //
                    // Also, validating fully would require us to validate across all properties for every property
                    // write.
                    //
                    // I think this is OK for now.  If it becomes an issue we'll probably want to wire in a separate
                    // validation step that is performed on commit when choice conformance is in play.
                    try {
                        validate(value, this[Internal.session], {
                            path: this[Internal.reference].location.path,
                            siblings: struct,
                        });
                    } catch (e) {
                        // Undo our change on error.  Rollback will take care of this when transactional but this
                        // handles the cases of 1.) no transaction, and 2.) error is caught within transaction
                        target[key] = oldValue;

                        throw e;
                    }
                }
            });
        },
    };

    if (manage === PrimitiveManager) {
        // For primitives, we don't need a manager so just proxy reads directly
        descriptor.get = function (this: Struct) {
            if (access.mayRead(this[Internal.session], this[Internal.reference].location)) {
                const struct = this[Internal.reference].value as Val.Dynamic;
                if (struct === undefined) {
                    throw new PhantomReferenceError(this[Internal.reference].location);
                }
                if (struct[Val.properties]) {
                    const properties = struct[Val.properties](
                        this[Internal.reference].rootOwner,
                        this[Internal.session],
                    );
                    if (name in properties) {
                        return properties[name];
                    }
                }

                const key = this[Internal.reference].primaryKey === "id" ? (id ?? name) : name;
                if (key in struct) {
                    return struct[key];
                }

                const key2 = this[Internal.reference].primaryKey === "id" ? name : id;
                if (key2 !== undefined && key2 in struct) {
                    return struct[key2];
                }

                return undefined;
            }
        };
    } else {
        // For collections, we create a managed value
        let cloneContainer: (container: Val) => Val;
        switch (schema.effectiveMetatype) {
            case Metatype.array:
                cloneContainer = (container: Val) => [...(container as Val.List)];
                break;

            case Metatype.bitmap:
                cloneContainer = (container: Val) => {
                    // Special case for bitmaps -- this only occurs when the manager takes control and converts from
                    // a number to an object
                    if (typeof container === "number" || typeof container === "bigint") {
                        return {};
                    }

                    // Already an object
                    return { ...(container as Val.Struct) };
                };
                break;

            default:
                cloneContainer = (container: Val) => ({ ...(container as Val.Struct) });
        }

        descriptor.get = function (this: Struct) {
            let value;

            // Obtain the value.  Normally just struct[key] except in the case of Val.Dynamic
            const pk = this[Internal.reference].primaryKey;
            const struct = this[Internal.reference].value;
            const key = pk === "id" ? (id ?? name) : name;
            let valueFromProperties = false;
            if ((struct as Val.Dynamic)[Val.properties]) {
                const properties = (struct as Val.Dynamic)[Val.properties](
                    this[Internal.reference].rootOwner,
                    this[Internal.session],
                );
                if (name in properties) {
                    value = properties[name];
                    valueFromProperties = true;
                } else {
                    value = struct[name];
                }
            } else {
                if (key in struct) {
                    value = struct[key];
                } else {
                    const key2 = pk === "id" ? id : name;
                    if (key2 !== undefined && key2 in struct) {
                        value = struct[key2];
                    }
                }
            }

            // Note that we only mask values that are unreadable.  This is appropriate when the parent object is
            // visible.  For direct access to a property we should throw an error but that must be implemented at a
            // higher level because we cannot differentiate here
            if (!access.mayRead(this[Internal.session], this[Internal.reference].location)) {
                return undefined;
            }

            if (value === undefined) {
                return defaultReader?.(this);
            }

            // Value is null or a dynamic property, so just return it
            // TODO Consider to also use Management for dynamic properties
            if (value === null || valueFromProperties) {
                return value;
            }

            const managed = this[Internal.reference].subrefs?.[name];
            if (managed) {
                return managed.owner;
            }

            const assertWriteOk = (value: Val) => {
                // Note - this needs to mirror behavior in the setter above
                access.authorizeWrite(this[Internal.session], this[Internal.reference].location);
                if (validate) {
                    validate(value, this[Internal.session], {
                        path: this[Internal.reference].location.path,
                        siblings: this[Internal.reference].value,
                    });
                }
            };

            // Clone the container before write
            const ref = ManagedReference(this[Internal.reference], pk, name, id, assertWriteOk, cloneContainer);

            ref.owner = manage(ref, this[Internal.session]);

            return ref.owner;
        };
    }

    return { descriptor, access };
}
