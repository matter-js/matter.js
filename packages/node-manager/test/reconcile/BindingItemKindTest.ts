/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BindingGrant, BindingItemKind } from "#reconcile/BindingItemKind.js";
import { ClientNode, ManagedItem } from "@matter/node";
import { ClusterId, EndpointNumber, FabricIndex, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";

type Target = Binding.Target;

const LOCAL_EP = 1;

function fakePeer(initial: Target[], localEp = LOCAL_EP) {
    const store = { binding: [...initial] };
    const endpoint = {
        async getStateOf(_behavior: unknown, fields?: string[]) {
            if (fields === undefined) {
                return { ...store };
            }
            const out: Record<string, unknown> = {};
            for (const f of fields) {
                out[f] = store[f as keyof typeof store];
            }
            return out;
        },
        async setStateOf(_behavior: unknown, values: { binding: Target[] }) {
            store.binding = values.binding.map(t => ({ ...t, fabricIndex: FabricIndex(1) }));
        },
    };
    const node = {
        endpoints: {
            has: (n: number) => n === localEp,
            for: (n: number) => {
                if (n !== localEp) {
                    throw new Error(`no endpoint ${n}`);
                }
                return endpoint;
            },
        },
    } as unknown as ClientNode;
    return { node, store };
}

const grant: BindingGrant = {
    localEndpoint: LOCAL_EP,
    target: { node: NodeId(0x99n), endpoint: EndpointNumber(1), cluster: ClusterId(6) },
};

function item(g: BindingGrant): ManagedItem<BindingGrant> {
    return {
        kind: "binding",
        key: "k1",
        intent: g,
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
    };
}

function foreign(): Target {
    return { node: NodeId(0x11n), endpoint: EndpointNumber(2), cluster: ClusterId(8), fabricIndex: FabricIndex(1) };
}

describe("BindingItemKind", () => {
    it("apply appends our target and preserves foreign bindings", async () => {
        const kind = new BindingItemKind();
        const { node, store } = fakePeer([foreign()]);
        await kind.apply(node, item(grant));
        expect(store.binding.length).equals(2);
        expect(store.binding.some(t => t.node === NodeId(0x11n))).equals(true);
        expect(store.binding.some(t => t.node === NodeId(0x99n) && t.cluster === ClusterId(6))).equals(true);
    });

    it("apply is a no-op when our target is already present", async () => {
        const kind = new BindingItemKind();
        const present: Target = {
            node: NodeId(0x99n),
            endpoint: EndpointNumber(1),
            cluster: ClusterId(6),
            fabricIndex: FabricIndex(1),
        };
        const { node, store } = fakePeer([present]);
        await kind.apply(node, item(grant));
        expect(store.binding.length).equals(1);
    });

    it("verify is true when present, false when removed behind us", async () => {
        const kind = new BindingItemKind();
        const { node, store } = fakePeer([]);
        await kind.apply(node, item(grant));
        expect(await kind.verify(node, item(grant))).equals(true);
        store.binding = [];
        expect(await kind.verify(node, item(grant))).equals(false);
    });

    it("remove drops only our target", async () => {
        const kind = new BindingItemKind();
        const { node, store } = fakePeer([foreign()]);
        await kind.apply(node, item(grant));
        await kind.remove(node, item(grant));
        expect(store.binding.length).equals(1);
        expect(store.binding[0].node).equals(NodeId(0x11n));
    });

    it("verify returns false when the local endpoint is absent", async () => {
        const kind = new BindingItemKind();
        const { node } = fakePeer([]);
        expect(await kind.verify(node, item({ ...grant, localEndpoint: 99 }))).equals(false);
    });

    it("apply throws when the local endpoint is absent", async () => {
        const kind = new BindingItemKind();
        const { node } = fakePeer([]);
        let threw = false;
        try {
            await kind.apply(node, item({ ...grant, localEndpoint: 99 }));
        } catch {
            threw = true;
        }
        expect(threw).equals(true);
    });
});
