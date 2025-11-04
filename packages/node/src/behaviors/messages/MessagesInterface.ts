/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Messages } from "#clusters/messages";

export namespace MessagesInterface {
    export interface Base {
        /**
         * Upon receipt, this shall cause the message in the passed fields to be appended to the Messages attribute.
         *
         * If appending the message would cause the number of messages to be greater than the capacity of the list, the
         * device shall NOT append any message to Messages, and shall return a status code of RESOURCE_EXHAUSTED.
         *
         * When displaying a message in response to this command, an indication (ex. visual) of the origin node of the
         * command shall be provided. This could be in the form of a friendly name label which uniquely identifies the
         * node to the user. This friendly name label is typically assigned by the Matter Admin at the time of
         * commissioning and, when it’s a device, is often editable by the user. It might be a combination of a company
         * name and friendly name, for example, ”Acme” or “Acme Streaming Service on Alice’s Phone”.
         *
         * > [!NOTE]
         *
         * > It is currently not specified where the friendly name label can be found on the node, meaning that clients
         *   SHOULD NOT rely on a certain method they happen to observe in a particular server instance, since other
         *   instances could employ a different method.
         *
         * The device SHOULD make it possible for the user to view which nodes have access to this cluster and to
         * individually remove privileges for each node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1
         */
        presentMessagesRequest(request: Messages.PresentMessagesRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2
         */
        cancelMessagesRequest(request: Messages.CancelMessagesRequest): MaybePromise;
    }
}

export type MessagesInterface = { components: [{ flags: {}, methods: MessagesInterface.Base }] };
