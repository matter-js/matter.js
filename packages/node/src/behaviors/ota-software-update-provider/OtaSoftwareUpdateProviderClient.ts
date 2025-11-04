/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OtaSoftwareUpdateProviderClientConstructor = ClientBehavior(OtaSoftwareUpdateProvider.Complete);
export interface OtaSoftwareUpdateProviderClient extends InstanceType<typeof OtaSoftwareUpdateProviderClientConstructor> {}
export interface OtaSoftwareUpdateProviderClientConstructor extends Identity<typeof OtaSoftwareUpdateProviderClientConstructor> {}
export const OtaSoftwareUpdateProviderClient: OtaSoftwareUpdateProviderClientConstructor = OtaSoftwareUpdateProviderClientConstructor;
