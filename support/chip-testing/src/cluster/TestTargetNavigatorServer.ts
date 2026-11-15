/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TargetNavigatorServer } from "@matter/main/behaviors/target-navigator";
import { TargetNavigator } from "@matter/main/clusters/target-navigator";

/**
 * Navigates to any target in the TargetList and makes it the CurrentTarget; answers TargetNotFound for any other
 * identifier and leaves CurrentTarget unchanged, as chip's tv-app does.
 *
 * The endpoint must enable CurrentTarget.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.11.6.1
 */
export class TestTargetNavigatorServer extends TargetNavigatorServer {
    override navigateTarget({ target }: TargetNavigator.NavigateTargetRequest): TargetNavigator.NavigateTargetResponse {
        if (!this.state.targetList.some(({ identifier }) => identifier === target)) {
            return { status: TargetNavigator.Status.TargetNotFound };
        }
        this.state.currentTarget = target;
        return { status: TargetNavigator.Status.Success };
    }
}
