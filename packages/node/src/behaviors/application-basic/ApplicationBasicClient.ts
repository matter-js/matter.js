/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ApplicationBasic } from "#clusters/application-basic";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ApplicationBasicClientConstructor = ClientBehavior(ApplicationBasic.Complete);
export interface ApplicationBasicClient extends InstanceType<typeof ApplicationBasicClientConstructor> {}
export interface ApplicationBasicClientConstructor extends Identity<typeof ApplicationBasicClientConstructor> {}
export const ApplicationBasicClient: ApplicationBasicClientConstructor = ApplicationBasicClientConstructor;
