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

## Common Commands

```bash
docker compose ps          # Check status
docker compose logs -f     # View logs
docker compose restart     # Restart services
docker compose down        # Stop services
```

## Security

- `.env` and `letsencrypt/` are git-ignored
- Traefik dashboard on port 8080 (restrict access in production)
- Docker socket mounted read-only
