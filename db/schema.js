import { pgTable, text, serial, timestamp, boolean, integer, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

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
    tier: text("tier").notNull().default("basic"),
    notes: text("notes"),
    isTrial: boolean("is_trial").notNull().default(false),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    notifyUserId: text("notify_user_id"),
    activationMethod: text("activation_method"),
});

export const automodSettingsTable = pgTable("automod_settings", {
    guildId: text("guild_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    badWords: text("bad_words").notNull().default(""),
    maxMentions: integer("max_mentions").notNull().default(5),
    maxCapsPercent: integer("max_caps_percent").notNull().default(70),
    logChannelId: text("log_channel_id"),
    antiSpamEnabled: boolean("anti_spam_enabled").notNull().default(false),
    blockLinks: boolean("block_links").notNull().default(false),
    blockInvites: boolean("block_invites").notNull().default(false),
    regexPatterns: text("regex_patterns").notNull().default(""),
    bypassChannels: text("bypass_channels").notNull().default(""),
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
    winners: text("winners").notNull().default(""),
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
    messageCount: integer("message_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guildId, t.userId] })]);

export const serverCustomizationTable = pgTable("server_customization", {
    guildId: text("guild_id").primaryKey(),
    embedColor: text("embed_color").notNull().default("5865f2"),
    footerText: text("footer_text"),
    welcomeChannelId: text("welcome_channel_id"),
    welcomeMessage: text("welcome_message"),
    welcomeEmbedTemplate: text("welcome_embed_template"),
    logChannelId: text("log_channel_id"),
    leaveChannelId: text("leave_channel_id"),
    leaveMessage: text("leave_message"),
    leaveEmbedTemplate: text("leave_embed_template"),
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

// ── Ticket System ─────────────────────────────────────────────────────────────

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

// ── Reaction Roles ────────────────────────────────────────────────────────────

export const reactionRolesTable = pgTable("reaction_roles", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    emoji: text("emoji").notNull(),
    roleId: text("role_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("reaction_roles_message_emoji_unique").on(t.messageId, t.emoji)]);

// ── Vote Records ──────────────────────────────────────────────────────────────

export const voteRecordsTable = pgTable("vote_records", {
    userId: text("user_id").primaryKey(),
    lastVotedAt: timestamp("last_voted_at").notNull().defaultNow(),
    voteStreak: integer("vote_streak").notNull().default(0),
    totalVotes: integer("total_votes").notNull().default(0),
});

export const voteReminderOptInTable = pgTable("vote_reminder_opt_in", {
    userId: text("user_id").primaryKey(),
    optedIn: boolean("opted_in").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── AntiNuke ──────────────────────────────────────────────────────────────────

export const antinukeSettingsTable = pgTable("antinuke_settings", {
    guildId: text("guild_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    banThreshold: integer("ban_threshold").notNull().default(3),
    kickThreshold: integer("kick_threshold").notNull().default(3),
    channelThreshold: integer("channel_threshold").notNull().default(3),
    roleThreshold: integer("role_threshold").notNull().default(3),
    timeWindow: integer("time_window").notNull().default(10),
    action: text("action").notNull().default("ban"),
    logChannelId: text("log_channel_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const antinukeWhitelistTable = pgTable("antinuke_whitelist", {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    addedAt: timestamp("added_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guildId, t.userId] })]);

// ── Birthdays ─────────────────────────────────────────────────────────────────

export const birthdaysTable = pgTable("birthdays", {
    userId: text("user_id").notNull(),
    guildId: text("guild_id").notNull(),
    month: integer("month").notNull(),
    day: integer("day").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.guildId] })]);

export const birthdaySettingsTable = pgTable("birthday_settings", {
    guildId: text("guild_id").primaryKey(),
    channelId: text("channel_id").notNull(),
    roleId: text("role_id"),
    message: text("message").notNull().default("🎂 Happy Birthday {user}! 🎉"),
    enabled: boolean("enabled").notNull().default(true),
});

// ── Confessions ───────────────────────────────────────────────────────────────

export const confessionSettingsTable = pgTable("confession_settings", {
    guildId: text("guild_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    channelId: text("channel_id"),
    reviewChannelId: text("review_channel_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const confessionsTable = pgTable("confessions", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    authorId: text("author_id").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("pending"),
    confessionMessageId: text("confession_message_id"),
    reviewMessageId: text("review_message_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Custom Commands ───────────────────────────────────────────────────────────

export const customCommandsTable = pgTable("custom_commands", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    response: text("response").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("custom_commands_guild_name_unique").on(t.guildId, t.name)]);

// ── Embed Templates ───────────────────────────────────────────────────────────

export const embedTemplatesTable = pgTable("embed_templates", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    color: text("color"),
    footerText: text("footer_text"),
    footerIconUrl: text("footer_icon_url"),
    thumbnailUrl: text("thumbnail_url"),
    imageUrl: text("image_url"),
    authorName: text("author_name"),
    authorIconUrl: text("author_icon_url"),
    fieldsJson: text("fields_json"),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("embed_templates_guild_name_unique").on(t.guildId, t.name)]);

// ── Join-to-Create ────────────────────────────────────────────────────────────

export const j2cHubsTable = pgTable("j2c_hubs", {
    channelId: text("channel_id").primaryKey(),
    guildId: text("guild_id").notNull(),
    nameTemplate: text("name_template").notNull().default("{user}'s Channel"),
    userLimit: integer("user_limit").notNull().default(0),
    bitrate: integer("bitrate").notNull().default(64),
    createdBy: text("created_by").notNull(),
});

export const j2cTempChannelsTable = pgTable("j2c_temp_channels", {
    channelId: text("channel_id").primaryKey(),
    guildId: text("guild_id").notNull(),
    hubId: text("hub_id").notNull(),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Jail ──────────────────────────────────────────────────────────────────────

export const jailSettingsTable = pgTable("jail_settings", {
    guildId: text("guild_id").primaryKey(),
    jailRoleId: text("jail_role_id").notNull(),
    jailChannelId: text("jail_channel_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const jailRecordsTable = pgTable("jail_records", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    moderatorId: text("moderator_id").notNull(),
    moderatorTag: text("moderator_tag").notNull(),
    reason: text("reason").notNull(),
    savedRoles: text("saved_roles").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Member Notes ──────────────────────────────────────────────────────────────

export const memberNotesTable = pgTable("member_notes", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    authorId: text("author_id").notNull(),
    authorTag: text("author_tag").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Scheduled Messages ────────────────────────────────────────────────────────

export const scheduledMessagesTable = pgTable("scheduled_messages", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    content: text("content").notNull(),
    sendAt: timestamp("send_at").notNull(),
    createdBy: text("created_by").notNull(),
    createdByTag: text("created_by_tag").notNull(),
    sent: boolean("sent").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Starboard ─────────────────────────────────────────────────────────────────

export const starboardSettingsTable = pgTable("starboard_settings", {
    guildId: text("guild_id").primaryKey(),
    channelId: text("channel_id").notNull(),
    threshold: integer("threshold").notNull().default(3),
    emoji: text("emoji").notNull().default("⭐"),
    enabled: boolean("enabled").notNull().default(true),
});

// ── Sticky Messages ───────────────────────────────────────────────────────────

export const stickyMessagesTable = pgTable("sticky_messages", {
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    content: text("content").notNull(),
    lastMessageId: text("last_message_id"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.guildId, t.channelId] })]);

// ── Tags ──────────────────────────────────────────────────────────────────────

export const tagsTable = pgTable("tags", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    createdBy: text("created_by").notNull(),
    createdByTag: text("created_by_tag").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("tags_guild_name_unique").on(t.guildId, t.name)]);

// ── Temp Bans ─────────────────────────────────────────────────────────────────

export const tempBansTable = pgTable("temp_bans", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    moderatorId: text("moderator_id").notNull(),
    moderatorTag: text("moderator_tag").notNull(),
    reason: text("reason").notNull(),
    unbanAt: timestamp("unban_at").notNull(),
    unbanned: boolean("unbanned").notNull().default(false),
    unbannedAt: timestamp("unbanned_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Temp Roles ────────────────────────────────────────────────────────────────

export const tempRolesTable = pgTable("temp_roles", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    moderatorId: text("moderator_id").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    removed: boolean("removed").notNull().default(false),
    removedAt: timestamp("removed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Verification ──────────────────────────────────────────────────────────────

export const verificationSettingsTable = pgTable("verification_settings", {
    guildId: text("guild_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    channelId: text("channel_id"),
    roleId: text("role_id"),
    message: text("message").notNull().default("Click the button below to verify yourself and gain access to the server."),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Starboard Entries ─────────────────────────────────────────────────────────

export const starboardEntriesTable = pgTable("starboard_entries", {
    messageId: text("message_id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    authorId: text("author_id").notNull(),
    starboardMessageId: text("starboard_message_id"),
    starCount: integer("star_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── User Timezones ────────────────────────────────────────────────────────────

export const userTimezonesTable = pgTable("user_timezones", {
    userId: text("user_id").primaryKey(),
    timezone: text("timezone").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Slowmode Timers ───────────────────────────────────────────────────────────

export const slowmodeTimersTable = pgTable("slowmode_timers", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── AI Assistant Audit Log ────────────────────────────────────────────────────

export const aiAssistantLogsTable = pgTable("ai_assistant_logs", {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    channelId: text("channel_id").notNull(),
    prompt: text("prompt").notNull(),
    planSummary: text("plan_summary"),
    actionsJson: text("actions_json").notNull().default("[]"),
    resultsJson: text("results_json").notNull().default("[]"),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    status: text("status").notNull().default("executed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});
