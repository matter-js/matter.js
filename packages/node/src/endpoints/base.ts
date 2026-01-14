/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BindingServer as BaseBindingServer } from "../behaviors/binding/BindingServer.js";
import { FixedLabelServer as BaseFixedLabelServer } from "../behaviors/fixed-label/FixedLabelServer.js";
import { UserLabelServer as BaseUserLabelServer } from "../behaviors/user-label/UserLabelServer.js";

export namespace BaseRequirements {
    /**
     * The Binding cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link BindingServer} for convenience.
     */
    export const BindingServer = BaseBindingServer;

    /**
     * The FixedLabel cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FixedLabelServer} for convenience.
     */
    export const FixedLabelServer = BaseFixedLabelServer;

    /**
     * The UserLabel cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link UserLabelServer} for convenience.
     */
    export const UserLabelServer = BaseUserLabelServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        optional: { Binding: BindingServer, FixedLabel: FixedLabelServer, UserLabel: UserLabelServer },
        mandatory: {}
    };
}

export namespace BaseEndpoint {
    export const requirements = BaseRequirements;
}
