/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclItemKind } from "./AclItemKind.js";
import { BindingItemKind } from "./BindingItemKind.js";
import { GroupKeyItemKind } from "./GroupKeyItemKind.js";
import { GroupKeyMapItemKind } from "./GroupKeyMapItemKind.js";
import { GroupMembershipItemKind } from "./GroupMembershipItemKind.js";

/**
 * The item kinds this package reconciles, as the single instance of each that is registered.
 *
 * A task names a kind by passing one of these rather than by spelling its name, so a typo does not compile and
 * the intent type follows the kind. They are shared instances because a kind holds no state of its own — and
 * because the reconciler registers exactly these, so a task cannot pass a lookalike.
 */
export const GroupKey = new GroupKeyItemKind();
export const GroupKeyMap = new GroupKeyMapItemKind();
export const GroupMembership = new GroupMembershipItemKind();
export const Acl = new AclItemKind();
export const Binding = new BindingItemKind();

/** Every kind the reconciler registers by default. */
export const BUILT_IN_KINDS = [GroupKey, GroupKeyMap, GroupMembership, Acl, Binding] as const;
