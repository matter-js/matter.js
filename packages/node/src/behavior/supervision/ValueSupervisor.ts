/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AsyncObservable, Transaction } from "#general";
import { DataModelPath, Schema } from "#model";
import type { AccessControl, Val } from "#protocol";
import type { ValidationLocation } from "../state/validation/location.js";
import type { RootSupervisor } from "./RootSupervisor.js";

/**
 * Value supervisor implements schema-based supervision of a specific value.
 *
 * Supervision functions include:
 *
 *   - Access controls
 *
 *   - Datatype validation
 *
 *   - Managed instance generation
 *
 * Supervision is implemented via schema-driven runtime compilation.  We perform as much logic as possible at startup to
 * minimize overhead during server operation.
 *
 * This means we typically ingest schema, create a compact form of denormalized metadata, and/or generate functions to
 * perform required operations.
 */
export interface ValueSupervisor {
    /**
     * The schema manager that owns this ValueSupervisor.
     */
    readonly owner: RootSupervisor;

    /**
     * The logical schema that controls the value's behavior.
     */
    readonly schema: Schema;

    /**
     * Consolidated access control information for the schema.
     */
    readonly access: AccessControl;

    /**
     * Perform validation.
     */
    readonly validate: ValueSupervisor.Validate | undefined;

    /**
     * Create a managed instance of a value.
     */
    readonly manage: ValueSupervisor.Manage;

    /**
     * Apply changes.  Does not perform validation.
     */
    readonly patch: ValueSupervisor.Patch;

    /**
     * Convert a JS value to the appropriate JS type for the schema.
     */
    readonly cast: ValueSupervisor.Cast;
}

export namespace ValueSupervisor {
    /**
     * {@link Session} values that control supervision.
     */
    export interface SupervisionSettings {
        /**
         * The transaction used for isolating state changes associated with this session.
         */
        transaction: Transaction;

        /**
         * If this is true, data validation is disabled.  This should only be used in contexts where data validation is
         * deferred.
         */
        acceptInvalid?: boolean;

        /**
         * If true, structs initialize without named properties which are more expensive to install.  This is useful
         * when implementing the Matter protocol where ID is the only value necessary.
         */
        protocol?: boolean;
    }

    /**
     * {@link Session} information that enforces stricter controls based on an authenticated remote subject.
     */
    export interface RemoteActorSession extends AccessControl.RemoteActorSession, SupervisionSettings {
        /**
         * If present the session is associated with an online interaction.  Emits when the interaction ends.
         */
        interactionComplete?: AsyncObservable<[session?: RemoteActorSession]>;

        /**
         * Set to true when the interaction has started and the interactionBegin event was emitted for this session
         */
        interactionStarted?: boolean;
    }

    export interface LocalActorSession extends AccessControl.LocalActorSession, SupervisionSettings {}

    export type Session = LocalActorSession | RemoteActorSession;

    export type Validate = (value: Val, session: Session, location: ValidationLocation) => void;

    export type Manage = (reference: Val.Reference, session: Session) => Val;

    export type Patch = (changes: Val.ReadonlyCollection, target: Val.Collection, path: DataModelPath) => Val;

    export type Cast = (value: Val) => Val;
}
