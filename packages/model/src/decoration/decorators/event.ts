/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventModel } from "#models/EventModel.js";
import { element } from "./element.js";

/**
 * Decorates a property as a Matter event.
 *
 * If you don't assign an event ID using this decorator, matter.js treats properties as internal and they are not
 * accessible via the Matter protocol.
 */
export const event = element.property(EventModel);
