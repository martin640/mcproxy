import { Server, Socket } from 'net'
import { ProxySocket } from './lib/ProxySocket'
import { OPT_CONCURRENT_LIMIT, OPT_LISTEN_PORT, OPT_LOG_VERBOSE, OPT_RATE_LIMIT, OPT_RATE_LIMIT_WINDOW } from './config'

let openSockets: Socket[] = []
let connectionIpCounter: [ string, number, number ][] = []

const server = new Server()
server.on('connection', socket => {
    if (!socket.remoteAddress) {
        socket.resetAndDestroy()
        return
    }
    
    const address = socket.remoteAddress
    const addressWithPort = `${socket.remoteAddress}:${socket.remotePort}`
    
    connectionIpCounter = connectionIpCounter.filter(x => x[2] > (Date.now() - OPT_RATE_LIMIT_WINDOW))
    const counter = connectionIpCounter.find(x => x[0] === address)
    
    if ((counter?.[1] || 0) >= OPT_RATE_LIMIT) {
        if (OPT_LOG_VERBOSE) console.log(`[${addressWithPort}] rate-limit (current ${counter?.[1]})`)
        socket.resetAndDestroy()
    } else {
        if (counter) counter[1]++
        else connectionIpCounter.push([address, 1, Date.now()])
        
        const openSocketsByIP = openSockets.filter(x => x.remoteAddress === address).length
        if (openSocketsByIP >= OPT_CONCURRENT_LIMIT) {
            if (OPT_LOG_VERBOSE) console.log(`[${addressWithPort}] max concurrent connections exceeded (current ${openSocketsByIP})`)
            socket.resetAndDestroy()
        } else {
            openSockets.push(socket)
            socket.on('close', () => {
                openSockets = openSockets.filter(x => x !== socket)
                console.log(`[${addressWithPort}] peer disconnected (${new Date().toLocaleString()})`)
            })
            console.log(`[${addressWithPort}] peer connected (${new Date().toLocaleString()})`)
            ProxySocket.from(socket)
        }
    }
})

server.listen(OPT_LISTEN_PORT, '0.0.0.0', () => {
    console.log('mcproxy is ready')
})
