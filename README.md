# mcproxy

mcproxy is a simple reverse proxy for Minecraft

## Configuration

example configuration in config.yml:

```yaml
settings:
  cache-size: 1024 # maximum number of entries in limiting counters
  handshake-timeout: 3 # close connection if client doesn't send handshake packet within 3 seconds
  handshake-buffer-limit: 64 # close connection if client doesn't send handshake packet within first 64 bytes of data
  rate-limit-window: 60 # reset rate limit counter after 60 seconds
  rate-limit: 5 # allow max 5 connections from single IP address within rate-limit-window
  concurrent-limit: 5 # allow max 5 concurrent connections from single IP address
  clients-limit: 200 # allow max total 200 concurrent connections
  listen: 25565
  log: verbose

endpoints:
  server1:
    host: mc1.example.com # hostname used by client to connect to the server
    backend: 127.0.0.1:3000 # Minecraft server to forward traffic to
  server2:
    host: mc2.example.com
    backend: 127.0.0.1:3001
  server2alias:
    host: coolserver.com
    rewrite: mc2.example.com # modify hostname in the handshake packet, mcproxy automatically resolves backend address from the referenced endpoint
  _default:
    motd: THIS IS FALLBACK STATUS # custom motd
    message: Sorry this server is not available. Try connecting to mc1.example.com # message on join
  _default2: # alternative fallback endpoint - rename to _default
    rewrite: mc1.example.com # fallback to server1

blocklist:
  - 192.168.1.5 # block ip from all endpoints
```

## Installation

1. install dependencies with `npm i`
2. create a configuration file `config.yml` and edit it to your needs
3. start service with `npm run start`
4. that's it ^^
