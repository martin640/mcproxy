import { IncomingPacket } from './IncomingPacket'

export class PingRequestIncomingPacket extends IncomingPacket {
    private readonly _payload: bigint
    
    constructor(length: number, id: number, raw: Buffer) {
        super(length, id, raw)
        this._payload = this._raw.readLong()
    }
    
    public get payload(): bigint {
        return this._payload
    }
}
