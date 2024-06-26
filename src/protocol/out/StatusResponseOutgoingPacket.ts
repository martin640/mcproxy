import { OutgoingPacket } from './OutgoingPacket'

export interface StatusResponse {
    version: {
        name: string
        protocol: number
    }
    players: {
        max: number
        online: number
        sample: {
            name: string
            id: string
        }[]
    }
    description: {
        text: string
    }
    favicon: string//"data:image/png;base64,<data>",
    enforcesSecureChat: boolean
    previewsChat: boolean
}

export class StatusResponseOutgoingPacket extends OutgoingPacket {
    private readonly _status: StatusResponse
    
    constructor(status: StatusResponse) {
        super(0x00)
        this._status = status
        this._raw.writeString(JSON.stringify(status))
    }
    
    public get status(): StatusResponse {
        return this._status
    }
}
