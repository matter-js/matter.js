/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ApplicationLauncher } from "#clusters/application-launcher";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ApplicationLauncherClientConstructor = ClientBehavior(ApplicationLauncher.Complete);
export interface ApplicationLauncherClient extends InstanceType<typeof ApplicationLauncherClientConstructor> {}
export interface ApplicationLauncherClientConstructor extends Identity<typeof ApplicationLauncherClientConstructor> {}
export const ApplicationLauncherClient: ApplicationLauncherClientConstructor = ApplicationLauncherClientConstructor;
