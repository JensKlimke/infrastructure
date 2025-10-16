#!/bin/bash
set -e

echo 'Starting MongoDB initialization...'

# Generate keyfile if it doesn't exist (for replica set authentication)
if [ ! -f /etc/mongo/mongo-keyfile ]; then
  echo 'Generating MongoDB keyfile...'
  openssl rand -base64 756 > /etc/mongo/mongo-keyfile
  chown mongodb:mongodb /etc/mongo/mongo-keyfile
  chmod 400 /etc/mongo/mongo-keyfile
  echo 'Keyfile generated successfully'
else
  echo 'Keyfile already exists, skipping generation'
  chown mongodb:mongodb /etc/mongo/mongo-keyfile
  chmod 400 /etc/mongo/mongo-keyfile
fi

# Start MongoDB in background WITHOUT authentication first (to create users and initialize replica set)
echo 'Starting MongoDB without authentication for initial setup...'
mongod --replSet rs0 --bind_ip_all --fork --logpath /var/log/mongodb.log

# Wait for MongoDB to be ready
echo 'Waiting for MongoDB to be ready...'
until mongosh --quiet --eval 'db.adminCommand("ping")' > /dev/null 2>&1; do
  echo 'MongoDB not ready yet, waiting...'
  sleep 2
done
echo 'MongoDB is ready'

# Check if replica set is already initialized
RS_STATUS=$(mongosh --quiet --eval 'try { rs.status().ok } catch(e) { 0 }')

# Get hostname for replica set (defaults to 'mongodb' if not set)
MONGO_HOSTNAME=${MONGO_HOSTNAME:-mongodb}

if [ "$RS_STATUS" = "1" ]; then
  echo 'Replica set already initialized'
else
  echo "Initializing replica set with hostname: $MONGO_HOSTNAME..."
  mongosh --eval "rs.initiate({
    _id: \"rs0\",
    members: [{ _id: 0, host: \"${MONGO_HOSTNAME}:27017\" }]
  })"

  # Wait for replica set to be ready
  echo 'Waiting for replica set to be ready...'
  until mongosh --quiet --eval 'rs.status().ok' | grep -q 1; do
    sleep 1
  done
  echo 'Replica set initialized successfully'
fi

# Wait a bit more for replica set to elect primary
sleep 2

# Check if admin user already exists
echo 'Checking if admin user exists...'
ADMIN_EXISTS=$(mongosh admin --quiet --eval "try { db.getUser('${MONGO_INITDB_ROOT_USERNAME}') ? 1 : 0 } catch(e) { 0 }")

if [ "$ADMIN_EXISTS" = "1" ]; then
  echo 'Admin user already exists, skipping creation'
else
  echo 'Creating admin user...'
  mongosh admin --eval "
    db.createUser({
      user: '${MONGO_INITDB_ROOT_USERNAME}',
      pwd: '${MONGO_INITDB_ROOT_PASSWORD}',
      roles: [
        { role: 'root', db: 'admin' }
      ]
    })
  "
  echo 'Admin user created successfully'
fi

# Shutdown the background MongoDB
echo 'Shutting down background MongoDB process...'
mongosh admin -u "${MONGO_INITDB_ROOT_USERNAME}" -p "${MONGO_INITDB_ROOT_PASSWORD}" --eval 'db.getSiblingDB("admin").shutdownServer()' > /dev/null 2>&1 || \
mongosh --eval 'db.getSiblingDB("admin").shutdownServer()' > /dev/null 2>&1 || true
sleep 3

# Start MongoDB in foreground WITH authentication (this keeps the container running)
echo 'Starting MongoDB in foreground with authentication...'
exec mongod --replSet rs0 --bind_ip_all --keyFile /etc/mongo/mongo-keyfile
