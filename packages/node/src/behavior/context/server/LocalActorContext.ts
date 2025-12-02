/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import type { Agent } from "#endpoint/Agent.js";
import { Diagnostic, InternalError, Lifetime, MaybePromise, Transaction } from "#general";
import { AccessLevel } from "#model";
import { AccessControl } from "#protocol";
import { Contextual } from "../Contextual.js";
import type { NodeActivity } from "../NodeActivity.js";
export let nextInternalId = 1;

let ReadOnly: LocalActorContext | undefined;

export interface LocalActorContext extends ValueSupervisor.LocalActorSession {
    /**
     * @deprecated use `context.fabric === undefined` or `hasLocalActor(context)` to detect a local actor
     */
    offline: true;
}

/**
 * The context for operations triggered locally, either for in-process node implementations or remote nodes that are
 * peers of a local node.
 *
 * You can also use {@link LocalActorContext.ReadOnly} for read-only {@link Agent} access.
 */
export const LocalActorContext = {
    /**
     * Operate on behalf of a local actor.  This is the context for operations on nodes initiated locally, without
     * authentication.
     *
     * {@link act} provides an {@link ActionContext} you can use to access agents for a {@link Endpoint}.
     * State changes and change events occur once {@link actor} returns.
     * It can return a promise even if the actor method does not return a promise, so manual checks are needed.
     *
     * The {@link Transaction} is destroyed with {@link act} exits so you should not keep a reference to any agents
     * beyond the lifespan of {@link actor}.
     *
     * Offline context is very permissive.  You should use carefully.
     */
    act<T>(
        purpose: string,
        actor: (context: LocalActorContext) => MaybePromise<T>,
        options?: LocalActorContext.Options,
    ): MaybePromise<T> {
        const context = this.open(purpose, options);

        let result;
        try {
            result = actor(context);
        } catch (e) {
            return context.reject(e);
        }

        return context.resolve(result);
    },

    /**
     * Create an offline context.
     *
     * This context operates with a {@link Transaction} created via {@link Transaction.open} and the same rules
     * apply for lifecycle management using {@link Transaction.Finalization}.
     */
    open(purpose: string, options?: LocalActorContext.Options): LocalActorContext & Transaction.Finalization {
        const id = nextInternalId;
        nextInternalId = (nextInternalId + 1) % 65535;
        const via = Diagnostic.via(`${purpose}#${id.toString(16)}`);

        let frame: NodeActivity.Activity | undefined;
        let transaction: (Transaction & Transaction.Finalization) | undefined;

        try {
            frame = options?.activity?.begin(via);

            transaction = Transaction.open(via, options?.lifetime ?? Lifetime.process, options?.isolation);

            if (frame) {
                transaction.onClose(frame.close.bind(frame));
            }

            const context = Object.freeze({
                ...options,

                transaction,
                activity: frame,

                authorityAt(desiredAccessLevel: AccessLevel) {
                    // Be as restrictive as possible.  The offline flag should make this irrelevant
                    return desiredAccessLevel === AccessLevel.View
                        ? AccessControl.Authority.Granted
                        : AccessControl.Authority.Unauthorized;
                },

                get [Contextual.context]() {
                    return this;
                },

                [Symbol.toStringTag]: "OfflineContext",

                resolve: transaction.resolve.bind(transaction),
                reject: transaction.reject.bind(transaction),

                offline: true,
            });

            return context;
        } catch (e) {
            if (transaction) {
                transaction.reject(e);
            } else {
                frame?.close();
                throw e;
            }
        }

        // Should not get here because we should either return context or throw synchronously
        throw new InternalError("Unexpected end of open");
    },

    /**
     * Normally you need to use {@link LocalActorContext.act} to work with behaviors, and you can only interact with the
     * behaviors in the actor function.  This {@link ActionContext} allows you to create offline agents that remain
     * functional for the lifespan of the node.
     *
     * Write operations will throw an error with this context.
     */
    get ReadOnly() {
        if (ReadOnly === undefined) {
            ReadOnly = LocalActorContext.open("read-only", { isolation: "ro" });
        }
        return ReadOnly;
    },

    [Symbol.toStringTag]: "OfflineContext",
};

export namespace LocalActorContext {
    /**
     * {@link LocalActorContext} configuration options.
     */
    export interface Options {
        lifetime?: Lifetime.Owner;
        command?: boolean;
        activity?: NodeActivity;
        isolation?: Transaction.IsolationLevel;
    }
}
