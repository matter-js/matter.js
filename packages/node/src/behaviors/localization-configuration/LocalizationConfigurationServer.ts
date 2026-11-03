/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MaybePromise } from "@matter/general";
import { LocalizationConfigurationBehavior } from "./LocalizationConfigurationBehavior.js";

const logger = Logger.get("LocalizationConfigurationServer");

/**
 * This is the default server implementation of {@link LocalizationConfigurationBehavior}.
 */
export class LocalizationConfigurationServer extends LocalizationConfigurationBehavior {
    override initialize(): MaybePromise {
        if (this.state.supportedLocales.length === 0) {
            const locale = this.state.activeLocale ?? this.detectedLocale;
            this.state.supportedLocales = [locale];
            this.state.activeLocale = locale;
        }
        const { activeLocale, supportedLocales } = this.state;
        if (activeLocale !== undefined && supportedLocales.includes(activeLocale)) {
            return;
        }

        const detected = this.detectedLocale;
        const locale = supportedLocales.includes(detected) ? detected : supportedLocales[0];
        if (activeLocale !== undefined) {
            logger.warn(`Active locale "${activeLocale}" is not in supportedLocales, using "${locale}"`);
        }
        this.state.activeLocale = locale;
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
