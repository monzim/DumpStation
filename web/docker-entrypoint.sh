#!/bin/sh
# Generate runtime configuration from environment variables

cat > /app/dist/client/config.js << EOF
// Runtime configuration
// This file is generated from environment variables at container startup
window.APP_CONFIG = {
  API_BASE_URL: '${VITE_API_BASE_URL:-http://localhost:8080/api/v1}',
  TURNSTILE_SITE_KEY: '${VITE_TURNSTILE_SITE_KEY:-}'
};
EOF

echo "Generated config.js with:"
echo "  API_BASE_URL: ${VITE_API_BASE_URL:-http://localhost:8080/api/v1}"
echo "  TURNSTILE_SITE_KEY: ${VITE_TURNSTILE_SITE_KEY:-}"

# Start the application
exec "$@"
