import { Server } from 'net'
import { ProxySocket } from './lib/ProxySocket'

const server = new Server()
server.on('connection', socket => {
    socket.on('close', () => {
        console.log(`[${socket.remoteAddress}:${socket.remotePort}] peer disconnected (${new Date().toLocaleString()})`)
    })
    console.log(`[${socket.remoteAddress}:${socket.remotePort}] peer connected (${new Date().toLocaleString()})`)
    ProxySocket.from(socket)
})

server.listen(Number(process.env.OPT_LISTEN_PORT || 25565), '0.0.0.0', () => {
    console.log('mcproxy is ready')
})
