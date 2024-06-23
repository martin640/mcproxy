import { IncomingPacket } from './IncomingPacket'
import { StatusResponse } from '../out/StatusResponseOutgoingPacket'

export class StatusResponseIncomingPacket extends IncomingPacket {
    private readonly _status: StatusResponse
    
    constructor(length: number, id: number, raw: Buffer) {
        super(length, id, raw)
        const json = this._raw.readString()
        this._status = JSON.parse(json)
    }
    
    public get status(): StatusResponse {
        return this._status
    }
}
