FROM nginx:latest

# Copy custom nginx configuration
COPY nginx/conf.d/marlene.cloud.conf /etc/nginx/conf.d/default.conf

# Copy website content
COPY html /usr/share/nginx/html

# Update nginx config to listen on port 8080
RUN sed -i 's/listen 80;/listen 8080;/g' /etc/nginx/conf.d/default.conf

# Expose port 8080
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
