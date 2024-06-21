import { Socket, connect } from 'net'
import { config, EndpointSchema, OPT_LOG_VERBOSE } from '../config'
import { logEvent } from './Logger'
import { HandshakeIncomingPacket } from './protocol/in/HandshakeIncomingPacket'
import { HandshakeOutgoingPacket } from './protocol/out/HandshakeOutgoingPacket'
import { StatusResponseOutgoingPacket } from './protocol/out/StatusResponseOutgoingPacket'
import { PingResponseOutgoingPacket } from './protocol/out/PingResponseOutgoingPacket'
import { PingRequestIncomingPacket } from './protocol/in/PingRequestIncomingPacket'
import { DisconnectOutgoingPacket } from './protocol/out/DisconnectOutgoingPacket'
import { parseIncomingPacket } from './protocol/in/parser'

enum SocketState {
    HANDSHAKE,
    STATUS,
    LOGIN,
    FORWARD,
    CLOSED
}

export class ProxySocket {
    private readonly _client: Socket
    private _backend: Socket | undefined
    
    private _state: SocketState
    private _endpoint: EndpointSchema | undefined
    private _buffer: Buffer
    private readonly _timeoutTimer: NodeJS.Timeout
    private readonly _unregisterClientCallbacks: () => void
    
    private constructor(socket: Socket) {
        this._client = socket
        const clientDataCallback = this._handleClientData.bind(this)
        this._client.on('data', clientDataCallback)
        this._client.on('error', e => {
            if (OPT_LOG_VERBOSE) logEvent(this, `${e.message} (error caused by client socket)`)
            this.close()
        })
        this._client.on('close', () => {
            this.close()
        })
        this._unregisterClientCallbacks = () => {
            this._client.off('data', clientDataCallback)
        }
        
        this._state = SocketState.HANDSHAKE
        this._buffer = Buffer.from([])
        this._timeoutTimer = setTimeout(() => {
            if (this._state === SocketState.HANDSHAKE) {
                if (OPT_LOG_VERBOSE) logEvent(this, 'Handshake timed out')
                this.close()
            }
        }, 5000)
    }
    
    private _handleClientData(b: Buffer) {
        if (OPT_LOG_VERBOSE) logEvent(this, `received ${b.length} B chunk`)
        
        if (this._state === SocketState.HANDSHAKE || this._state === SocketState.STATUS) {
            if ((this._buffer.length + b.length) > config.handshakeBufferLimit) {
                this.close()
                if (OPT_LOG_VERBOSE) logEvent(this, `client didn't send handshake packet within the first ${config.handshakeBufferLimit} bytes`)
                return
            }
            this._buffer = Buffer.concat([this._buffer, b])
        }
        
        if (this._state === SocketState.HANDSHAKE) {
            const packet = parseIncomingPacket(this._buffer, 0)
            if (packet && (packet.id === 0x00)) {
                const handshakePacket = packet as HandshakeIncomingPacket
                const endpoint = config.endpoints.find(x => x.host === handshakePacket.address) || config.endpoints.find(x => x.name === '_default')
                if (endpoint) {
                    this._endpoint = endpoint
                    this._state = SocketState.FORWARD
                    clearTimeout(this._timeoutTimer)
                    
                    if (endpoint.backend) {
                        if (endpoint.rewrite) {
                            this._buffer = new HandshakeOutgoingPacket(
                                handshakePacket.version,
                                endpoint.rewrite,
                                handshakePacket.port,
                                handshakePacket.nextState
                            ).toBuffer()
                        }
                        
                        const endpointAddress = endpoint.backend.split(':', 2)
                        this._backend = connect({ host: endpointAddress[0], port: Number(endpointAddress[1]), timeout: 2000 })
                        this._backend.on('error', e => {
                            if (OPT_LOG_VERBOSE) logEvent(this, `${e.message} (error caused by backend socket)`)
                            this.close()
                        })
                        this._backend.on('close', () => {
                            this.close()
                        })
                        this._backend.on('connect', () => {
                            if (!this._backend || this._state !== SocketState.FORWARD) return
                            this._unregisterClientCallbacks()
                            this._backend.pipe(this._client)
                            this._client.pipe(this._backend)
                            this._backend.write(this._buffer)
                            // release buffer reference
                            this._buffer = Buffer.from([])
                        })
                    } else {
                        if (handshakePacket.nextState === 1) { // status
                            this._state = SocketState.STATUS
                        } else {
                            this._state = SocketState.LOGIN
                        }
                    }
                    
                } else {
                    const hostEscaped = handshakePacket.address.substring(0, 16).replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                    if (OPT_LOG_VERBOSE) logEvent(this, `unknown hostname: ${hostEscaped}`)
                    this.close()
                }
            }
        } else if (this._state === SocketState.STATUS) {
            const packet = parseIncomingPacket(this._buffer, 1)
            if (packet) {
                if (packet.id === 0x00) {
                    this._client.write(new StatusResponseOutgoingPacket({
                        version: {
                            name: this._endpoint?.version || '',
                            protocol: 762
                        },
                        players: {
                            max: 1,
                            online: 0,
                            sample: []
                        },
                        description: {
                            text: this._endpoint?.motd || ''
                        },
                        favicon: '',
                        enforcesSecureChat: false,
                        previewsChat: false,
                    }).toBuffer())
                } else if (packet.id === 0x01) {
                    this._client.write(new PingResponseOutgoingPacket(packet as PingRequestIncomingPacket).toBuffer())
                }
            }
        } else if (this._state === SocketState.LOGIN) {
            this._client.write(new DisconnectOutgoingPacket(this._endpoint?.message || 'Disconnected').toBuffer(), () => {
                this.close()
            })
        }
    }
    
    public close() {
        this._state = SocketState.CLOSED
        clearTimeout(this._timeoutTimer)
        this._unregisterClientCallbacks()
        this._client.resetAndDestroy()
        if (this._backend) this._backend.resetAndDestroy()
        if (this._buffer.length) this._buffer = Buffer.from([])
    }
    
    public get client(): Socket {
        return this._client
    }
    
    
    public get backend(): Socket | undefined {
        return this._backend
    }
    
    public get state(): SocketState {
        return this._state
    }
    
    public get endpoint(): EndpointSchema | undefined {
        return this._endpoint
    }
    
    public static from(s: Socket) {
        return new ProxySocket(s)
    }
}
