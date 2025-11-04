/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Identify } from "#clusters/identify";

export namespace IdentifyInterface {
    export interface Base {
        /**
         * This command starts or stops the receiving device identifying itself.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.1
         */
        identify(request: Identify.IdentifyRequest): MaybePromise;

        /**
         * This command allows the support of feedback to the user, such as a certain light effect. It is used to allow
         * an implementation to provide visual feedback to the user under certain circumstances such as a color light
         * turning green when it has successfully connected to a network. The use of this command and the effects
         * themselves are entirely up to the implementer to use whenever a visual feedback is useful but it is not the
         * same as and does not replace the identify mechanism used during commissioning.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.2
         */
        triggerEffect(request: Identify.TriggerEffectRequest): MaybePromise;
    }
}

export type IdentifyInterface = { components: [{ flags: {}, methods: IdentifyInterface.Base }] };
