#!/bin/bash
export PGPASSWORD=postgres

# Function to run SQL
run_sql() {
  echo "Running SQL: $1"
  docker compose -f supabase/docker-compose.yml exec -T db psql -U postgres -d postgres -c "$1"
}

# Function to run SQL file
run_sql_file() {
  echo "Running SQL file: $1"
  docker compose -f supabase/docker-compose.yml exec -T db psql -U postgres -d postgres < "$1"
}

echo "Resetting DB..."
run_sql "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"

# Create auth schema
echo "Setting up local environment mocks..."
run_sql "CREATE SCHEMA IF NOT EXISTS auth;"

# Create auth.uid() using HEREDOC to avoid shell expansion of $$
cat << 'EOF' > temp_setup.sql
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ 
SELECT '00000000-0000-0000-0000-000000000000'::uuid; 
$$ LANGUAGE SQL IMMUTABLE;
EOF

echo "Creating auth.uid() function..."
run_sql_file temp_setup.sql

# Create extension
run_sql "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" SCHEMA public;"

echo "Running migrations..."
run_sql_file "supabase/migrations/20240101000000_init.sql"
run_sql_file "supabase/migrations/20260103000000_add_performance_indexes.sql"
run_sql_file "supabase/migrations/20260106000000_fix_messages_schema.sql"

rm temp_setup.sql
echo "Done!"
