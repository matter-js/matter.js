/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeFormatLocalization } from "#clusters/time-format-localization";
import { Logger, MaybePromise } from "#general";
import { TimeFormatLocalizationBehavior } from "./TimeFormatLocalizationBehavior.js";

const logger = Logger.get("TimeFormatLocalizationServer");

/**
 * This is the default server implementation of {@link TimeFormatLocalizationBehavior}.
 */
export class TimeFormatLocalizationServer extends TimeFormatLocalizationBehavior.with("CalendarFormat") {
    override initialize(): MaybePromise {
        if (this.state.hourFormat === undefined) {
            this.state.hourFormat = this.detectedHourFormat;
        }
        if (this.state.activeCalendarType === undefined) {
            this.state.activeCalendarType = this.detectedCalendarType;
        }
        if (this.state.supportedCalendarTypes === undefined) {
            this.state.supportedCalendarTypes = [this.state.activeCalendarType];
        }
    }

    /** Override this getter with own implementation to detect the hour format of the system. */
    get detectedHourFormat() {
        if (Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12) {
            return TimeFormatLocalization.HourFormat["12Hr"];
        }
        return TimeFormatLocalization.HourFormat["24Hr"];
    }

    /** Override this getter with own implementation to detect the calendar type of the system. */
    get detectedCalendarType() {
        const type = Intl.DateTimeFormat().resolvedOptions().calendar;
        switch (type) {
            case "buddhist":
                return TimeFormatLocalization.CalendarType.Buddhist;

            case "chinese":
                return TimeFormatLocalization.CalendarType.Chinese;

            case "coptic":
                return TimeFormatLocalization.CalendarType.Coptic;

            case "ethiopian":
                return TimeFormatLocalization.CalendarType.Ethiopian;

            case "gregory":
                return TimeFormatLocalization.CalendarType.Gregorian;

            case "ethiopic":
                return TimeFormatLocalization.CalendarType.Ethiopian;

            case "hebrew":
                return TimeFormatLocalization.CalendarType.Hebrew;

            case "indian":
                return TimeFormatLocalization.CalendarType.Indian;

            case "islamic":
                return TimeFormatLocalization.CalendarType.Islamic;

            case "japanese":
                return TimeFormatLocalization.CalendarType.Japanese;

            case "dangi":
                return TimeFormatLocalization.CalendarType.Korean;

            case "persian":
                return TimeFormatLocalization.CalendarType.Persian;

            default:
                logger.warn(`Unmapped calendar type "${type}"; falling back to Gregorian`);
                return TimeFormatLocalization.CalendarType.Gregorian;
        }
    }
}

export namespace TimeFormatLocalizationServer {
    export declare const ExtensionInterface: {
        detectedHourFormat: string;
        detectedCalendarType: string;
    };
}
