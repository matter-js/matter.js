/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with an indoor
 * or outdoor area of a home.
 *
 * @see {@link MatterSpecification.v141.Namespace} § 13
 */
export const AreaNamespaceTag = SemanticNamespace({
    id: 0x10,

    tags: {
        Aisle: { id: 0x0, label: "Aisle" },
        Attic: { id: 0x1, label: "Attic" },
        BackDoor: { id: 0x2, label: "BackDoor" },
        BackYard: { id: 0x3, label: "BackYard" },
        Balcony: { id: 0x4, label: "Balcony" },
        Ballroom: { id: 0x5, label: "Ballroom" },

        /**
         * Also known as Restroom
         */
        Bathroom: { id: 0x6, label: "Bathroom" },

        Bedroom: { id: 0x7, label: "Bedroom" },
        Border: { id: 0x8, label: "Border" },

        /**
         * A small room typically used for storage
         */
        Boxroom: { id: 0x9, label: "Boxroom" },

        BreakfastRoom: { id: 0xa, label: "BreakfastRoom" },
        Carport: { id: 0xb, label: "Carport" },
        Cellar: { id: 0xc, label: "Cellar" },
        Cloakroom: { id: 0xd, label: "Cloakroom" },

        /**
         * A small room for storing clothing, linens, and other items.
         */
        Closet: { id: 0xe, label: "Closet" },

        Conservatory: { id: 0xf, label: "Conservatory" },
        Corridor: { id: 0x10, label: "Corridor" },
        CraftRoom: { id: 0x11, label: "CraftRoom" },
        Cupboard: { id: 0x12, label: "Cupboard" },
        Deck: { id: 0x13, label: "Deck" },

        /**
         * A small, comfortable room for individual activities such as work or hobbies
         */
        Den: { id: 0x14, label: "Den" },

        Dining: { id: 0x15, label: "Dining" },
        DrawingRoom: { id: 0x16, label: "DrawingRoom" },
        DressingRoom: { id: 0x17, label: "DressingRoom" },
        Driveway: { id: 0x18, label: "Driveway" },
        Elevator: { id: 0x19, label: "Elevator" },

        /**
         * A bathroom directly accessible from a bedroom
         */
        Ensuite: { id: 0x1a, label: "Ensuite" },

        Entrance: { id: 0x1b, label: "Entrance" },
        Entryway: { id: 0x1c, label: "Entryway" },
        FamilyRoom: { id: 0x1d, label: "FamilyRoom" },
        Foyer: { id: 0x1e, label: "Foyer" },
        FrontDoor: { id: 0x1f, label: "FrontDoor" },
        FrontYard: { id: 0x20, label: "FrontYard" },
        GameRoom: { id: 0x21, label: "GameRoom" },
        Garage: { id: 0x22, label: "Garage" },
        GarageDoor: { id: 0x23, label: "GarageDoor" },
        Garden: { id: 0x24, label: "Garden" },
        GardenDoor: { id: 0x25, label: "GardenDoor" },

        /**
         * Also known as Guest Restroom
         */
        GuestBathroom: { id: 0x26, label: "GuestBathroom" },

        GuestBedroom: { id: 0x27, label: "GuestBedroom" },

        /**
         * Deprecated: was Guest Restroom; use 0x26 Guest Bathroom
         */
        Reserved1: { id: 0x28, label: "Reserved1" },

        /**
         * Also known as Guest Bedroom
         */
        GuestRoom: { id: 0x29, label: "GuestRoom" },

        Gym: { id: 0x2a, label: "Gym" },
        Hallway: { id: 0x2b, label: "Hallway" },

        /**
         * A cozy room containing a fireplace or other point heat source
         */
        HearthRoom: { id: 0x2c, label: "HearthRoom" },

        KidsRoom: { id: 0x2d, label: "KidsRoom" },
        KidsBedroom: { id: 0x2e, label: "KidsBedroom" },
        Kitchen: { id: 0x2f, label: "Kitchen" },

        /**
         * Deprecated: was Larder; use 0x3D Pantry
         */
        Reserved2: { id: 0x30, label: "Reserved2" },

        LaundryRoom: { id: 0x31, label: "LaundryRoom" },
        Lawn: { id: 0x32, label: "Lawn" },
        Library: { id: 0x33, label: "Library" },
        LivingRoom: { id: 0x34, label: "LivingRoom" },
        Lounge: { id: 0x35, label: "Lounge" },
        MediaTvRoom: { id: 0x36, label: "MediaTvRoom" },

        /**
         * A space used to remove soiled garments prior to entering the domicile proper
         */
        MudRoom: { id: 0x37, label: "MudRoom" },

        MusicRoom: { id: 0x38, label: "MusicRoom" },
        Nursery: { id: 0x39, label: "Nursery" },
        Office: { id: 0x3a, label: "Office" },
        OutdoorKitchen: { id: 0x3b, label: "OutdoorKitchen" },
        Outside: { id: 0x3c, label: "Outside" },

        /**
         * AKA a larder, a place where food is stored
         */
        Pantry: { id: 0x3d, label: "Pantry" },

        ParkingLot: { id: 0x3e, label: "ParkingLot" },
        Parlor: { id: 0x3f, label: "Parlor" },
        Patio: { id: 0x40, label: "Patio" },
        PlayRoom: { id: 0x41, label: "PlayRoom" },

        /**
         * A room centered around a pool/billiards table
         */
        PoolRoom: { id: 0x42, label: "PoolRoom" },

        Porch: { id: 0x43, label: "Porch" },
        PrimaryBathroom: { id: 0x44, label: "PrimaryBathroom" },
        PrimaryBedroom: { id: 0x45, label: "PrimaryBedroom" },
        Ramp: { id: 0x46, label: "Ramp" },
        ReceptionRoom: { id: 0x47, label: "ReceptionRoom" },
        RecreationRoom: { id: 0x48, label: "RecreationRoom" },

        /**
         * Deprecated: was Restroom; use 0x06 Bathroom
         */
        Reserved3: { id: 0x49, label: "Reserved3" },

        Roof: { id: 0x4a, label: "Roof" },
        Sauna: { id: 0x4b, label: "Sauna" },

        /**
         * A utility space for cleaning dishes and laundry
         */
        Scullery: { id: 0x4c, label: "Scullery" },

        SewingRoom: { id: 0x4d, label: "SewingRoom" },
        Shed: { id: 0x4e, label: "Shed" },
        SideDoor: { id: 0x4f, label: "SideDoor" },
        SideYard: { id: 0x50, label: "SideYard" },
        SittingRoom: { id: 0x51, label: "SittingRoom" },

        /**
         * An informal space meant to be 'cozy', 'snug', relaxed, meant to share with family or friends
         */
        Snug: { id: 0x52, label: "Snug" },

        Spa: { id: 0x53, label: "Spa" },
        Staircase: { id: 0x54, label: "Staircase" },
        SteamRoom: { id: 0x55, label: "SteamRoom" },
        StorageRoom: { id: 0x56, label: "StorageRoom" },
        Studio: { id: 0x57, label: "Studio" },
        Study: { id: 0x58, label: "Study" },
        SunRoom: { id: 0x59, label: "SunRoom" },
        SwimmingPool: { id: 0x5a, label: "SwimmingPool" },
        Terrace: { id: 0x5b, label: "Terrace" },
        UtilityRoom: { id: 0x5c, label: "UtilityRoom" },

        /**
         * The innermost area of a large home
         */
        Ward: { id: 0x5d, label: "Ward" },

        Workshop: { id: 0x5e, label: "Workshop" },

        /**
         * A room dedicated to a toilet; a water closet / WC
         */
        Toilet: { id: 0x5f, label: "Toilet" }
    }
});
