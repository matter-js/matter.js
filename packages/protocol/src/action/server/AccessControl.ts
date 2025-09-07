/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#general";
import { Access, AccessLevel, DataModelPath, ElementTag, Schema, ValueModel } from "#model";
import { ClusterId, EndpointNumber, FabricIndex, Status } from "#types";
import { InvokeError, ReadError, SchemaImplementationError, WriteError } from "../errors.js";
import { Subject } from "./Subject.js";

const cache = new WeakMap<Schema, AccessControl>();

/**
 * Confirm that an access control session (or some variante thereof) is a {@link AccessControl.RemoteActorSession}.
 */
export function hasRemoteActor<T extends undefined | AccessControl.Session>(
    session: T,
): session is Exclude<T, undefined | { subject?: undefined }> {
    return session?.subject !== undefined;
}

/**
 * Throws if a session is not a {@link AccessControl.RemoteActorSession}.
 */
export function assertRemoteActor<T extends undefined | AccessControl.Session>(
    session: T,
): asserts session is Exclude<T, undefined | { subject?: undefined }> {
    if (!hasRemoteActor(session)) {
        throw new ImplementationError("This operation requires an authenticated remote session");
    }
}

/**
 * Confirm that an access control session (or some variante thereof) is a {@link AccessControl.LocalActorSession}.
 */
export function hasLocalActor<T extends undefined | AccessControl.Session>(
    session: T,
): session is Exclude<T, { subject: Subject }> {
    return session?.subject === undefined;
}

/**
 * Enforces access control for a specific schema.
 */
export interface AccessControl {
    /**
     * Operational access control metadata.
     */
    limits: AccessControl.Limits;

    /**
     * Assert read is authorized.
     */
    authorizeRead: AccessControl.Assertion;

    /**
     * Determine if read is authorized.
     */
    mayRead: AccessControl.Verification;

    /**
     * Assert write is authorized.
     */
    authorizeWrite: AccessControl.Assertion;

    /**
     * Determine if write is authorized.
     */
    mayWrite: AccessControl.Verification;

    /**
     * Assert invoke is authorized.
     */
    authorizeInvoke: AccessControl.Assertion;

    /**
     * Determine if invoke is authorized.
     */
    mayInvoke: AccessControl.Verification;
}

/**
 * Obtain an enforcer for specific schema.
 *
 * This is central to security.  Implementation is explicit, all objects are involved are frozen and cache is stored as
 * module-private.
 *
 * Pure function; returned value is cached.
 */
export function AccessControl(schema: Schema) {
    let enforcer = cache.get(schema);
    if (enforcer === undefined) {
        enforcer = enforcerFor(schema);
    }
    return enforcer;
}

export namespace AccessControl {
    /**
     * Operational access control metadata for a schema.
     */
    export interface Limits {
        readonly readable: boolean;
        readonly readLevel: AccessLevel;

        readonly writable: boolean;
        readonly writeLevel: AccessLevel;

        readonly fabricScoped: boolean;
        readonly fabricSensitive: boolean;

        readonly timed: boolean;
    }

    /**
     * A function that asserts access control requirements are met.
     *
     * If {@link session} is undefined the function does not enforce access controls.
     */
    export type Assertion = (session: Session | undefined, location: Location) => void;

    /**
     * A function that returns true if access control requirements are met.
     *
     * If {@link session} is undefined the function does not enforce access controls.
     */
    export type Verification = (session: Session | undefined, location: Location) => boolean;

    /**
     * Metadata that varies with position in the data model.
     */
    export interface Location {
        /**
         * The diagnostic path to the location.
         */
        path: DataModelPath;

        /**
         * The owning endpoint.
         */
        endpoint?: EndpointNumber;

        /**
         * The owning behavior.
         */
        cluster?: ClusterId;

        /**
         * The fabric that owns the data subtree.  Undefined or {@link FabricIndex.NO_FABRIC} disables fabric
         * enforcement.
         */
        owningFabric?: FabricIndex;
    }

    /**
     * Authorization metadata that varies by remote actor.
     */
    export interface RemoteActorSession {
        /**
         * Determine whether authorized client has authority at a specific location.
         */
        authorityAt(desiredAccessLevel: AccessLevel, location?: Location): Authority;

        /**
         * The fabric of the authorized client.
         *
         * For PASE sessions this will be {@link FabricIndex.NO_FABRIC}.
         */
        readonly fabric: FabricIndex;

        /**
         * The authenticated remote actor. This includes the relevant Node Id, Group ID and also potential relevant Case
         * Authenticated Tags.
         */
        readonly subject: Subject;

        /**
         * If this is true, fabric-scoped lists are filtered to the accessing fabric.
         */
        readonly fabricFiltered?: boolean;

        /**
         * If this is true a timed transaction is in effect.
         */
        readonly timed?: boolean;

        /**
         * If this is true then data access levels are not enforced.  Datatypes and command-related access controls are
         * active.
         */
        readonly command?: boolean;
    }

    /**
     * A local actor session has no authenticated subject and access controls are bypassed.
     */
    export type LocalActorSession = {
        fabric?: undefined;
        subject?: undefined;
    };

    /**
     * The accessing session.
     */
    export type Session = LocalActorSession | RemoteActorSession;

    /**
     * Authority status.
     */
    export enum Authority {
        /**
         * Authority is granted.
         */
        Granted = 1,

        /**
         * Insufficient privileges.
         */
        Unauthorized = 2,

        /**
         * Feature is restricted.
         */
        Restricted = 3,
    }
}

Object.freeze(AccessControl);
Object.freeze(AccessControl.Authority);

function enforcerFor(schema: Schema): AccessControl {
    if (schema.tag === ElementTag.Command) {
        return commandEnforcerFor(schema);
    }
    return dataEnforcerFor(schema);
}

function dataEnforcerFor(schema: Schema): AccessControl {
    const limits = limitsFor(schema);

    let mayRead: AccessControl.Verification = (session, location) => {
        if (hasLocalActor(session) || session.command) {
            return true;
        }

        return session.authorityAt(limits.readLevel, location) === AccessControl.Authority.Granted;
    };

    let mayWrite: AccessControl.Verification = (session, location) => {
        if (hasLocalActor(session) || session.command) {
            return true;
        }

        return session.authorityAt(limits.writeLevel, location) === AccessControl.Authority.Granted;
    };

    let authorizeRead: AccessControl.Assertion = (session, location) => {
        if (hasLocalActor(session) || session.command) {
            return;
        }

        if (session.authorityAt(limits.readLevel, location) === AccessControl.Authority.Granted) {
            return;
        }

        throw new ReadError(location, "Permission denied", Status.UnsupportedAccess);
    };

    let authorizeWrite: AccessControl.Assertion = (session, location) => {
        if (hasLocalActor(session) || session.command) {
            return;
        }

        if (session.authorityAt(limits.writeLevel, location) === AccessControl.Authority.Granted) {
            return;
        }

        throw new WriteError(location, "Permission denied", Status.UnsupportedAccess);
    };

    if (limits.timed) {
        const wrappedAuthorizeWrite = authorizeWrite;
        const wrappedMayWrite = mayWrite;

        authorizeWrite = (session, location) => {
            if (hasRemoteActor(session) && !session.timed) {
                throw new WriteError(
                    location,
                    "Permission denied because interaction is not timed",
                    Status.NeedsTimedInteraction,
                );
            }
            wrappedAuthorizeWrite?.(session, location);
        };

        mayWrite = (session, location) => {
            if (hasRemoteActor(session) && !session.timed) {
                return false;
            }

            return wrappedMayWrite(session, location);
        };
    }

    if (limits.fabricSensitive) {
        const wrappedAuthorizeRead = authorizeRead;
        const wrappedMayRead = mayRead;
        const wrappedAuthorizeWrite = authorizeWrite;
        const wrappedMayWrite = mayWrite;

        authorizeRead = (session, location) => {
            if (hasLocalActor(session) || session.command) {
                return;
            }

            if (session.fabricFiltered) {
                if (!session.fabric) {
                    throw new ReadError(location, "Permission denied: No accessing fabric", Status.UnsupportedAccess);
                }

                if (location?.owningFabric !== undefined && location.owningFabric !== session.fabric) {
                    throw new ReadError(
                        location,
                        "Permission denied: Owning/accessing fabric mismatch",
                        Status.UnsupportedAccess,
                    );
                }
            }

            wrappedAuthorizeRead(session, location);
        };

        mayRead = (session, location) => {
            if (hasLocalActor(session) || session.command) {
                return true;
            }

            if (!session.fabric) {
                return false;
            }

            if (location?.owningFabric !== undefined && location.owningFabric !== session.fabric) {
                return false;
            }

            return wrappedMayRead(session, location);
        };

        authorizeWrite = (session, location) => {
            if (hasLocalActor(session) || session.command) {
                return;
            }

            if (!session.fabric) {
                throw new WriteError(location, "Permission denied: No accessing fabric", Status.UnsupportedAccess);
            }

            if (location?.owningFabric !== undefined && location.owningFabric !== session.fabric) {
                throw new WriteError(location, "Permission denied: Owning/accessing fabric mismatch");
            }

            wrappedAuthorizeWrite(session, location);
        };

        mayWrite = (session, location) => {
            if (hasLocalActor(session) || session.command) {
                return true;
            }

            if (!session.fabric) {
                return false;
            }

            if (location?.owningFabric !== undefined && location.owningFabric !== session.fabric) {
                return false;
            }

            return wrappedMayWrite(session, location);
        };
    }

    if (!limits.readable) {
        authorizeRead = (session, location) => {
            if (hasLocalActor(session) || session.command) {
                return;
            }

            throw new ReadError(location, "Permission defined: Value is write-only");
        };

        mayRead = session => {
            return hasLocalActor(session) || !!session.command;
        };
    }

    if (!limits.writable) {
        authorizeWrite = (session, location) => {
            if (hasLocalActor(session) || session.command) {
                return;
            }
            throw new WriteError(location, "Permission denied: Value is read-only");
        };

        mayWrite = session => {
            return hasLocalActor(session) || !!session.command;
        };
    }

    return Object.freeze({
        limits,
        authorizeRead,
        mayRead,
        authorizeWrite,
        mayWrite,

        authorizeInvoke(_session: undefined | AccessControl.Session, location: AccessControl.Location) {
            throw new SchemaImplementationError(location, "Permission denied: Invoke request but non-command schema");
        },

        mayInvoke() {
            return false;
        },
    } satisfies AccessControl);
}

function commandEnforcerFor(schema: Schema): AccessControl {
    const limits = limitsFor(schema);
    const timed = schema.effectiveAccess.timed;
    const fabric = schema.effectiveAccess.fabric;

    return {
        limits,

        authorizeRead(_session, location) {
            throw new SchemaImplementationError(location, "Permission denied: Read request but command schema");
        },

        mayRead() {
            return false;
        },

        authorizeWrite(_session, location) {
            throw new SchemaImplementationError(location, "Permission denied: Write request but command schema");
        },

        mayWrite() {
            return false;
        },

        authorizeInvoke(session, location) {
            if (hasLocalActor(session)) {
                return;
            }

            if (!session.command) {
                throw new InvokeError(location, "Invoke attempt without command context");
            }

            if (timed && !session.timed) {
                throw new InvokeError(
                    location,
                    "Invoke attempt without required timed context",
                    Status.TimedRequestMismatch,
                );
            }

            if (fabric && !session.fabric) {
                throw new WriteError(location, "Permission denied: No accessing fabric", Status.UnsupportedAccess);
            }

            if (session.authorityAt(limits.writeLevel, location) === AccessControl.Authority.Granted) {
                return;
            }

            throw new InvokeError(location, "Permission denied", Status.UnsupportedAccess);
        },

        mayInvoke(session, location) {
            if (hasLocalActor(session)) {
                return true;
            }

            if (!session.command) {
                return false;
            }

            if (timed && !session.timed) {
                return false;
            }

            if (fabric && !session.fabric) {
                return false;
            }

            return session.authorityAt(limits.writeLevel, location) === AccessControl.Authority.Granted;
        },
    };
}

function limitsFor(schema: Schema) {
    const access = schema.effectiveAccess;
    const quality = schema instanceof ValueModel ? schema.effectiveQuality : undefined;

    // Special handling for fixed values - we treat any property owned by a fixed value as also read-only
    let fixed = quality?.fixed;
    for (let s = schema.parent; !fixed && s instanceof ValueModel; s = s.parent) {
        if (s.effectiveQuality.fixed) {
            fixed = true;
        }
    }

    const limits: AccessControl.Limits = Object.freeze({
        readable: access.readable,
        writable: access.writable && !fixed,
        fabricScoped: access.fabric === Access.Fabric.Scoped || access.fabric === Access.Fabric.Sensitive,
        fabricSensitive: access.fabric === Access.Fabric.Sensitive,
        timed: access.timed === true,

        // Official Matter defaults are View for read and Operate for write. However, the schema's effective access
        // should already have these defaults.  Here we just adopt minimum needed rights as a safe fallback access level.
        readLevel: access.readPriv === undefined ? AccessLevel.View : Access.PrivilegeLevel[access.readPriv],
        writeLevel: access.writePriv === undefined ? AccessLevel.Operate : Access.PrivilegeLevel[access.writePriv],
    });

    return limits;
}
