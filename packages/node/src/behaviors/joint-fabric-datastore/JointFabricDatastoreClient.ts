/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { JointFabricDatastore } from "#clusters/joint-fabric-datastore";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const JointFabricDatastoreClientConstructor = ClientBehavior(JointFabricDatastore.Complete);
export interface JointFabricDatastoreClient extends InstanceType<typeof JointFabricDatastoreClientConstructor> {}
export interface JointFabricDatastoreClientConstructor extends Identity<typeof JointFabricDatastoreClientConstructor> {}
export const JointFabricDatastoreClient: JointFabricDatastoreClientConstructor = JointFabricDatastoreClientConstructor;
