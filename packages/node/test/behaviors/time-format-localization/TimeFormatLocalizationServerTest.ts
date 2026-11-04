/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeFormatLocalizationServer } from "#behaviors/time-format-localization";
import { ServerNode } from "#node/ServerNode.js";
import { MockServerNode } from "@matter/node/testing";
import { ConstraintError } from "@matter/protocol";
import { TimeFormatLocalization } from "@matter/types/clusters/time-format-localization";

function createEndpoint() {
    return MockServerNode.create(
        ServerNode.RootEndpoint.with(
            TimeFormatLocalizationServer.with("CalendarFormat").set({
                supportedCalendarTypes: [
                    TimeFormatLocalization.CalendarType.Buddhist,
                    TimeFormatLocalization.CalendarType.Chinese,
                    TimeFormatLocalization.CalendarType.Coptic,
                ],
                hourFormat: TimeFormatLocalization.HourFormat["24Hr"],
                activeCalendarType: TimeFormatLocalization.CalendarType.Coptic,
            }),
        ),
    );
}

describe("TimeFormatLocalizationServer", () => {
    it("accepts valid date formats", async () => {
        await using endpoint = await createEndpoint();
        await endpoint.act(agent => {
            agent.timeFormatLocalization.state.activeCalendarType = TimeFormatLocalization.CalendarType.Chinese;
        });
    });

    it("rejects invalid date formats", async () => {
        await using endpoint = await createEndpoint();
        expect(() =>
            endpoint.act(agent => {
                agent.timeFormatLocalization.state.activeCalendarType = TimeFormatLocalization.CalendarType.Gregorian;
            }),
        ).throws(
            ConstraintError,
            'Validating node0.timeFormatLocalization.state: Constraint "in supportedCalendarTypes": Value 4 is not one of the values allowed by "in" constraint (135)',
        );
    });

    it("lets a subclass of the class itself override the detected formats with any enum value", () => {
        // Type-level check only: a failure shows as a build error in this file
        class ActiveLocaleFormats extends TimeFormatLocalizationServer {
            override get detectedHourFormat() {
                return TimeFormatLocalization.HourFormat.UseActiveLocale;
            }

            override get detectedCalendarType() {
                return TimeFormatLocalization.CalendarType.UseActiveLocale;
            }
        }
        void ActiveLocaleFormats;
    });

    it("uses the overridden detected formats of a derived type", async () => {
        // The runtime assertions also pass on the old declarations; the compile of the overrides is the check
        class FixedFormats extends TimeFormatLocalizationServer.with("CalendarFormat") {
            override get detectedHourFormat() {
                return TimeFormatLocalization.HourFormat["12Hr"];
            }
            override get detectedCalendarType() {
                return TimeFormatLocalization.CalendarType.Buddhist;
            }
        }

        await using node = await MockServerNode.create(
            ServerNode.RootEndpoint.with(
                FixedFormats.set({ supportedCalendarTypes: [TimeFormatLocalization.CalendarType.Buddhist] }),
            ),
        );

        expect(node.state.timeFormatLocalization.hourFormat).equals(TimeFormatLocalization.HourFormat["12Hr"]);
        expect(node.state.timeFormatLocalization.activeCalendarType).equals(
            TimeFormatLocalization.CalendarType.Buddhist,
        );
    });
});
