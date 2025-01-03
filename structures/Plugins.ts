export class Plugin {
    constructor(readonly name: string) { }

    load(_aqua: import("./Aqua").Aqua) { }
    unload(_aqua: import("./Aqua").Aqua) { }
}

