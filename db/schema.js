import { pgTable, text, serial, timestamp, boolean, integer, primaryKey, uniqueIndex, } from "drizzle-orm/pg-core";

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
    // UID to DM when subscription is expiring / expired (defaults to guild owner if null)
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

// ── Ticket System ────────────────────────────────────────────────────────────

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

// ── Reaction Roles ───────────────────────────────────────────────────────────

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
