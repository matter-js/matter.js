/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { JointFabricAdministrator } from "@matter/types/clusters/joint-fabric-administrator";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const JointFabricAdministratorClientConstructor = ClientBehavior(JointFabricAdministrator.Complete);
export interface JointFabricAdministratorClient extends InstanceType<typeof JointFabricAdministratorClientConstructor> {}
export interface JointFabricAdministratorClientConstructor extends Identity<typeof JointFabricAdministratorClientConstructor> {}
export const JointFabricAdministratorClient: JointFabricAdministratorClientConstructor = JointFabricAdministratorClientConstructor;
