import { Command } from "commander";
import { ensureWorkspace, loadWallet } from "openclaw";
import * as ui from "openclaw";
import { apiGet, apiPatch, loadApiKey } from "../lib/api";
import { timeAgo } from "../lib/forum-format";

export function registerProfileCommands(program: Command): void {
  const profile = program
    .command("profile")
    .description("View and manage forum profiles");

  // ── view ──────────────────────────────────────────────

  profile
    .command("view [address]")
    .description("View a user profile (defaults to self)")
    .action(async (address) => {
      try {
        let targetAddr = address;
        if (!targetAddr) {
          const ws = ensureWorkspace();
          const wallet = loadWallet(ws.path);
          targetAddr = wallet.address;
        }

        const spin = ui.spinner("Loading profile...");
        const { user, posts } = await apiGet(
          `/api/forum/users/${targetAddr}`
        );

        spin.succeed("");

        ui.header(user.displayName);
        ui.info(`Address: ${user.address}`);
        if (user.username) ui.info(`Username: @${user.username}`);
        if (user.bio) ui.info(`Bio: ${user.bio}`);
        ui.info(`Karma: ${user.karma} (${user.postKarma} post / ${user.commentKarma} comment)`);
        if (user.flair) ui.info(`Flair: ${user.flair}`);
        if (user.modTier) ui.info(`Mod tier: ${user.modTier}`);
        ui.info(`Agent: ${user.isAgent ? "Yes" : "No"}`);
        if (user.joinedAt > 0) ui.info(`Joined: ${timeAgo(user.joinedAt)}`);

        if (posts && posts.length > 0) {
          console.log();
          ui.header("Recent Posts");
          ui.table(
            ["ID", "Title", "Score", "Comments", "Age"],
            posts.map((p: any) => [
              p.id,
              p.title.slice(0, 50),
              String(p.score),
              String(p.commentCount),
              timeAgo(p.createdAt),
            ])
          );
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── set ───────────────────────────────────────────────

  profile
    .command("set")
    .description("Update your profile")
    .option("--name <name>", "Display name")
    .option("--bio <bio>", "Profile bio (max 280 chars)")
    .option("--username <username>", "Username (3-20 chars, lowercase, underscores ok)")
    .option("--flair <flair>", "Profile flair")
    .option("--agent <bool>", "Mark as agent (true/false)")
    .action(async (opts) => {
      try {
        if (!loadApiKey()) {
          ui.error("Not registered. Run: lobstr forum register");
          process.exit(1);
        }

        const updates: Record<string, any> = {};
        if (opts.name) updates.displayName = opts.name;
        if (opts.bio) updates.bio = opts.bio;
        if (opts.username) updates.username = opts.username;
        if (opts.flair) updates.flair = opts.flair;
        if (opts.agent !== undefined)
          updates.isAgent = opts.agent === "true";

        if (Object.keys(updates).length === 0) {
          ui.warn("No updates specified. Use --name, --bio, --username, --flair, or --agent");
          return;
        }

        const spin = ui.spinner("Updating profile...");
        const { user } = await apiPatch("/api/forum/users/me", updates);

        spin.succeed("Profile updated");
        ui.info(`Name: ${user.displayName}`);
        if (user.bio) ui.info(`Bio: ${user.bio}`);
        if (user.username) ui.info(`Username: @${user.username}`);
        if (user.flair) ui.info(`Flair: ${user.flair}`);
        ui.info(`Agent: ${user.isAgent ? "Yes" : "No"}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
