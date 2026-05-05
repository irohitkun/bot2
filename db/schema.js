import { pgTable, text, serial, timestamp, boolean, integer, primaryKey, unique } from "drizzle-orm/pg-core";

export const guildSettingsTable = pgTable("guild_settings", {
    guildId: text("guild_id").primaryKey(),
    prefix: text("prefix").notNull().default("%"),
    noPrefixMode: boolean("no_prefix_mode").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const noPrefixAccessTable = pgTable("no_prefix_access", {
    guildId: text("guild_id").notNull(),
    targetId: text("target_id").notNull(),
    targetType: text("target_type").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guildId, t.targetId, t.targetType] })]);

export const warningsTable = pgTable("warnings", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    moderatorId: text("moderator_id").notNull(),
    moderatorTag: text("moderator_tag").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const premiumGuildsTable = pgTable("premium_guilds", {
    guildId: text("guild_id").primaryKey(),
    activatedBy: text("activated_by").notNull(),
    activatedByTag: text("activated_by_tag").notNull(),
    activatedAt: timestamp("activated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    tier: text("tier").notNull().default("premium"),
    notes: text("notes"),
    isTrial: boolean("is_trial").notNull().default(false),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    notifyUserId: text("notify_user_id"),
});

export const automodSettingsTable = pgTable("automod_settings", {
    guildId: text("guild_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    badWords: text("bad_words").notNull().default(""),
    maxMentions: integer("max_mentions").notNull().default(5),
    maxCapsPercent: integer("max_caps_percent").notNull().default(70),
    logChannelId: text("log_channel_id"),
    antiSpamEnabled: boolean("anti_spam_enabled").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const giveawaysTable = pgTable("giveaways", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    prize: text("prize").notNull(),
    winnersCount: integer("winners_count").notNull().default(1),
    hostId: text("host_id").notNull(),
    hostTag: text("host_tag").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    ended: boolean("ended").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    winners: text("winners").notNull().default(""),
    requiredRoleId: text("required_role_id"),
    minAccountAgeDays: integer("min_account_age_days"),
    bonusRoleIds: text("bonus_role_ids").notNull().default(""),
    bonusEntries: integer("bonus_entries").notNull().default(0),
});

export const afkUsersTable = pgTable("afk_users", {
    userId: text("user_id").notNull(),
    guildId: text("guild_id").notNull(),
    reason: text("reason").notNull().default("AFK"),
    setAt: timestamp("set_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.guildId] })]);

export const memberStatsTable = pgTable("member_stats", {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    coins: integer("coins").notNull().default(0),
    dailyStreak: integer("daily_streak").notNull().default(0),
    lastDailyAt: timestamp("last_daily_at"),
    lastChatXpAt: timestamp("last_chat_xp_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guildId, t.userId] })]);

export const serverCustomizationTable = pgTable("server_customization", {
    guildId: text("guild_id").primaryKey(),
    embedColor: text("embed_color").notNull().default("5865f2"),
    footerText: text("footer_text"),
    welcomeChannelId: text("welcome_channel_id"),
    welcomeMessage: text("welcome_message"),
    logChannelId: text("log_channel_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const remindersTable = pgTable("reminders", {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    message: text("message").notNull(),
    remindAt: timestamp("remind_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sent: boolean("sent").notNull().default(false),
});

export const ticketSettingsTable = pgTable("ticket_settings", {
    guildId: text("guild_id").primaryKey(),
    categoryId: text("category_id"),
    transcriptChannelId: text("transcript_channel_id"),
    supportRoleId: text("support_role_id"),
    panelChannelId: text("panel_channel_id"),
    panelMessageId: text("panel_message_id"),
    panelTitle: text("panel_title").notNull().default("Support Tickets"),
    panelDescription: text("panel_description").notNull().default("Click the button below to open a support ticket."),
    ticketCount: integer("ticket_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ticketsTable = pgTable("tickets", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    ticketNumber: integer("ticket_number").notNull(),
    status: text("status").notNull().default("open"),
    closedBy: text("closed_by"),
    closedByTag: text("closed_by_tag"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiAssistantLogsTable = pgTable("ai_assistant_logs", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    channelId: text("channel_id").notNull(),
    prompt: text("prompt").notNull(),
    planSummary: text("plan_summary"),
    actionsJson: text("actions_json").notNull(),
    resultsJson: text("results_json").notNull(),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    status: text("status").notNull().default("executed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Reaction Roles ───────────────────────────────────────────────────────────
// NOTE: uses composite PK (message_id, emoji) — no serial id column,
// matching the actual database table that was created without one.

export const reactionRolesTable = pgTable("reaction_roles", {
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    emoji: text("emoji").notNull(),
    roleId: text("role_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.messageId, t.emoji] })]);

// ── Temporary Bans ────────────────────────────────────────────────────────────
// Auto-unban scheduler reads this on startup to recover pending unbans.

export const tempBansTable = pgTable("temp_bans", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    moderatorId: text("moderator_id").notNull(),
    moderatorTag: text("moderator_tag").notNull(),
    reason: text("reason").notNull().default("No reason provided"),
    bannedAt: timestamp("banned_at").notNull().defaultNow(),
    unbanAt: timestamp("unban_at").notNull(),
    unbanned: boolean("unbanned").notNull().default(false),
    unbannedAt: timestamp("unbanned_at"),
});

// ── Member Notes ──────────────────────────────────────────────────────────────
// Staff-only notes attached to members — never visible to the member themselves.

export const memberNotesTable = pgTable("member_notes", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    authorId: text("author_id").notNull(),
    authorTag: text("author_tag").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Tags ──────────────────────────────────────────────────────────────────────
// Staff-triggered canned responses. Different from autoresponders (keyword-based).
// Staff run /tag <name> or %tag <name> — bot posts the saved content.

export const tagsTable = pgTable("tags", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    createdBy: text("created_by").notNull(),
    createdByTag: text("created_by_tag").notNull(),
    uses: integer("uses").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("tags_guild_name_unique").on(t.guildId, t.name)]);

// ── Sticky Messages ───────────────────────────────────────────────────────────
// A message that re-posts itself at the bottom of a channel after each new message.

export const stickyMessagesTable = pgTable("sticky_messages", {
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    content: text("content").notNull(),
    lastMessageId: text("last_message_id"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guildId, t.channelId] })]);

// ── Scheduled Messages ────────────────────────────────────────────────────────
// Messages queued to be sent to a channel at a specific future time.

export const scheduledMessagesTable = pgTable("scheduled_messages", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    content: text("content").notNull(),
    sendAt: timestamp("send_at").notNull(),
    sent: boolean("sent").notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdByTag: text("created_by_tag").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Join-to-Create (J2C) ──────────────────────────────────────────────────────
// Hub voice channels — joining creates a personal temp VC (premium).

export const j2cHubsTable = pgTable("j2c_hubs", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    categoryId: text("category_id"),
    nameTemplate: text("name_template").notNull().default("{user}'s Channel"),
    userLimit: integer("user_limit").notNull().default(0),
    bitrate: integer("bitrate").notNull().default(64),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("j2c_hubs_channel_unique").on(t.channelId)]);

// Active temporary voice channels created by J2C hubs.
export const j2cTempChannelsTable = pgTable("j2c_temp_channels", {
    channelId: text("channel_id").primaryKey(),
    guildId: text("guild_id").notNull(),
    hubId: text("hub_id").notNull(),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Starboard ─────────────────────────────────────────────────────────────────
// Hall-of-fame: messages with enough reactions get posted to a starboard channel (premium).

export const starboardSettingsTable = pgTable("starboard_settings", {
    guildId: text("guild_id").primaryKey(),
    channelId: text("channel_id").notNull(),
    threshold: integer("threshold").notNull().default(3),
    emoji: text("emoji").notNull().default("⭐"),
    enabled: boolean("enabled").notNull().default(true),
});

export const starboardEntriesTable = pgTable("starboard_entries", {
    messageId: text("message_id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    authorId: text("author_id").notNull(),
    starboardMessageId: text("starboard_message_id"),
    starCount: integer("star_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Birthdays ─────────────────────────────────────────────────────────────────
// Members register their birthday; bot announces it on the day (announcement = premium).

export const birthdaysTable = pgTable("birthdays", {
    userId: text("user_id").notNull(),
    guildId: text("guild_id").notNull(),
    month: integer("month").notNull(),
    day: integer("day").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.guildId] })]);

export const birthdaySettingsTable = pgTable("birthday_settings", {
    guildId: text("guild_id").primaryKey(),
    channelId: text("channel_id"),
    roleId: text("role_id"),
    message: text("message").notNull().default("🎂 Happy Birthday, {user}! 🎉"),
    enabled: boolean("enabled").notNull().default(true),
});
