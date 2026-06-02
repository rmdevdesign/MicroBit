basic.showIcon(IconNames.SmallDiamond)

basic.forever(function () {
    let pitch = input.rotation(Rotation.Pitch)
    let roll = input.rotation(Rotation.Roll)
    let heading = input.compassHeading()
    let x = input.acceleration(Dimension.X)
    let y = input.acceleration(Dimension.Y)
    let z = input.acceleration(Dimension.Z)

    serial.writeLine(
    "{\"pitch\":" + pitch +
    ",\"roll\":" + roll +
    ",\"heading\":" + heading +
    ",\"x\":" + x +
    ",\"y\":" + y +
    ",\"z\":" + z + "}"
    )

    basic.pause(50)
})
