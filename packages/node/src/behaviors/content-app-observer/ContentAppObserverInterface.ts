/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ContentAppObserver } from "#clusters/content-app-observer";

export namespace ContentAppObserverInterface {
    export interface Base {
        /**
         * Upon receipt, the data field may be parsed and interpreted. Message encoding is specific to the Content App.
         * A Content App may when possible read attributes from the Basic Information Cluster on the Observer and use
         * this to determine the Message encoding.
         *
         * This command returns a ContentAppMessage Response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1
         */
        contentAppMessage(request: ContentAppObserver.ContentAppMessageRequest): MaybePromise<ContentAppObserver.ContentAppMessageResponse>;
    }
}

export type ContentAppObserverInterface = { components: [{ flags: {}, methods: ContentAppObserverInterface.Base }] };
