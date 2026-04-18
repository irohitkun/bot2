import { pgTable, text, serial, timestamp, boolean, integer, primaryKey, } from "drizzle-orm/pg-core";
export const guildSettingsTable = pgTable("guild_settings", {
    guildId: text("guild_id").primaryKey(),
    prefix: text("prefix").notNull().default("%"),
    noPrefixMode: boolean("no_prefix_mode").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
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
