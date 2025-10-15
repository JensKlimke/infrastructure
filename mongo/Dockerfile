# MongoDB Dockerfile with Replica Set and Keyfile Setup
FROM mongo:8.0.15

# Create directory for keyfile
RUN mkdir -p /etc/mongo

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/

# Make the entrypoint script executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set the entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Expose MongoDB port
EXPOSE 27017
