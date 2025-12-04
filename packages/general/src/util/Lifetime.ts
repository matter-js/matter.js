/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { DiagnosticPresentation } from "#log/DiagnosticPresentation.js";
import { DiagnosticSource } from "#log/DiagnosticSource.js";
import { InternalError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import "#time/StandardTime.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";

/**
 * A "lifetime" represents the existence of an entity or ongoing task.
 *
 * This serves as a mechanism for tracking granular information about process state for diagnostic purposes.  A lifetime
 * is present in diagnostic reports until disposed.
 *
 * Lifetimes are hierarchical.  Create sublifetimes using join().
 */
export interface Lifetime extends Disposable, Diagnostic, Lifetime.Owner {
    /**
     * The name of the lifetime used for diagnostic presentation.
     *
     * Any diagnostic (so, any value) may serve as a name.
     */
    name: unknown;

    /**
     * The time at which the lifetime began.
     */
    readonly startedAt: Timestamp;

    /**
     * A "span" is a sub-lifetime created via {@link join}.
     */
    readonly spans: Set<Lifetime>;

    /**
     * Arbitrary details presented as a dictionary with {@link name}.
     */
    readonly details: Record<string, unknown>;

    /**
     * The inverse of {@link isClosing}.
     */
    readonly isOpen: boolean;

    /**
     * Set when the lifetime begins closing (via {@link closing}) or {@link isClosed} is true.
     */
    readonly isClosing: boolean;

    /**
     * Set when the lifetime has exited.
     */
    readonly isClosed: boolean;

    /**
     * The lifetime enclosing this lifetime.
     *
     * Only the process lifetime should have no owner.  This field is writable so you can move ownership of a lifetime.
     */
    owner?: Lifetime;

    /**
     * Mark this lifetime as closing.
     *
     * Creates a sublifetime specifically for closing this lifetime.  This supports the common pattern of tracking the
     * close process associated with an active lifetime.
     *
     * Calling repeatedly returns the same sublifetime.  Disposing the returned lifetime disposes this lifetime.
     */
    closing(): Lifetime;
}

export function Lifetime(...name: unknown[]) {
    return Lifetime.process.join(...name);
}

class LifetimeImplementation implements Lifetime, Lifetime.Owner {
    #name: unknown;
    #owner?: Lifetime;
    #startedAt: Timestamp;
    #details?: Record<string, unknown>;
    #spans?: Set<Lifetime>;
    #closing?: Lifetime;
    #isClosed = false;

    declare [Diagnostic.presentation]: unknown;

    constructor(name: unknown[], owner?: Lifetime) {
        this.#name = name.length > 1 ? name : name[0];
        this.#startedAt = Time.nowMs;
        this.#owner = owner;

        if (owner) {
            owner.spans.add(this);
        }
    }

    get spans() {
        if (!this.#spans) {
            this.#spans = new Set();
        }
        return this.#spans;
    }

    get name() {
        return this.#name;
    }

    set name(name: unknown) {
        this.#name = name;
    }

    get startedAt() {
        return this.#startedAt;
    }

    get details() {
        return this.#details ?? {};
    }

    get owner() {
        return this.#owner;
    }

    set owner(owner: Lifetime | undefined) {
        if (!this.#owner) {
            throw new InternalError("Cannot move ownership of root lifetime");
        }

        if (this.#owner === owner) {
            return;
        }

        removeSpan(this.owner, this);

        this.#owner = owner;

        this.#owner?.spans.add(this);
    }

    join(...name: unknown[]): Lifetime {
        return new LifetimeImplementation(name, this);
    }

    closing(): Lifetime {
        if (!this.#closing) {
            this.#closing = this.join("closing");

            const disposeClosing = this.#closing[Symbol.dispose].bind(this.#closing);

            this.#closing[Symbol.dispose] = () => {
                disposeClosing();

                this[Symbol.dispose]();
            };
        }

        return this.#closing;
    }

    get isOpen() {
        return this.#closing === undefined && !this.#isClosed;
    }

    get isClosing() {
        return this.#closing !== undefined || this.#isClosed;
    }

    get isClosed() {
        return this.#isClosed;
    }

    get [DiagnosticPresentation.value]() {
        // Special case for process lifetime
        if (!this.#owner) {
            return Diagnostic.node("🛠", "Lifetimes", {
                children: this.spans,
            });
        }

        const header: unknown[] = [this.#name];

        if (this.isClosed) {
            header.push(Diagnostic.weak("(zombie)"));
        }

        const details: Record<string, unknown> = {
            up: Duration.format(Timestamp.delta(this.startedAt, Time.nowMs)),
            ...this.#details,
        };

        header.push(Diagnostic.dict(details));

        const result: unknown[] = [header];

        if (this.#spans?.size) {
            result.push(Diagnostic.list(this.spans));
        }

        return result;
    }

    [Symbol.dispose]() {
        if (!this.#owner) {
            // Can't dispose of process lifetime
            return;
        }

        this.#isClosed = true;

        // If we are disposed with active sublifetimess we become a zombie
        if (this.#spans?.size) {
            return;
        }

        removeSpan(this.#owner, this);
    }
}

function removeSpan(owner: Lifetime | undefined, span: Lifetime) {
    if (!owner) {
        return;
    }

    owner.spans.delete(span);
    if (owner.isClosed && !owner.spans?.size) {
        owner[Symbol.dispose]();
    }
}

export namespace Lifetime {
    /**
     * The lifetime of the system process.
     *
     * This is effectively a "global" lifetime.  It parents all other lifetimes.
     */
    export const process: Lifetime.Owner = new LifetimeImplementation(["process"]);

    /**
     * Obtain a lifetime not attached to {@link process} for testing purposes.
     */
    export declare const mock: Lifetime;

    /**
     * An object associated with a lifetime.
     */
    export interface Owner {
        /**
         * Create or move a sublifetime.
         */
        join(...name: unknown[]): Lifetime;
    }

    /**
     * A lifetime subject that exists for a portion of a larger timespan.
     */
    export interface Contributor {
        [owner]: Owner;
    }

    /**
     * Determine the lifetime of the owner of a component.
     */
    export function of(subject?: {}) {
        return (subject as Partial<Contributor> | undefined)?.[owner] ?? process;
    }

    export const owner = Symbol("owner");
}

Object.defineProperty(Lifetime, "mock", {
    get() {
        return new LifetimeImplementation(["mock"]);
    },
});

DiagnosticSource.add(Lifetime.process as Lifetime);
