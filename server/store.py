"""PostgreSQL persistence. No plaintext tokens or recordings are stored."""
from pathlib import Path

from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool


class PostgresStore:
    def __init__(self, database_url: str):
        self.pool = ConnectionPool(database_url, min_size=1, max_size=5, open=False, timeout=5)

    def open(self):
        self.pool.open(wait=True, timeout=15)
        with self.pool.connection() as connection:
            # Serialize schema creation across concurrent replicas.
            connection.execute('SELECT pg_advisory_xact_lock(74743301)')
            connection.execute('CREATE TABLE IF NOT EXISTS riff_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
            for path in sorted((Path(__file__).parent / 'migrations').glob('*.sql')):
                if connection.execute('SELECT 1 FROM riff_migrations WHERE name = %s', (path.name,)).fetchone():
                    continue
                connection.execute(path.read_text(encoding='utf-8'))
                connection.execute('INSERT INTO riff_migrations(name) VALUES (%s)', (path.name,))

    def close(self):
        self.pool.close()

    def ready(self):
        with self.pool.connection() as connection:
            connection.execute('SELECT 1').fetchone()

    def create(self, token_hash: str):
        with self.pool.connection() as connection:
            connection.execute('INSERT INTO riff_accounts(token_hash) VALUES (%s)', (token_hash,))

    def read(self, token_hash: str):
        with self.pool.connection() as connection:
            row = connection.execute('SELECT progress FROM riff_accounts WHERE token_hash = %s', (token_hash,)).fetchone()
        return (row is not None, row[0] if row else None)

    def write(self, token_hash: str, progress: dict):
        with self.pool.connection() as connection:
            return connection.execute('UPDATE riff_accounts SET progress = %s, updated_at = now() WHERE token_hash = %s', (Jsonb(progress), token_hash)).rowcount == 1

    def delete(self, token_hash: str):
        with self.pool.connection() as connection:
            return connection.execute('DELETE FROM riff_accounts WHERE token_hash = %s', (token_hash,)).rowcount == 1
