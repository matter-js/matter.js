/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { deepCopy, Environment, InternalError, Observer } from "#general";
import { MockEndpointType } from "../behavior/mock-behavior.js";
import { MockServerNode } from "../node/mock-server-node.js";

export class MockBehavior1 extends Behavior {
    static override readonly id = "one";
}

export namespace MockBehavior1 {
    export class State extends Behavior.State {
        b1e = "foo";
        b1f = "bar";
    }
}

export class MockBehavior2 extends Behavior {
    static override readonly id = "two";
}

export namespace MockBehavior2 {
    export class State extends Behavior.State {
        b2e = "biz";
        b2f = "baz";
    }
}

const activeParts = new Set<MockEndpoint<any>>();

// I think we can get by without this
// afterEach(async () => {
//     while (activeParts.size) {
//         await activeParts[Symbol.iterator]().next().value?.close();
//     }
// });

export class MockEndpoint<T extends EndpointType> extends Endpoint<T> {
    constructor(definition: T | MockEndpoint.Configuration<T>);

    constructor(type: T, options: MockEndpoint.Options<T>);

    constructor(definition: T | MockEndpoint.Configuration<T>, options?: MockEndpoint.Options<T>) {
        const config = Endpoint.configurationFor(definition, options);

        if (!("owner" in config)) {
            config.owner = new MockServerNode(MockServerNode.RootEndpoint, {
                id: "node0",
                environment: config.environment as Environment | undefined,
            });
        }

        super(config);

        activeParts.add(this);
    }

    override async close() {
        activeParts.delete(this);
        await super.close();
    }

    captureEvents<T extends Behavior.Type>(type: T, options?: { names?: Array<keyof InstanceType<T["Events"]>> }) {
        const events = this.events[type.id];
        if (events === undefined) {
            throw new InternalError(`Events unavailable for behavior ${type.id}`);
        }

        const capturedEvents = Array<
            { name: string } & ({ newValue: unknown; oldValue: unknown } | { value: unknown })
        >();

        const names = options?.names ?? Object.keys(events);
        for (const name of names) {
            const event = events[name as keyof typeof events] as { on?: (observer: Observer) => void };
            if (event?.on) {
                if ((name as string).endsWith("$Changed") || (name as string).endsWith("$Changing")) {
                    event.on((newValue, oldValue) => {
                        capturedEvents.push({
                            name: name as string,
                            oldValue: deepCopy(oldValue),
                            newValue: deepCopy(newValue),
                        });
                    });
                } else {
                    event.on(value => {
                        capturedEvents.push({
                            name: name as string,
                            value: deepCopy(value),
                        });
                    });
                }
            }
        }

        return capturedEvents;
    }

    static create<const T extends EndpointType>(
        definition: T | MockEndpoint.Configuration<T>,
    ): Promise<MockEndpoint<T>>;

    static create<const T extends EndpointType>(type: T, options: MockEndpoint.Options<T>): Promise<MockEndpoint<T>>;

    static async create(definition: EndpointType | MockEndpoint.Configuration, options?: MockEndpoint.Options) {
        const endpoint = new MockEndpoint(Endpoint.configurationFor(definition, options));
        return await endpoint.construction.ready;
    }

    static async createWith<T extends Behavior.Type>(type: T) {
        return await MockEndpoint.create(MockEndpointType.with(type));
    }
}

export namespace MockEndpoint {
    export type Options<T extends EndpointType = EndpointType> = Endpoint.Options<T> & { environment?: Environment };
    export type Configuration<T extends EndpointType = EndpointType> = Endpoint.Configuration<T, Options<T>>;
}
