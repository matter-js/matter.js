/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { AsyncObservable, Diagnostic, InternalError, MaybePromise, Transaction } from "#general";
import { AccessLevel } from "#model";
import type { Node } from "#node/Node.js";
import type { Message, NodeProtocol } from "#protocol";
import { AccessControl, AclEndpointContext, FabricAccessControl, MessageExchange, SecureSession } from "#protocol";
import { FabricIndex, Priority } from "#types";
import { Contextual } from "../Contextual.js";
import { NodeActivity } from "../NodeActivity.js";

export interface RemoteActorContext extends ValueSupervisor.RemoteActorSession {
    /**
     * Override for {@link ValueSupervisor.RemoteActorSession} to specialize the context.
     */
    interactionComplete?: AsyncObservable<[context?: RemoteActorContext]>;

    /**
     * The Matter session in which an interaction occurs.
     */
    session: SecureSession;

    /**
     * The Matter exchange in which an interaction occurs.
     */
    exchange: MessageExchange;

    /**
     * The wire message that initiated invocation.
     */
    message?: Message;

    /**
     * Activity tracking information.  If present, activity frames are inserted at key points for diagnostic
     * purposes.
     */
    activity?: NodeActivity.Activity;

    /**
     * The priority of actions in this context.
     */
    priority?: Priority;

    /**
     * @deprecated use `context.fabric !== undefined` or `hasRemoteActor(context)` to detect a remote actor
     */
    offline?: false;
}

/**
 * Caches completion events per exchange. Uses if multiple OnlineContext instances are created for an exchange.
 * Entries will be cleaned up when the exchange is closed.
 */
const exchangeCompleteEvents = new WeakMap<
    MessageExchange,
    AsyncObservable<[session?: RemoteActorContext | undefined]>
>();

/**
 * The context for operations triggered by an authenticated peer.  Public Matter interactions use this context.
 */
export function RemoteActorContext(options: RemoteActorContext.Options) {
    let nodeProtocol: NodeProtocol | undefined;
    let accessLevelCache: Map<AccessControl.Location, number[]> | undefined;

    const { exchange, message } = options;
    const session = exchange.session;

    SecureSession.assert(session);
    const fabric = session.fabric;
    const subject = session.subjectFor(message);
    // Without a fabric, we assume default PASE based access controls and use a fresh FabricAccessControlManager instance
    const accessControl = fabric?.accessControl ?? new FabricAccessControl();

    // If we have subjects, the first is the main one, used for diagnostics
    const via = Diagnostic.via(
        `online#${message?.packetHeader?.messageId?.toString(16) ?? "?"}@${subject.id.toString(16)}`,
    );

    return {
        /**
         * Operate on behalf of a remote actor.
         *
         * If the actor changes state, this may return a promise even if {@link actor} does not return a promise.
         */
        act<T>(actor: (context: RemoteActorContext) => MaybePromise<T>): MaybePromise<T> {
            const context = this.open();

            let result;
            try {
                result = actor(context);
            } catch (e) {
                return context.reject(e);
            }

            return context.resolve(result);
        },

        /**
         * Create an online context.
         *
         * This context operates with a {@link Transaction} created via {@link Transaction.open} and the same rules
         * apply for lifecycle management using {@link Transaction.Finalization}.
         */
        open(): RemoteActorContext & Transaction.Finalization {
            let close;
            let tx;
            try {
                close = initialize();
                tx = Transaction.open(via);
                tx.onClose(close);
            } catch (e) {
                close?.();
                throw e;
            }

            return createContext(tx, {
                resolve: tx.resolve.bind(tx),
                reject: tx.reject.bind(tx),
            });
        },

        /**
         * Begin an operation with a read-only context.
         *
         * A read-only context offers simpler lifecycle semantics than a r/w OnlineContext but you must still close the
         * context after use to properly deregister activity.
         */
        beginReadOnly() {
            const close = initialize();

            return createContext(Transaction.open(via, "snapshot"), {
                [Symbol.dispose]: close,
            }) as RemoteActorContext.ReadOnly;
        },

        [Symbol.toStringTag]: "OnlineContext",
    };

    /**
     * Initialization stage one - initialize everything common to r/o and r/w contexts
     */
    function initialize() {
        const activity = options.activity?.frame(via);

        const close = () => {
            if (message) {
                Contextual.setContextOf(message, undefined);
            }
            if (activity) {
                activity[Symbol.dispose]();
            }
        };

        return close;
    }

    /**
     * Initialization stage two - create context object after obtaining transaction
     */
    function createContext<T extends {}>(transaction: Transaction, methods: T) {
        if (session) {
            SecureSession.assert(session);
        }
        let interactionComplete: AsyncObservable<[session?: RemoteActorContext | undefined]> | undefined;
        if (exchange !== undefined) {
            interactionComplete = exchangeCompleteEvents.get(exchange);
            if (interactionComplete === undefined) {
                interactionComplete = new AsyncObservable();
                exchangeCompleteEvents.set(exchange, interactionComplete);
            }

            const notifyInteractionComplete = () => {
                exchange.closing.off(notifyInteractionComplete);
                exchangeCompleteEvents.delete(exchange);
                if (context.interactionComplete?.isObserved) {
                    context.interactionComplete.emit(context);
                }
            };
            exchange.closing.on(notifyInteractionComplete);
        }
        const context: RemoteActorContext & T = {
            ...options,
            session,
            exchange,
            subject,
            largeMessage: exchange?.session.supportsLargeMessages,
            offline: false,

            fabric: fabric?.fabricIndex ?? FabricIndex.NO_FABRIC,
            transaction,

            interactionComplete,

            ...methods,

            // TODO - Matter 1.4 - add support for ARLs
            authorityAt(desiredAccessLevel: AccessLevel, location?: AccessControl.Location) {
                if (location === undefined) {
                    throw new InternalError("AccessControl.Location is required");
                }

                // We already checked access levels in this transaction, so reuse it
                const cachedAccessLevels = accessLevelCache?.get(location);
                if (cachedAccessLevels !== undefined) {
                    return cachedAccessLevels.includes(desiredAccessLevel)
                        ? AccessControl.Authority.Granted
                        : AccessControl.Authority.Unauthorized;
                }

                if (options.node === undefined) {
                    throw new InternalError("OnlineContext initialized without node");
                }

                const accessLevels = accessControl.accessLevelsFor(context, location, aclEndpointContextFor(location));

                if (accessLevelCache === undefined) {
                    accessLevelCache = new Map();
                }
                accessLevelCache.set(location, accessLevels);

                return accessLevels.includes(desiredAccessLevel)
                    ? AccessControl.Authority.Granted
                    : AccessControl.Authority.Unauthorized;
            },

            get [Contextual.context](): RemoteActorContext {
                return this;
            },
        };

        if (message) {
            Contextual.setContextOf(message, context);
        }

        return context;
    }

    /**
     * Access endpoint metadata required for access control.
     */
    function aclEndpointContextFor({ endpoint: number }: AccessControl.Location): AclEndpointContext {
        if (number === undefined) {
            throw new InternalError("Online location missing required endpoint number");
        }

        if (options.node === undefined) {
            throw new InternalError("Online context has no node defined");
        }

        if (nodeProtocol === undefined) {
            nodeProtocol = options.node.protocol;
        }

        const endpoint = nodeProtocol[number];
        if (endpoint !== undefined) {
            return endpoint;
        }

        // For non-existent endpoints create a fallback structure to still do basic endpoint-based ACL checks
        return {
            id: number,
            deviceTypes: [],
        };
    }
}

export namespace RemoteActorContext {
    export type Options = {
        node: Node;
        exchange: MessageExchange;
        activity?: NodeActivity.Activity;
        command?: boolean;
        timed?: boolean;
        fabricFiltered?: boolean;
        message?: Message;
    };

    export interface ReadOnly extends RemoteActorContext {
        [Symbol.dispose](): void;
    }
}
