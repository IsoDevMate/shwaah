import express from 'express';
import { authenticateUser } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { AffiliateModel, UserCreditsModel } from '../schemas';
import { Database } from '../../models';

const router = express.Router();

// POST /api/v2/affiliates/register
router.post('/register', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const affiliate = await AffiliateModel.create(req.user!.id);
    res.json({ affiliate });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/v2/affiliates/dashboard
router.get('/dashboard', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const affiliate = await AffiliateModel.findByUser(req.user!.id);
    if (!affiliate) return res.status(404).json({ message: 'Not an affiliate. Register first.' });

    const referrals = await AffiliateModel.getReferrals(String(affiliate.id));
    const referralLink = `${process.env.FRONTEND_URL || 'https://shwaah-frontend-31fs.vercel.app'}?ref=${affiliate.referralCode}`;

    res.json({
      affiliate,
      referralLink,
      referrals,
      stats: {
        totalReferrals: affiliate.totalReferrals,
        totalEarningsCredits: affiliate.totalEarningsCredits,
        pendingReferrals: referrals.filter((r: any) => r.status === 'clicked').length,
        convertedReferrals: referrals.filter((r: any) => r.status === 'signed_up').length,
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/v2/affiliates/track-click — called when someone visits with ?ref=CODE
router.post('/track-click', async (req, res) => {
  try {
    const { code } = req.body;
    const affiliate = await AffiliateModel.findByCode(code);
    if (!affiliate) return res.status(404).json({ message: 'Invalid referral code' });
    // Just confirm code is valid — actual referral recorded on signup
    res.json({ valid: true, affiliateId: affiliate.id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
