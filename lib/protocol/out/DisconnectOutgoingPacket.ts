import { OutgoingPacket } from './OutgoingPacket'

export class DisconnectOutgoingPacket extends OutgoingPacket {
    private readonly _reason: string
    
    constructor(reason: string) {
        super(0x00)
        this._reason = reason
        this._raw.writeString(JSON.stringify({ text: reason }))
    }
    
    public get reason(): string {
        return this._reason
    }
}
