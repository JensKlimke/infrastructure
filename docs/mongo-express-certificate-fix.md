# Mongo-Express Certificate Issue - Resolution Documentation

## Issue Summary

The mongo-express service at `https://mongo.marlene.cloud` was not receiving a valid Let's Encrypt SSL certificate. Instead, it was serving Traefik's default self-signed certificate.

## Root Cause Analysis

The issue was **not** with the Let's Encrypt configuration or certificate resolver. The actual problem was:

**Traefik was filtering out mongo-express because its health check was failing.**

### Technical Details

1. **Health Check Failure** (docker-compose.mongo.yml:53)
   - The healthcheck used: `wget http://localhost:8081`
   - `localhost` resolved to IPv6 address `[::1]`
   - Mongo-express was only listening on IPv4 `0.0.0.0:8081`
   - Connection to `[::1]:8081` failed with "Connection refused"

2. **Traefik Behavior**
   - Traefik's Docker provider filters out containers with failing health checks
   - Log showed: `Filtering unhealthy or starting container container=mongo-express`
   - Because mongo-express was marked unhealthy, Traefik:
     - Did not create HTTP/HTTPS routes for it
     - Did not request a Let's Encrypt certificate
     - Served default self-signed certificate for `mongo.marlene.cloud`

## Solution

Changed the healthcheck URL from `localhost` to `127.0.0.1` to force IPv4 resolution:

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:8081"]
```

## Resolution Steps

1. Enabled debug logging in Traefik to identify the issue
2. Discovered mongo-express was being filtered as unhealthy
3. Investigated health check logs showing IPv6 connection failures
4. Modified healthcheck to use IPv4 explicitly (127.0.0.1)
5. Restarted mongo-express container
6. Traefik detected the healthy container
7. Let's Encrypt certificate was automatically requested and issued

## Verification

After the fix:
- Container status: `healthy`
- Certificate subject: `CN=mongo.marlene.cloud`
- Certificate issuer: `C=US; O=Let's Encrypt; CN=R13`
- Valid period: Oct 14, 2025 to Jan 12, 2026
- Service accessible at: `https://mongo.marlene.cloud`

## Key Takeaways

1. Always check container health status when Traefik routes are not appearing
2. IPv6 resolution can cause unexpected health check failures
3. Traefik debug logging (`--log.level=DEBUG`) is invaluable for troubleshooting
4. The Let's Encrypt process works automatically once Traefik detects healthy services
5. Browser SSL errors with "self-signed certificate" from Traefik indicate routing issues, not certificate issues

## Related Configuration Files

- `/root/infrastructure/docker-compose.mongo.yml` - Mongo-express service definition
- `/root/infrastructure/docker-compose.yml` - Traefik configuration
- `/root/infrastructure/letsencrypt/acme.json` - Certificate storage
