import pool from "../config/db";

export interface UpsertUserParams {
  credential: string;
  email: string;
  name: string;
}

export interface UpsertUserResult {
  id: string;
  credential: string;
  email: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  created: boolean;
}

export async function upsertUser(params: UpsertUserParams): Promise<UpsertUserResult> {
  const { credential, email, name } = params;

  const { rows } = await pool.query<UpsertUserResult>(
    `INSERT INTO users (credential, email, name, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (credential, email) DO UPDATE
       SET name = EXCLUDED.name,
           updated_at = NOW()
     RETURNING *, (xmax = 0) AS created`,
    [credential, email, name]
  );

  return rows[0];
}
