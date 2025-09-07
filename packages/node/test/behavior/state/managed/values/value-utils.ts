/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { camelize, Identity, MaybePromise, MockCrypto, Observable } from "#general";
import { DataModelPath, FieldElement, FieldModel } from "#model";
import type { Node } from "#node/Node.js";
import { Val } from "#protocol";
import { ClusterId, EndpointNumber } from "#types";

/**
 * Create schema for a single field.
 */
export function fieldOf(name: string, definition: string | Partial<FieldElement>) {
    if (typeof definition === "string") {
        definition = { type: definition };
    }
    return FieldElement({
        ...definition,
        name,
    });
}

/**
 * Create a struct with specified properties.
 */
export function structOf(fields: Record<string, string | Partial<FieldElement>>, structType?: Partial<FieldElement>) {
    return FieldElement({
        name: "Struct",
        type: "struct",

        ...structType,

        children: Object.entries(fields).map(([name, definition]) => fieldOf(name, definition)),
    });
}

/**
 * Create a list of specified entry type.
 */
export function listOf(entryType: string | Partial<FieldElement>, listType?: Partial<FieldElement>) {
    return FieldElement({
        name: "List",
        type: "list",

        ...listType,

        children: [fieldOf("entry", entryType)],
    });
}

export interface Online2 {
    cx1: ActionContext;
    cx2: ActionContext;
    ref1: Val.Struct;
    ref2: Val.Struct;
}

class TestState {}

/**
 * Utility for creating a managed struct via a datasource.
 */
export function TestStruct(fields: Record<string, string | Partial<FieldElement>>, defaults: Val.Struct = {}) {
    const supervisor = RootSupervisor.for(new FieldModel(structOf(fields)));

    const notifies: { index: string | undefined; oldValue: Val; newValue: Val }[] = [];

    const events = {} as Record<string, Observable<any>>;
    for (const index in fields) {
        const observable = Observable();
        events[`${camelize(index)}$Changed`] = observable;
        observable.on((newValue: Val, oldValue: Val) => {
            notifies.push({ index, oldValue, newValue });
        });
    }

    const datasource = Datasource({
        crypto: MockCrypto(),
        location: {
            endpoint: EndpointNumber(1),
            cluster: ClusterId(1),
            path: DataModelPath("TestStruct"),
        },
        type: TestState,
        supervisor,
        defaults,
        events,
    });

    return {
        get fields() {
            return datasource.view as Val.Struct;
        },
        notifies,

        expect(expected: Val.Struct) {
            expect(this.fields).deep.equals(expected);
        },

        online(cx: RemoteActorContext.Options, actor: (ref: Val.Struct, cx: ActionContext) => MaybePromise) {
            return RemoteActorContext(cx).act(cx => actor(this.reference(cx), cx));
        },

        online2(
            cx1: RemoteActorContext.Options,
            cx2: RemoteActorContext.Options,
            actor: (online: Online2) => MaybePromise,
        ) {
            return this.online(cx1, (ref1, cx1) => this.online(cx2, (ref2, cx2) => actor({ cx1, cx2, ref1, ref2 })));
        },

        reference(context: ValueSupervisor.Session) {
            return datasource.reference(context) as Val.Struct;
        },
    };
}

export type TestStruct = Identity<ReturnType<typeof TestStruct>>;

export function aclEndpoint() {
    return {
        protocol: {
            1: {
                deviceTypes: [],
            },
        },
    } as unknown as Node;
}
