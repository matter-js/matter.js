/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MaybePromise } from "#util/Promises.js";
import { Environmental } from "./Environmental.js";

export interface ServiceProvider {
    has(type: Environmental.ServiceType): boolean;
    get<T extends object>(type: Environmental.ServiceType<T>): T;
    maybeGet<T extends object>(type: Environmental.ServiceType<T>): T | undefined;
    delete(type: Environmental.ServiceType, instance?: any): void;
    load<T extends Environmental.Service>(type: Environmental.Factory<T>): Promise<T>;
    close<T extends object>(
        type: Environmental.ServiceType<T>,
    ): T extends { close: () => MaybePromise<void> } ? MaybePromise<void> : void;
}
