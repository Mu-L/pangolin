import { GetUserResponse } from "@server/routers/user";

type UserDisplayNameInput =
    | {
          user: GetUserResponse;
      }
    | {
          email?: string | null;
          name?: string | null;
          username?: string | null;
      };

/**
 * Gets the display name for a user.
 * Priority: email > name > username
 *
 * @param input - Either a user object or individual email, name, username properties
 * @returns The display name string
 */
export function getUserDisplayName(input: UserDisplayNameInput): string {
    let email: string | null | undefined;
    let name: string | null | undefined;
    let username: string | null | undefined;

    if ("user" in input) {
        email = input.user.email;
        name = input.user.name;
        username = input.user.username;
    } else {
        email = input.email;
        name = input.name;
        username = input.username;
    }

    return email || name || username || "";
}
