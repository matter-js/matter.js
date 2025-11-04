/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OtaSoftwareUpdateRequestorClientConstructor = ClientBehavior(OtaSoftwareUpdateRequestor.Complete);
export interface OtaSoftwareUpdateRequestorClient extends InstanceType<typeof OtaSoftwareUpdateRequestorClientConstructor> {}
export interface OtaSoftwareUpdateRequestorClientConstructor extends Identity<typeof OtaSoftwareUpdateRequestorClientConstructor> {}
export const OtaSoftwareUpdateRequestorClient: OtaSoftwareUpdateRequestorClientConstructor = OtaSoftwareUpdateRequestorClientConstructor;
