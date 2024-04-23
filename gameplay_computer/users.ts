import { z } from "zod";
import { Uuid25 } from "uuid25";
import { uuidv7obj } from "uuidv7";
import { eq } from "drizzle-orm";

import { Name } from "./games/game.ts";

import { traced } from "./tracing.ts";
import { GamePlayDB, NotFound, schema, SelectUser, UserId } from "./schema.ts";

export function userId(): UserId {
  return `u_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as UserId;
}

export const fetchUserByUsername = traced(
  "fetchUserByUsername",
  _fetchUserByUsername,
);
async function _fetchUserByUsername(
  db: GamePlayDB,
  username: Name,
): Promise<SelectUser | NotFound> {
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username));
  if (users.length > 0) {
    return users[0];
  }
  return new NotFound("user", username);
}

export const ClerkUser = z.object({
  clerk_user_id: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  username: Name,
  email_address: z.string(),
});
export type ClerkUser = z.infer<typeof ClerkUser>;

export const syncClerkUser = traced("syncClerkUser", _syncClerkUser);
export async function _syncClerkUser(
  db: GamePlayDB,
  clerk_user: ClerkUser,
): Promise<SelectUser> {
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerk_user_id, clerk_user.clerk_user_id));
  if (users.length > 0) {
    const user = users[0];

    // Update if anything changed.
    const changed_fields: {
      first_name?: string | null;
      last_name?: string | null;
      username?: Name;
      email_address?: string;
    } = {};
    if (user.first_name !== clerk_user.first_name) {
      changed_fields["first_name"] = clerk_user.first_name;
    }
    if (user.last_name !== clerk_user.last_name) {
      changed_fields["last_name"] = clerk_user.last_name;
    }
    if (user.username !== clerk_user.username) {
      changed_fields["username"] = clerk_user.username;
    }
    if (user.email_address !== clerk_user.email_address) {
      changed_fields["email_address"] = clerk_user.email_address;
    }

    if (Object.keys(changed_fields).length == 0) {
      return user;
    }

    await db
      .update(schema.users)
      .set(changed_fields)
      .where(eq(schema.users.user_id, user.user_id));
    // todo: user updated event
    return { ...user, ...changed_fields };
  }

  // New User
  const user_id = userId();
  const new_users = await db
    .insert(schema.users)
    .values({
      user_id,
      username: clerk_user.username,
      first_name: clerk_user.first_name,
      last_name: clerk_user.last_name,
      email_address: clerk_user.email_address,
      clerk_user_id: clerk_user.clerk_user_id,
    })
    .returning();
  const user = new_users[0];
  // todo: user created event
  return user;
}
