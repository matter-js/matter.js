/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BasicInformation } from "#clusters/basic-information";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const BasicInformationClientConstructor = ClientBehavior(BasicInformation.Complete);
export interface BasicInformationClient extends InstanceType<typeof BasicInformationClientConstructor> {}
export interface BasicInformationClientConstructor extends Identity<typeof BasicInformationClientConstructor> {}
export const BasicInformationClient: BasicInformationClientConstructor = BasicInformationClientConstructor;
