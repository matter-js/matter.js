/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BasicInformation } from "@matter/types/clusters/basic-information";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const BasicInformationClientConstructor = ClientBehavior(BasicInformation);
export interface BasicInformationClient extends InstanceType<typeof BasicInformationClientConstructor> {}
export interface BasicInformationClientConstructor extends Identity<typeof BasicInformationClientConstructor> {}
export const BasicInformationClient: BasicInformationClientConstructor = BasicInformationClientConstructor;
