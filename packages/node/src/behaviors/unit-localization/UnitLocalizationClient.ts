/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { UnitLocalization } from "#clusters/unit-localization";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const UnitLocalizationClientConstructor = ClientBehavior(UnitLocalization.Complete);
export interface UnitLocalizationClient extends InstanceType<typeof UnitLocalizationClientConstructor> {}
export interface UnitLocalizationClientConstructor extends Identity<typeof UnitLocalizationClientConstructor> {}
export const UnitLocalizationClient: UnitLocalizationClientConstructor = UnitLocalizationClientConstructor;
