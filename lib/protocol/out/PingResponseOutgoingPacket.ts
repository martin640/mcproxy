import { OutgoingPacket } from './OutgoingPacket'
import { PingRequestIncomingPacket } from '../in/PingRequestIncomingPacket'

export class PingResponseOutgoingPacket extends OutgoingPacket {
    private readonly _payload: bigint
    
    constructor(v: bigint | PingRequestIncomingPacket) {
        super(0x01)
        this._payload = typeof v === 'bigint' ? v : v.payload
        this._raw.writeLong(this._payload)
    }
    
    public get payload(): bigint {
        return this._payload
    }
}
