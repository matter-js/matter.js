group "default" {
    targets = ["chip"]
}

variable "VERSION" {}
variable "CHIP_COMMIT" {}
variable "TMPDIR" { default = "/tmp" }

target "chip" {
    dockerfile = "Dockerfile"
    target = "chip"

    labels = {
        "org.opencontainers.image.version" = "${VERSION}"
        "org.opencontainers.image.revision" = "${CHIP_COMMIT}",
    }

    args = {
        "CHIP_COMMIT" = "${CHIP_COMMIT}"
    }

    tags = [
        "ghcr.io/matter-js/chip:latest",
        "ghcr.io/matter-js/chip:${CHIP_COMMIT}",
        "chip:latest",
    ]

    output = [
        {
            type = "docker"
        }
    ]

    #cache-from = [
    #    {
    #        type = "registry"
    #        ref = "ghcr.io/matter-js/chip-cache:cache"
    #        mode = "max"
    #    }
    #]

    #cache-to = [
    #    {
    #        type = "registry"
    #        ref = "ghcr.io/matter-js/chip-cache:cache"
    #        mode = "max"
    #        ignore-error = true
    #    }
    #]
}

target "chip-artifact" {
    inherits = [ "chip" ]
    output = [
        {
            type = "docker"
            dest = "${TMPDIR}/chip.tar"
        }
    ]
}

target "base" {
    inherits = [ "chip" ]
    target = "base"

    tags = [
        "chip-base"
    ]
}

target "build" {
    inherits = [ "chip" ]
    target = "build"

    tags = [
        "chip-build"
    ]
}

target "source" {
    inherits = [ "chip" ]
    target = "source"

    tags = [
        "chip-source"
    ]
}

target "bins" {
    inherits = [ "chip" ]
    target = "bins"

    tags = [
        "chip-bins"
    ]
}
