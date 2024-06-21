import { OutgoingPacket } from './OutgoingPacket'
import { PingRequestIncomingPacket } from '../in/PingRequestIncomingPacket'

export class PingResponseOutgoingPacket extends OutgoingPacket {
    private readonly _payload: number
    
    constructor(v: number | PingRequestIncomingPacket) {
        super(0x01)
        this._payload = typeof v === 'number' ? v : v.payload
        this._raw.writeVarInt(this._payload)
    }
    
    public get payload(): number {
        return this._payload
    }
}
