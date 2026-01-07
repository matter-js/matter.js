/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "#general";
import { LocalizationConfigurationBehavior } from "./LocalizationConfigurationBehavior.js";

/**
 * This is the default server implementation of {@link LocalizationConfigurationBehavior}.
 */
export class LocalizationConfigurationServer extends LocalizationConfigurationBehavior {
    override initialize(): MaybePromise {
        if (this.state.activeLocale === undefined) {
            this.state.activeLocale = this.detectedLocale;
        }
        if (this.state.supportedLocales === undefined) {
            this.state.supportedLocales = [this.state.activeLocale];
        }
    }

    /** Override this getter with own implementation to detect the locale of the system. */
    protected get detectedLocale() {
        return Intl.DateTimeFormat().resolvedOptions().locale;
    }
}

export namespace LocalizationConfigurationServer {
    export declare const ExtensionInterface: {
        detectedLocale: string;
    };
}
