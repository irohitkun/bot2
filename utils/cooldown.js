/**
   * In-memory cooldown manager.
   * Prevents command spam with per-user, per-command cooldowns.
   */
  const cooldowns = new Map();

  /**
   * Check and set a cooldown. Returns { onCooldown, remaining }.
   * remaining is in milliseconds.
   */
  export function checkCooldown(key, cooldownMs) {
      const now = Date.now();
      const expiry = cooldowns.get(key);
      if (expiry && now < expiry) {
          return { onCooldown: true, remaining: expiry - now };
      }
      cooldowns.set(key, now + cooldownMs);
      return { onCooldown: false };
  }

  export function clearCooldown(key) {
      cooldowns.delete(key);
  }

  export function formatRemaining(ms) {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.ceil(ms / 60000)}m`;
  }

  // Prune expired entries every 5 minutes
  setInterval(() => {
      const now = Date.now();
      for (const [k, exp] of cooldowns.entries()) {
          if (now >= exp) cooldowns.delete(k);
      }
  }, 5 * 60 * 1000);
  