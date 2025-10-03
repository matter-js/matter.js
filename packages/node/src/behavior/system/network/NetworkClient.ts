/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatatypeModel, FieldElement } from "#model";
import { Node } from "#node/Node.js";
import { DEFAULT_MIN_INTERVAL_FLOOR, Subscribe } from "#protocol";
import { CaseAuthenticatedTag } from "#types";
import { ClientNetworkRuntime } from "./ClientNetworkRuntime.js";
import { NetworkBehavior } from "./NetworkBehavior.js";

export class NetworkClient extends NetworkBehavior {
    declare internal: NetworkClient.Internal;
    declare state: NetworkClient.State;

    override initialize() {
        if (this.state.enabledOnStartUp !== undefined) {
            this.state.isEnabled = this.state.enabledOnStartUp;
        }
    }

    override async startup() {
        const { startupSubscription, isEnabled } = this.state;

        if (startupSubscription === null || !isEnabled) {
            return;
        }

        // TODO - configure subscription based on physical device properties
        const subscribe = Subscribe({
            fabricFilter: true,
            minIntervalFloor: DEFAULT_MIN_INTERVAL_FLOOR,
            maxIntervalCeiling: 0,
            attributes: [{}],
            events: [{ isUrgent: true }],
            ...startupSubscription,
        });

        // First, read.  This allows us to retrieve attributes that do not support subscription
        for await (const _chunk of this.#node.interaction.read(subscribe));

        // Now subscribe for subsequent updates
        await this.#node.interaction.subscribe(subscribe);
    }

    get #node() {
        return this.env.get(Node);
    }

    /**
     * Define logical schema for fields that should persist.
     */
    static override readonly schema = new DatatypeModel({
        name: "NetworkState",
        type: "struct",

        children: [
            FieldElement({
                name: "startupSubscription",
                type: "any",
                default: { type: "properties", properties: {} },
                quality: "XN",
            }),

            FieldElement({
                name: "isEnabled",
                type: "bool",
                quality: "N",
                default: true,
            }),

            FieldElement({
                name: "enabledOnStartUp",
                type: "bool",
                quality: "N",
                conformance: "O",
            }),

            FieldElement({
                name: "caseAuthenticatedTags",
                type: "list",
                quality: "N",
                conformance: "O",
                children: [
                    FieldElement({
                        name: "entry",
                        type: "uint32",
                    }),
                ],
            }),
        ],
    });
}

export namespace NetworkClient {
    export class Internal extends NetworkBehavior.Internal {
        declare runtime?: ClientNetworkRuntime;
    }

    export class State extends NetworkBehavior.State {
        /**
         * A subscription installed when the node is first commissioned and when the service is restarted.
         *
         * The default subscription is a wildcard for all attributes of the node.  You can set to undefined or filter
         * the fields and values but only values selected by this subscription will update automatically.
         *
         * Set to null to disable automatic subscription.
         */
        startupSubscription?: Subscribe | null;

        /**
         * Represents the current operational network state of the node. When true the node is enabled and operational.
         * When false the node is disabled and not operational.
         *
         * This state can be changed at any time to enable or disable the node.
         */
        isEnabled = true;

        /**
         * If defined, it overrides the isEnabled state on startup.
         * If not defined the node will start up in the state that it was last in.
         */
        enabledOnStartUp?: boolean;

        /**
         * Case Authenticated Tags (CATs) to use for operational CASE sessions with this node.
         *
         * CATs provide additional authentication context for Matter operational sessions. They are only used
         * for operational CASE connections after commissioning is complete, not during the initial PASE
         * commissioning process.
         */
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
    }
}
