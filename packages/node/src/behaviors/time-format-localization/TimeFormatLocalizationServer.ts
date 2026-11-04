/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MaybePromise } from "@matter/general";
import { TimeFormatLocalization } from "@matter/types/clusters/time-format-localization";
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
        if (!this.features.calendarFormat) {
            return;
        }
        if (!this.state.supportedCalendarTypes?.length) {
            const calendarType = this.state.activeCalendarType ?? this.detectedCalendarType;
            this.state.supportedCalendarTypes = [calendarType];
            this.state.activeCalendarType = calendarType;
        }
        const { activeCalendarType, supportedCalendarTypes } = this.state;
        if (activeCalendarType !== undefined && supportedCalendarTypes.includes(activeCalendarType)) {
            return;
        }

        const detected = this.detectedCalendarType;
        const calendarType = supportedCalendarTypes.includes(detected) ? detected : supportedCalendarTypes[0];
        if (activeCalendarType !== undefined) {
            logger.warn(
                `Active calendar type ${TimeFormatLocalization.CalendarType[activeCalendarType]} is not in supportedCalendarTypes, using ${TimeFormatLocalization.CalendarType[calendarType]}`,
            );
        }
        this.state.activeCalendarType = calendarType;
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
                logger.info(`Unmapped calendar type "${type}"; falling back to Gregorian`);
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
