import { Database, generateUUID } from '../../models';

export const PLANS = {
  free: {
    name: 'Free',
    monthlyCredits: 15,
    priceMonthly: 0,
    priceYearly: 0,
    platformLimits: { instagram: 1, tiktok: 1, youtube: 1, linkedin: 0, facebook: 0 },
    features: { scheduling: true, maxScheduledPosts: 2 }
  },
  creator: {
    name: 'Creator',
    monthlyCredits: 999999, // unlimited
    priceMonthly: 29,
    priceYearly: 290,
    platformLimits: { instagram: 3, tiktok: 3, youtube: 2, linkedin: 1, facebook: 1 },
    features: { scheduling: true, maxScheduledPosts: 999999 }
  },
  pro: {
    name: 'Pro',
    monthlyCredits: 999999,
    priceMonthly: 59,
    priceYearly: 590,
    platformLimits: { instagram: 5, tiktok: 5, youtube: 5, linkedin: 3, facebook: 3 },
    features: { scheduling: true, maxScheduledPosts: 999999 }
  }
} as const;

export type PlanId = keyof typeof PLANS;

export async function runV2Migrations() {
  const migrations = [
    `CREATE TABLE IF NOT EXISTS UserSubscriptions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      billingCycle TEXT DEFAULT 'monthly',
      currentPeriodStart DATETIME,
      currentPeriodEnd DATETIME,
      paystackCustomerId TEXT,
      paystackSubscriptionCode TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS UserCredits (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      creditsRemaining INTEGER NOT NULL DEFAULT 15,
      creditsUsedThisCycle INTEGER NOT NULL DEFAULT 0,
      rolloverCredits INTEGER NOT NULL DEFAULT 0,
      cycleStart DATETIME DEFAULT CURRENT_TIMESTAMP,
      cycleEnd DATETIME,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS CreditTransactions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      postId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS Affiliates (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      referralCode TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      totalReferrals INTEGER DEFAULT 0,
      totalEarningsCredits INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS Referrals (
      id TEXT PRIMARY KEY,
      affiliateId TEXT NOT NULL,
      referredUserId TEXT,
      referralCode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'clicked',
      commissionCredits INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (affiliateId) REFERENCES Affiliates(id)
    )`
  ];

  for (const sql of migrations) {
    try {
      await Database.execute(sql);
    } catch (e: any) {
      console.warn('[V2 Migration] Skipped:', e.message?.substring(0, 80));
    }
  }
  console.log('✅ V2 tables ready');
}

export class UserCreditsModel {
  static async findByUser(userId: string) {
    const r = await Database.execute('SELECT * FROM UserCredits WHERE userId = ?', [userId]);
    return r.rows[0] || null;
  }

  static async initForUser(userId: string, plan: PlanId = 'free') {
    const existing = await this.findByUser(userId);
    if (existing) return existing;
    const id = generateUUID();
    const cycleEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await Database.execute(
      'INSERT INTO UserCredits (id, userId, plan, creditsRemaining, creditsUsedThisCycle, rolloverCredits, cycleStart, cycleEnd) VALUES (?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP, ?)',
      [id, userId, plan, PLANS[plan].monthlyCredits, cycleEnd]
    );
    return this.findByUser(userId);
  }

  static async consume(userId: string, amount: number, description: string, postId?: string) {
    const credits = await this.findByUser(userId);
    if (!credits) throw new Error('No credits record found');
    const remaining = Number(credits.creditsRemaining);
    if (remaining < amount && Number(credits.plan === 'free' ? 1 : 0)) {
      throw new Error(`Insufficient credits. You have ${remaining} credits remaining.`);
    }
    await Database.execute(
      'UPDATE UserCredits SET creditsRemaining = creditsRemaining - ?, creditsUsedThisCycle = creditsUsedThisCycle + ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
      [amount, amount, userId]
    );
    const txId = generateUUID();
    await Database.execute(
      'INSERT INTO CreditTransactions (id, userId, type, amount, description, postId) VALUES (?, ?, ?, ?, ?, ?)',
      [txId, userId, 'consume', -amount, description, postId || null]
    );
  }

  static async add(userId: string, amount: number, description: string) {
    await Database.execute(
      'UPDATE UserCredits SET creditsRemaining = creditsRemaining + ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
      [amount, userId]
    );
    const txId = generateUUID();
    await Database.execute(
      'INSERT INTO CreditTransactions (id, userId, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      [txId, userId, 'add', amount, description]
    );
  }

  static async upgradePlan(userId: string, plan: PlanId) {
    const cycleEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await Database.execute(
      'UPDATE UserCredits SET plan = ?, creditsRemaining = ?, creditsUsedThisCycle = 0, cycleStart = CURRENT_TIMESTAMP, cycleEnd = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
      [plan, PLANS[plan].monthlyCredits, cycleEnd, userId]
    );
  }

  static async getTransactions(userId: string, limit = 20) {
    const r = await Database.execute(
      'SELECT * FROM CreditTransactions WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, limit]
    );
    return r.rows;
  }

  static async rollover(userId: string) {
    const credits = await this.findByUser(userId);
    if (!credits) return;
    const plan = credits.plan as PlanId;
    const planCredits = PLANS[plan].monthlyCredits;
    const used = Number(credits.creditsUsedThisCycle);
    const unused = Math.max(0, planCredits - used);
    const rollover = Math.floor(unused / 3);
    const cycleEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await Database.execute(
      'UPDATE UserCredits SET creditsRemaining = ?, rolloverCredits = ?, creditsUsedThisCycle = 0, cycleStart = CURRENT_TIMESTAMP, cycleEnd = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
      [planCredits + rollover, rollover, cycleEnd, userId]
    );
  }
}

export class SubscriptionModel {
  static async findByUser(userId: string) {
    const r = await Database.execute('SELECT * FROM UserSubscriptions WHERE userId = ?', [userId]);
    return r.rows[0] || null;
  }

  static async upsert(userId: string, data: any) {
    const existing = await this.findByUser(userId);
    if (existing) {
      await Database.execute(
        'UPDATE UserSubscriptions SET plan = ?, status = ?, billingCycle = ?, currentPeriodStart = ?, currentPeriodEnd = ?, paystackCustomerId = ?, paystackSubscriptionCode = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
        [data.plan, data.status, data.billingCycle, data.currentPeriodStart, data.currentPeriodEnd, data.paystackCustomerId, data.paystackSubscriptionCode, userId]
      );
    } else {
      const id = generateUUID();
      await Database.execute(
        'INSERT INTO UserSubscriptions (id, userId, plan, status, billingCycle, currentPeriodStart, currentPeriodEnd, paystackCustomerId, paystackSubscriptionCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, userId, data.plan, data.status, data.billingCycle, data.currentPeriodStart, data.currentPeriodEnd, data.paystackCustomerId, data.paystackSubscriptionCode]
      );
    }
  }
}

export class AffiliateModel {
  static async findByUser(userId: string) {
    const r = await Database.execute('SELECT * FROM Affiliates WHERE userId = ?', [userId]);
    return r.rows[0] || null;
  }

  static async findByCode(code: string) {
    const r = await Database.execute('SELECT * FROM Affiliates WHERE referralCode = ?', [code]);
    return r.rows[0] || null;
  }

  static async create(userId: string) {
    const existing = await this.findByUser(userId);
    if (existing) return existing;
    const id = generateUUID();
    const code = `SHW-${userId.substring(0, 8).toUpperCase()}`;
    await Database.execute(
      'INSERT INTO Affiliates (id, userId, referralCode) VALUES (?, ?, ?)',
      [id, userId, code]
    );
    return this.findByUser(userId);
  }

  static async recordReferral(affiliateId: string, referredUserId: string, code: string) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO Referrals (id, affiliateId, referredUserId, referralCode, status) VALUES (?, ?, ?, ?, ?)',
      [id, affiliateId, referredUserId, code, 'signed_up']
    );
    await Database.execute(
      'UPDATE Affiliates SET totalReferrals = totalReferrals + 1 WHERE id = ?',
      [affiliateId]
    );
  }

  static async getReferrals(affiliateId: string) {
    const r = await Database.execute(
      'SELECT * FROM Referrals WHERE affiliateId = ? ORDER BY createdAt DESC',
      [affiliateId]
    );
    return r.rows;
  }

  static async addEarnings(affiliateId: string, credits: number) {
    await Database.execute(
      'UPDATE Affiliates SET totalEarningsCredits = totalEarningsCredits + ? WHERE id = ?',
      [credits, affiliateId]
    );
  }
}
