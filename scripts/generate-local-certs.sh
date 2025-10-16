#!/bin/bash

# Script to generate self-signed certificates for local HTTPS development
# These certificates will work for example.test and 127.0.0.1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../certs"
DOMAIN="example.test"

echo "🔐 Generating self-signed certificates for local development..."

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate private key
echo "📝 Generating private key..."
openssl genrsa -out "$CERTS_DIR/${DOMAIN}.key" 2048

# Generate certificate signing request with SAN (Subject Alternative Names)
echo "📝 Generating certificate signing request..."
cat > "$CERTS_DIR/${DOMAIN}.conf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C = US
ST = Local
L = Local
O = Local Development
CN = ${DOMAIN}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = *.${DOMAIN}
DNS.3 = *.shorty.${DOMAIN}
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Generate self-signed certificate
echo "📝 Generating self-signed certificate..."
openssl req -new -x509 \
    -key "$CERTS_DIR/${DOMAIN}.key" \
    -out "$CERTS_DIR/${DOMAIN}.crt" \
    -days 825 \
    -config "$CERTS_DIR/${DOMAIN}.conf" \
    -extensions v3_req

# Clean up config file
rm "$CERTS_DIR/${DOMAIN}.conf"

echo "✅ Certificates generated successfully!"
echo ""
echo "📁 Certificate files:"
echo "   - Private key: $CERTS_DIR/${DOMAIN}.key"
echo "   - Certificate: $CERTS_DIR/${DOMAIN}.crt"
echo ""
echo "⚠️  Note: Your browser will show a security warning because this is a self-signed certificate."
echo "   You can safely proceed by clicking 'Advanced' and 'Proceed to ${DOMAIN}'."
echo ""
echo "💡 For a better experience, you can:"
echo "   1. Add the certificate to your system's trusted certificates"
echo "   2. Or use mkcert (https://github.com/FiloSottile/mkcert) for automatic trust"
echo ""
echo "🔧 For ${DOMAIN} to work locally, add this to /etc/hosts:"
echo "   127.0.0.1 ${DOMAIN} auth.${DOMAIN} mongo.${DOMAIN} api.${DOMAIN} shorty.${DOMAIN} api.shorty.${DOMAIN}"
