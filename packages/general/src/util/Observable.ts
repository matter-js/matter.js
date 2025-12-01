/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";
import { Instant, Millis, Seconds } from "#time/TimeUnit.js";
import { ImplementationError } from "../MatterError.js";
import { Logger } from "../log/Logger.js";
import "../polyfills/disposable.js";
import { asError } from "./Error.js";
import { MaybePromise } from "./Promises.js";

const logger = Logger.get("Observable");

/**
 * A callback function for observables.
 *
 * The observer return value effects how an {@link Observable} emits:
 *
 *   - If an observer returns undefined the {@link Observable} invokes the next observer immediately.
 *
 *   - If an observer returns a {@link Promise}, the {@link Observable} awaits the return value then continues as
 *     described here.  The emitter must then await the {@link Promise} returned by {@link Observable.emit}.
 *
 *   - Any other return value is returned by {@link Observable.emit} and subsequent observers do not see emission.
 *
 * @param payload a list of arguments to be emitted
 */
export interface Observer<T extends any[] = any[], R = void> {
    (...payload: T): MaybePromise<R | undefined>;
    [observant]?: boolean;
}

/**
 * A discrete event that may be monitored via callback.  Could call it "event" but that could be confused with Matter
 * cluster events and/or DOM events.
 *
 * @param T arguments, should be a named tuple
 */
export interface Observable<T extends any[] = any[], R = void> extends AsyncIterable<T>, PromiseLike<T> {
    /**
     * Notify observers.
     */
    emit(...args: T): R | undefined;

    /**
     * Add an observer.
     */
    on(observer: Observer<T, R>): void;

    /**
     * Remove an observer.
     */
    off(observer: Observer<T, R>): void;

    /**
     * Add an observer that emits once then is unregistered.
     */
    once(observer: Observer<T, R>): void;

    /**
     * True if there is at least one observer registered.
     */
    isObserved: boolean;

    /**
     * Determine whether an observer is registered.
     */
    isObservedBy(observer: Observer<T, R>): boolean;

    /**
     * Errors throw by observers will interrupt emitters unless an error handler is installed here and the handler does
     * not rethrow.
     *
     * The only exception to this is if {@link handlePromise} is false and an observer is asynchronous.  In this case
     * the emitter cannot be made aware of the exception.
     */
    handleError: ObserverErrorHandler;

    /**
     * We allow emitters to be async, but we do not want to overburden either the emitter or the observer with promise
     * tracking if the lifetime of the observer is not relevant to the emitter.
     *
     * To facilitate this we allow observables to be configured in one of three promise handling modes:
     *
     * * If you set handlePromise, isAsync is true; the handler is invoked for any observer promise
     *
     * * If isAsync is true but you do not set handlePromise, any observer promise is returned to the emitter which must
     *   handle the promise
     *
     * * If isAsync is false, we log observer promise errors but the promise is otherwise untracked
     *
     * If the promiseHandler returns a promise or is true and the emitter returns a promise, the observable will emit to
     * successive observers only after the promise resolves.
     */
    isAsync: boolean;

    /**
     * A promise handler.
     *
     * If you set {@link isAsync} (either true or false) the promise handler is set by the Observable.
     */
    handlePromise: ObserverPromiseHandler | boolean;

    /**
     * Creates a promise that resolves when next emitted.
     */
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T[0]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2>;

    /**
     * Observable supports standard "for await (const value of observable").
     *
     * Using an observer in this manner limits your listener to the first parameter normally emitted and your observer
     * cannot return a value.
     */
    [Symbol.asyncIterator](): AsyncIterator<T[0]>;

    /**
     * Release resources associated with the observable.
     */
    [Symbol.dispose](): void;
}

/**
 * An observable value.
 *
 * This is a stateful observable that remembers its last emitted value and maps to standard Promise semantics.
 *
 * Unlike a normal {@link Observable}, awaiting an {@link ObservableValue} will result in immediate resolution if the
 * value is truthy, and immediately upon updating to a truthy value otherwise.
 *
 * Also unlike a normal {@link Observable}, an {@link ObservableValue} may be placed into an error state which will
 * result in rejection if awaited.
 */
export interface ObservableValue<T extends [any, ...any[]] = [boolean], R extends MaybePromise<void> = void>
    extends Observable<T, R>, Promise<T[0]> {
    value: T[0] | undefined;
    error?: Error;

    /**
     * Place the observable into an error state.
     *
     * The error is cleared on next emit.
     */
    reject(cause: unknown): void;

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T[0]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2>;

    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T[0] | TResult>;
}

/**
 * An observer may designate itself as "not observant" for the purposes of {@link Observable.isObserved} by returning
 * false from this field.
 */
export const observant = Symbol("consider-observed");

/**
 * An {@link Observable} that explicitly supports asynchronous observers.
 */
export interface AsyncObservable<T extends any[] = any[], R = void> extends Observable<T, MaybePromise<R>> {}

/**
 * An {@link ObservableValue} that explicitly supports asynchronous observers.
 */
export interface AsyncObservableValue<T extends [any, ...any[]] = [boolean]> extends ObservableValue<T, MaybePromise> {}

function defaultErrorHandler(error: Error) {
    throw error;
}

export type ObserverErrorHandler = (error: Error, observer: Observer<any[], any>) => void;

export type ObserverPromiseHandler = (promise: Promise<unknown>, observer: Observer<any[], any>) => unknown;

/**
 * A concrete {@link Observable} implementation.
 */
export class BasicObservable<T extends any[] = any[], R = void> implements Observable<T, R> {
    #handleError!: ObserverErrorHandler;
    #isAsync!: boolean;
    #handlePromise!: ObserverPromiseHandler;
    #observers?: Set<Observer<T, R>>;
    #once?: Set<Observer<T, R>>;

    #joinIteration?: () => Promise<Next<T>>;
    #removeIterator?: () => void;
    #stopIteration?: () => void;

    constructor(handleError?: ObserverErrorHandler, asyncConfig?: ObserverPromiseHandler | boolean) {
        this.handleError = handleError ?? defaultErrorHandler;
        if (typeof asyncConfig === "function") {
            this.handlePromise = asyncConfig;
        } else {
            this.isAsync = asyncConfig ?? false;
        }
    }

    [Symbol.dispose]() {
        this.#observers = this.#once = undefined;

        this.#stopIteration?.();
    }

    set handleError(handleError: ObserverErrorHandler) {
        this.#handleError = handleError;
    }

    get handleError() {
        return this.#handleError;
    }

    set isAsync(isAsync: boolean) {
        this.#isAsync = isAsync;
        if (isAsync) {
            // Promises handled by emitter
            this.#handlePromise = promise => promise;
        } else {
            // We log promise errors but do not otherwise track
            this.#handlePromise = (promise, observer) => {
                promise.catch(error => {
                    let identity: string;
                    if (observer.name) {
                        identity = ` "${observer.name}"`;
                    } else {
                        identity = "";
                    }

                    if (this.#handleError === defaultErrorHandler) {
                        logger.error(`Unhandled error in async observer${identity}:`, error);
                    } else {
                        this.#handleError(error, observer);
                    }
                });
            };
        }
    }

    get isAsync() {
        return this.#isAsync;
    }

    set handlePromise(handlePromise: ObserverPromiseHandler) {
        this.isAsync = true;
        this.#handlePromise = handlePromise;
    }

    get handlePromise() {
        return this.#handlePromise;
    }

    get isObserved() {
        if (this.#observers) {
            for (const observer of this.#observers) {
                if (observer[observant] !== false) {
                    return true;
                }
            }
        }

        if (this.#once) {
            for (const observer of this.#once) {
                if (observer[observant] !== false) {
                    return true;
                }
            }
        }

        return false;
    }

    isObservedBy(observer: Observer<T, R>) {
        return !!this.#observers?.has(observer);
    }

    emit(...payload: T): R | undefined {
        if (!this.#observers) {
            return;
        }

        // Iterate over a clone of observers so we do not trigger new observers added during observation
        const iterator = [...this.#observers][Symbol.iterator]();

        const emitNext = (previousEmitResult?: R): R | undefined => {
            if (previousEmitResult !== undefined) {
                return previousEmitResult;
            }

            for (let iteration = iterator.next(); !iteration.done; iteration = iterator.next()) {
                let result;

                const observer = iteration.value;

                try {
                    result = observer(...payload);
                } catch (e) {
                    this.#handleError(asError(e), observer);
                }

                if (this.#once?.has(observer)) {
                    this.#once.delete(observer);
                    this.#observers?.delete(observer);
                }

                if (result === undefined) {
                    continue;
                }

                if (MaybePromise.is(result)) {
                    result = this.#handlePromise(Promise.resolve(result), observer as Observer) as R | undefined;

                    if (MaybePromise.is(result)) {
                        return result.then(result => {
                            if (result === undefined) {
                                return emitNext();
                            }
                            return result;
                        }) as R;
                    }

                    if (result === undefined) {
                        continue;
                    }
                }

                return result;
            }
        };

        return emitNext();
    }

    on(observer: Observer<T, R>) {
        if (!this.#observers) {
            this.#observers = new Set();
        }
        this.#observers.add(observer);
    }

    off(observer: Observer<T, R>) {
        this.#observers?.delete(observer);
    }

    once(observer: Observer<T, R>) {
        this.on(observer);
        if (!this.#once) {
            this.#once = new Set();
        }
        this.#once.add(observer);
    }

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T[0]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return new Promise<T>(resolve => {
            this.once((...payload): undefined => {
                resolve(payload[0]);
            });
        }).then(onfulfilled, onrejected);
    }

    async *[Symbol.asyncIterator](): AsyncIterator<T[0]> {
        let promise = this.#addIterator();

        try {
            while (promise) {
                const next = await promise;
                if (next) {
                    promise = next.promise;
                    yield next.value;
                }
            }
        } finally {
            this.#removeIterator?.();
        }
    }

    #addIterator() {
        if (this.#joinIteration) {
            return this.#joinIteration();
        }

        let resolve: (next: Next<T>) => void;
        let iteratorCount = 1;

        function newPromise() {
            return new Promise<Next<T>>(r => (resolve = r));
        }

        let promise = newPromise();

        function observer(...args: T): undefined {
            const oldResolve = resolve;
            promise = newPromise();
            oldResolve({ value: args[0], promise });
        }

        this.on(observer);

        this.#joinIteration = () => {
            iteratorCount++;
            return promise;
        };

        this.#removeIterator = () => {
            if (!iteratorCount--) {
                this.#stopIteration?.();
            }
        };

        this.#stopIteration = () => {
            this.off(observer);
            resolve(undefined);
            this.#stopIteration = undefined;
            this.#removeIterator = undefined;
        };
    }
}

type Next<T> = undefined | { value: T; promise: Promise<Next<T>> };

/**
 * Create an {@link Observable}.
 */
export const Observable = constructObservable as unknown as {
    new <T extends any[], R = void>(errorHandler?: ObserverErrorHandler): Observable<T, R>;
    <T extends any[], R = void>(errorHandler?: ObserverErrorHandler): Observable<T, R>;
};

function constructObservable(handleError?: ObserverErrorHandler) {
    return new BasicObservable(handleError);
}

/**
 * Create an {@link AsyncObservable} that explicitly supports asynchronous results
 */
export const AsyncObservable = constructAsyncObservable as unknown as {
    new <T extends any[], R = void>(handleError?: ObserverErrorHandler): AsyncObservable<T, R>;
    <T extends any[], R = void>(handleError?: ObserverErrorHandler): AsyncObservable<T, R>;
};

function constructAsyncObservable(handleError?: ObserverErrorHandler) {
    return new BasicObservable(handleError, true);
}

function event<E, N extends string>(emitter: E, name: N) {
    const observer = (emitter as any)[name];
    if (typeof !observer?.on !== "function") {
        throw new ImplementationError(`Invalid event name ${name}`);
    }
    return observer as Observable;
}

/**
 * A concrete {@link ObservableValue} implementation.
 */
export class BasicObservableValue<T extends [any, ...any[]] = [boolean]>
    extends BasicObservable<T, void>
    implements ObservableValue<T>
{
    #value: T | undefined;
    #error?: Error;
    #awaiters?: {
        resolve?: ((value: T[0]) => void) | null;
        reject?: ((reason: any) => void) | null;
    }[];

    constructor(value?: T[0], handleError?: ObserverErrorHandler, asyncConfig?: ObserverPromiseHandler | boolean) {
        super(handleError, asyncConfig);
        this.#value = value;
        this.on(this.#maybeResolve.bind(this) as unknown as Observer<T, void>);
    }

    /**
     * The current value.
     *
     * This will resolve the promise interface but you must use {@link emit} to also emit an event..
     */
    get value(): T[0] | undefined {
        return this.#value;
    }

    set value(value: T[0] | undefined) {
        this.#maybeResolve([value]);
    }

    get error() {
        return this.#error;
    }

    reject(cause: unknown) {
        cause = asError(cause);
        this.#value = undefined;
        this.#error = cause as Error;
        const awaiters = this.#awaiters;
        if (awaiters) {
            this.#awaiters = undefined;
            for (const awaiter of awaiters) {
                awaiter.reject?.(cause as Error);
            }
        }
    }

    #maybeResolve(value: T[0] | undefined) {
        this.#value = value;
        if (!this.#value) {
            return;
        }

        const awaiters = this.#awaiters;
        if (awaiters) {
            this.#awaiters = undefined;
            for (const awaiter of awaiters) {
                awaiter.resolve?.(this.#value);
            }
        }
    }

    override then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        if (this.#error) {
            return Promise.reject(this.#error).then(onfulfilled, onrejected);
        }
        if (this.#value) {
            return Promise.resolve(this.#value).then(onfulfilled, onrejected);
        }

        return new Promise<T>((resolve, reject) => {
            if (!this.#awaiters) {
                this.#awaiters = [];
            }
            this.#awaiters.push({ resolve, reject });
        }).then(onfulfilled, onrejected);
    }

    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult> {
        return this.then(undefined, onrejected);
    }

    finally(onfinally?: (() => void) | null): Promise<T> {
        return Promise.resolve(this).finally(onfinally);
    }

    [Symbol.toStringTag] = "Promise";
}

/**
 * Create an {@link ObservableValue}.
 */
export const ObservableValue = constructObservableValue as unknown as {
    new <T extends [any, ...any[]]>(value?: T[0], errorHandler?: ObserverErrorHandler): ObservableValue<T>;
    <T extends [any, ...any[]]>(value?: T[0], errorHandler?: ObserverErrorHandler): ObservableValue<T>;
};

function constructObservableValue(value?: unknown, handleError?: ObserverErrorHandler) {
    return new BasicObservableValue<any>(value, handleError);
}

/**
 * Create an {@link AsyncObservableValue}.
 */
export const AsyncObservableValue = constructAsyncObservableValue as unknown as {
    new <T extends [any, ...any[]]>(value?: T[0], errorHandler?: ObserverErrorHandler): AsyncObservableValue<T>;
    <T extends [any, ...any[]]>(value?: T[0], errorHandler?: ObserverErrorHandler): AsyncObservableValue<T>;
};

function constructAsyncObservableValue(value?: unknown, handleError?: ObserverErrorHandler) {
    return new BasicObservableValue<any>(value, handleError, true);
}

/**
 * A set of observables.  You can bind events using individual observables or the methods emulating a subset Node's
 * EventEmitter.
 *
 * To maintain type safety, implementers define events as observable child properties.
 */
export class EventEmitter {
    // True private screws up TS types
    private events?: Record<string, Observable | undefined>;

    emit<This, N extends EventEmitter.NamesOf<This>>(this: This, name: N, ...payload: EventEmitter.PayloadOf<This, N>) {
        event(this, name).emit(...payload);
    }

    addListener<This, N extends EventEmitter.NamesOf<This>>(
        this: This,
        name: N,
        handler: EventEmitter.ObserverOf<This, N>,
    ) {
        event(this, name).on(handler as any);
    }

    removeListener<This, N extends EventEmitter.NamesOf<This>>(
        this: This,
        name: N,
        handler: EventEmitter.ObserverOf<This, N>,
    ) {
        event(this, name).off(handler as any);
    }

    addEvent(name: string, event?: Observable) {
        if (!this.events) {
            this.events = {};
        }

        this.events[name] = event;
    }

    getEvent(name: string) {
        if (!this.events || !(name in this.events)) {
            throw new ImplementationError(`No such event ${name}`);
        }

        return this.events[name] ?? (this.events[name] = Observable());
    }

    hasEvent(name: string, onlyIfInitialized = false) {
        return this.events && (onlyIfInitialized ? this.events[name] : name in this.events);
    }

    get eventNames() {
        return this.events ? Object.keys(this.events) : [];
    }

    [Symbol.dispose]() {
        if (!this.events) {
            return;
        }

        for (const event of Object.values(this.events)) {
            event?.[Symbol.dispose]?.();
        }

        this.events = undefined;
    }
}

export namespace EventEmitter {
    /**
     * Legal event names.  If there are no events defined, assume this is an
     * untyped instance and allow any argument.
     */
    export type NamesOf<This> = [EventNames<This>] extends [never] ? string : EventNames<This>;

    export type EventNames<This> = string &
        keyof {
            [K in keyof This as This[K] extends Observable ? K : never]: true;
        };

    /**
     * Arguments for an event.  If there are no events defined, assume this is
     * an untyped emitter and allow any argument.
     */
    export type PayloadOf<This, E extends string> = [EventPayload<This, E>] extends [never]
        ? any[]
        : EventPayload<This, E>;

    export type EventPayload<This, E extends string> = This extends { [K in E]: Observable<infer T extends any[]> }
        ? T
        : never;

    export type ObserverOf<This, E extends string> = Observable<PayloadOf<This, E>>;
}

/**
 * An {@link Observable} that proxies to another {@link Observable}.
 *
 * Events emitted here instead emit on the target {@link Observable}.  Events emitted on the target emit locally via
 * a listener installed by the proxy.
 *
 * This is useful for managing a subset of {@link Observer}s for an {@link Observable}.
 *
 * Note that this "proxy" acts as a proxy but is not a JS {@link Proxy}.
 */
export class ObservableProxy extends BasicObservable {
    #target: Observable;
    #emitter = super.emit.bind(this);

    constructor(target: Observable) {
        super();

        Object.defineProperty(this.#emitter, observant, {
            get() {
                return super.isObserved;
            },
        });

        this.#target = target;
        this.#target.on(this.#emitter);
        this.emit = this.#target.emit.bind(this.#target);
    }

    override [Symbol.dispose]() {
        this.#target.off(this.#emitter);
        super[Symbol.dispose]();
    }

    override get isObserved(): boolean {
        return this.#target.isObserved;
    }

    override emit: (...payload: any) => any | undefined;

    protected get target() {
        return this.#target;
    }
}

/**
 * A collection of observers managed as a unit.  This makes it convenient to deregister multiple observers when an
 * object closes.
 */
export class ObserverGroup {
    #defaultTarget?: {};
    #observers = new Map<Observable<any[], any> | AsyncObservable<any>, Observer<any[], any>[]>();
    #boundObservers = new Map<Observer<any[], any>, Map<{}, Observer<any[]>>>();

    constructor(target?: {}) {
        this.#defaultTarget = target;
    }

    /**
     * Add an observer.
     *
     * @param observable the observable to observe
     * @param observer the observer function
     * @param target optional "this" to bind the observer
     */
    on<T extends any[], R>(
        observable: Observable<T, R> | AsyncObservable<T, R>,
        observer: Observer<ObserverGroup.VarArgs<NoInfer<T>>, NoInfer<R>>,
        target = this.#defaultTarget,
    ) {
        if (target !== undefined) {
            observer = observer.bind(target);
        }
        observable.on(observer as Observer<T, R>);
        const observers = this.#observers.get(observable);
        if (observers === undefined) {
            this.#observers.set(observable, [observer]);
        } else {
            observers.push(observer);
        }
    }

    /**
     * Remove a single observer.
     *
     * @param observable the observable to observe
     * @param observer the observer function
     * @param target if the observer was bound in {@link on} this must match the bound target
     */
    off<T extends any[]>(
        observable: Observable<T> | AsyncObservable<T>,
        observer: Observer<NoInfer<T>>,
        target = this.#defaultTarget,
    ) {
        if (target) {
            const observers = this.#boundObservers.get(observer);
            if (observers === undefined) {
                return;
            }
            const bound = observers.get(target);
            if (bound === undefined) {
                return;
            }
            observers.delete(target);
            if (observers.size === 0) {
                this.#boundObservers.delete(observer);
            }
        }
        const observers = this.#observers.get(observable);
        if (observers) {
            const index = observers.indexOf(observer);
            if (index !== -1) {
                observers?.splice(index, 1);
            }
        }
        observable.off(observer);
    }

    /**
     * Remove all observers.
     */
    close() {
        for (const [observable, observers] of this.#observers.entries()) {
            for (const observer of observers) {
                observable.off(observer);
            }
        }
        this.#observers.clear();
        this.#boundObservers.clear();
    }
}

export namespace ObserverGroup {
    /**
     * This is a workaround for a TS bug, without this the observer must provide a full argument set even if it does not
     * use all arguments.
     */
    export type VarArgs<T extends any[]> = T extends [...infer R, infer A] ? [...R, A] : T extends [infer A] ? A : [];
}

/**
 * An {@link Observable} that emits an algorithmically-reduced number of events.
 */
export class QuietObservable<T extends any[] = any[]> extends BasicObservable<T> implements QuietObservable.State<T> {
    #emitAutomatically = QuietObservable.defaults.emitAutomatically;
    #suppressionEnabled = QuietObservable.defaults.suppressionEnabled;
    #minimumEmitInterval = QuietObservable.defaults.minimumEmitInterval;
    #shouldEmit?: QuietObservable.EmitPredicate<T>;
    #source?: Observable<T>;
    #sink?: Observable<T>;
    #sourceObserver?: Observer<T>;
    #sinkObserver?: Observer<T>;
    #deferredPayload?: T;
    #lastEmitAt?: number;
    #emitTimer?: Timer;

    constructor(config?: QuietObservable.Configuration<T>) {
        super();
        if (config) {
            this.config = config;
        }
    }

    get config() {
        return this;
    }

    set config(config: QuietObservable.Configuration<T>) {
        const { suppressionEnabled, minimumEmitInterval, emitAutomatically } = config;
        if (emitAutomatically !== undefined) {
            this.emitAutomatically = emitAutomatically;
        }
        if (suppressionEnabled !== undefined) {
            this.suppressionEnabled = suppressionEnabled;
        }
        if (minimumEmitInterval !== undefined) {
            this.minimumEmitInterval = minimumEmitInterval;
        }
        if ("shouldEmit" in config) {
            this.shouldEmit = config.shouldEmit;
        }
        if ("source" in config) {
            this.source = config.source;
        }
        if ("sink" in config) {
            this.sink = config.sink;
        }
        if ("handleError" in config) {
            this.handleError = config.handleError ?? defaultErrorHandler;
        }
        if ("handlePromise" in config && config.handlePromise) {
            this.handlePromise = config.handlePromise;
        } else {
            this.isAsync = config.isAsync ?? false;
        }
    }

    get emitAutomatically() {
        return this.#emitAutomatically;
    }

    set emitAutomatically(value: boolean) {
        this.#emitAutomatically = value;
        if (value) {
            this.emitSoon();
        } else if (this.#emitTimer) {
            this.#stop();
        }
    }

    get suppressionEnabled() {
        return this.#suppressionEnabled;
    }

    set suppressionEnabled(value: boolean) {
        this.#suppressionEnabled = value;
    }

    get minimumEmitInterval() {
        return this.#minimumEmitInterval;
    }

    set minimumEmitInterval(value: Duration) {
        if (this.#minimumEmitInterval === value) {
            return;
        }
        const needStart = this.#emitTimer !== undefined;
        if (needStart) {
            this.#stop();
        }
        this.#minimumEmitInterval = value;
        if (needStart) {
            this.#start();
        }
    }

    get source() {
        return this.#source;
    }

    set source(source: Observable<T> | undefined) {
        if (this.#source === source) {
            return;
        }
        if (this.#source && this.#sourceObserver) {
            this.#source.off(this.#sourceObserver);
        } else if (this.#sourceObserver === undefined) {
            this.#sourceObserver = this.emit.bind(this);
        }
        this.#source = source;
        if (source) {
            source.on(this.#sourceObserver);
        }
    }

    get sink() {
        return this.#sink;
    }

    set sink(sink: Observable<T> | undefined) {
        if (this.#sink === sink) {
            return;
        }
        if (this.#sink && this.#sinkObserver) {
            this.off(this.#sinkObserver);
        }
        this.#sink = sink;
        if (sink) {
            this.#sinkObserver = (...payload) => sink.emit(...payload);
            this.#sinkObserver[observant] = false;
            this.on(this.#sinkObserver);
        }
    }

    get shouldEmit() {
        return this.#shouldEmit;
    }

    set shouldEmit(shouldEmit: QuietObservable.EmitPredicate<T> | undefined) {
        this.#shouldEmit = shouldEmit;
        if (this.#deferredPayload && shouldEmit?.(...this.#deferredPayload) === false) {
            this.#deferredPayload = undefined;
            this.#stop();
        }
    }

    override get isObserved() {
        return super.isObserved || this.#sink?.isObserved || false;
    }

    override isObservedBy(observer: Observer<T>): boolean {
        return this.#sink?.isObservedBy(observer) || this.isObservedBy(observer) || false;
    }

    override emit(...payload: T) {
        const shouldEmit = this.#shouldEmit?.(...payload);
        if (shouldEmit === false) {
            return;
        }
        const immediate = shouldEmit === "now";
        if (!immediate && !this.#emitAutomatically) {
            this.#deferredPayload = payload;
            return;
        }
        const now = Time.nowMs;
        if (
            immediate ||
            !this.#suppressionEnabled ||
            this.#lastEmitAt === undefined ||
            this.#lastEmitAt + this.#minimumEmitInterval < now
        ) {
            return this.#emit(payload, now);
        }
        this.#deferredPayload = payload;
        this.#start(now);
    }

    /**
     * Emit immediately, regardless of suppression configuration.
     */
    emitNow() {
        this.#stop();
        if (this.#deferredPayload) {
            this.#emit(this.#deferredPayload);
            this.#deferredPayload = undefined;
        }
    }

    /**
     * Emit as soon as allowed by suppression.
     */
    emitSoon() {
        if (this.#deferredPayload && this.#emitTimer === undefined) {
            this.#start();
        }
    }

    override [Symbol.dispose]() {
        this.#stop();
    }

    #emit(payload: T, now?: number) {
        this.#deferredPayload = undefined;
        this.#lastEmitAt = now ?? Time.nowMs;
        this.#stop();
        super.emit(...payload);
    }

    #start(now?: number) {
        if (this.#emitTimer || this.#deferredPayload === undefined) {
            return;
        }

        let timeout: Duration;
        if (this.#lastEmitAt === undefined) {
            timeout = Instant;
        } else {
            timeout = Millis(this.#minimumEmitInterval - ((now ?? Time.nowMs) - this.#lastEmitAt));
        }

        if (timeout <= 0) {
            this.emitNow();
        } else {
            this.#emitTimer = Time.getTimer("delayed emit", timeout, this.emitNow.bind(this));
            this.#emitTimer.start();
        }
    }

    #stop() {
        if (this.#emitTimer) {
            this.#emitTimer.stop();
            this.#emitTimer = undefined;
        }
    }
}

export namespace QuietObservable {
    export interface State<T extends any[] = any[]> {
        /**
         * If true this observable will emit within the suppression constraints.  If false it will only emit after calls
         * to {@link emitSoon} or {@link emitNow}.
         */
        emitAutomatically: boolean;

        /**
         * If true then emit rate is constrained.  If false emits will occur immediately.
         */
        suppressionEnabled: boolean;

        /**
         * The minimum time between emits in milliseconds.
         */
        minimumEmitInterval: Duration;

        /**
         * An input observable this observable will automatically observe to produce events.
         */
        source?: Observable<T>;

        /**
         * An output observable this observable will automatically emit to whenever it emits.
         */
        sink?: Observable<T>;

        /**
         * A predicate that determine whether a payload should emit.
         */
        shouldEmit?: EmitPredicate<T>;

        /**
         * Handler for errors returned by observers.
         */
        handleError?: ObserverErrorHandler;

        /**
         * Designates async support (overridden if you supply {@link handlePromise}).
         */
        isAsync?: boolean;

        /**
         * Handler for promises returned by observers.
         */
        handlePromise?: ObserverPromiseHandler;
    }

    /**
     * An emit predicate may emit this value to force immediate emit.
     */
    export const now = "now";

    /**
     * The return value of an emit predicate.  "true" allows the event to emit as normal, "false" prevents the event
     * from emitting, and {@link now} forces immediate emit regardless of interval configuration.
     */
    export type EmitDirective = true | false | typeof now;

    /**
     * A predicate that may filter emits manually.
     */
    export interface EmitPredicate<T extends any[] = any[]> {
        (...payload: T): EmitDirective;
    }

    export interface Configuration<T extends any[] = any[]> extends Partial<State<T>> {}

    export const defaults: State = {
        emitAutomatically: true,
        suppressionEnabled: true,
        minimumEmitInterval: Seconds.one,
    };
}
