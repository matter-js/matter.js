/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
    readonly ready: Promise<T>;

    /**
     * Resolves when destruction completes; rejects if the component crashes.
     *
     * Handling errors on this promise will prevent other handlers from seeing the primary cause.
     */
    readonly closed: Promise<T>;

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
     * Throws an error if construction is ongoing or incomplete.
     */
    assert(description?: string): void;

    /**
     * Asserts construction is complete and that an object is defined.
     */
    assert<T>(description: string, dependency: T | undefined): T;

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

    toString(): string;
}

/**
 * Create an {@link Constructable} and optionally begin async construction.
 */
export function Construction<const T extends Constructable>(
    subject: T,
    initializer?: () => MaybePromise,
): Construction<T> {
    if (!initializer) {
        assertDeferred(subject);
    }

    // The promise returned by the initializer if initialization is async
    let initializerPromise: MaybePromise<void>;

    // The promise we use to implement Construction.then() and Construction.ready
    let awaiterPromise: undefined | Promise<T>;
    let awaiterResolve: undefined | ((subject: T) => void);
    let awaiterReject: undefined | ((error: any) => void);

    // The promise we use to implement Constructable.close
    let closedPromise: undefined | Promise<void>;
    let closedResolve: undefined | (() => void);
    let closedReject: undefined | ((error: any) => void);

    let error: undefined | Error;
    let errorForDependencies: undefined | CrashedDependencyError;
    let primaryCauseHandled = false;
    let change: Observable<[status: Lifecycle.Status, subject: T]> | undefined;

    // Lifecycle information that exists
    let status = Lifecycle.Status.Inactive;
    let lifetime: Lifetime | undefined;

    const self: Construction<any> = {
        [Symbol.toStringTag]: "Construction",

        get error() {
            return error;
        },

        get status() {
            return status;
        },

        get change() {
            if (change === undefined) {
                change = Observable();
            }
            return change;
        },

        get isErrorHandled() {
            return primaryCauseHandled;
        },

        join(...name: unknown[]) {
            return activeLifetime().join(...name);
        },

        start<const T, const A extends [], const This extends Construction<Constructable.Deferred<T, A>>>(
            this: This,
            ...args: A
        ) {
            if (status !== Lifecycle.Status.Inactive) {
                throw new ImplementationError(`Cannot initialize ${subject} because it is already active`);
            }

            assertDeferred(subject);

            setStatus(Lifecycle.Status.Initializing);

            try {
                const initializeDeferred = () => subject[Construction.construct](...args);
                invokeInitializer(initializeDeferred);
            } catch (e) {
                rejected(e);
                return;
            }
        },

        assert(description?: string, dependency?: any) {
            Lifecycle.assertActive(status, description ?? nameOf(subject));

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
        },

        then<TResult1 = T, TResult2 = never>(
            onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
            const handleRejection = onrejected ? () => onrejected?.(crashedError()) as TResult2 : undefined;
            if (status === Lifecycle.Status.Inactive || status === Lifecycle.Status.Initializing) {
                if (!awaiterPromise) {
                    awaiterPromise = new Promise<T>((resolve, reject) => {
                        awaiterResolve = resolve;
                        awaiterReject = reject;
                    });
                }

                return awaiterPromise.then(onfulfilled, handleRejection);
            }

            const promise = error ? Promise.reject(crashedError()) : Promise.resolve(subject);
            return promise.then(onfulfilled, handleRejection);
        },

        catch<TResult = never>(
            onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
        ): Promise<T | TResult> {
            return this.then(undefined, onrejected);
        },

        onSuccess(actor: () => MaybePromise<void>) {
            const onSuccess = () => {
                const errorHandler = createErrorHandler("onSuccess");

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
                // Failure should result in a CrashedDependencyError which simply means initialization failed.  The
                // actual error is logged so we can safely ignore.  If the error was not a CrashedDependencyError then
                // it is unexpected.  We rethrow which will result in the process exiting with an unexpected error
                CrashedDependencyError.accept(e);
            });
        },

        onError(actor: (error: Error) => MaybePromise<void>) {
            const onError = (error: unknown) => {
                const errorHandler = createErrorHandler("onError");

                try {
                    const result = actor(errorOf(error));
                    if (MaybePromise.is(result)) {
                        return result.then(undefined, errorHandler);
                    }
                } catch (e) {
                    errorHandler(e);
                }
            };

            this.ready.catch(onError);
        },

        onCompletion(actor: () => void) {
            const onCompletion = () => {
                const errorHandler = createErrorHandler("onCompletion");

                try {
                    actor();
                } catch (e) {
                    errorHandler(e);
                }
            };

            // Do not use finally() because eslint rule doesn't like it
            this.then(onCompletion, onCompletion);
        },

        close(destructor): MaybePromise {
            const destructorError = createErrorHandler("destructor");

            // Destruction phase 4 - move to destroyed state
            function destroyed() {
                setStatus(Lifecycle.Status.Destroyed);
                if (closedResolve) {
                    closedResolve();
                    closedResolve = closedReject = undefined;
                }
            }

            // Destruction phase 3 - invoke AsyncDestructable.destruct if present
            const destruct = (subject as Partial<Constructable.Destructable>)[Construction.destruct];
            const invokeDestruct = destruct
                ? function invokeDestruct() {
                      try {
                          const promise = destruct.bind(subject)();
                          if (promise) {
                              return promise.then(undefined, destructorError).then(destroyed);
                          }
                      } catch (e) {
                          destructorError(e);
                      }
                      destroyed();
                  }
                : destroyed;

            // Destruction phase 2 - invoke destructor function if present
            const invokeDestructor = destructor
                ? function invokeDestructor() {
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

            // Destruction phase 1 - move to destroying state
            function beginDestruction() {
                if (status === Lifecycle.Status.Destroying || status === Lifecycle.Status.Destroyed) {
                    return self.closed;
                }
                setStatus(Lifecycle.Status.Destroying);
                return invokeDestructor();
            }

            switch (status) {
                case Lifecycle.Status.Initializing:
                    // Wait for initialization to complete, then close
                    return this.then(beginDestruction, beginDestruction);

                case Lifecycle.Status.Destroying:
                    // Wait for previously initiated destruction to complete
                    return this.closed;

                case Lifecycle.Status.Destroyed:
                    // Already destroyed
                    return;

                default:
                    // Begin destruction
                    return beginDestruction();
            }
        },

        finally(onfinally: () => void): Promise<T> {
            return Promise.prototype.finally.call(this, onfinally);
        },

        setStatus(newStatus: Lifecycle.Status) {
            if (this.status === newStatus) {
                return;
            }

            switch (status) {
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
                    awaiterPromise = closedPromise = undefined;
                    primaryCauseHandled = false;
                    error = errorForDependencies = undefined;
                    break;

                case Lifecycle.Status.Active:
                    awaiterPromise = closedPromise = undefined;
                    error = errorForDependencies = undefined;
                    break;

                default:
                    break;
            }

            setStatus(newStatus);
        },

        crash(newError?: Error) {
            error = newError;
            setStatus(Lifecycle.Status.Crashed);
        },

        get ready() {
            return {
                [Symbol.toStringTag]: "AsyncConstruction#primary",

                then<TResult1 = T, TResult2 = never>(
                    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
                    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
                ): Promise<TResult1 | TResult2> {
                    let rejectionHandler: undefined | typeof onrejected;
                    if (onrejected) {
                        primaryCauseHandled = true;
                        rejectionHandler = () => onrejected(errorOf(error));
                    }

                    return self.then(onfulfilled, rejectionHandler);
                },

                catch<TResult = never>(
                    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
                ): Promise<T | TResult> {
                    return this.then(undefined, onrejected);
                },

                finally(onfinally: () => void): Promise<T> {
                    return Promise.prototype.finally.call(this, onfinally);
                },
            };
        },

        get closed() {
            if (closedPromise === undefined) {
                closedPromise = new Promise((resolve, reject) => {
                    closedResolve = resolve;
                    closedReject = reject;
                });
            }

            return {
                [Symbol.toStringTag]: "AsyncConstruction#primary",

                then<TResult1 = void, TResult2 = never>(
                    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
                    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
                ): Promise<TResult1 | TResult2> {
                    let rejectionHandler: undefined | typeof onrejected;
                    if (onrejected) {
                        primaryCauseHandled = true;
                        rejectionHandler = () => onrejected(errorOf(error));
                    }

                    return (closedPromise as Promise<void>).then(onfulfilled, rejectionHandler);
                },

                catch<TResult = never>(
                    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
                ): Promise<T | TResult> {
                    return this.then(undefined, onrejected);
                },

                finally(onfinally: () => void): Promise<T> {
                    return Promise.prototype.finally.call(this, onfinally);
                },
            };
        },
    };

    if (initializer) {
        invokeInitializer(initializer);
    }

    return self;

    // Begin initialization.  May throw synchronously or asynchronously
    function invokeInitializer(initializer: () => MaybePromise<void>) {
        setStatus(Lifecycle.Status.Initializing);

        initializerPromise = initializer();

        if (MaybePromise.is(initializerPromise)) {
            initializerPromise.then(resolved, rejected);
        } else {
            resolved();
        }
    }

    // We return the original error for the first rejection.  The stack trace will point to the source of the error.
    // This means that the owner of the object should register error handling first.
    //
    // For subsequent rejections we throw a new CrashedDependencyError for each listener.  This prevents the logs from
    // filling with redundant stack traces and ensures the stack trace details the listener's stack rather than the
    // original error's stack.
    function crashedError() {
        if (!primaryCauseHandled && error) {
            primaryCauseHandled = true;
            return error;
        }

        if (errorForDependencies) {
            return errorForDependencies;
        }

        errorForDependencies = new CrashedDependencyError(nameOf(subject), "unavailable due to initialization error");
        errorForDependencies.subject = subject;
        errorForDependencies.cause = error;
        return errorForDependencies;
    }

    function setStatus(newStatus: Lifecycle.Status) {
        if (status === newStatus) {
            return;
        }

        status = newStatus;

        switch (status) {
            case Lifecycle.Status.Initializing:
            case Lifecycle.Status.Active:
            case Lifecycle.Status.Destroying:
                if (!lifetime) {
                    lifetime = joinOwner();
                }

                if (status === Lifecycle.Status.Destroying) {
                    lifetime.closing();
                }
                break;

            default:
                if (lifetime) {
                    lifetime.closing()[Symbol.dispose]();
                    lifetime[Symbol.dispose]();
                    lifetime = undefined;
                }
                break;
        }

        if (change) {
            change.emit(status, subject);
        }
    }

    function resolved() {
        if (status === Lifecycle.Status.Initializing) {
            setStatus(Lifecycle.Status.Active);
        }

        if (awaiterResolve) {
            const resolve = awaiterResolve;
            awaiterResolve = awaiterReject = undefined;
            resolve(subject);
        }
    }

    function rejected(cause: any) {
        if (status !== Lifecycle.Status.Destroying && status !== Lifecycle.Status.Destroyed) {
            error = cause;
            setStatus(Lifecycle.Status.Crashed);
        }

        if (awaiterReject) {
            const reject = awaiterReject;
            awaiterResolve = awaiterReject = undefined;
            reject(crashedError());
        }

        if (closedReject) {
            primaryCauseHandled = true;
            const reject = closedReject;
            closedResolve = closedReject = undefined;
            reject(cause);
        }

        if (!primaryCauseHandled) {
            unhandledError(cause);
        }
    }

    function unhandledError(...args: any[]) {
        const logger = Logger.get(subject.constructor.name);
        logger.error(...args);
    }

    function createErrorHandler(name: string) {
        return (e: any) => {
            unhandledError(`Unhandled error in ${nameOf(subject)} ${name}:`, e);
        };
    }

    function activeLifetime() {
        if (lifetime) {
            if (status === Lifecycle.Status.Destroying) {
                return lifetime.closing();
            }

            return lifetime;
        }

        // We are not in fact alive so create a zombie lifetime.  Generally this is a bug but if it happens this allows
        // us to handle without crashing and properly track lifetime spans
        const zombie = joinOwner();
        zombie[Symbol.dispose]();
        return zombie;
    }

    function joinOwner() {
        const lifetime = Lifetime.of(subject);
        return lifetime.join(decamelize(nameOf(subject), " "));
    }
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

    export const construct = Symbol("construct");
    export const destruct = Symbol("destruct");
}

function assertDeferred<T>(subject: Constructable<T>): asserts subject is Constructable.Deferred<T, any> {
    if (typeof (subject as Constructable.Deferred<any, any>)?.[Construction.construct] !== "function") {
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
