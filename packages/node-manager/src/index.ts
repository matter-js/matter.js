/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type { ManagedFabric } from "./ManagedFabric.js";
export * from "./reconcile/kinds.js";
export { ReconcilerBehavior } from "./ReconcilerBehavior.js";
export type { ItemKind } from "./ReconcilerBehavior.js";

export * from "./task/errors.js";

export { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroup } from "./task/groups/AddNodeToGroup.js";
export type { AddNodeToGroupParams } from "./task/groups/AddNodeToGroup.js";
export { REMOVE_NODE_FROM_GROUP_TYPE, RemoveNodeFromGroup } from "./task/groups/RemoveNodeFromGroup.js";
export type { RemoveNodeFromGroupParams } from "./task/groups/RemoveNodeFromGroup.js";
export { ROTATE_GROUP_KEY_TYPE, RotateGroupKey } from "./task/groups/RotateGroupKey.js";
export type { RotateGroupKeyParams } from "./task/groups/RotateGroupKey.js";
export { ROLLBACK_TYPE, Rollback } from "./task/Rollback.js";
export type { RollbackParams } from "./task/Rollback.js";

export { addressLabel } from "./task/peer.js";
export type { RunView, TaskDefinition } from "./task/Task.js";
export { TaskCancelOutcome, TaskManagerBehavior } from "./task/TaskManagerBehavior.js";
export type { TaskCancellation, TaskFeasibility, TaskHandle } from "./task/TaskManagerBehavior.js";
export { TaskRegistry } from "./task/TaskRegistry.js";
export { RunId } from "./task/types.js";
export type {
    ChangeEntry,
    PlannedChange,
    RetireSeq,
    TaskContext,
    TaskPhase,
    TaskState,
    TaskStatus,
} from "./task/types.js";
export { Require } from "./task/validation.js";
