/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EcosystemInformation } from "#clusters/ecosystem-information";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const EcosystemInformationClientConstructor = ClientBehavior(EcosystemInformation.Complete);
export interface EcosystemInformationClient extends InstanceType<typeof EcosystemInformationClientConstructor> {}
export interface EcosystemInformationClientConstructor extends Identity<typeof EcosystemInformationClientConstructor> {}
export const EcosystemInformationClient: EcosystemInformationClientConstructor = EcosystemInformationClientConstructor;
