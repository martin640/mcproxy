import { ProxySocket } from './ProxySocket'

export const logEvent = (client: string | ProxySocket, message: string) => {
    const address = typeof client === 'string' ? client : `${client.client.remoteAddress}:${client.client.remotePort}`
    const hostname = typeof client === 'string' ? '-' : (client.endpoint?.host || '-')
    const date = new Date().toUTCString()
    console.log(`[${JSON.stringify(date)} ${JSON.stringify(address)} ${JSON.stringify(hostname)}] ${message}`)
}
