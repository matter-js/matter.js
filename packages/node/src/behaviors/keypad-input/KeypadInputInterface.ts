/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { KeypadInput } from "#clusters/keypad-input";

export namespace KeypadInputInterface {
    export interface Base {
        /**
         * Upon receipt, this shall process a keycode as input to the media endpoint.
         *
         * If a device has multiple media endpoints implementing this cluster, such as a casting video player endpoint
         * with one or more content app endpoints, then only the endpoint receiving the command shall process the
         * keycode as input. In other words, a specific content app endpoint shall NOT process a keycode received by a
         * different content app endpoint.
         *
         * If a second SendKey request with the same KeyCode value is received within 200 ms, then the endpoint will
         * consider the first key press to be a press and hold. When such a repeat KeyCode value is not received within
         * 200 ms, then the endpoint will consider the last key press to be a release.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.8.6.1
         */
        sendKey(request: KeypadInput.SendKeyRequest): MaybePromise<KeypadInput.SendKeyResponse>;
    }
}

export type KeypadInputInterface = { components: [{ flags: {}, methods: KeypadInputInterface.Base }] };
