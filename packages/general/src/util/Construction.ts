/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagnosticPresentation } from "#log/DiagnosticPresentation.js";
import { LogFormat } from "#log/LogFormat.js";
import { Logger } from "../log/Logger.js";
import { ImplementationError } from "../MatterError.js";
import { asError, errorOf } from "./Error.js";
import { decamelize } from "./identifier-case.js";
import { CrashedDependenciesError, CrashedDependencyError, Lifecycle } from "./Lifecycle.js";
import { Lifetime } from "./Lifetime.js";
import { Observable } from "./Observable.js";
import { MaybePromise } from "./Promises.js";

/**
 * Create an instance of a class implementing the {@link Constructable} pattern.
 */
export async function asyncNew<const A extends any[], const C extends new (...args: A) => Constructable<any>>(
    constructor: C,
    ...args: A
): Promise<InstanceType<C>> {
    const subject = new constructor(...args);

    // If construction of the subject is not initiated you cannot use asyncNew because something needs to invoke
    // Construction#start.
    if (subject.construction.status === Lifecycle.Status.Inactive) {
        throw new ImplementationError(
            `You cannot use asyncNew on ${constructor.name} because its construction is controlled by another component`,
        );
    }

    await subject.construction.ready;

    return subject as InstanceType<C>;
}

/**
 * A pattern for asynchronous object initialization and cleanup of a target object, called the "subject".
 *
 * Construction happens in the initializer parameter of {@link Construction} or via {@link Construction.construct} on
 * the subject.  You invoke in your constructor and place in a property called "construction".
 *
 * Destruction is optional and happens in the destructor parameter of {@link Construction#close} or via
 * {@link Construction.destruct} on the subject.  Typically you invoke in a "close" method of the subject.
 *
 * If construction or destruction is not asynchronous (does not return a Promise) then they complete synchronously,
 * including throwing exceptions.
 *
 * To ensure an instance is initialized prior to use you may await construction, so e.g. `await new
 * MyConstructable().construction`. {@link asyncNew} is shorthand for this.  The creation code path can instead await
 * {@link Construction.ready} to ensure handling of the root cause.
 *
 * Public APIs should provide a static async create() that performs an asyncNew().  The class will then adhere to
 * Matter.js conventions and library users can ignore the complexities associated with async creation.
 */
export interface Constructable<T = object> {
    readonly construction: Construction<T>;
}

export namespace Constructable {
    /**
     * An {@link Constructable} that supports deferred construction.
     *
     * This supports use cases where initialization initiates separately from construction and/or reinitialization is
     * possible.
     */
    export interface Deferred<T, A extends unknown[]> extends Constructable<T> {
        /**
         * Perform deferred construction.
         */
        [Construction.construct](...args: A): MaybePromise<void>;
    }

    /**
     * An object that supports destruction.
     */
    export interface Destructable {
        /**
         * Perform destruction. This is used invoked by {@link Constructable#close} after transitioning to
         * {@link Lifecycle.Status.Destroying} but before transitioning to {@link Lifecycle.Status.Destroyed}.
         *
         * This is separate from {@link Symbol.dispose}/{@link Symbol.asyncDispose} so those can invoke
         * {@link Constructable#close}.
         */
        [Construction.destruct](): MaybePromise<void>;
    }
}

/**
 * The promise implementing by an {@link Constructable#construction}.
 *
 * Manages asynchronous object initialization and cleanup of a target object, called the "subject".
 */
export interface Construction<T> extends Promise<T>, Lifetime.Owner {
    /**
     * If construction ends with an error, the error is saved here.
     */
    readonly error?: Error;

    /**
     * Status of the constructed object.
     */
    readonly status: Lifecycle.Status;

    /**
     * Notifications of state change.  Normally you just await construction but this offers more granular events and
     * repeating events.
     */
    readonly change: Observable<[status: Lifecycle.Status, subject: T]>;

    /**
     * True iff the primary error has been or will be reported.
     */
    readonly isErrorHandled: boolean;

    /**
     * Resolves when construction completes; rejects if construction crashes.
     *
     * Behaves identically to {@link Construction} but always throws the primary cause rather than
     * {@link CrashedDependencyError}.
     *
     * Handling errors on this promise will prevent other handlers from seeing the primary cause.
     */
    readonly ready: PromiseLike<T>;

    /**
     * Resolves when destruction completes; rejects if the component crashes.
     *
     * Handling errors on this promise will prevent other handlers from seeing the primary cause.
     */
    readonly closed: PromiseLike<void>;

    /**
     * If you omit the initializer parameter to {@link Construction} execution is deferred until you invoke this
     * method to initiate construction via the {@link Constructable.Deferred} interface.
     *
     * Unlike the initializer, errors are always reported via the PromiseLike interface even if the constructable throws
     * an error synchronously.
     */
    start<const T, const A extends unknown[], const This extends Construction<Constructable.Deferred<T, A>>>(
        this: This,
        ...args: A
    ): void;

    /**
     * Throws an error if construction is ongoing or incomplete.
     */
    assert(description?: string): void;

    /**
     * Asserts construction is complete and that an object is defined.
     */
    assert<T>(description: string, dependency: T | undefined): T;

    /**
     * Invoke destruction logic then move to destroyed status.
     *
     * Typically you invoke this in the subject's "close" method.
     *
     * Use of this function is optional.  It provides these benefits:
     *
     *   - Ensures the subject is fully initialized before closing.
     *
     *   - Guards against closing multiple times; tertiary closes will wait for destruction.
     *
     *   - Handles and logs errors, ensuring close() always completes successfully.
     *
     *   - Makes destruction observable via {@link change} and {@link closed}.
     */
    close(destructor?: () => MaybePromise): MaybePromise;

    /**
     * Invoke a method after construction completes successfully.
     *
     * Errors thrown by this callback are logged but otherwise ignored.
     */
    onSuccess(actor: () => MaybePromise<void>): void;

    /**
     * Invoke a method after construction completes unsuccessfully.
     *
     * If you register an onError handler then the default error handler will not log the error.
     *
     * Errors thrown by this callback are logged but otherwise ignored.
     */
    onError(actor: (error: Error) => MaybePromise<void>): void;

    /**
     * Invoke a method after construction completes successfully or onsuccessfully.
     *
     * Errors thrown by this callback are logged but otherwise ignored.
     */
    onCompletion(actor: () => void): void;

    /**
     * Manually force a specific {@link status}.
     *
     * This offers flexibility in component lifecycle management including resetting component to inactive state and
     * broadcasting lifecycle changes.  On reset listeners are also reset and must be reinstalled.
     *
     * This method fails if initialization is ongoing; await completion first.
     */
    setStatus(status: Lifecycle.Status): void;

    /**
     * Move subject to "crashed" state, optionally setting the cause.
     *
     * This happens automatically if there is an error during construction.  It is also useful for post-construction
     * errors to convey crashed state to components such as the environmental runtime service.
     */
    crash(cause?: any): void;

    toString(): string;
}

const constructSymbol: unique symbol = Symbol("construct");
const destructSymbol: unique symbol = Symbol("destruct");

/**
 * Create an {@link Constructable} and optionally begin async construction.
 */
const createConstruction = (() => {
    class Construction<T = Constructable> implements Promise<T>, Lifetime.Owner {
        #initializerPromise: MaybePromise<void> | undefined;
        #awaiterPromise: undefined | Promise<T>;
        #awaiterResolve: undefined | ((subject: T) => void);
        #awaiterReject: undefined | ((error: any) => void);
        #closedPromise: undefined | Promise<void>;
        #closedResolve: undefined | (() => void);
        #closedReject: undefined | ((error: any) => void);
        #error: undefined | Error;
        #errorForDependencies: undefined | CrashedDependencyError;
        #primaryCauseHandled = false;
        #change: Observable<[status: Lifecycle.Status, subject: T]> | undefined;
        #status = Lifecycle.Status.Inactive;
        #lifetime: Lifetime | undefined;
        #subject: T & Constructable;
        #readyThenable: PromiseLike<T> | undefined;
        #closedThenable: PromiseLike<void> | undefined;

        constructor(subject: T & Constructable, initializer?: () => MaybePromise) {
            this.#subject = subject;

            if (!initializer) {
                assertDeferred(subject);
            }

            if (initializer) {
                this.#invokeInitializer(initializer);
            }
        }

        get [Symbol.toStringTag]() {
            return "Construction";
        }

        get error() {
            return this.#error;
        }

        get status() {
            return this.#status;
        }

        get change() {
            if (this.#change === undefined) {
                this.#change = Observable();
            }
            return this.#change;
        }

        get isErrorHandled() {
            return this.#primaryCauseHandled;
        }

        join(...name: unknown[]) {
            return this.#activeLifetime().join(...name);
        }

        start(...args: unknown[]): void {
            if (this.#status !== Lifecycle.Status.Inactive) {
                throw new ImplementationError(`Cannot initialize ${this.#subject} because it is already active`);
            }

            assertDeferred(this.#subject);

            this.#applyStatus(Lifecycle.Status.Initializing);

            try {
                const initializeDeferred = () =>
                    (this.#subject as unknown as Constructable.Deferred<any, any>)[constructSymbol](...args);
                this.#invokeInitializer(initializeDeferred);
            } catch (e) {
                this.#rejected(e);
                return;
            }
        }

        assert(description?: string, dependency?: any) {
            Lifecycle.assertActive(this.#status, description ?? nameOf(this.#subject));

            if (arguments.length < 2) {
                return;
            }

            try {
                if (dependency === undefined) {
                    throw new ImplementationError(`Property is undefined`);
                }
            } catch (e) {
                let error;
                if (e instanceof Error) {
                    error = e;
                } else {
                    error = new ImplementationError(e?.toString() ?? "(unknown error)");
                }
                error.message = `Cannot access ${description}: ${error.message}`;
                throw error;
            }
            return dependency;
        }

        then<TResult1 = T, TResult2 = never>(
            onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
            const handleRejection = onrejected ? () => onrejected?.(this.#crashedError()) as TResult2 : undefined;
            if (this.#status === Lifecycle.Status.Inactive || this.#status === Lifecycle.Status.Initializing) {
                if (!this.#awaiterPromise) {
                    this.#awaiterPromise = new Promise<T>((resolve, reject) => {
                        this.#awaiterResolve = resolve;
                        this.#awaiterReject = reject;
                    });
                }

                return this.#awaiterPromise.then(onfulfilled, handleRejection);
            }

            const promise = this.#error ? Promise.reject(this.#crashedError()) : Promise.resolve(this.#subject);
            return promise.then(onfulfilled, handleRejection);
        }

        catch<TResult = never>(
            onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
        ): Promise<T | TResult> {
            return this.then(undefined, onrejected);
        }

        onSuccess(actor: () => MaybePromise<void>) {
            const onSuccess = () => {
                const errorHandler = this.#createErrorHandler("onSuccess");

                try {
                    const result = actor();
                    if (MaybePromise.is(result)) {
                        return Promise.resolve(result).catch(errorHandler);
                    }
                } catch (e) {
                    errorHandler(e);
                }
            };

            this.then(onSuccess).catch(e => {
                CrashedDependencyError.accept(e);
            });
        }

        onError(actor: (error: Error) => MaybePromise<void>) {
            const onError = (error: unknown) => {
                const errorHandler = this.#createErrorHandler("onError");

                try {
                    const result = actor(errorOf(error));
                    if (MaybePromise.is(result)) {
                        return result.then(undefined, errorHandler);
                    }
                } catch (e) {
                    errorHandler(e);
                }
            };

            this.ready.then(undefined, onError);
        }

        onCompletion(actor: () => void) {
            const onCompletion = () => {
                const errorHandler = this.#createErrorHandler("onCompletion");

                try {
                    actor();
                } catch (e) {
                    errorHandler(e);
                }
            };

            this.then(onCompletion, onCompletion);
        }

        close(destructor?: () => MaybePromise): MaybePromise {
            const destructorError = this.#createErrorHandler("destructor");

            const destroyed = () => {
                this.#applyStatus(Lifecycle.Status.Destroyed);
                if (this.#closedResolve) {
                    this.#closedResolve();
                    this.#closedResolve = this.#closedReject = undefined;
                }
            };

            const destruct = (this.#subject as Partial<Constructable.Destructable>)[destructSymbol];
            const invokeDestruct = destruct
                ? () => {
                      try {
                          const promise = destruct.bind(this.#subject)();
                          if (promise) {
                              return promise.then(undefined, destructorError).then(destroyed);
                          }
                      } catch (e) {
                          destructorError(e);
                      }
                      destroyed();
                  }
                : destroyed;

            const invokeDestructor = destructor
                ? () => {
                      try {
                          const promise = destructor();
                          if (promise) {
                              return promise.then(undefined, destructorError).then(invokeDestruct);
                          }
                      } catch (e) {
                          destructorError(e);
                      }
                      invokeDestruct();
                  }
                : invokeDestruct;

            const beginDestruction = () => {
                if (this.#status === Lifecycle.Status.Destroying || this.#status === Lifecycle.Status.Destroyed) {
                    return this.closed;
                }
                this.#applyStatus(Lifecycle.Status.Destroying);
                return invokeDestructor();
            };

            switch (this.#status) {
                case Lifecycle.Status.Initializing:
                    return this.then(beginDestruction, beginDestruction) as Promise<void>;

                case Lifecycle.Status.Destroying:
                    return this.closed;

                case Lifecycle.Status.Destroyed:
                    return;

                default:
                    return beginDestruction();
            }
        }

        finally(onfinally?: (() => void) | null): Promise<T> {
            return Promise.prototype.finally.call(this, onfinally);
        }

        setStatus(newStatus: Lifecycle.Status) {
            if (this.#status === newStatus) {
                return;
            }

            switch (this.#status) {
                case newStatus:
                    return;

                case Lifecycle.Status.Destroying:
                    if (newStatus !== Lifecycle.Status.Destroyed) {
                        throw new ImplementationError("Cannot change status because destruction is ongoing");
                    }
                    break;

                case Lifecycle.Status.Destroyed:
                    throw new ImplementationError("Cannot change status because destruction is final");

                case Lifecycle.Status.Initializing:
                    throw new ImplementationError("Cannot change status because initialization is ongoing");
            }

            switch (newStatus) {
                case Lifecycle.Status.Inactive:
                    this.#awaiterPromise = this.#closedPromise = undefined;
                    this.#primaryCauseHandled = false;
                    this.#error = this.#errorForDependencies = undefined;
                    this.#readyThenable = this.#closedThenable = undefined;
                    break;

                case Lifecycle.Status.Active:
                    this.#awaiterPromise = this.#closedPromise = undefined;
                    this.#error = this.#errorForDependencies = undefined;
                    this.#readyThenable = this.#closedThenable = undefined;
                    break;

                default:
                    break;
            }

            this.#applyStatus(newStatus);
        }

        crash(newError?: Error) {
            this.#error = newError;
            this.#applyStatus(Lifecycle.Status.Crashed);
        }

        get ready(): PromiseLike<T> {
            if (this.#readyThenable === undefined) {
                this.#readyThenable = {
                    [Symbol.toStringTag]: "AsyncConstruction#primary",

                    then: <TResult1 = T, TResult2 = never>(
                        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
                        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
                    ): Promise<TResult1 | TResult2> => {
                        let rejectionHandler: undefined | typeof onrejected;
                        if (onrejected) {
                            this.#primaryCauseHandled = true;
                            rejectionHandler = () => onrejected(errorOf(this.#error));
                        }

                        return this.then(onfulfilled, rejectionHandler);
                    },
                } as PromiseLike<T>;
            }
            return this.#readyThenable;
        }

        get closed(): PromiseLike<void> {
            if (this.#closedPromise === undefined) {
                this.#closedPromise = new Promise((resolve, reject) => {
                    this.#closedResolve = resolve;
                    this.#closedReject = reject;
                });
            }

            if (this.#closedThenable === undefined) {
                this.#closedThenable = {
                    [Symbol.toStringTag]: "AsyncConstruction#primary",

                    then: <TResult1 = void, TResult2 = never>(
                        onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
                        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
                    ): Promise<TResult1 | TResult2> => {
                        let rejectionHandler: undefined | typeof onrejected;
                        if (onrejected) {
                            this.#primaryCauseHandled = true;
                            rejectionHandler = () => onrejected(errorOf(this.#error));
                        }

                        return (this.#closedPromise as Promise<void>).then(onfulfilled, rejectionHandler);
                    },
                } as PromiseLike<void>;
            }
            return this.#closedThenable!;
        }

        toString() {
            return `Construction(${nameOf(this.#subject)})`;
        }

        #invokeInitializer(initializer: () => MaybePromise<void>) {
            this.#applyStatus(Lifecycle.Status.Initializing);

            this.#initializerPromise = initializer();

            if (MaybePromise.is(this.#initializerPromise)) {
                this.#initializerPromise.then(
                    () => this.#resolved(),
                    (e: any) => this.#rejected(e),
                );
            } else {
                this.#resolved();
            }
        }

        #crashedError() {
            if (!this.#primaryCauseHandled && this.#error) {
                this.#primaryCauseHandled = true;
                return this.#error;
            }

            if (this.#errorForDependencies) {
                return this.#errorForDependencies;
            }

            this.#errorForDependencies = new CrashedDependencyError(
                nameOf(this.#subject),
                "unavailable due to initialization error",
            );
            this.#errorForDependencies.subject = this.#subject;
            this.#errorForDependencies.cause = this.#error;
            return this.#errorForDependencies;
        }

        #applyStatus(newStatus: Lifecycle.Status) {
            if (this.#status === newStatus) {
                return;
            }

            this.#status = newStatus;

            switch (this.#status) {
                case Lifecycle.Status.Initializing:
                case Lifecycle.Status.Active:
                case Lifecycle.Status.Destroying:
                    if (!this.#lifetime) {
                        this.#lifetime = this.#joinOwner();
                    }

                    if (this.#status === Lifecycle.Status.Destroying) {
                        this.#lifetime.closing();
                    }
                    break;

                default:
                    if (this.#lifetime) {
                        this.#lifetime.closing()[Symbol.dispose]();
                        this.#lifetime[Symbol.dispose]();
                        this.#lifetime = undefined;
                    }
                    break;
            }

            if (this.#change) {
                this.#change.emit(this.#status, this.#subject);
            }
        }

        #resolved() {
            if (this.#status === Lifecycle.Status.Initializing) {
                this.#applyStatus(Lifecycle.Status.Active);
            }

            if (this.#awaiterResolve) {
                const resolve = this.#awaiterResolve;
                this.#awaiterResolve = this.#awaiterReject = undefined;
                resolve(this.#subject);
            }
        }

        #rejected(cause: any) {
            if (this.#status !== Lifecycle.Status.Destroying && this.#status !== Lifecycle.Status.Destroyed) {
                this.#error = cause;
                this.#applyStatus(Lifecycle.Status.Crashed);
            }

            if (this.#awaiterReject) {
                const reject = this.#awaiterReject;
                this.#awaiterResolve = this.#awaiterReject = undefined;
                reject(this.#crashedError());
            }

            if (this.#closedReject) {
                this.#primaryCauseHandled = true;
                const reject = this.#closedReject;
                this.#closedResolve = this.#closedReject = undefined;
                reject(cause);
            }

            if (!this.#primaryCauseHandled) {
                this.#unhandledError(cause);
            }
        }

        #unhandledError(...args: any[]) {
            const logger = Logger.get(this.#subject.constructor.name);
            logger.error(...args);
        }

        #createErrorHandler(name: string) {
            return (e: any) => {
                this.#unhandledError(`Unhandled error in ${nameOf(this.#subject)} ${name}:`, e);
            };
        }

        #activeLifetime() {
            if (this.#lifetime) {
                if (this.#status === Lifecycle.Status.Destroying) {
                    return this.#lifetime.closing();
                }

                return this.#lifetime;
            }

            const zombie = this.#joinOwner();
            zombie[Symbol.dispose]();
            return zombie;
        }

        #joinOwner() {
            const lifetime = Lifetime.of(this.#subject);
            return lifetime.join(decamelize(nameOf(this.#subject), " "));
        }
    }

    return <T extends Constructable>(subject: T, initializer?: () => MaybePromise): Construction<T> =>
        new Construction(subject, initializer) as unknown as Construction<T>;
})();

/**
 * Create an {@link Constructable} and optionally begin async construction.
 */
export function Construction<T extends Constructable>(subject: T, initializer?: () => MaybePromise): Construction<T> {
    return createConstruction(subject, initializer);
}

export namespace Construction {
    /**
     * Ensure a pool of {@link Constructable}s are initialized.  Returns a promise if any constructables are still
     * initializing or there is an error.
     *
     * @param subjects the constructables to monitor; may mutate whilst construction is ongoing
     * @param onError error handler; if returns error it is thrown; if omitted throws CrashedDependenciesError
     */
    export function all<T extends Constructable>(
        subjects: Iterable<T>,
        onError?: (errored: Iterable<T>) => void | Error,
    ): MaybePromise {
        if (onError === undefined) {
            onError = errors => new CrashedDependenciesError(errors);
        }

        const subjectArray = [...subjects];

        const uninitialized = subjectArray.filter(
            subject => subject.construction.status === Lifecycle.Status.Initializing,
        );
        if (uninitialized.length) {
            return Promise.allSettled(uninitialized.map(backing => backing.construction)).then(() =>
                // Recurse to ensure subjects added subsequent to initial "all" settle
                all(subjects, onError),
            );
        }

        const crashed = Object.values(subjectArray).filter(
            subject => subject.construction.status === Lifecycle.Status.Crashed,
        );
        if (crashed.length) {
            let error;
            try {
                error = onError(crashed);
            } catch (e) {
                error = asError(e);
            }
            if (error) {
                return Promise.reject(error);
            }
        }
    }

    export const construct: typeof constructSymbol = constructSymbol;
    export const destruct: typeof destructSymbol = destructSymbol;
}

function assertDeferred<T>(subject: Constructable<T>): asserts subject is Constructable.Deferred<T, any> {
    if (typeof (subject as Constructable.Deferred<any, any>)?.[constructSymbol] !== "function") {
        throw new ImplementationError(`No initializer defined for ${subject}`);
    }
}

function nameOf(subject: {}) {
    if (DiagnosticPresentation.name in subject) {
        const name = subject[DiagnosticPresentation.name];
        if (name !== undefined) {
            return LogFormat("plain")(name);
        }
    }

    if (subject.toString === Object.prototype.toString) {
        return subject.constructor.name;
    }

    return subject.toString();
}
