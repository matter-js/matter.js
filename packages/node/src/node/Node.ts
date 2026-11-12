/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { NetworkBehavior } from "#behavior/system/network/NetworkBehavior.js";
import { NetworkRuntime } from "#behavior/system/network/NetworkRuntime.js";
import { PartsBehavior } from "#behavior/system/parts/PartsBehavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Endpoints } from "#endpoint/properties/Endpoints.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import {
    asError,
    Construction,
    DestroyedDependencyError,
    Diagnostic,
    DiagnosticPresentation,
    DiagnosticSource,
    Environment,
    Identity,
    ImplementationError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    MatterError,
    MaybePromise,
} from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { Interactable } from "@matter/protocol";
import type { EndpointNumber } from "@matter/types";
import { RootEndpoint } from "../endpoints/root.js";
import { ProtocolService } from "./integration/ProtocolService.js";
import { NodeLifecycle } from "./NodeLifecycle.js";

const logger = Logger.get("Node");

/**
 * How each {@link Node.IntentCall} is admitted and named: `action` in errors, `operation` in the warning of a long
 * wait.
 */
const INTENT_CALLS: Record<Node.IntentCall, { admission: Node.IntentAdmission; action: string; operation: string }> = {
    start: { admission: "intent", action: "start", operation: "starting" },
    stop: { admission: "stop", action: "stop", operation: "stopping" },
    enable: { admission: "intent", action: "enable", operation: "enabling" },
    disable: { admission: "intent", action: "disable", operation: "disabling" },
    "clear-disabled": {
        admission: "intent",
        action: "clear the disabled flag",
        operation: "clearing the disabled flag of",
    },
};

/**
 * Whether every value of {@link change} holds in {@link intent}.
 */
function holdsIn(intent: object, change: object) {
    return Object.entries(change).every(([key, value]) => Reflect.get(intent, key) === value);
}

/**
 * A Matter Node.
 *
 * In Matter, a "node" is an individually addressable top-level network resource.
 */
export abstract class Node<T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint> extends Endpoint<T> {
    #environment: Environment;
    #runtime?: NetworkRuntime;

    /**
     * The close of the runtime of a failed start, which runs in the background.  The next runtime is created once it
     * ended, as both register their handlers with the same exchange manager.
     */
    #closingRuntime?: Promise<void>;

    constructor(config: Node.Configuration<T>) {
        const parentEnvironment = config.environment ?? config.owner?.env ?? Environment.default;

        // Ensure runtime is shared across components
        void parentEnvironment.root.runtime;

        if (config.id === undefined) {
            config.id = `node${parentEnvironment.vars.increment("node.nextFallbackId")}`;
        }

        super(config);

        // We create a local environment so nodes can offer node-specific services via the environment
        this.#environment = new Environment(config.id, parentEnvironment);

        this.#environment.set(NodeActivity, new NodeActivity());
        this.#environment.set(ProtocolService, new ProtocolService(this));

        if (this.lifecycle.hasNumber) {
            if (this.number !== 0) {
                throw new ImplementationError("The root endpoint ID must be 0");
            }
        } else {
            this.number = 0;
        }

        this.lifecycle.online.on(() => {
            this.statusUpdate("is online");
        });

        this.lifecycle.offline.on(() => {
            this.statusUpdate("is offline");
        });

        this.lifecycle.goingOffline.on(() => {
            this.statusUpdate("going offline");
        });
    }

    override get env() {
        return this.#environment;
    }

    /**
     * Model of Matter semantics understood by this node.  Defaults to the standard model; client nodes may narrow or
     * extend it so remote clusters resolve to real element names.
     */
    get matter(): MatterModel {
        return Matter;
    }

    /**
     * The optimized view that supports local Matter protocol implementation.
     */
    get protocol() {
        return this.env.get(ProtocolService).protocol;
    }

    override get lifecycle(): NodeLifecycle {
        return super.lifecycle as NodeLifecycle;
    }

    /**
     * Bring the node online.
     *
     * A call of {@link start} or {@link stop} records its intent at once and waits for its turn; calls take turns in
     * call order.  At its turn a call applies the current intent if that intent still points in the direction of the
     * call, and skips if a later call reversed the direction:
     *
     * 1. The call resolves only once the node applied the intent in its direction, or once it skipped.
     * 2. The call rejects only if it is refused, or if a step it ran failed: its preparation or its apply.  The intent
     *    is then what the node is, unless a later call recorded another intent.
     * 3. A call followed by a later call of the same direction does not resolve before that direction is applied.
     *
     * A crashed node recovers first as {@link recoverWithMutex} describes; if that fails, the call rejects with the
     * failure and the node stays crashed.
     *
     * Throws {@link DestroyedDependencyError} once a close or delete of the node was requested, and the error of the
     * {@link onlineBlocker} if the node may not go online at its turn.
     */
    async start() {
        await this.requestIntent({ target: "online" }, "start");
    }

    /**
     * What keeps the node from going online now, or undefined if nothing does.  This is the only gate at the node's
     * turn; a check a call makes before it records its intent is a precondition of that call.
     *
     * @internal
     */
    get onlineBlocker(): Node.OnlineBlocker | undefined {
        const cause = this.lifecycle.terminalCause;
        if (cause !== undefined) {
            return { error: () => this.verbs.refusal(cause, "go online") };
        }
    }

    /**
     * Record {@link change} as the intent of {@link call} and apply it at its turn on the node mutex as {@link start}
     * describes.  At its turn the call applies the current intent only if every value of {@link change} still holds in
     * it, so no later call reversed it.
     */
    protected async requestIntent(change: Partial<NodeLifecycle.Intent>, call: Node.IntentCall) {
        const { admission, action, operation } = INTENT_CALLS[call];
        if (!this.#admitOrThrow(admission, action)) {
            return;
        }
        if (
            change.target === "online" &&
            this.lifecycle.isOnline &&
            this.lifecycle.shouldBeOnline &&
            holdsIn(this.appliedIntent, change)
        ) {
            return;
        }

        const ticket = this.lifecycle.request(change);
        try {
            if (change.target === "online") {
                const preparing = this.prepareStart();
                if (MaybePromise.is(preparing)) {
                    await preparing;
                }
            }
            await this.lifecycle.mutex.hold(`${operation} ${this}`, async () => {
                // A close or delete may have been requested while this call waited for the mutex
                if (holdsIn(this.lifecycle.intent, change) && this.#admitOrThrow(admission, action)) {
                    await this.#applyIntentWithMutex();
                }
            });
        } catch (error) {
            this.lifecycle.restore(ticket, this.appliedIntent);
            throw error;
        }
    }

    /**
     * Bring the node online if its intent is online and no {@link onlineBlocker} keeps it offline, else take it
     * offline.  Bringing a crashed node online recovers it first as {@link recoverWithMutex} describes, which for a
     * client node that crashed in an erase is a whole erase.  Records no intent.  The owner of a blocker calls this
     * when the blocker appears or lifts, and only after its own `isOnline` reflects the change.  Does nothing once a
     * close or delete of the node was requested, as that takes the node offline itself.  A failed apply is logged by
     * the caller; the next apply or a {@link start} tries again.
     *
     * @internal
     */
    async applyIntent() {
        if (!this.#admitOrThrow("stop", "apply its intent")) {
            return;
        }
        await this.lifecycle.mutex.hold(`applying the intent of ${this}`, async () => {
            if (this.lifecycle.shouldBeOnline && this.onlineBlocker === undefined) {
                await this.#applyIntentWithMutex();
            } else {
                await this.cancelWithMutex();
            }
        });
    }

    /**
     * Persist the parts of the intent that outlive a restart.  The caller holds the node mutex (level 1 or 4 of the
     * lock order in `LifecycleMutex`).
     */
    protected async persistIntentWithMutex() {}

    /**
     * What the node is: online while its network runtime runs.
     */
    protected get appliedIntent(): NodeLifecycle.Intent {
        return { target: this.#runtime === undefined ? "offline" : "online" };
    }

    /**
     * Bring the node to its current intent, so a call never undoes a later one.  The node goes offline before the
     * intent persists and online only after it persisted, so a failed persist never leaves it online against its
     * intent.  The caller holds the node mutex.
     */
    async #applyIntentWithMutex() {
        if (this.lifecycle.shouldBeOnline) {
            if (this.construction.status === Lifecycle.Status.Crashed) {
                await this.recoverWithMutex();
            }
            await this.persistIntentWithMutex();
            await this.startWithMutex();
            return;
        }

        const errors = new Array<unknown>();
        for (const step of [() => this.cancelWithMutex(), () => this.persistIntentWithMutex()]) {
            try {
                await step();
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length > 1) {
            throw new MatterAggregateError(errors, `Error taking ${this} offline`);
        }
        if (errors.length) {
            throw errors[0];
        }
    }

    /**
     * Bring a crashed node back before it goes online, or reject with the reason it cannot come back.  By default the
     * node resets and initializes again; if the cause of the crash persists, the node crashes again and this rejects
     * with that failure.  An override either recovers the node or rejects.  The caller holds the node mutex (level 1 or
     * 4 of the lock order in `LifecycleMutex`) and the node is offline.
     */
    protected async recoverWithMutex() {
        await this.lifecycle.treeMutex.hold(`recovering ${this}`, () => this.resetWithMutex());
        this.construction.start();
        await this.construction;
    }

    /**
     * Admit a call of {@link requestIntent} or {@link applyIntent}.  Returns whether the call runs, or throws if it is refused.
     */
    #admitOrThrow(call: Node.IntentAdmission, action: string) {
        const admission = this.verbs.admit(call);
        if (admission.decision === "refuse") {
            throw this.verbs.refusal(admission.cause, action);
        }
        return admission.decision !== "skip";
    }

    /**
     * Prepare a {@link start} once it recorded its intent and before it waits for the node mutex.
     */
    protected prepareStart(): MaybePromise<void> {}

    /**
     * Bring the node online.  The caller holds the node mutex (level 1 or 4 of the lock order in `LifecycleMutex`).
     */
    protected async startWithMutex() {
        if (this.isRuntimeWorker) {
            this.env.runtime.add(this);
        }

        try {
            await this.construction.ready;

            if (this.#runtime) {
                return;
            }

            const blocker = this.onlineBlocker;
            if (blocker !== undefined) {
                throw blocker.error();
            }

            await this.#closingRuntime;

            this.statusUpdate("going online");

            this.#runtime = this.createRuntime();
            this.#runtime.construction.start();
            this.#environment.set(NetworkRuntime, this.#runtime);
            await this.#runtime.construction.ready;
            await this.act("network startup", agent => agent.get(NetworkBehavior).startup());
        } catch (e) {
            // If a runtime instance got created, tear it down.  Detach state synchronously to avoid a deadlock:
            // runtime.close() awaits activity.inactive, but we may be called from within an activity (e.g.
            // commissioning) that can't close until we return.  Closing in the background breaks the cycle.
            if (this.#runtime) {
                const runtime = this.#runtime;
                this.#environment.delete(NetworkRuntime, runtime);
                this.#runtime = undefined;
                this.behaviors.internalsOf(NetworkBehavior).runtime = undefined;

                try {
                    await this.act(agent => this.lifecycle.goingOffline.emit(agent.context));
                } catch (error) {
                    logger.warn(`Error reporting that ${this} goes offline after its start failed:`, error);
                }

                this.#closingRuntime = runtime.close().catch(e => {
                    logger.warn("Error closing network runtime", asError(e));
                });
            }
            if (this.isRuntimeWorker) {
                this.env.runtime.delete(this);
            }
            throw e;
        }
    }

    /**
     * @deprecated use {@link start}
     */
    async bringOnline() {
        return this.start();
    }

    /**
     * Run the node in standalone mode.  Returns when the node is closed.
     */
    async run() {
        await this.start();
        await this.construction.closed;
    }

    /**
     * Take the node offline but leave state and structure intact.  Happens automatically on close.
     *
     * Once the node is offline you may use {@link start} to bring the node online again.  Calls take effect as
     * {@link start} describes.  A failed stop still leaves the node offline, as it drops the network runtime first.
     * Does nothing once a close or delete of the node was requested, as that takes the node offline itself.
     */
    async stop() {
        await this.requestIntent({ target: "offline" }, "stop");
    }

    /**
     * @deprecated use {@link stop}
     */
    cancel() {
        return this.stop();
    }

    /**
     * All endpoints owned by the node.
     *
     * Normally you access endpoints via {@link parts} but you can use this property access endpoints directly by
     * {@link EndpointNumber}.
     */
    get endpoints(): Endpoints {
        return new Endpoints(this);
    }

    /**
     * Take the node offline.  The caller holds the node mutex (level 1 or 4 of the lock order in `LifecycleMutex`).
     */
    protected async cancelWithMutex() {
        if (!this.#runtime) {
            return;
        }

        await MatterAggregateError.settleSeries(
            [
                () => this.act(agent => this.lifecycle.goingOffline.emit(agent.context)),
                async () => {
                    const runtime = this.#runtime;
                    if (runtime === undefined) {
                        return;
                    }
                    this.#runtime = undefined;
                    this.#environment.delete(NetworkRuntime, runtime);
                    await runtime.close();
                },
            ],
            `Error taking ${this} offline`,
        );
    }

    /**
     * Run the step of a lifecycle verb of the node while holding the node mutex and then the tree mutex.  The node goes
     * offline first and online again afterwards if its network was running and it should stay online.
     */
    protected override async withLifecycleMutex(operation: string, step: () => Promise<void>) {
        await this.lifecycle.mutex.hold(operation, () => this.#runOffline(operation, step));
    }

    /**
     * Take the node offline, run {@link step} while holding the tree mutex, and bring the node online again if its
     * network was running and it should stay online.  The runtime is not designed to operate with a node whose root
     * resets or closes, so it goes first.  A node that fails to go offline before an erase or to go online again
     * crashes, unless an {@link onlineBlocker} keeps it offline by then.  The node goes offline before the step takes
     * the tree mutex, because a report of the runtime may run a verb of a part that waits for that mutex.
     */
    async #runOffline(operation: string, step: () => Promise<void>) {
        // A peer without a session is offline while its runtime runs and reconnects
        const wasRunning = this.#runtime !== undefined;
        const errors = new Array<unknown>();

        try {
            await this.cancelWithMutex();
        } catch (e) {
            errors.push(e);
            if (!this.lifecycle.isTerminal) {
                this.construction.crash();
                throw new MatterAggregateError(errors, `Error ${operation}`);
            }
        }

        try {
            await this.lifecycle.treeMutex.hold(operation, step);
        } catch (e) {
            errors.push(e);
        }

        if (wasRunning && this.lifecycle.shouldBeOnline && this.construction.status === Lifecycle.Status.Active) {
            try {
                await this.startWithMutex();
            } catch (e) {
                if (this.onlineBlocker !== undefined) {
                    logger.debug(
                        Diagnostic.strong(this.toString()),
                        `stays offline after ${operation} as it cannot go online now:`,
                        e,
                    );
                } else {
                    errors.push(e);

                    // A failed start of the construction crashed it with its cause already
                    if (this.construction.status === Lifecycle.Status.Active) {
                        this.construction.crash();
                    }
                }
            }
        }

        if (errors.length === 1 && errors[0] instanceof MatterAggregateError) {
            throw errors[0];
        }
        if (errors.length) {
            throw new MatterAggregateError(errors, `Error ${operation}`);
        }
    }

    /**
     * Create the network runtime.
     */
    protected abstract createRuntime(): NetworkRuntime;

    /**
     * An {@link Interactable} that allows for execution of Matter interactions against this node.
     */
    abstract interaction: Interactable<ActionContext>;

    abstract readonly nodeType: "server" | "client" | "group";

    protected abstract prepareRuntimeShutdown(): Promise<void>;

    /**
     * Whether the node registers with the environment's runtime when it starts, so that shutting down the runtime
     * closes it.
     */
    protected get isRuntimeWorker() {
        return true;
    }

    /**
     * Sections this node adds to its diagnostics, each a heading followed by its content.
     */
    protected get diagnosticSections(): unknown[] {
        return [];
    }

    get [DiagnosticPresentation.name]() {
        return ["Runtime for", Diagnostic.strong(this.toString())];
    }

    get [Diagnostic.value](): unknown {
        const nodeActivity = this.#environment.get(NodeActivity);
        using _activity = nodeActivity.begin("diagnostics");
        return Diagnostic.node("🧩", this.id, {
            children: [
                Diagnostic.strong("Structure"),
                Diagnostic.list([super[Diagnostic.value]]),
                Diagnostic.strong("Activity"),
                nodeActivity[Diagnostic.value],
                ...this.diagnosticSections,
            ],
        });
    }

    protected override createLifecycle(): NodeLifecycle {
        return new NodeLifecycle(this, { target: "offline" });
    }

    protected statusUpdate(message: string) {
        logger.notice(Diagnostic.strong(this.toString()), message);
    }

    override async [Construction.destruct]() {
        await MatterAggregateError.settleSeries(
            [
                () => this.cancelWithMutex(),
                () => this.#closingRuntime,
                () => super[Construction.destruct](),
                () => DiagnosticSource.delete(this),
                () => this.#environment[Symbol.dispose](),
            ],
            `Error destroying node ${this}`,
        );
    }
}

export namespace Node {
    /**
     * What keeps a node from going online now.
     *
     * @internal
     */
    export interface OnlineBlocker {
        /**
         * Build the error that refuses going online.
         */
        error(): MatterError;
    }

    /**
     * A call that records an intent with `Node.requestIntent()`.
     *
     * @internal
     */
    export type IntentCall = "start" | "stop" | "enable" | "disable" | "clear-disabled";

    /**
     * How a requested close or delete affects a call; see `EndpointVerbs.admit()`.
     *
     * @internal
     */
    export type IntentAdmission = "intent" | "stop";

    export interface NodeOptions extends Endpoint.EndpointOptions {
        environment?: Environment;
    }

    export type Options<
        T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint,
        O extends NodeOptions = NodeOptions,
    > = Endpoint.Options<T, O>;

    export type Configuration<
        T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint,
        O extends NodeOptions = NodeOptions,
    > = Endpoint.Configuration<T, O>;

    export function nodeConfigFor<T extends RootEndpoint, O extends NodeOptions>(
        defaultType: T,
        configuration: undefined | T | Configuration<T>,
        options: Options<T, O>,
    ): Node.Configuration<T, O> {
        if (configuration === undefined) {
            return {
                type: defaultType,
                ...options,
            };
        }
        if ((configuration as EndpointType).deviceType !== undefined) {
            return {
                type: configuration as T,
                ...options,
            };
        }
        return {
            type: defaultType,
            ...configuration,
        } as Node.Configuration<T, O>;
    }

    export function forEndpoint(endpoint: Endpoint): Node {
        const node = endpoint.ownerOfType(RootEndpoint);
        if (node === undefined) {
            throw new ImplementationError(`Cannot complete operation because ${endpoint} is not installed in a node`);
        }
        if (!(node instanceof Node)) {
            throw new ImplementationError(`Root endpoint for ${endpoint} is not a node`);
        }
        return node;
    }

    /**
     * Common root endpoint definition for all nodes.
     */
    export const CommonRootEndpoint = MutableEndpoint({
        name: RootEndpoint.name,
        deviceType: RootEndpoint.deviceType,
        deviceRevision: RootEndpoint.deviceRevision,
        deviceClass: RootEndpoint.deviceClass,
        requirements: RootEndpoint.requirements,
        behaviors: {
            parts: PartsBehavior,
            index: IndexBehavior,
        },
    });

    export interface CommonRootEndpoint extends Identity<typeof CommonRootEndpoint> {}
}
