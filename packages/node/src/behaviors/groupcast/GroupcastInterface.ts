/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Groupcast } from "#clusters/groupcast";

export namespace GroupcastInterface {
    export interface Base {
        joinGroup(request: Groupcast.JoinGroupRequest): MaybePromise;
        leaveGroup(request: Groupcast.LeaveGroupRequest): MaybePromise<Groupcast.LeaveGroupResponse>;
        updateGroupKey(request: Groupcast.UpdateGroupKeyRequest): MaybePromise;
        groupcastTesting(request: Groupcast.GroupcastTestingRequest): MaybePromise;
    }

    export interface Listener {
        configureAuxiliaryAcl(request: Groupcast.ConfigureAuxiliaryAclRequest): MaybePromise;
    }
}

export type GroupcastInterface = {
    components: [
        { flags: {}, methods: GroupcastInterface.Base },
        { flags: { listener: true }, methods: GroupcastInterface.Listener }
    ]
};
