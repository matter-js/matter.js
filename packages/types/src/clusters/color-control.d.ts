/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the ColorControl cluster.
 *
 * This cluster provides an interface for changing the color of a light. Color is specified according to the CIE 1931
 * Color space. Color control is carried out in terms of x,y values, as defined by this specification.
 *
 * Additionally, color may optionally be controlled in terms of color temperature, or as hue and saturation values based
 * on optionally variable RGB and W color points. It is recommended that the hue and saturation are interpreted
 * according to the HSV (a.k.a. HSB) color model.
 *
 * Control over luminance is not included, as this is provided by means of the Level Control for Lighting cluster. It is
 * recommended that the level provided by this cluster be interpreted as representing a proportion of the maximum
 * intensity achievable at the current color.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 3.2
 */
export declare namespace ColorControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0300;

    /**
     * Textual cluster identifier.
     */
    export const name: "ColorControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 8;

    /**
     * Canonical metadata for the ColorControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ColorControl} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates which attributes are currently determining the color of the device.
         *
         * The value of the ColorMode attribute cannot be written directly - it is set upon reception of any command in
         * section Commands to the appropriate mode for that command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.10
         */
        colorMode: ColorMode;

        /**
         * Indicates a bitmap that determines the default behavior of some cluster commands. Each command that is
         * dependent on the Options attribute shall first construct a temporary Options bitmap that is in effect during
         * the command processing. The temporary Options bitmap has the same format and meaning as the Options
         * attribute, but includes any bits that may be overridden by command fields.
         *
         * This attribute is meant to be changed only during commissioning.
         *
         * Below is the format and description of the Options attribute and temporary Options bitmap and the effect on
         * dependent commands.
         *
         * Command execution shall NOT continue beyond the Options processing if all of these criteria are true:
         *
         *   - The On/Off cluster exists on the same endpoint as this cluster.
         *
         *   - The OnOff attribute of the On/Off cluster, on this endpoint, is FALSE.
         *
         *   - The value of the ExecuteIfOff bit is 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.11
         */
        options: Options;

        /**
         * Indicates the number of color primaries implemented on this device. A value of null shall indicate that the
         * number of primaries is unknown.
         *
         * Where this attribute is implemented, the attributes below for indicating the “x” and “y” color values of the
         * primaries shall also be implemented for each of the primaries from 1 to NumberOfPrimaries, without leaving
         * gaps. Implementation of the Primary1Intensity attribute and subsequent intensity attributes is optional.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.24
         */
        numberOfPrimaries: number | null;

        /**
         * Indicates which attributes are currently determining the color of the device.
         *
         * To provide compatibility with clients not supporting EHUE, the original ColorMode attribute shall indicate
         * CurrentHue and CurrentSaturation when the light uses the EnhancedCurrentHue attribute. If the ColorMode
         * attribute is changed, its new value shall be copied to the EnhancedColorMode attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.13
         */
        enhancedColorMode: EnhancedColorMode;

        /**
         * Indicates the color control capabilities of the device.
         *
         * Bits 0-4 of the ColorCapabilities attribute shall have the same values as the corresponding bits of the
         * FeatureMap attribute. All other bits in ColorCapabilities shall be 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.19
         */
        colorCapabilities: ColorCapabilities;

        /**
         * Indicates the time remaining, in 1/10ths of a second, until transitions due to the currently active command
         * will be complete.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When it changes from 0 to any value higher than 10, or
         *
         *   - When it changes, with a delta larger than 10, caused by the invoke of a command, or
         *
         *   - When it changes to 0.
         *
         * For commands with a transition time or changes to the transition time less than 1 second, changes to this
         * attribute shall NOT be reported.
         *
         * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the reporting
         * of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.4
         */
        remainingTime?: number;

        /**
         * Indicates what mechanism, if any, is in use for compensation for color/intensity drift over time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.7
         */
        driftCompensation?: DriftCompensation;

        /**
         * This attribute shall contain a textual indication of what mechanism, if any, is in use to compensate for
         * color/intensity drift over time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.8
         */
        compensationText?: string;

        /**
         * Indicates the normalized chromaticity value x for this primary, as defined in the CIE xyY Color Space.
         *
         * The value of x shall be related to the Primary1X attribute by the relationship
         *
         * x = Primary1X / 65536 (Primary1X in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.25
         */
        primary1X?: number;

        /**
         * Indicates the normalized chromaticity value y for this primary, as defined in the CIE xyY Color Space.
         *
         * The value of y shall be related to the Primary1Y attribute by the relationship
         *
         * y = Primary1Y / 65536 (Primary1Y in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.26
         */
        primary1Y?: number;

        /**
         * Indicates a representation of the maximum intensity of this primary as defined in Section 3.1.3, “The Dimming
         * Light Curve”, normalized such that the primary with the highest maximum intensity contains the value 254.
         *
         * A value of null shall indicate that this primary is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.27
         */
        primary1Intensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary2X?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary2Y?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary2Intensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary3X?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary3Y?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary3Intensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary4X?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary4Y?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary4Intensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary5X?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary5Y?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary5Intensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary6X?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary6Y?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary6Intensity?: number | null;

        /**
         * Indicates the normalized chromaticity value x, as defined in the CIE xyY Color Space, of the current white
         * point of the device.
         *
         * The value of x shall be related to the WhitePointX attribute by the relationship
         *
         * x = WhitePointX / 65536 (WhitePointX in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.29
         */
        whitePointX?: number;

        /**
         * Indicates the normalized chromaticity value y, as defined in the CIE xyY Color Space, of the current white
         * point of the device.
         *
         * The value of y shall be related to the WhitePointY attribute by the relationship
         *
         * y = WhitePointY / 65536 (WhitePointY in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.30
         */
        whitePointY?: number;

        /**
         * Indicates the normalized chromaticity value x, as defined in the CIE xyY Color Space, of the red color point
         * of the device.
         *
         * The value of x shall be related to the ColorPointRX attribute by the relationship
         *
         * x = ColorPointRX / 65536 (ColorPointRX in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.31
         */
        colorPointRx?: number;

        /**
         * Indicates the normalized chromaticity value y, as defined in the CIE xyY Color Space, of the red color point
         * of the device.
         *
         * The value of y shall be related to the ColorPointRY attribute by the relationship
         *
         * y = ColorPointRY / 65536 (ColorPointRY in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.32
         */
        colorPointRy?: number;

        /**
         * Indicates a representation of the relative intensity of the red color point as defined in Section 3.1.3, “The
         * Dimming Light Curve”, normalized such that the color point with the highest relative intensity contains the
         * value 254.
         *
         * A value of null shall indicate an invalid value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.33
         */
        colorPointRIntensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointGx?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointGy?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointGIntensity?: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointBx?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointBy?: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointBIntensity?: number | null;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "HueSaturation".
     */
    export interface HueSaturationAttributes {
        /**
         * The CurrentHue attribute contains the current hue value of the light. It is updated as fast as practical
         * during commands that change the hue.
         *
         * The hue in degrees shall be related to the CurrentHue attribute by the relationship:
         *
         * Hue = "CurrentHue" * 360 / 254
         *
         * where CurrentHue is in the range from 0 to 254 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.2
         */
        currentHue: number;

        /**
         * Indicates the current saturation value of the light. It is updated as fast as practical during commands that
         * change the saturation.
         *
         * The saturation (on a scale from 0.0 to 1.0) shall be related to the CurrentSaturation attribute by the
         * relationship:
         *
         * Saturation = "CurrentSaturation" / 254
         *
         * where CurrentSaturation is in the range from 0 to 254 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.3
         */
        currentSaturation: number;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "Xy".
     */
    export interface XyAttributes {
        /**
         * Indicates the current value of the normalized chromaticity value x, as defined in the CIE xyY Color Space. It
         * is updated as fast as practical during commands that change the color.
         *
         * The value of x shall be related to the CurrentX attribute by the relationship
         *
         * x = "CurrentX" / 65536
         *
         * where CurrentX is in the range from 0 to 65279 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.5
         */
        currentX: number;

        /**
         * Indicates the current value of the normalized chromaticity value y, as defined in the CIE xyY Color Space. It
         * is updated as fast as practical during commands that change the color.
         *
         * The value of y shall be related to the CurrentY attribute by the relationship
         *
         * y = "CurrentY" / 65536
         *
         * where CurrentY is in the range from 0 to 65279 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.6
         */
        currentY: number;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "ColorTemperature".
     */
    export interface ColorTemperatureAttributes {
        /**
         * Indicates a scaled inverse of the current value of the color temperature. The unit of ColorTemperatureMireds
         * is the mired (micro reciprocal degree), a.k.a. mirek (micro reciprocal kelvin). It is updated as fast as
         * practical during commands that change the color.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * The color temperature value in kelvins shall be related to the ColorTemperatureMireds attribute in mired by
         * the relationship
         *
         * "Color temperature [K]" = "1,000,000" / "ColorTemperatureMireds"
         *
         * where ColorTemperatureMireds is in the range from 1 to 65279 inclusive, giving a color temperature range from
         * 1,000,000 K to 15.32 K.
         *
         * If this attribute is implemented then the ColorMode attribute shall also be implemented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.9
         */
        colorTemperatureMireds: number;

        /**
         * Indicates the minimum mired value supported by the hardware. ColorTempPhysicalMinMireds corresponds to the
         * maximum color temperature in kelvins supported by the hardware. ColorTempPhysicalMinMireds <=
         * ColorTemperatureMireds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.20
         */
        colorTempPhysicalMinMireds: number;

        /**
         * Indicates the maximum mired value supported by the hardware. ColorTempPhysicalMaxMireds corresponds to the
         * minimum color temperature in kelvins supported by the hardware. ColorTemperatureMireds <=
         * ColorTempPhysicalMaxMireds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.21
         */
        colorTempPhysicalMaxMireds: number;

        /**
         * Indicates a lower bound on the value of the ColorTemperatureMireds attribute for the purposes of coupling the
         * ColorTemperatureMireds attribute to the CurrentLevel attribute when the CoupleColorTempToLevel bit of the
         * Options attribute of the Level Control cluster is equal to 1. When coupling the ColorTemperatureMireds
         * attribute to the CurrentLevel attribute, this value shall correspond to a CurrentLevel value of 254 (100%).
         *
         * This attribute shall be set such that the following relationship exists: ColorTempPhysicalMinMireds <=
         * CoupleColorTempToLevelMinMireds <= ColorTemperatureMireds
         *
         * Note that since this attribute is stored as a micro reciprocal degree (mired) value (i.e. color temperature
         * in kelvins = 1,000,000 / CoupleColorTempToLevelMinMireds), the CoupleColorTempToLevelMinMireds attribute
         * corresponds to an upper bound on the value of the color temperature in kelvins supported by the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.22
         */
        coupleColorTempToLevelMinMireds?: number;

        /**
         * Indicates the desired startup color temperature value the light shall use when it is supplied with power and
         * this value shall be reflected in the ColorTemperatureMireds attribute. In addition, the ColorMode and
         * EnhancedColorMode attributes shall be set to 2 (ColorTemperatureMireds). The values of the
         * StartUpColorTemperatureMireds attribute are listed in the table below,
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.23
         */
        startUpColorTemperatureMireds?: number | null;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "EnhancedHue".
     */
    export interface EnhancedHueAttributes {
        /**
         * Indicates the non-equidistant steps along the CIE 1931 color triangle, and it provides 16-bits precision.
         *
         * The upper 8 bits of this attribute shall be used as an index in the implementation specific XY lookup table
         * to provide the non-equidistant steps. The lower 8 bits shall be used to interpolate between these steps in a
         * linear way in order to provide color zoom for the user.
         *
         * To provide compatibility with clients not supporting EHUE, the CurrentHue attribute shall contain a hue value
         * in the range 0 to 254, calculated from the EnhancedCurrentHue attribute.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.12
         */
        enhancedCurrentHue: number;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "ColorLoop".
     */
    export interface ColorLoopAttributes {
        /**
         * Indicates the current active status of the color loop. If this attribute has the value 0, the color loop
         * shall NOT be active. If this attribute has the value 1, the color loop shall be active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.14
         */
        colorLoopActive: ColorLoopActive;

        /**
         * Indicates the current direction of the color loop. If this attribute has the value Decrement, the
         * EnhancedCurrentHue attribute shall be decremented. If this attribute has the value Increment, the
         * EnhancedCurrentHue attribute shall be incremented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.15
         */
        colorLoopDirection: ColorLoopDirection;

        /**
         * Indicates the number of seconds it shall take to perform a full color loop, i.e., to cycle all values of the
         * EnhancedCurrentHue attribute (between 0 and 65534).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.16
         */
        colorLoopTime: number;

        /**
         * Indicates the value of the EnhancedCurrentHue attribute from which the color loop shall be started.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.17
         */
        colorLoopStartEnhancedHue: number;

        /**
         * Indicates the value of the EnhancedCurrentHue attribute before the color loop was started. Once the color
         * loop is complete, the EnhancedCurrentHue attribute shall be restored to this value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.18
         */
        colorLoopStoredEnhancedHue: number;
    }

    /**
     * Attributes that may appear in {@link ColorControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates which attributes are currently determining the color of the device.
         *
         * The value of the ColorMode attribute cannot be written directly - it is set upon reception of any command in
         * section Commands to the appropriate mode for that command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.10
         */
        colorMode: ColorMode;

        /**
         * Indicates a bitmap that determines the default behavior of some cluster commands. Each command that is
         * dependent on the Options attribute shall first construct a temporary Options bitmap that is in effect during
         * the command processing. The temporary Options bitmap has the same format and meaning as the Options
         * attribute, but includes any bits that may be overridden by command fields.
         *
         * This attribute is meant to be changed only during commissioning.
         *
         * Below is the format and description of the Options attribute and temporary Options bitmap and the effect on
         * dependent commands.
         *
         * Command execution shall NOT continue beyond the Options processing if all of these criteria are true:
         *
         *   - The On/Off cluster exists on the same endpoint as this cluster.
         *
         *   - The OnOff attribute of the On/Off cluster, on this endpoint, is FALSE.
         *
         *   - The value of the ExecuteIfOff bit is 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.11
         */
        options: Options;

        /**
         * Indicates the number of color primaries implemented on this device. A value of null shall indicate that the
         * number of primaries is unknown.
         *
         * Where this attribute is implemented, the attributes below for indicating the “x” and “y” color values of the
         * primaries shall also be implemented for each of the primaries from 1 to NumberOfPrimaries, without leaving
         * gaps. Implementation of the Primary1Intensity attribute and subsequent intensity attributes is optional.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.24
         */
        numberOfPrimaries: number | null;

        /**
         * Indicates which attributes are currently determining the color of the device.
         *
         * To provide compatibility with clients not supporting EHUE, the original ColorMode attribute shall indicate
         * CurrentHue and CurrentSaturation when the light uses the EnhancedCurrentHue attribute. If the ColorMode
         * attribute is changed, its new value shall be copied to the EnhancedColorMode attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.13
         */
        enhancedColorMode: EnhancedColorMode;

        /**
         * Indicates the color control capabilities of the device.
         *
         * Bits 0-4 of the ColorCapabilities attribute shall have the same values as the corresponding bits of the
         * FeatureMap attribute. All other bits in ColorCapabilities shall be 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.19
         */
        colorCapabilities: ColorCapabilities;

        /**
         * Indicates the time remaining, in 1/10ths of a second, until transitions due to the currently active command
         * will be complete.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When it changes from 0 to any value higher than 10, or
         *
         *   - When it changes, with a delta larger than 10, caused by the invoke of a command, or
         *
         *   - When it changes to 0.
         *
         * For commands with a transition time or changes to the transition time less than 1 second, changes to this
         * attribute shall NOT be reported.
         *
         * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the reporting
         * of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.4
         */
        remainingTime: number;

        /**
         * Indicates what mechanism, if any, is in use for compensation for color/intensity drift over time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.7
         */
        driftCompensation: DriftCompensation;

        /**
         * This attribute shall contain a textual indication of what mechanism, if any, is in use to compensate for
         * color/intensity drift over time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.8
         */
        compensationText: string;

        /**
         * Indicates the normalized chromaticity value x for this primary, as defined in the CIE xyY Color Space.
         *
         * The value of x shall be related to the Primary1X attribute by the relationship
         *
         * x = Primary1X / 65536 (Primary1X in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.25
         */
        primary1X: number;

        /**
         * Indicates the normalized chromaticity value y for this primary, as defined in the CIE xyY Color Space.
         *
         * The value of y shall be related to the Primary1Y attribute by the relationship
         *
         * y = Primary1Y / 65536 (Primary1Y in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.26
         */
        primary1Y: number;

        /**
         * Indicates a representation of the maximum intensity of this primary as defined in Section 3.1.3, “The Dimming
         * Light Curve”, normalized such that the primary with the highest maximum intensity contains the value 254.
         *
         * A value of null shall indicate that this primary is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.27
         */
        primary1Intensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary2X: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary2Y: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary2Intensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary3X: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary3Y: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary3Intensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary4X: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary4Y: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary4Intensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary5X: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary5Y: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary5Intensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary6X: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary6Y: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        primary6Intensity: number | null;

        /**
         * Indicates the normalized chromaticity value x, as defined in the CIE xyY Color Space, of the current white
         * point of the device.
         *
         * The value of x shall be related to the WhitePointX attribute by the relationship
         *
         * x = WhitePointX / 65536 (WhitePointX in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.29
         */
        whitePointX: number;

        /**
         * Indicates the normalized chromaticity value y, as defined in the CIE xyY Color Space, of the current white
         * point of the device.
         *
         * The value of y shall be related to the WhitePointY attribute by the relationship
         *
         * y = WhitePointY / 65536 (WhitePointY in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.30
         */
        whitePointY: number;

        /**
         * Indicates the normalized chromaticity value x, as defined in the CIE xyY Color Space, of the red color point
         * of the device.
         *
         * The value of x shall be related to the ColorPointRX attribute by the relationship
         *
         * x = ColorPointRX / 65536 (ColorPointRX in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.31
         */
        colorPointRx: number;

        /**
         * Indicates the normalized chromaticity value y, as defined in the CIE xyY Color Space, of the red color point
         * of the device.
         *
         * The value of y shall be related to the ColorPointRY attribute by the relationship
         *
         * y = ColorPointRY / 65536 (ColorPointRY in the range 0 to 65279 inclusive)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.32
         */
        colorPointRy: number;

        /**
         * Indicates a representation of the relative intensity of the red color point as defined in Section 3.1.3, “The
         * Dimming Light Curve”, normalized such that the color point with the highest relative intensity contains the
         * value 254.
         *
         * A value of null shall indicate an invalid value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.33
         */
        colorPointRIntensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointGx: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointGy: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointGIntensity: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointBx: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointBy: number;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7
         */
        colorPointBIntensity: number | null;

        /**
         * The CurrentHue attribute contains the current hue value of the light. It is updated as fast as practical
         * during commands that change the hue.
         *
         * The hue in degrees shall be related to the CurrentHue attribute by the relationship:
         *
         * Hue = "CurrentHue" * 360 / 254
         *
         * where CurrentHue is in the range from 0 to 254 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.2
         */
        currentHue: number;

        /**
         * Indicates the current saturation value of the light. It is updated as fast as practical during commands that
         * change the saturation.
         *
         * The saturation (on a scale from 0.0 to 1.0) shall be related to the CurrentSaturation attribute by the
         * relationship:
         *
         * Saturation = "CurrentSaturation" / 254
         *
         * where CurrentSaturation is in the range from 0 to 254 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.3
         */
        currentSaturation: number;

        /**
         * Indicates the current value of the normalized chromaticity value x, as defined in the CIE xyY Color Space. It
         * is updated as fast as practical during commands that change the color.
         *
         * The value of x shall be related to the CurrentX attribute by the relationship
         *
         * x = "CurrentX" / 65536
         *
         * where CurrentX is in the range from 0 to 65279 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.5
         */
        currentX: number;

        /**
         * Indicates the current value of the normalized chromaticity value y, as defined in the CIE xyY Color Space. It
         * is updated as fast as practical during commands that change the color.
         *
         * The value of y shall be related to the CurrentY attribute by the relationship
         *
         * y = "CurrentY" / 65536
         *
         * where CurrentY is in the range from 0 to 65279 inclusive.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.6
         */
        currentY: number;

        /**
         * Indicates a scaled inverse of the current value of the color temperature. The unit of ColorTemperatureMireds
         * is the mired (micro reciprocal degree), a.k.a. mirek (micro reciprocal kelvin). It is updated as fast as
         * practical during commands that change the color.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * The color temperature value in kelvins shall be related to the ColorTemperatureMireds attribute in mired by
         * the relationship
         *
         * "Color temperature [K]" = "1,000,000" / "ColorTemperatureMireds"
         *
         * where ColorTemperatureMireds is in the range from 1 to 65279 inclusive, giving a color temperature range from
         * 1,000,000 K to 15.32 K.
         *
         * If this attribute is implemented then the ColorMode attribute shall also be implemented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.9
         */
        colorTemperatureMireds: number;

        /**
         * Indicates the minimum mired value supported by the hardware. ColorTempPhysicalMinMireds corresponds to the
         * maximum color temperature in kelvins supported by the hardware. ColorTempPhysicalMinMireds <=
         * ColorTemperatureMireds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.20
         */
        colorTempPhysicalMinMireds: number;

        /**
         * Indicates the maximum mired value supported by the hardware. ColorTempPhysicalMaxMireds corresponds to the
         * minimum color temperature in kelvins supported by the hardware. ColorTemperatureMireds <=
         * ColorTempPhysicalMaxMireds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.21
         */
        colorTempPhysicalMaxMireds: number;

        /**
         * Indicates a lower bound on the value of the ColorTemperatureMireds attribute for the purposes of coupling the
         * ColorTemperatureMireds attribute to the CurrentLevel attribute when the CoupleColorTempToLevel bit of the
         * Options attribute of the Level Control cluster is equal to 1. When coupling the ColorTemperatureMireds
         * attribute to the CurrentLevel attribute, this value shall correspond to a CurrentLevel value of 254 (100%).
         *
         * This attribute shall be set such that the following relationship exists: ColorTempPhysicalMinMireds <=
         * CoupleColorTempToLevelMinMireds <= ColorTemperatureMireds
         *
         * Note that since this attribute is stored as a micro reciprocal degree (mired) value (i.e. color temperature
         * in kelvins = 1,000,000 / CoupleColorTempToLevelMinMireds), the CoupleColorTempToLevelMinMireds attribute
         * corresponds to an upper bound on the value of the color temperature in kelvins supported by the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.22
         */
        coupleColorTempToLevelMinMireds: number;

        /**
         * Indicates the desired startup color temperature value the light shall use when it is supplied with power and
         * this value shall be reflected in the ColorTemperatureMireds attribute. In addition, the ColorMode and
         * EnhancedColorMode attributes shall be set to 2 (ColorTemperatureMireds). The values of the
         * StartUpColorTemperatureMireds attribute are listed in the table below,
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.23
         */
        startUpColorTemperatureMireds: number | null;

        /**
         * Indicates the non-equidistant steps along the CIE 1931 color triangle, and it provides 16-bits precision.
         *
         * The upper 8 bits of this attribute shall be used as an index in the implementation specific XY lookup table
         * to provide the non-equidistant steps. The lower 8 bits shall be used to interpolate between these steps in a
         * linear way in order to provide color zoom for the user.
         *
         * To provide compatibility with clients not supporting EHUE, the CurrentHue attribute shall contain a hue value
         * in the range 0 to 254, calculated from the EnhancedCurrentHue attribute.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.12
         */
        enhancedCurrentHue: number;

        /**
         * Indicates the current active status of the color loop. If this attribute has the value 0, the color loop
         * shall NOT be active. If this attribute has the value 1, the color loop shall be active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.14
         */
        colorLoopActive: ColorLoopActive;

        /**
         * Indicates the current direction of the color loop. If this attribute has the value Decrement, the
         * EnhancedCurrentHue attribute shall be decremented. If this attribute has the value Increment, the
         * EnhancedCurrentHue attribute shall be incremented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.15
         */
        colorLoopDirection: ColorLoopDirection;

        /**
         * Indicates the number of seconds it shall take to perform a full color loop, i.e., to cycle all values of the
         * EnhancedCurrentHue attribute (between 0 and 65534).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.16
         */
        colorLoopTime: number;

        /**
         * Indicates the value of the EnhancedCurrentHue attribute from which the color loop shall be started.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.17
         */
        colorLoopStartEnhancedHue: number;

        /**
         * Indicates the value of the EnhancedCurrentHue attribute before the color loop was started. Once the color
         * loop is complete, the EnhancedCurrentHue attribute shall be restored to this value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.18
         */
        colorLoopStoredEnhancedHue: number;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "HueSaturation".
     */
    export interface HueSaturationCommands {
        /**
         * This command will move the device to the requested hue value using a transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.4
         */
        moveToHue(request: MoveToHueRequest): MaybePromise;

        /**
         * This command will move the device to the requested hue value using a step rate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.5
         */
        moveHue(request: MoveHueRequest): MaybePromise;

        /**
         * This command will change the device to the requested hue value using a step and transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.6
         */
        stepHue(request: StepHueRequest): MaybePromise;

        /**
         * This command will move the device to the requested saturation value using a transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.7
         */
        moveToSaturation(request: MoveToSaturationRequest): MaybePromise;

        /**
         * This command will move the device to the requested saturation value using a rate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.8
         */
        moveSaturation(request: MoveSaturationRequest): MaybePromise;

        /**
         * This command will change the device to the requested saturation value using a step transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.9
         */
        stepSaturation(request: StepSaturationRequest): MaybePromise;

        /**
         * This command will move the device to the requested hue and saturation value using a transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.10
         */
        moveToHueAndSaturation(request: MoveToHueAndSaturationRequest): MaybePromise;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "Xy".
     */
    export interface XyCommands {
        /**
         * This command will move the device to the requested color value using a transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.11
         */
        moveToColor(request: MoveToColorRequest): MaybePromise;

        /**
         * This command will move the device to the requested color using a step rate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.12
         */
        moveColor(request: MoveColorRequest): MaybePromise;

        /**
         * This command will move the device to the requested color using a step transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.13
         */
        stepColor(request: StepColorRequest): MaybePromise;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "ColorTemperature".
     */
    export interface ColorTemperatureCommands {
        /**
         * This command will move the device to the requested color temperate using a transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.14
         */
        moveToColorTemperature(request: MoveToColorTemperatureRequest): MaybePromise;

        /**
         * This command allows the color temperature of the light to be moved at a specified rate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.21
         */
        moveColorTemperature(request: MoveColorTemperatureRequest): MaybePromise;

        /**
         * This command allows the color temperature of the light to be stepped with a specified step size.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22
         */
        stepColorTemperature(request: StepColorTemperatureRequest): MaybePromise;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "EnhancedHue".
     */
    export interface EnhancedHueCommands {
        /**
         * This command allows the light to be moved in a smooth continuous transition from their current hue to a
         * target hue.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.15
         */
        enhancedMoveToHue(request: EnhancedMoveToHueRequest): MaybePromise;

        /**
         * This command allows the light to start a continuous transition starting from their current hue.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.16
         */
        enhancedMoveHue(request: EnhancedMoveHueRequest): MaybePromise;

        /**
         * This command allows the light to be moved in a stepped transition from their current hue, resulting in a
         * linear transition through XY space.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.17
         */
        enhancedStepHue(request: EnhancedStepHueRequest): MaybePromise;

        /**
         * This command allows the light to be moved in a smooth continuous transition from their current hue to a
         * target hue and from their current saturation to a target saturation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.18
         */
        enhancedMoveToHueAndSaturation(request: EnhancedMoveToHueAndSaturationRequest): MaybePromise;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "ColorLoop".
     */
    export interface ColorLoopCommands {
        /**
         * This command allows a color loop to be activated such that the color light cycles through its range of hues.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.19
         */
        colorLoopSet(request: ColorLoopSetRequest): MaybePromise;
    }

    /**
     * {@link ColorControl} supports these elements if it supports feature "HueSaturationOrXyOrColorTemperature".
     */
    export interface HueSaturationOrXyOrColorTemperatureCommands {
        /**
         * This command is provided to allow MoveTo and Step commands to be stopped.
         *
         * > [!NOTE]
         *
         * > This automatically provides symmetry to the Level Control cluster.
         *
         * > [!NOTE]
         *
         * > The StopMoveStep command has no effect on an active color loop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.20
         */
        stopMoveStep(request: StopMoveStepRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ColorControl}.
     */
    export interface Commands extends
        HueSaturationCommands,
        XyCommands,
        ColorTemperatureCommands,
        EnhancedHueCommands,
        ColorLoopCommands,
        HueSaturationOrXyOrColorTemperatureCommands
    {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { hueSaturation: true }, attributes: HueSaturationAttributes, commands: HueSaturationCommands },
        { flags: { xy: true }, attributes: XyAttributes, commands: XyCommands },
        {
            flags: { colorTemperature: true },
            attributes: ColorTemperatureAttributes,
            commands: ColorTemperatureCommands
        },
        { flags: { enhancedHue: true }, attributes: EnhancedHueAttributes, commands: EnhancedHueCommands },
        { flags: { colorLoop: true }, attributes: ColorLoopAttributes, commands: ColorLoopCommands },
        { flags: { hueSaturation: true }, commands: HueSaturationOrXyOrColorTemperatureCommands },
        { flags: { xy: true }, commands: HueSaturationOrXyOrColorTemperatureCommands },
        { flags: { colorTemperature: true }, commands: HueSaturationOrXyOrColorTemperatureCommands }
    ];

    export type Features = "HueSaturation" | "EnhancedHue" | "ColorLoop" | "Xy" | "ColorTemperature";

    /**
     * These are optional features supported by ColorControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.4
     */
    export enum Feature {
        /**
         * HueSaturation (HS)
         *
         * Supports color specification via hue/saturation.
         */
        HueSaturation = "HueSaturation",

        /**
         * EnhancedHue (EHUE)
         *
         * Enhanced hue is supported.
         */
        EnhancedHue = "EnhancedHue",

        /**
         * ColorLoop (CL)
         *
         * Color loop is supported.
         */
        ColorLoop = "ColorLoop",

        /**
         * Xy (XY)
         *
         * Supports color specification via XY.
         */
        Xy = "Xy",

        /**
         * ColorTemperature (CT)
         *
         * Supports specification of color temperature.
         */
        ColorTemperature = "ColorTemperature"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.5
     */
    export enum ColorMode {
        /**
         * The current hue and saturation attributes determine the color.
         */
        CurrentHueAndCurrentSaturation = 0,

        /**
         * The current X and Y attributes determine the color.
         */
        CurrentXAndCurrentY = 1,

        /**
         * The color temperature attribute determines the color.
         */
        ColorTemperatureMireds = 2
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.2
     */
    export declare class Options {
        constructor(values?: Partial<Options> | number);

        /**
         * Dependency on On/Off cluster
         *
         * This bit shall indicate if this cluster server instance has a dependency with the On/Off cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.2.1
         */
        executeIfOff?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.6
     */
    export enum EnhancedColorMode {
        /**
         * The current hue and saturation attributes determine the color.
         */
        CurrentHueAndCurrentSaturation = 0,

        /**
         * The current X and Y attributes determine the color.
         */
        CurrentXAndCurrentY = 1,

        /**
         * The color temperature attribute determines the color.
         */
        ColorTemperatureMireds = 2,

        /**
         * The enhanced current hue and saturation attributes determine the color.
         */
        EnhancedCurrentHueAndCurrentSaturation = 3
    }

    /**
     * Indicates the color control capabilities of the device.
     *
     * Bits 0-4 of the ColorCapabilities attribute shall have the same values as the corresponding bits of the
     * FeatureMap attribute. All other bits in ColorCapabilities shall be 0.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.19
     */
    export declare class ColorCapabilities {
        constructor(values?: Partial<ColorCapabilities> | number);

        /**
         * Supports color specification via hue/saturation.
         */
        hueSaturation?: boolean;

        /**
         * Enhanced hue is supported.
         */
        enhancedHue?: boolean;

        /**
         * Color loop is supported.
         */
        colorLoop?: boolean;

        /**
         * Supports color specification via XY.
         */
        xy?: boolean;

        /**
         * Supports color specification via color temperature.
         */
        colorTemperature?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.4
     */
    export enum DriftCompensation {
        /**
         * There is no compensation.
         */
        None = 0,

        /**
         * The compensation is based on other or unknown mechanism.
         */
        OtherOrUnknown = 1,

        /**
         * The compensation is based on temperature monitoring.
         */
        TemperatureMonitoring = 2,

        /**
         * The compensation is based on optical luminance monitoring and feedback.
         */
        OpticalLuminanceMonitoringAndFeedback = 3,

        /**
         * The compensation is based on optical color monitoring and feedback.
         */
        OpticalColorMonitoringAndFeedback = 4
    }

    /**
     * Indicates the current active status of the color loop. If this attribute has the value 0, the color loop shall
     * NOT be active. If this attribute has the value 1, the color loop shall be active.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.7.14
     */
    export enum ColorLoopActive {
        Inactive = 0,
        Active = 1
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.11
     */
    export enum ColorLoopDirection {
        /**
         * Decrement the hue in the color loop.
         */
        Decrement = 0,

        /**
         * Increment the hue in the color loop.
         */
        Increment = 1
    }

    /**
     * This command will move the device to the requested hue value using a transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.4
     */
    export declare class MoveToHueRequest {
        constructor(values?: Partial<MoveToHueRequest>);

        /**
         * This field shall indicate the hue to be moved to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.4.1
         */
        hue: number;

        /**
         * This field shall indicate the movement direction.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.4.2
         */
        direction: Direction;

        /**
         * This field shall indicate, in 1/10ths of a second, the time that shall be taken to move to the new hue.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.4.3
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested hue value using a step rate.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.5
     */
    export declare class MoveHueRequest {
        constructor(values?: Partial<MoveHueRequest>);

        /**
         * This field shall indicate the mode of movement.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.5.1
         */
        moveMode: MoveMode;

        /**
         * This field shall indicate the rate of movement in steps per second. A step is a change in the device’s hue of
         * one unit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.5.2
         */
        rate: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will change the device to the requested hue value using a step and transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.6
     */
    export declare class StepHueRequest {
        constructor(values?: Partial<StepHueRequest>);

        /**
         * This field shall indicate the mode of the step to be performed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.6.1
         */
        stepMode: StepMode;

        /**
         * This field shall indicate the change to be added to (or subtracted from) the current value of the device’s
         * hue.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.6.2
         */
        stepSize: number;

        /**
         * This field shall indicate, in 1/10ths of a second, the time that shall be taken to perform the step. A step
         * is a change in the device’s hue of Step size units.
         *
         * > [!NOTE]
         *
         * > Here the TransitionTime data field is of data type uint8, where uint16 is more common for TransitionTime
         *   data fields in other clusters / commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.6.3
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested saturation value using a transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.7
     */
    export declare class MoveToSaturationRequest {
        constructor(values?: Partial<MoveToSaturationRequest>);
        saturation: number;
        transitionTime: number;
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested saturation value using a rate.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.8
     */
    export declare class MoveSaturationRequest {
        constructor(values?: Partial<MoveSaturationRequest>);

        /**
         * This field shall indicate the mode of movement, as described in the MoveHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.8.1
         */
        moveMode: MoveMode;

        /**
         * This field shall indicate the rate of movement in steps per second. A step is a change in the device’s
         * saturation of one unit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.8.2
         */
        rate: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will change the device to the requested saturation value using a step transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.9
     */
    export declare class StepSaturationRequest {
        constructor(values?: Partial<StepSaturationRequest>);

        /**
         * This field shall indicate the mode of the step to be performed, as described in the StepHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.9.1
         */
        stepMode: StepMode;

        /**
         * This field shall indicate the change to be added to (or subtracted from) the current value of the device’s
         * saturation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.9.2
         */
        stepSize: number;

        /**
         * This field shall indicate, in 1/10ths of a second, the time that shall be taken to perform the step. A step
         * is a change in the device’s saturation of Step size units.
         *
         * > [!NOTE]
         *
         * > Here the TransitionTime data field is of data type uint8, where uint16 is more common for TransitionTime
         *   data fields in other clusters / commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.9.3
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested hue and saturation value using a transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.10
     */
    export declare class MoveToHueAndSaturationRequest {
        constructor(values?: Partial<MoveToHueAndSaturationRequest>);
        hue: number;
        saturation: number;
        transitionTime: number;
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested color value using a transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.11
     */
    export declare class MoveToColorRequest {
        constructor(values?: Partial<MoveToColorRequest>);
        colorX: number;
        colorY: number;
        transitionTime: number;
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested color using a step rate.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.12
     */
    export declare class MoveColorRequest {
        constructor(values?: Partial<MoveColorRequest>);

        /**
         * This field shall indicate the rate of movement in steps per second. A step is a change in the device’s
         * CurrentX attribute of one unit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.12.1
         */
        rateX: number;

        /**
         * This field shall indicate the rate of movement in steps per second. A step is a change in the device’s
         * CurrentY attribute of one unit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.12.2
         */
        rateY: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested color using a step transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.13
     */
    export declare class StepColorRequest {
        constructor(values?: Partial<StepColorRequest>);
        stepX: number;
        stepY: number;

        /**
         * The field shall indicate, in 1/10ths of a second, the time that shall be taken to perform the color change.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.13.2
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command will move the device to the requested color temperate using a transition.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.14
     */
    export declare class MoveToColorTemperatureRequest {
        constructor(values?: Partial<MoveToColorTemperatureRequest>);
        colorTemperatureMireds: number;
        transitionTime: number;
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows the color temperature of the light to be moved at a specified rate.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.21
     */
    export declare class MoveColorTemperatureRequest {
        constructor(values?: Partial<MoveColorTemperatureRequest>);

        /**
         * This field shall indicate the mode of movement, as described in the MoveHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.21.1
         */
        moveMode: MoveMode;

        /**
         * This field shall indicate the rate of movement in steps per second. A step is a change in the color
         * temperature of a device by one unit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.21.2
         */
        rate: number;

        /**
         * This field shall indicate a lower bound on the ColorTemperatureMireds attribute (≡ an upper bound on the
         * color temperature in kelvins) for the current move operation
         *
         * ColorTempPhysicalMinMireds <= ColorTemperatureMinimumMireds field <= ColorTemperatureMireds As such if the
         * move operation takes the ColorTemperatureMireds attribute towards the value of the
         * ColorTemperatureMinimumMireds field it shall be clipped so that the above invariant is satisfied. If the
         * ColorTemperatureMinimumMireds field is set to 0, ColorTempPhysicalMinMireds shall be used as the lower bound
         * for the ColorTemperatureMireds attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.21.3
         */
        colorTemperatureMinimumMireds: number;

        /**
         * This field shall indicate an upper bound on the ColorTemperatureMireds attribute (≡ a lower bound on the
         * color temperature in kelvins) for the current move operation
         *
         * ColorTemperatureMireds <= ColorTemperatureMaximumMireds field <= ColorTempPhysicalMaxMireds As such if the
         * move operation takes the ColorTemperatureMireds attribute towards the value of the
         * ColorTemperatureMaximumMireds field it shall be clipped so that the above invariant is satisfied. If the
         * ColorTemperatureMaximumMireds field is set to 0, ColorTempPhysicalMaxMireds shall be used as the upper bound
         * for the ColorTemperatureMireds attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.21.4
         */
        colorTemperatureMaximumMireds: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows the color temperature of the light to be stepped with a specified step size.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22
     */
    export declare class StepColorTemperatureRequest {
        constructor(values?: Partial<StepColorTemperatureRequest>);

        /**
         * This field shall indicate the mode of the step to be performed, as described in the StepHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22.1
         */
        stepMode: StepMode;

        /**
         * This field shall indicate the change to be added to (or subtracted from) the current value of the device’s
         * color temperature.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22.2
         */
        stepSize: number;

        /**
         * This field shall indicate, in units of 1/10ths of a second, the time that shall be taken to perform the step.
         * A step is a change to the device’s color temperature of a magnitude corresponding to the StepSize field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22.3
         */
        transitionTime: number;

        /**
         * This field shall indicate a lower bound on the ColorTemperatureMireds attribute (≡ an upper bound on the
         * color temperature in kelvins) for the current step operation
         *
         * ColorTempPhysicalMinMireds <= ColorTemperatureMinimumMireds field <= ColorTemperatureMireds As such if the
         * step operation takes the ColorTemperatureMireds attribute towards the value of the
         * ColorTemperatureMinimumMireds field it shall be clipped so that the above invariant is satisfied. If the
         * ColorTemperatureMinimumMireds field is set to 0, ColorTempPhysicalMinMireds shall be used as the lower bound
         * for the ColorTemperatureMireds attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22.4
         */
        colorTemperatureMinimumMireds: number;

        /**
         * This field shall indicate an upper bound on the ColorTemperatureMireds attribute (≡ a lower bound on the
         * color temperature in kelvins) for the current step operation
         *
         * ColorTemperatureMireds ≤ ColorTemperatureMaximumMireds field ≤ ColorTempPhysicalMaxMireds As such if the step
         * operation takes the ColorTemperatureMireds attribute towards the value of the ColorTemperatureMaximumMireds
         * field it shall be clipped so that the above invariant is satisfied. If the ColorTemperatureMaximumMireds
         * field is set to 0, ColorTempPhysicalMaxMireds shall be used as the upper bound for the ColorTemperatureMireds
         * attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.22.5
         */
        colorTemperatureMaximumMireds: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows the light to be moved in a smooth continuous transition from their current hue to a target
     * hue.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.15
     */
    export declare class EnhancedMoveToHueRequest {
        constructor(values?: Partial<EnhancedMoveToHueRequest>);

        /**
         * This field shall indicate the target extended hue for the light.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.15.1
         */
        enhancedHue: number;

        /**
         * This field shall indicate the movement direction.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.15.2
         */
        direction: Direction;

        /**
         * This field shall indicate the transition time, as described in the MoveToHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.15.3
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows the light to start a continuous transition starting from their current hue.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.16
     */
    export declare class EnhancedMoveHueRequest {
        constructor(values?: Partial<EnhancedMoveHueRequest>);

        /**
         * This field shall indicate the mode of movement, as described in the MoveHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.16.1
         */
        moveMode: MoveMode;

        /**
         * This field shall indicate the rate of movement in steps per second. A step is a change in the extended hue of
         * a device by one unit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.16.2
         */
        rate: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows the light to be moved in a stepped transition from their current hue, resulting in a linear
     * transition through XY space.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.17
     */
    export declare class EnhancedStepHueRequest {
        constructor(values?: Partial<EnhancedStepHueRequest>);

        /**
         * This field shall indicate the mode of the step to be performed, as described in the StepHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.17.1
         */
        stepMode: StepMode;

        /**
         * This field shall indicate the change to be added to (or subtracted from) the current value of the device’s
         * enhanced hue.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.17.2
         */
        stepSize: number;

        /**
         * The field shall indicate, in units of 1/10ths of a second, the time that shall be taken to perform the step.
         * A step is a change to the device’s enhanced hue of a magnitude corresponding to the StepSize field.
         *
         * > [!NOTE]
         *
         * > Here TransitionTime data field is of data type uint16, while the TransitionTime data field of the StepHue
         *   command is of data type uint8.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.17.3
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows the light to be moved in a smooth continuous transition from their current hue to a target
     * hue and from their current saturation to a target saturation.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.18
     */
    export declare class EnhancedMoveToHueAndSaturationRequest {
        constructor(values?: Partial<EnhancedMoveToHueAndSaturationRequest>);

        /**
         * This field shall indicate the target extended hue for the light.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.18.1
         */
        enhancedHue: number;

        /**
         * This field shall indicate the saturation, as described in the MoveToHueAndSaturation command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.18.2
         */
        saturation: number;

        /**
         * This field shall indicate the transition time, as described in the MoveToHue command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.18.3
         */
        transitionTime: number;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command allows a color loop to be activated such that the color light cycles through its range of hues.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.19
     */
    export declare class ColorLoopSetRequest {
        constructor(values?: Partial<ColorLoopSetRequest>);

        /**
         * This field shall indicate which color loop attributes to update (from the values supplied in the other
         * fields, see field descriptions below) before the color loop is started.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.19.1
         */
        updateFlags: UpdateFlags;

        /**
         * This field shall indicate the action to take for the color loop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.19.2
         */
        action: ColorLoopAction;

        /**
         * This field shall indicate the direction for the color loop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.19.3
         */
        direction: ColorLoopDirection;

        /**
         * This field shall indicate the number of seconds over which to perform a full color loop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.19.4
         */
        time: number;

        startHue: number;
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This command is provided to allow MoveTo and Step commands to be stopped.
     *
     * > [!NOTE]
     *
     * > This automatically provides symmetry to the Level Control cluster.
     *
     * > [!NOTE]
     *
     * > The StopMoveStep command has no effect on an active color loop.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.8.20
     */
    export declare class StopMoveStepRequest {
        constructor(values?: Partial<StopMoveStepRequest>);
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * This data type is derived from map8 and is used in the ColorLoopSet command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.3
     */
    export declare class UpdateFlags {
        constructor(values?: Partial<UpdateFlags> | number);

        /**
         * Device adheres to the associated action field.
         *
         * This bit shall indicate whether the server adheres to the Action field in order to process the command.
         *
         *   - 0 = Device shall ignore the Action field.
         *
         *   - 1 = Device shall adhere to the Action field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.3.1
         */
        updateAction?: boolean;

        /**
         * Device updates the associated direction attribute.
         *
         * This bit shall indicate whether the device updates the ColorLoopDirection attribute with the Direction field.
         *
         *   - 0 = Device shall ignore the Direction field.
         *
         *   - 1 = Device shall update the ColorLoopDirection attribute with the value of the Direction field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.3.2
         */
        updateDirection?: boolean;

        /**
         * Device updates the associated time attribute.
         *
         * This bit shall indicate whether the device updates the ColorLoopTime attribute with the Time field.
         *
         *   - 0 = Device shall ignore the Time field.
         *
         *   - 1 = Device shall update the value of the ColorLoopTime attribute with the value of the Time field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.3.3
         */
        updateTime?: boolean;

        /**
         * Device updates the associated start hue attribute.
         *
         * This bit shall indicate whether the device updates the ColorLoopStartEnhancedHue attribute with the value of
         * the StartHue field.
         *
         *   - 0 = Device shall ignore the StartHue field.
         *
         *   - 1 = Device shall update the value of the ColorLoopStartEnhancedHue attribute with the value of the
         *     StartHue field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.3.4
         */
        updateStartHue?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.7
     */
    export enum Direction {
        /**
         * Shortest distance
         */
        Shortest = 0,

        /**
         * Longest distance
         */
        Longest = 1,

        /**
         * Up
         */
        Up = 2,

        /**
         * Down
         */
        Down = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.8
     */
    export enum MoveMode {
        /**
         * Stop the movement
         */
        Stop = 0,

        /**
         * Move in an upwards direction
         */
        Up = 1,

        /**
         * Move in a downwards direction
         */
        Down = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.9
     */
    export enum StepMode {
        /**
         * Step in an upwards direction
         */
        Up = 1,

        /**
         * Step in a downwards direction
         */
        Down = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 3.2.6.10
     */
    export enum ColorLoopAction {
        /**
         * De-activate the color loop.
         */
        Deactivate = 0,

        /**
         * Activate the color loop from the value in the ColorLoopStartEnhancedHue field.
         */
        ActivateFromColorLoopStartEnhancedHue = 1,

        /**
         * Activate the color loop from the value of the EnhancedCurrentHue attribute.
         */
        ActivateFromEnhancedCurrentHue = 2
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ColorControl}.
     */
    export const Cluster: typeof ColorControl;

    /**
     * @deprecated Use {@link ColorControl}.
     */
    export const Complete: typeof ColorControl;

    export const Typing: ColorControl;
}

/**
 * @deprecated Use {@link ColorControl}.
 */
export declare const ColorControlCluster: typeof ColorControl;

export interface ColorControl extends ClusterTyping {
    Attributes: ColorControl.Attributes;
    Commands: ColorControl.Commands;
    Features: ColorControl.Features;
    Components: ColorControl.Components;
}
