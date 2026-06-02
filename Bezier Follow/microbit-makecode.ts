bluetooth.startUartService()
bluetooth.setTransmitPower(7)
basic.showIcon(IconNames.SmallDiamond)
basic.pause(500)
basic.showString(control.deviceName())

input.onButtonPressed(Button.A, function () {
    basic.showString(control.deviceName())
})

bluetooth.onBluetoothConnected(function () {
    basic.showIcon(IconNames.Yes)
})

bluetooth.onBluetoothDisconnected(function () {
    basic.showIcon(IconNames.SmallDiamond)
})

basic.forever(function () {
    let x = input.acceleration(Dimension.X)
    let y = input.acceleration(Dimension.Y)
    let z = input.acceleration(Dimension.Z)
    let pitch = input.rotation(Rotation.Pitch)
    let roll = input.rotation(Rotation.Roll)
    let heading = input.compassHeading()
    let payload = "{\"x\":" + x +
        ",\"y\":" + y +
        ",\"z\":" + z +
        ",\"pitch\":" + pitch +
        ",\"roll\":" + roll +
        ",\"heading\":" + heading + "}"

    bluetooth.uartWriteLine(payload)

    basic.pause(50)
})
