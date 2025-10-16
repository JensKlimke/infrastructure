# Infrastructure

Docker infrastructure with Traefik reverse proxy, nginx web server, and automatic Let's Encrypt SSL/TLS.

## Quick Start

```bash
# Clone and configure
git clone git@github.com:JensKlimke/infrastructure.git
cd infrastructure
cp .env.example .env
nano .env  # Set DOMAIN and LETSENCRYPT_EMAIL

# Start services
docker compose up -d
```

Your site is now live at `https://yourdomain.com` with automatic HTTPS.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your domain name |
| `LETSENCRYPT_EMAIL` | Email for SSL notifications |
| `HTTP_PORT` | HTTP port (default: 80) |
| `HTTPS_PORT` | HTTPS port (default: 443) |
| `TRAEFIK_DASHBOARD_PORT` | Dashboard port (default: 8080) |

## Services

- **Traefik** - Reverse proxy with Let's Encrypt on ports 80/443
- **Web** - Nginx serving static content

## Local Development with HTTPS

For local development, use `docker-compose.local.yml` which includes HTTPS support with self-signed certificates.

### First-Time Setup

1. **Generate self-signed certificates**:
   ```bash
   ./scripts/generate-local-certs.sh
   ```
   This creates `certs/localhost.crt` and `certs/localhost.key`.

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   nano .env  # Set COOKIE_SECRET and RESEND_API_KEY
   ```

3. **Start services**:
   ```bash
   docker compose -f docker-compose.local.yml up -d
   ```

4. **Access your site**:
   - HTTP: http://localhost
   - HTTPS: https://localhost (your browser will show a security warning for self-signed certificates)

### Trusting the Certificate (Optional)

To avoid browser warnings, you can either:

1. **Manually trust the certificate** (varies by browser):
   - Chrome/Edge: Click "Advanced" → "Proceed to localhost"
   - Add `certs/localhost.crt` to your system's trusted certificates

2. **Use mkcert** for automatically trusted certificates:
   ```bash
   # Install mkcert
   brew install mkcert  # macOS
   # or follow instructions at https://github.com/FiloSottile/mkcert

   # Generate trusted certificates
   mkcert -install
   mkcert -cert-file certs/localhost.crt -key-file certs/localhost.key localhost 127.0.0.1 ::1

   # Restart services
   docker compose -f docker-compose.local.yml restart traefik
   ```

### Why HTTPS for Local Development?

HTTPS is required for local development when:
- Testing authentication flows
- Browser security features force HTTPS redirects
- Testing secure cookies and HSTS headers
- Matching production environment behavior

## Shorty Stack

The infrastructure supports deploying the Shorty URL shortener application as a separate stack that integrates with the main Traefik reverse proxy and authentication middleware.

### Production Deployment

1. **Ensure main stack is running** (creates the shared network):
   ```bash
   docker compose up -d
   ```

2. **Configure Shorty environment variables** in `.env`:
   ```bash
   SHORTY_MONGO_ROOT_USERNAME=shorty_admin
   SHORTY_MONGO_ROOT_PASSWORD=your-secure-password
   ```

3. **Deploy Shorty stack**:
   ```bash
   docker compose -f docker-compose.shorty.yml up -d
   ```

The Shorty application will be available at:
- Frontend: `https://shorty.yourdomain.com`
- Backend API: `https://api.shorty.yourdomain.com`

Both endpoints are protected by the authentication middleware from the main stack.

### Local Development

For local development with self-signed certificates:

```bash
# Start main stack
docker compose -f docker-compose.local.yml up -d

# Start Shorty stack
docker compose -f docker-compose.shorty.local.yml up -d
```

Access locally at:
- Frontend: `https://shorty.localhost`
- Backend API: `https://api.shorty.localhost`

## Common Commands

```bash
# Local development
docker compose -f docker-compose.local.yml ps          # Check status
docker compose -f docker-compose.local.yml logs -f     # View logs
docker compose -f docker-compose.local.yml restart     # Restart services
docker compose -f docker-compose.local.yml down        # Stop services

# Shorty stack (local)
docker compose -f docker-compose.shorty.local.yml ps
docker compose -f docker-compose.shorty.local.yml logs -f
docker compose -f docker-compose.shorty.local.yml down

# Production
docker compose ps          # Check status
docker compose logs -f     # View logs
docker compose restart     # Restart services
docker compose down        # Stop services

# Shorty stack (production)
docker compose -f docker-compose.shorty.yml ps
docker compose -f docker-compose.shorty.yml logs -f
docker compose -f docker-compose.shorty.yml down
```

## Security

- `.env`, `letsencrypt/`, and `certs/` are git-ignored
- Traefik dashboard on port 8080 (restrict access in production)
- Docker socket mounted read-only
- Self-signed certificates for local development only (never use in production)
