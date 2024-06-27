import { ProxySocket } from './ProxySocket'

export const logEvent = (client: string | ProxySocket, message: string) => {
    const address = typeof client === 'string' ? client : `${client.client.remoteAddress}:${client.client.remotePort}`
    const hostname = typeof client === 'string' ? '-' : (client.endpoint?.hostname || '-')
    const state = typeof client === 'string' ? '-' : client.stateName
    const elapsed = typeof client === 'string' ? '-' : (performance.now() - client.timeStarted).toFixed(3)
    const date = new Date().toLocaleString()
    console.log(`[${JSON.stringify(date)} ${JSON.stringify(elapsed)} ${JSON.stringify(address)} ${JSON.stringify(state)} ${JSON.stringify(hostname)}] ${message}`)
}
