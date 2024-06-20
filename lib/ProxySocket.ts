import { Socket } from 'net'
import { connect } from 'node:net'
import EventEmitter from 'node:events'
import { HandshakeProtocolPacket, ProtocolPacket } from './ProtocolPacket'

enum SocketState {
    HANDSHAKE,
    FORWARD,
    CLOSED
}

const ACCEPT_HOST = process.env.OPT_ACCEPT_HOST || ''

export class ProxySocket extends EventEmitter {
    private readonly _client: Socket
    private readonly _backend: Socket
    private readonly _timeoutTimer: NodeJS.Timeout
    private _state: SocketState
    private _handshakeBuffer: Buffer
    private readonly _pipe: () => void
    
    private constructor(socket: Socket) {
        super()
        this._backend = connect({ host: '127.0.0.1', port: Number(process.env.OPT_BACKEND_PORT || 25566) })
        const backendDataCallback = (b: Buffer) => this._handleServerData(b)
        this._backend.on('data', backendDataCallback)
        this._backend.on('error', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
            try { this._client.resetAndDestroy() } catch { }
        })
        this._backend.on('close', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
        })
        this._client = socket
        const clientDataCallback = (b: Buffer) => this._handleClientData(b)
        this._client.on('data', clientDataCallback)
        this._client.on('error', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
            try { this._backend.resetAndDestroy() } catch { }
        })
        this._client.on('close', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
        })
        this._state = SocketState.HANDSHAKE
        this._handshakeBuffer = Buffer.from([])
        this._timeoutTimer = setTimeout(() => {
            if (this._state === SocketState.HANDSHAKE) {
                console.warn(`[${this._tag()}] Handshake timed out`)
                this.close()
            }
        }, 5000)
        this._pipe = () => {
            // create pipes and unregister data handlers
            this._client.pipe(this._backend)
            this._backend.pipe(this._client)
            this._client.off('data', clientDataCallback)
            this._backend.off('data', backendDataCallback)
        }
    }
    
    private _tag() {
        return `${this._client.remoteAddress}:${this._client.remotePort}`
    }
    
    private _handleClientData(b: Buffer) {
        if (this._state === SocketState.HANDSHAKE) {
            if ((this._handshakeBuffer.length + b.length) > 2097151) {
                this.close()
                console.warn(`[${this._tag()}] client didn't send handshake packet within the first 2 MB`)
            }
            this._handshakeBuffer = Buffer.concat([this._handshakeBuffer, b])
            
            const packet = ProtocolPacket.fromBuffer(this._handshakeBuffer)
            if (packet && (packet.packetID === 0x00)) {
                const handshakePacket = packet as HandshakeProtocolPacket
                if (handshakePacket.address === ACCEPT_HOST) {
                    this._state = SocketState.FORWARD
                    clearTimeout(this._timeoutTimer)
                    this._handleClientData(b)
                    this._pipe()
                } else {
                    console.warn(`[${this._tag()}] client used incorrect hostname: ${handshakePacket.address.substring(0, 16)}`)
                    this.close()
                }
            }
        } else if (this._state === SocketState.FORWARD) {
            this._backend.write(b)
        }
    }
    
    private _handleServerData(b: Buffer) {
        if (this._state === SocketState.FORWARD) {
            this._client.write(b)
        }
    }
    
    public close() {
        this._state = SocketState.CLOSED
        clearTimeout(this._timeoutTimer)
        try { this._client.resetAndDestroy() } catch { }
        try { this._backend.resetAndDestroy() } catch { }
    }
    
    public static from(s: Socket) {
        return new ProxySocket(s)
    }
}
