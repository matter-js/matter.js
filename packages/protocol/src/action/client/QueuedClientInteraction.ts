/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ClientBdxOptions, ClientBdxResponse } from "#action/client/ClientBdx.js";
import { InteractionSession } from "#action/Interactable.js";
import { ClientInvoke } from "#action/request/Invoke.js";
import { DecodedInvokeResult } from "#action/response/InvokeResult.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { WriteResult } from "#action/response/WriteResult.js";
import { InteractionQueue } from "#peer/InteractionQueue.js";
import { ClientInteraction, ClientInteractionContext, SubscriptionResult } from "./ClientInteraction.js";
import { ClientRead } from "./ClientRead.js";
import { ClientWrite } from "./ClientWrite.js";
import { ClientSubscribe } from "./subscription/ClientSubscribe.js";

export interface QueuedClientInteractionContext extends ClientInteractionContext {
    queue: InteractionQueue;
}

export class QueuedClientInteraction<
    SessionT extends InteractionSession = InteractionSession,
> extends ClientInteraction<SessionT> {
    #queue?: InteractionQueue;

    constructor(options: QueuedClientInteractionContext) {
        super(options);
        this.#queue = options.queue;
    }

    protected get queue() {
        if (this.#queue === undefined) {
            this.#queue = this.environment.get(InteractionQueue);
        }
        return this.#queue;
    }

    /**
     * Read chosen attributes remotely from the node. Known data versions are automatically injected into the request to
     * optimize the read.
     * Therefore, the returned data only contains attributes that have changed since the last read or subscription.
     * TODO: Allow control of data version injection and enrich response with attribute data missing in response due to data versioning?
     */
    override async *read(request: ClientRead, session?: SessionT): ReadResult {
        using _slot = await this.queue.obtainSlot();

        yield* super.read(request, session);
    }

    /**
     * Subscribe to remote events and attributes as defined by {@link request}.
     *
     * matter.js updates local state
     *
     * By default, matter.js subscribes to all attributes and events of the peer and updates {@link ClientNode} state
     * automatically.  So you normally do not need to subscribe manually.
     *
     * When providing the "sustain" flag, a SustainedSubscription is returned immediately. You need to use the events to
     * know when/if a subscription could be established.  This class handles reconnections automatically.
     * When not providing the "sustain" flag, a PeerSubscription is returned after a subscription have been successfully
     * established; or an error is returned if this was not possible.
     */
    override async subscribe<T extends ClientSubscribe>(request: T, session?: SessionT): SubscriptionResult<T> {
        using _slot = await this.queue.obtainSlot();

        return super.subscribe(request, session);
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute writing status information is returned.
     */
    override async write<T extends ClientWrite>(request: T, session?: SessionT): WriteResult<T> {
        using _slot = await this.queue.obtainSlot();

        return super.write(request, session);
    }

    /**
     * Invoke a command remotely on the node.
     * The returned command response is returned as response chunks
     */
    override async *invoke(request: ClientInvoke, session?: SessionT): DecodedInvokeResult {
        using _slot = await this.queue.obtainSlot();

        yield* super.invoke(request, session);
    }

    override async initBdx(request: ClientBdxOptions, session?: SessionT): Promise<ClientBdxResponse> {
        const slot = await this.queue.obtainSlot();

        return { ...(await super.initBdx(request, session)), slot };
    }
}
