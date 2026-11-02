// Players' Discord profile pictures for the board's player icons, by the
// name the board knows them by ("You" for yourself). Online games fill it
// from the server (Discord images only); local games leave it empty, so the
// icons show initials.

const avatars = new Map<string, string>();

export function setPlayerAvatars(entries: Iterable<[string, string]>): void {
  avatars.clear();
  for (const [name, url] of entries) avatars.set(name, url);
}

export function playerAvatar(pid: string): string | undefined {
  return avatars.get(pid);
}
