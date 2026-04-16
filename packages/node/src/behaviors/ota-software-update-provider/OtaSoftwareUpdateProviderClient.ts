/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const OtaSoftwareUpdateProviderClientConstructor = ClientBehavior(OtaSoftwareUpdateProvider);
export interface OtaSoftwareUpdateProviderClient extends InstanceType<typeof OtaSoftwareUpdateProviderClientConstructor> {}
export interface OtaSoftwareUpdateProviderClientConstructor extends Identity<typeof OtaSoftwareUpdateProviderClientConstructor> {}
export const OtaSoftwareUpdateProviderClient: OtaSoftwareUpdateProviderClientConstructor = OtaSoftwareUpdateProviderClientConstructor;
