import { HandshakeIncomingPacket } from './HandshakeIncomingPacket'
import { StatusRequestIncomingPacket } from './StatusRequestIncomingPacket'
import { PingRequestIncomingPacket } from './PingRequestIncomingPacket'
import { CursoredBuffer, IncomingPacket } from './IncomingPacket'
import { LoginStartIncomingPacket } from './LoginStartIncomingPacket'
import { StatusResponseIncomingPacket } from './StatusResponseIncomingPacket'

export interface IncomingPacketParseResult {
    packet: IncomingPacket
    end: number
}

export enum IncomingPacketSource {
    CLIENT, BACKEND
}

export const parseIncomingPacket = (b: Buffer, state: number, src: IncomingPacketSource): IncomingPacketParseResult => {
    const reader = new CursoredBuffer(b)
    const length = reader.readVarInt() 
    let position = reader.position
    const id = reader.readVarInt()
    if (b.length < (position + length)) throw new Error(`Expected buffer of size >= ${position + length}, got ${b.length}`)
    const raw = b.subarray(reader.position, position + length)
    let packet: IncomingPacket | null = null
    
    if (src === IncomingPacketSource.CLIENT) {
        if (state === 0) {
            if (id === 0x00) packet = new HandshakeIncomingPacket(length, id, raw)
        }
        if (state === 1) {
            if (id === 0x00) packet = new StatusRequestIncomingPacket(length, id, raw)
            if (id === 0x01) packet = new PingRequestIncomingPacket(length, id, raw)
        }
        if (state === 2) {
            if (id === 0x00) packet = new LoginStartIncomingPacket(length, id, raw)
        }
    } else if (src === IncomingPacketSource.BACKEND) {
        if (state === 1) {
            if (id === 0x00) packet = new StatusResponseIncomingPacket(length, id, raw)
        }
    }
    
    if (!packet) packet = new IncomingPacket(length, id, raw)
    
    return { packet, end: position + length }
}
