/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Thermostat } from "@matter/types/clusters/thermostat";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ThermostatBehavior is the base class for objects that support interaction with {@link Thermostat.Cluster}.
 *
 * Thermostat.Cluster requires you to enable one or more optional features. You can do so using
 * {@link ThermostatBehavior.with}.
 */
export const ThermostatBehaviorConstructor = ClusterBehavior.for(Thermostat);

export interface ThermostatBehaviorConstructor extends Identity<typeof ThermostatBehaviorConstructor> {}
export const ThermostatBehavior: ThermostatBehaviorConstructor = ThermostatBehaviorConstructor;
export interface ThermostatBehavior extends InstanceType<ThermostatBehaviorConstructor> {}
export namespace ThermostatBehavior { export interface State extends InstanceType<typeof ThermostatBehavior.State> {} }
