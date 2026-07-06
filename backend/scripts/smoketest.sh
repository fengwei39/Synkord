#!/usr/bin/env bash
# Synkord end-to-end smoke test
set -e
cd "$(dirname "$0")/.."

# Cleanup any previous DB
rm -f data/synkord.db data/synkord.db-* 2>/dev/null

# Start server
go run main.go > /tmp/synkord.log 2>&1 &
SERVER_PID=$!
sleep 3

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "=== Login OK ==="

# Create contract (use English name to avoid encoding issues in shell)
echo ""
echo "=== Create contract ==="
CONTRACT=$(curl -s -X POST http://127.0.0.1:8000/api/contracts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"order-platform","description":"Order Service"}')
CID=$(echo "$CONTRACT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$CONTRACT" | head -c 200
echo ""
echo "Contract ID: $CID"

# Add entity with schema (use here-doc to avoid escaping issues)
echo ""
echo "=== Add Order entity ==="
cat > /tmp/order_entity.json << 'JSONEOF'
{
  "name": "Order",
  "description": "Order",
  "schema_content": "{\"type\":\"object\",\"required\":[\"id\",\"status\"],\"properties\":{\"id\":{\"type\":\"string\"},\"status\":{\"type\":\"string\",\"enum\":[\"pending\",\"paid\",\"shipped\"]},\"userId\":{\"type\":\"string\"}}}"
}
JSONEOF
curl -s -X POST "http://127.0.0.1:8000/api/contracts/$CID/entities" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @/tmp/order_entity.json | head -c 300

echo ""
echo "=== Add User entity ==="
cat > /tmp/user_entity.json << 'JSONEOF'
{
  "name": "User",
  "description": "User",
  "schema_content": "{\"type\":\"object\",\"properties\":{\"id\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"},\"email\":{\"type\":\"string\"}}}"
}
JSONEOF
curl -s -X POST "http://127.0.0.1:8000/api/contracts/$CID/entities" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @/tmp/user_entity.json | head -c 300

# Add API referencing Order (use file-based payload to avoid escaping)
echo ""
echo "=== Add API referencing Order ==="
cat > /tmp/api_payload.json << 'JSONEOF'
{
  "path": "/api/orders/{id}",
  "method": "GET",
  "summary": "Get Order",
  "tags": ["orders"],
  "parameters": [
    {"name": "id", "in": "path", "required": true, "schema": {"type": "string"}}
  ],
  "responses": {
    "200": {
      "description": "OK",
      "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Order"}}}
    }
  }
}
JSONEOF
curl -s -X POST "http://127.0.0.1:8000/api/contracts/$CID/apis" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @/tmp/api_payload.json | head -c 300

echo ""
echo "=== Get dependency graph ==="
curl -s "http://127.0.0.1:8000/api/contracts/$CID/dependencies/graph" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== Set active contract ==="
curl -s -X PUT http://127.0.0.1:8000/api/mcp/active-contract -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"contract_id\":\"$CID\"}"

# Test validate_code (write to file to avoid bash escaping)
echo ""
echo "=== MCP validate_code (wrong path) ==="
cat > /tmp/bad_code.json << 'JSONEOF'
{
  "tool": "validate_code_against_contract",
  "caller": "Cursor",
  "args": {
    "code_snippet": "const res = await fetch(\"/api/wrong-path\");\nconst order = res.Order.wrongField;",
    "language": "typescript"
  }
}
JSONEOF
curl -s -X POST http://127.0.0.1:8000/api/mcp/query -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @/tmp/bad_code.json | head -c 800

echo ""
echo "=== MCP validate_code (correct) ==="
cat > /tmp/good_code.json << 'JSONEOF'
{
  "tool": "validate_code_against_contract",
  "caller": "Cursor",
  "args": {
    "code_snippet": "const res = await fetch(\"/api/orders/123\");\nconst id = res.Order.id;",
    "language": "typescript"
  }
}
JSONEOF
curl -s -X POST http://127.0.0.1:8000/api/mcp/query -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @/tmp/good_code.json | head -c 800

echo ""
echo "=== List members (should include username) ==="
curl -s "http://127.0.0.1:8000/api/contracts/$CID/members" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== Access log ==="
curl -s http://127.0.0.1:8000/api/mcp/access-log -H "Authorization: Bearer $TOKEN" | head -c 600
echo ""
echo "=== Done ==="