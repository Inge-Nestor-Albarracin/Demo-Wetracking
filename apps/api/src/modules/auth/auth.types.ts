import type { User } from '../../generated/prisma/client.js';

export type SafeUser = Pick<User,
  'id' | 'name' | 'email' | 'role' | 'active'
>;

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  user?: SafeUser;
}
