/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SmokeCoAlarm } from "#clusters/smoke-co-alarm";
import { ClusterType } from "#types";
import { SmokeCoAlarmBehavior } from "./SmokeCoAlarmBehavior.js";

const SmokeCoAlarmBase = SmokeCoAlarmBehavior.with(SmokeCoAlarm.Feature.SmokeAlarm, SmokeCoAlarm.Feature.CoAlarm);

/**
 * This is the default server implementation of {@link SmokeCoAlarmBehavior}.
 *
 * The Matter specification requires the SmokeCoAlarm cluster to support features we do not enable by default. You
 * should use {@link SmokeCoAlarmServer.with} to specialize the class for the features your implementation supports.
 */
export class SmokeCoAlarmBaseServer extends SmokeCoAlarmBase {
    override initialize() {
        if (this.state.expressedState === undefined) {
            this.state.expressedState = SmokeCoAlarm.ExpressedState.Normal;
        }
        if (this.features.smokeAlarm && this.state.smokeState === undefined) {
            this.state.smokeState = SmokeCoAlarm.AlarmState.Normal;
        }
        if (this.features.coAlarm && this.state.coState === undefined) {
            this.state.coState = SmokeCoAlarm.AlarmState.Normal;
        }
        if (this.state.batteryAlert === undefined) {
            this.state.batteryAlert = SmokeCoAlarm.AlarmState.Normal;
        }
        if (this.state.testInProgress === undefined) {
            this.state.testInProgress = false;
        }
        if (this.state.hardwareFaultAlert === undefined) {
            this.state.hardwareFaultAlert = false;
        }
        if (this.state.endOfServiceAlert === undefined) {
            this.state.endOfServiceAlert = SmokeCoAlarm.EndOfService.Normal;
        }
    }
}

export class SmokeCoAlarmServer extends SmokeCoAlarmBaseServer.for(ClusterType(SmokeCoAlarm.Base)) {}
