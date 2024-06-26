import { IncomingPacket } from './IncomingPacket'

export class StatusRequestIncomingPacket extends IncomingPacket {
    constructor(length: number, id: number, raw: Buffer) {
        super(length, id, raw)
    }
}
