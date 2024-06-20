# mcproxy

mcproxy is a simple proxy service that allows connection to the server only through specific hostname

## Configuration

mcproxy is currently using following environment variables

| name                  | type    | default        | description                                                                                       |
|-----------------------|---------|----------------|---------------------------------------------------------------------------------------------------|
| OPT_LISTEN_PORT       | number  | 25565          | port on which proxy listens for incoming connections                                              |
| OPT_BACKEND_PORT      | number  | 25566          | port on which underlying Minecraft server is listening                                            |
| OPT_ACCEPT_HOST       | string  | (empty string) | hostname(s) which must be used when connecting to the server, use colon to set multiple hostnames |
| OPT_RATE_LIMIT        | number  | 16             | number of connections a client from single IP address can make                                    |
| OPT_RATE_LIMIT_WINDOW | number  | 60000          | window size in ms to reset rate limit counter                                                     |
| OPT_CONCURRENT_LIMIT  | number  | 4              | number of concurrent connections from single IP address proxy can accept                          |
| OPT_LOG_VERBOSE       | boolean | false          | log decisions made by the proxy                                                                   |

## Installation

1. install dependencies with `npm i`
2. start service with `npm run start`
3. that's it ^^
