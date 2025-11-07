/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InteractionSession } from "#action/Interactable.js";
import { NodeProtocol } from "#action/protocols.js";
import { AccessControl } from "#action/server/AccessControl.js";
import { AccessLevel } from "#model";
import { BitmapSchema, NodeId, WildcardPathFlagsBitmap } from "#types";

export const WildcardPathFlagsCodec = BitmapSchema(WildcardPathFlagsBitmap);
export const FallbackLimits: AccessControl.Limits = {
    fabricScoped: false,
    fabricSensitive: false,
    readable: true,
    readLevel: AccessLevel.View,
    timed: false,
    largeMessage: false,
    writable: true,
    writeLevel: AccessLevel.Administer,
};

export abstract class DataResponse<SessionT extends InteractionSession = InteractionSession> {
    // Configuration
    #session: SessionT;
    #node: NodeProtocol;

    // The node ID may be expensive to retrieve and is invariant, so we cache it here
    #cachedNodeId?: NodeId;

    constructor(node: NodeProtocol, session: SessionT) {
        this.#node = node;
        this.#session = session;
    }

    protected get node() {
        return this.#node;
    }

    protected get session() {
        return this.#session;
    }

    /**
     * The node ID used to filter paths with node ID specified.  Unsure if this is ever actually used.
     */
    protected get nodeId() {
        if (this.#cachedNodeId === undefined) {
            this.#cachedNodeId =
                (this.#session.fabric && this.#node.nodeIdFor(this.#session.fabric)) ?? NodeId.UNSPECIFIED_NODE_ID;
        }
        return this.#cachedNodeId;
    }

    abstract counts: {
        /**
         * Number of existent entries that were processed. Not all must have had data to send.
         */
        existent: number;

        /**
         * Number of status responses (aka errors we have sent)
         */
        status: number;

        /**
         * Number of success or value responses (aka success we have sent)
         */
        success: number;
    };
}
