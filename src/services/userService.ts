import { upsertUser, UpsertUserParams } from "../repositories/userRepository";

export interface SyncUserResponse {
  id: string;
  credential: string;
  email: string;
  name: string;
  created: boolean;
}

export async function syncUser(params: UpsertUserParams): Promise<SyncUserResponse> {
  const row = await upsertUser(params);

  return {
    id: row.id,
    credential: row.credential,
    email: row.email,
    name: row.name,
    created: row.created,
  };
}
