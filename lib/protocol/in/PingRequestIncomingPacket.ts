import { IncomingPacket } from './IncomingPacket'

export class PingRequestIncomingPacket extends IncomingPacket {
    private readonly _payload: number
    
    constructor(length: number, id: number, raw: Buffer) {
        super(length, id, raw)
        this._payload = this._raw.readVarLong()
    }
    
    public get payload(): number {
        return this._payload
    }
}
