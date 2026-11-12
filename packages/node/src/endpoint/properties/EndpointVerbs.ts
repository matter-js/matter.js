/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    createPromise,
    DestroyedDependencyError,
    ImplementationError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    nextEmitOf,
} from "@matter/general";
import type { Endpoint } from "../Endpoint.js";
import { EndpointInitializer } from "./EndpointInitializer.js";
import { EndpointLifecycle } from "./EndpointLifecycle.js";
import { awaitLifecycleOperation } from "./LifecycleMutex.js";

const logger = Logger.get("Endpoint");

type Phase = "erasing" | "deleting" | "closing";

/**
 * The lifecycle verb of an endpoint that runs or ran last.  The promise is set only while the verb is in progress; the
 * phase stays after the verb ends, so a refusal can say whether the endpoint was deleted or closed.  A part that its
 * owner destroys runs a close; {@link byDelete} tells that the delete of an ancestor caused it.
 */
interface VerbState {
    readonly phase: Phase;
    readonly promise?: Promise<void>;
    readonly byDelete?: boolean;
}

const RUN = { decision: "run" } as const;
const SKIP = { decision: "skip" } as const;

/**
 * Runs the lifecycle verbs {@link Endpoint.erase}, {@link Endpoint.delete} and {@link Endpoint.close} of one endpoint
 * and decides how a call of a verb or of a node call such as `start()` proceeds.
 *
 * The endpoint creates one instance in its constructor and owns it for its lifetime.  The steps the endpoint itself
 * performs, which subclasses override, reach the engine as the {@link EndpointVerbs.Host} closures.
 *
 * {@link admit} decides node calls and `#admitVerb` decides verbs; both derive from `lifecycle.terminalCause`.
 *
 * @internal
 */
export class EndpointVerbs {
    #endpoint: Endpoint;
    #host: EndpointVerbs.Host;
    #verb?: VerbState;
    #isEraseUnfinished = false;

    constructor(endpoint: Endpoint, host: EndpointVerbs.Host) {
        this.#endpoint = endpoint;
        this.#host = host;
    }

    /**
     * The lifecycle verb in progress, if any: an erase, delete or close.
     */
    get inProgress(): Promise<void> | undefined {
        return this.#verb?.promise;
    }

    /**
     * Whether the last erase of the endpoint left it crashed, so a recovery finishes that erase.  An erase that
     * succeeds clears this.
     */
    get isEraseUnfinished() {
        return this.#isEraseUnfinished;
    }

    /**
     * Run {@link verb} for {@link origin}.  The origin decides which checks run and which locks the verb takes (see
     * `LifecycleMutex` for the lock order):
     *
     * | origin                 | verbs                | refused by a terminal ancestor | locks taken                 |
     * |------------------------|----------------------|--------------------------------|-----------------------------|
     * | `application`          | erase, delete, close | erase, delete                  | {@link EndpointVerbs.Host.hold} |
     * | `structure`            | delete               | yes                            | {@link EndpointVerbs.Host.hold} |
     * | `despiteOwnerTeardown` | delete               | no                             | {@link EndpointVerbs.Host.hold} |
     * | `recovery`             | erase                | yes                            | tree mutex only             |
     *
     * Origin `structure` skips {@link EndpointInitializer.assertVerbAdmitted}; it removes an endpoint of a client node
     * that the peer no longer reports.  Origin `recovery` is for a caller that holds the node mutex and has taken the
     * node offline; it must not run while another verb of the endpoint waits for the node mutex.
     */
    run(verb: "erase", origin: "application" | "recovery"): Promise<void>;
    run(verb: "delete", origin: "application" | "structure" | "despiteOwnerTeardown"): Promise<void>;
    run(verb: "close", origin: "application"): Promise<void>;
    async run(verb: EndpointVerbs.Verb, origin: EndpointVerbs.Origin): Promise<void> {
        switch (verb) {
            case "erase":
                return this.#erase(origin);

            case "delete":
                return this.#delete(origin);

            case "close":
                return this.#close();
        }
    }

    /**
     * Decide how a call of the node that is not a lifecycle verb proceeds.  The caller words a refusal with
     * {@link refusal}.
     *
     * | requested delete or close of | `intent` (`start()`, `enable()`, …) | `stop` (`stop()`, `applyIntent()`) |
     * |------------------------------|-------------------------------------|------------------------------------|
     * | none                         | run                                 | run                                |
     * | this endpoint                | refuse                              | skip                               |
     * | a terminal ancestor          | refuse                              | run in turn                        |
     */
    admit(action: "intent" | "stop"): EndpointVerbs.Admission {
        const cause = this.#endpoint.lifecycle.terminalCause;
        if (cause === undefined) {
            return RUN;
        }
        if (action === "stop") {
            return cause === this.#endpoint ? SKIP : RUN;
        }
        return { decision: "refuse", cause };
    }

    /**
     * The error that refuses {@link action} of the endpoint because the delete or close of {@link cause} was requested.
     */
    refusal(cause: Endpoint, action: string) {
        const destroyed = cause.construction.status === Lifecycle.Status.Destroyed;
        let state;
        if (cause.verbs.#isDeleting) {
            state = destroyed ? "is deleted" : "is being deleted";
        } else {
            state = destroyed ? "is closed" : "is closing";
        }
        const subject = cause === this.#endpoint ? "it" : `${this.#endpoint}`;
        return new DestroyedDependencyError(cause.toString(), `${state}, so ${subject} cannot ${action}`);
    }

    /**
     * Destroy an essential endpoint whose construction failed in {@link Endpoint.add}.  This does not wait for the
     * tree mutex, as the caller of `add()` may run inside a verb that holds it, such as a behavior that an erase
     * initializes.  The endpoint leaves the parts of its owner first, so a verb of the owner that holds the tree mutex
     * never reaches it.
     */
    async discardFailedConstruction() {
        this.#endpoint.owner?.parts.detachUntilDestroyed(this.#endpoint);
        const joined = this.#joinOrThrow("closing");
        if (joined !== undefined) {
            return await joined;
        }
        await this.#begin("closing", () => this.#host.destroy());
    }

    /**
     * Destroy {@link parts} of the endpoint, which the endpoint calls while it is destroyed.  Each part runs a close
     * as its verb at once, without waiting for the tree mutex: the caller holds it.  A verb of a part that waits for
     * the mutex finds the part destroyed and does nothing.  Every part is closed even when another one fails; failures
     * reject with a {@link MatterAggregateError}.
     */
    async closeParts(parts: Iterable<Endpoint> | undefined) {
        if (parts === undefined) {
            return;
        }
        await MatterAggregateError.settleSeries(
            this.#closePartTasks(parts),
            `Error closing parts of ${this.#endpoint}`,
        );
    }

    /**
     * Delete every part of the endpoint like {@link Endpoint.delete} while the caller holds the tree mutex of the
     * endpoint, which the parts share.  See {@link closeParts} for how a verb of a part behaves meanwhile.  Failures
     * reject with a {@link MatterAggregateError}.  The {@link EndpointInitializer.Erasure.finish} of a part delete does
     * not run, as no finish can run while the caller holds the mutex.
     */
    async #deleteParts() {
        await MatterAggregateError.settleSeries(
            this.#deletePartTasks([...this.#endpoint.parts]),
            `Error deleting parts of ${this.#endpoint}`,
        );
    }

    async #erase(origin: EndpointVerbs.Origin) {
        try {
            await this.#eraseOnce(origin);
            this.#isEraseUnfinished = false;
        } catch (e) {
            this.#isEraseUnfinished = this.#endpoint.construction.status === Lifecycle.Status.Crashed;
            throw e;
        }
    }

    async #eraseOnce(origin: EndpointVerbs.Origin) {
        const joined = this.#joinOrThrow("erasing");
        if (joined !== undefined) {
            return await joined;
        }
        this.#assertInNode("erased");
        this.#assertAdmitted("erase");
        const hold =
            origin === "recovery"
                ? (operation: string, step: () => Promise<void>) =>
                      this.#endpoint.lifecycle.treeMutex.hold(operation, step)
                : this.#host.hold;
        await this.#begin("erasing", () =>
            this.#withErasure(
                "erasing",
                async prepared => {
                    // A delete requested before the erase began wipes the data itself
                    if (this.#verb?.phase !== "deleting") {
                        await this.#eraseSteps(prepared);
                    }
                },
                hold,
            ),
        );
    }

    /**
     * Perform an erase while the caller holds the tree mutex.
     *
     * @param prepared receives the erasure once it is prepared; the erase runs its finish after it released the mutex
     */
    async #eraseSteps(prepared: (erasure: EndpointInitializer.Erasure) => void) {
        const endpoint = this.#endpoint;
        await this.#settle();
        const wasStarted = endpoint.construction.status !== Lifecycle.Status.Inactive;

        const errors = new Array<unknown>();
        let erasure;
        try {
            erasure = await this.#host.prepare("erase");
        } catch (e) {
            throw new MatterAggregateError([e], `Error erasing ${endpoint}`);
        }
        prepared(erasure);

        const wipeFailures = new Array<unknown>();
        if (erasure.deletesParts) {
            try {
                await this.#deleteParts();
            } catch (e) {
                wipeFailures.push(e);
            }
        }

        try {
            await this.#host.reset();
        } catch (e) {
            errors.push(e);
        }

        let wiped = true;
        try {
            await erasure.wipe();
        } catch (e) {
            wipeFailures.push(e);
        }
        if (wipeFailures.length) {
            errors.push(
                erasure.deletesParts
                    ? new MatterAggregateError(wipeFailures, `Error erasing the storage of ${endpoint}`)
                    : wipeFailures[0],
            );
            wiped = false;
            endpoint.construction.crash();
        }

        if (wasStarted && wiped && endpoint.lifecycle.terminalCause === undefined) {
            try {
                endpoint.construction.start();
                await endpoint.construction;
            } catch (e) {
                errors.push(e);
            }
        }

        if (errors.length) {
            throw new MatterAggregateError(errors, `Error erasing ${endpoint}`);
        }
    }

    async #delete(origin: EndpointVerbs.Origin) {
        const joined = this.#joinOrThrow("deleting", origin === "despiteOwnerTeardown");
        if (joined !== undefined) {
            return await joined;
        }
        this.#assertInNode("deleted");
        if (origin !== "structure") {
            this.#assertAdmitted("delete");
        }
        await this.#begin("deleting", () =>
            this.#withErasure("deleting", prepared => this.#deleteSteps(prepared), this.#host.hold),
        );
    }

    /**
     * Perform a delete while the caller holds the tree mutex.
     *
     * @param prepared receives the erasure once it is prepared; the delete runs its finish after it released the mutex
     */
    async #deleteSteps(prepared: (erasure: EndpointInitializer.Erasure) => void) {
        await this.#settle();
        let deletion: EndpointInitializer.Erasure | undefined;
        await MatterAggregateError.settleSeries(
            [
                async () => {
                    deletion = await this.#host.prepare("delete");
                    prepared(deletion);
                },
                () => this.#host.reset(),
                () => deletion?.wipe(),
                () => this.#host.destroy(),
            ],
            `Error deleting ${this.#endpoint}`,
        );
    }

    async #close() {
        const joined = this.#joinOrThrow("closing");
        if (joined !== undefined) {
            return await joined;
        }
        this.#assertAdmitted("close");
        await this.#begin("closing", () =>
            this.#host.hold(
                `closing ${this.#endpoint}`,
                this.#unlessDestroyed(() => this.#host.destroy()),
            ),
        );
    }

    /**
     * Run {@link step} of an erase or delete while holding the mutexes {@link hold} takes, then the finish of the
     * erasure it prepared once the mutexes are released, as a finish may wait for work that needs them.  The finish of
     * an erase that a delete took over does not run.  A failed finish adds to the failures of the step.
     */
    async #withErasure(
        phase: "erasing" | "deleting",
        step: (prepared: (erasure: EndpointInitializer.Erasure) => void) => Promise<void>,
        hold: EndpointVerbs.Host["hold"],
    ) {
        let erasure: EndpointInitializer.Erasure | undefined;
        let stepFailure: { error: unknown } | undefined;
        try {
            await hold(
                `${phase} ${this.#endpoint}`,
                this.#unlessDestroyed(() =>
                    step(prepared => {
                        erasure = prepared;
                    }),
                ),
            );
        } catch (error) {
            stepFailure = { error };
        }

        const finish = erasure?.finish;
        if (finish !== undefined && (phase === "deleting" || this.#verb?.phase !== "deleting")) {
            try {
                await finish();
            } catch (error) {
                const failures = new Array<unknown>();
                if (stepFailure?.error instanceof MatterAggregateError) {
                    failures.push(...stepFailure.error.errors);
                } else if (stepFailure !== undefined) {
                    failures.push(stepFailure.error);
                }
                throw new MatterAggregateError([...failures, error], `Error ${phase} ${this.#endpoint}`);
            }
        }

        if (stepFailure !== undefined) {
            throw stepFailure.error;
        }
    }

    /**
     * Wait until the endpoint is no longer initializing, so a verb starts from a settled state.
     */
    async #settle() {
        const { construction } = this.#endpoint;
        while (construction.status === Lifecycle.Status.Initializing) {
            await nextEmitOf(construction.change);
        }
    }

    /**
     * Let the {@link EndpointInitializer} of the node refuse {@link verb} before the verb changes any state.
     */
    #assertAdmitted(verb: EndpointVerbs.Verb) {
        this.#endpoint.env.maybeGet(EndpointInitializer)?.assertVerbAdmitted(this.#endpoint, verb);
    }

    /**
     * Throw unless the endpoint belongs to a node: the endpoint that owns the tree mutex of this endpoint is a node.
     */
    #assertInNode(action: string) {
        let root = this.#endpoint;
        while (!root.lifecycle.ownsTreeMutex && root.owner !== undefined) {
            root = root.owner;
        }
        if (!root.lifecycle.isNode) {
            throw new ImplementationError(`${this.#endpoint} was never added to a node, so it cannot be ${action}`);
        }
    }

    /**
     * Enter {@link phase} and run {@link operation} as the verb in progress.  A delete or close begins the destruction
     * of the endpoint at once, so the endpoint is gone for readers while the verb waits for its turn.
     */
    #begin(phase: Phase, operation: () => Promise<void>, byDelete?: boolean) {
        // Listeners of the Destroying change may call a verb, which joins this one only once it is installed
        const { promise: done, resolver, rejecter } = createPromise<void>();
        const promise = done.finally(() => {
            if (this.#verb === verb) {
                this.#verb = { phase, byDelete };
            }
        });
        const verb: VerbState = { phase, promise, byDelete };
        this.#verb = verb;

        try {
            if (phase === "deleting" || phase === "closing") {
                this.#endpoint.lifecycle.change(EndpointLifecycle.Change.Destroying);
            }
            operation().then(resolver, rejecter);
        } catch (e) {
            rejecter(e);
        }
        return promise;
    }

    /**
     * Wrap the step of a verb that waits for the tree mutex.  An ancestor may destroy the endpoint while the verb
     * waits.
     */
    #unlessDestroyed(step: () => Promise<void>) {
        return async () => {
            if (this.#endpoint.construction.status !== Lifecycle.Status.Destroyed) {
                await step();
            }
        };
    }

    /**
     * Decide how a call of the lifecycle verb {@link phase} proceeds.
     *
     * | call \ requested delete or close of | none                           | this endpoint                     | a terminal ancestor            |
     * |-------------------------------------|--------------------------------|-----------------------------------|--------------------------------|
     * | erase                               | join an erase running, else run | refuse                           | join an erase running, else refuse |
     * | delete                              | run                            | join a delete running, else refuse | refuse                        |
     * | delete despite owner teardown       | run                            | join a delete running, else refuse | run                           |
     * | close                               | run                            | join, failures ignored            | run in turn                    |
     *
     * An erase joins an erase in progress also once a terminal ancestor was requested, as the teardown of the ancestor
     * waits for that erase anyway.
     */
    #admitVerb(phase: Phase, despiteOwnerTeardown: boolean): EndpointVerbs.Admission {
        const current = this.#verb;
        const running = current?.promise;
        const cause = this.#endpoint.lifecycle.terminalCause;
        if (cause === this.#endpoint) {
            if (phase === "closing") {
                return { decision: "join", promise: this.#settled(running) };
            }
            if (phase === "deleting" && current?.phase === "deleting" && running !== undefined) {
                return { decision: "join", promise: running };
            }
            return { decision: "refuse", cause };
        }
        if (phase === "erasing" && current?.phase === "erasing" && running !== undefined) {
            return { decision: "join", promise: running };
        }
        if (cause === undefined || phase === "closing" || despiteOwnerTeardown) {
            return RUN;
        }
        return { decision: "refuse", cause };
    }

    /**
     * Admit a lifecycle verb of this endpoint.  Returns the join of a verb in progress, or undefined if the verb runs.
     */
    #joinOrThrow(phase: Phase, despiteOwnerTeardown = false) {
        const admission = this.#admitVerb(phase, despiteOwnerTeardown);
        switch (admission.decision) {
            case "join":
                return awaitLifecycleOperation(
                    `${phase} ${this.#endpoint}`,
                    `${this.#verb?.phase} ${this.#endpoint}`,
                    admission.promise,
                );

            case "refuse":
                throw this.refusal(admission.cause, phase === "erasing" ? "be erased" : "be deleted");

            case "skip":
            case "run":
                return;
        }
    }

    async #settled(operation: Promise<void> | undefined) {
        try {
            await operation;
        } catch (e) {
            logger.debug(`Close of ${this.#endpoint} joined a delete or close that failed:`, e);
        }
    }

    // The owner holds the tree mutex of its parts
    *#closePartTasks(parts: Iterable<Endpoint>): Generator<() => Promise<void>> {
        for (const part of parts) {
            const verbs = part.verbs;
            yield () => verbs.#begin("closing", () => verbs.#host.destroy(), this.#isDeleting);
        }
    }

    *#deletePartTasks(parts: Endpoint[]): Generator<() => Promise<void>> {
        for (const part of parts) {
            const verbs = part.verbs;
            yield () => verbs.#begin("deleting", () => verbs.#deleteSteps(() => {}));
        }
    }

    /**
     * Whether a delete of the endpoint or of an ancestor destroys it.
     */
    get #isDeleting() {
        return this.#verb?.phase === "deleting" || this.#verb?.byDelete === true;
    }
}

export namespace EndpointVerbs {
    export type Verb = EndpointInitializer.Verb;

    /**
     * Who calls a verb, which decides the checks and mutexes of the verb; see {@link EndpointVerbs.run}.
     */
    export type Origin = "application" | "structure" | "despiteOwnerTeardown" | "recovery";

    /**
     * How a call proceeds: it runs, has nothing to do, joins the verb in progress, or is refused because of `cause`.
     */
    export type Admission =
        | { readonly decision: "run" }
        | { readonly decision: "skip" }
        | { readonly decision: "join"; readonly promise: Promise<void> }
        | { readonly decision: "refuse"; readonly cause: Endpoint };

    /**
     * The steps of a verb that the endpoint performs.  The endpoint passes closures over its protected members, so a
     * subclass override takes effect.  The engine calls each only while a verb of the endpoint runs.
     */
    export interface Host {
        /**
         * Run {@link step} while holding the locks a verb of the endpoint takes; see `Endpoint.withLifecycleMutex`.
         */
        hold(operation: string, step: () => Promise<void>): Promise<void>;

        /**
         * Prepare the storage side of an erase or delete.  The caller holds the tree mutex.
         */
        prepare(verb: "erase" | "delete"): Promise<EndpointInitializer.Erasure>;

        /**
         * Reset the endpoint and its parts in memory.  The caller holds the tree mutex.
         */
        reset(): Promise<void>;

        /**
         * Destroy the endpoint and its parts.  The caller holds the tree mutex, or the endpoint left its owner.
         */
        destroy(): Promise<void>;
    }
}
