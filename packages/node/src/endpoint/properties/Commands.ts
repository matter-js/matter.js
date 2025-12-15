/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import type { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { EndpointType } from "#endpoint/type/EndpointType.js";
import { NotImplementedError } from "#general";

export type Commands<T extends EndpointType> = {
    [K in keyof T["behaviors"]]: Commands.OfBehavior<T["behaviors"][K]>;
};

export function Commands<T extends EndpointType = EndpointType.Empty>(endpoint: Endpoint<T>) {
    const commands: Record<string, unknown> = {};

    return new Proxy(commands, {
        get(target, property, receiver) {
            if (Object.hasOwn(commands, property)) {
                return commands[property as keyof typeof commands];
            }

            const behavior = (endpoint.behaviors.supported as Record<string, Behavior.Type>)[property as string];
            if (typeof behavior === "function" && "schema" in behavior) {
                return (commands[property as keyof typeof commands] = BehaviorCommands(endpoint, behavior));
            }

            return Reflect.get(target, property, receiver);
        },
    }) as Commands<T>;
}

function BehaviorCommands(endpoint: Endpoint, type: Behavior.Type) {
    return new Proxy(
        {},
        {
            get(target, property, receiver) {
                if (typeof property !== "string" || property in Object.prototype) {
                    return Reflect.get(target, property, receiver);
                }

                return Implementation(endpoint, type, property);
            },
        },
    );
}

function Implementation(endpoint: Endpoint, type: Behavior.Type, name: string): Commands.Command {
    return {
        [name](input: unknown, context?: ActionContext) {
            // Invoke with existing context
            if (context) {
                return Promise.resolve(invokerFor(context)(input, context));
            }

            // Invoke with a dedicated context
            const context2 = LocalActorContext.open(`invoke-${name}`, { lifetime: endpoint.construction });
            try {
                return Promise.resolve(context2.resolve(invokerFor(context2)(input, context)));
            } catch (e) {
                return Promise.resolve(context2.reject(e));
            }

            // Create a function to perform invocation
            function invokerFor(context: ActionContext) {
                const agent = endpoint.agentFor(context);
                const behavior = agent.get(type);
                const method = (behavior as unknown as Record<string, Commands.Command>)[name];
                if (typeof method !== "function") {
                    throw new NotImplementedError(`Command ${name} is not implemented`);
                }
                return method.bind(behavior);
            }
        },
    }[name];
}

export namespace Commands {
    export interface Command<C extends (arg: unknown) => unknown = (arg: unknown) => unknown> {
        (input: Parameters<C>[0], context?: ActionContext): Promise<Awaited<ReturnType<C>>>;
    }

    export type OfBehavior<T extends Behavior.Type> = {
        [K in keyof InstanceType<T>]: InstanceType<T>[K] extends (arg: any) => any
            ? Command<InstanceType<T>[K]>
            : never;
    };
}
