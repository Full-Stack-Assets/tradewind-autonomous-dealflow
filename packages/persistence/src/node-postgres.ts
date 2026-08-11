import type { SqlClient, SqlConnection, SqlResult } from './contracts.ts';

export interface NodePostgresQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface NodePostgresPoolClientLike {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<NodePostgresQueryResult<Row>>;
  release(): void;
}

export interface NodePostgresPoolLike {
  connect(): Promise<NodePostgresPoolClientLike>;
  end(): Promise<void>;
}

export class NodePostgresSqlClient implements SqlClient {
  private readonly pool: NodePostgresPoolLike;

  constructor(pool: NodePostgresPoolLike) {
    this.pool = pool;
  }

  async connect(): Promise<SqlConnection> {
    const client = await this.pool.connect();
    return {
      async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ): Promise<SqlResult<Row>> {
        const result = await client.query<Row>(text, values);
        return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
      },
      release(): void {
        client.release();
      },
    };
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export interface CreateNodePostgresClientOptions {
  connectionString: string;
  maxConnections?: number;
  applicationName?: string;
}

export async function createNodePostgresClient(
  options: CreateNodePostgresClientOptions,
): Promise<NodePostgresSqlClient> {
  if (options.connectionString.trim().length === 0) throw new Error('PostgreSQL connection string is required');
  const moduleName = 'pg';
  const pg = await import(moduleName) as {
    Pool: new (options: Record<string, unknown>) => NodePostgresPoolLike;
  };
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? 'tradewind-autonomous-dealflow',
  });
  return new NodePostgresSqlClient(pool);
}
