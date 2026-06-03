basic.showIcon(IconNames.SmallDiamond)

basic.forever(function () {
    let x = input.acceleration(Dimension.X)
    let y = input.acceleration(Dimension.Y)
    let z = input.acceleration(Dimension.Z)
    let pitch = input.rotation(Rotation.Pitch)
    let roll = input.rotation(Rotation.Roll)
    let heading = input.compassHeading()

    serial.writeLine(
    "{\"x\":" + x +
    ",\"y\":" + y +
    ",\"z\":" + z +
    ",\"pitch\":" + pitch +
    ",\"roll\":" + roll +
    ",\"heading\":" + heading + "}"
    )

    basic.pause(50)
})
