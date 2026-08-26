/* demo.js — deterministic sample dataset (Empower-style categories) so the app
   is explorable before importing a real export. */

const Demo = (() => {
  // Small seeded PRNG so the demo is stable across loads.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate() {
    const rand = mulberry32(20260826);
    const txns = [];
    const push = (date, description, category, amount, account = 'Everyday Checking', tags = '') => {
      const t = { date, month: date.slice(0, 7), description, category, account, tags, amount: Math.round(amount * 100) / 100 };
      t.id = 'demo-' + txns.length;
      txns.push(t);
    };
    const day = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
    const jitter = (base, spread) => base + (rand() - 0.5) * 2 * spread;

    const now = new Date();
    const months = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push([d.getFullYear(), d.getMonth() + 1]);
    }

    months.forEach(([y, m], mi) => {
      const isCurrent = mi === months.length - 1;
      const dayCap = isCurrent ? now.getDate() : 28;
      const monthly = (d, ...args) => { if (d <= dayCap) push(day(y, m, d), ...args); };

      // income — biweekly paychecks with a raise partway through
      const pay = mi < 6 ? 3120 : 3320;
      monthly(1, 'ACME DESIGN CO PAYROLL', 'Paychecks', pay);
      monthly(15, 'ACME DESIGN CO PAYROLL', 'Paychecks', pay);
      if (m === 3) monthly(20, 'ACME DESIGN CO BONUS', 'Bonus', 2500);
      monthly(28, 'HIGH YIELD SAVINGS INTEREST', 'Interest Income', jitter(31, 4));
      if (mi % 3 === 1) monthly(10, 'VANGUARD DIVIDEND', 'Dividends Received', jitter(120, 20));

      // fixed / needs
      monthly(2, 'OAKWOOD PROPERTIES RENT', 'Rent', -2150);
      monthly(6, 'CITY POWER & LIGHT', 'Utilities', -jitter(m >= 6 && m <= 9 ? 165 : 110, 20));
      monthly(8, 'BLUE RIVER WATER DIST', 'Utilities', -jitter(48, 6));
      monthly(12, 'COMCAST XFINITY INTERNET', 'Telecommunications', -(mi < 9 ? 79.99 : 94.99));  // sneaky price hike
      monthly(16, 'VERIZON WIRELESS', 'Telecommunications', -95.40);
      monthly(4, 'STATE FARM INSURANCE', 'Insurance', -168.50);
      monthly(22, 'CVS PHARMACY', 'Healthcare/Medical', -jitter(38, 15));

      // groceries — weekly-ish
      for (const d of [3, 10, 17, 24]) {
        monthly(d, 'TRADER JOES #552', 'Groceries', -jitter(96, 28));
      }
      monthly(20, 'COSTCO WHOLESALE #117', 'Groceries', -jitter(185, 45));

      // subscriptions
      monthly(5, 'NETFLIX.COM', 'Entertainment', -15.49);
      monthly(9, 'SPOTIFY USA', 'Entertainment', -11.99);
      monthly(11, 'EQUINOX FITNESS', 'Gym', -mi_price(mi));
      monthly(13, 'ADOBE CREATIVE CLOUD', 'Software', -59.99);
      monthly(19, 'NYTIMES DIGITAL', 'News', -17.00);
      monthly(21, 'ICLOUD STORAGE 2TB', 'Software', -9.99);

      // dining & fun — variable, creeping up in recent months
      const dineCount = 6 + Math.floor(rand() * 4) + (mi >= 11 ? 3 : 0);
      for (let i = 0; i < dineCount; i++) {
        const d = 1 + Math.floor(rand() * 27);
        const spots = [['SWEETGREEN', 16], ['LUCALI PIZZERIA', 62], ['BLUE BOTTLE COFFEE', 7.5], ['CHIPOTLE ONLINE', 14], ['BAR TARTINE', 88], ['UBER EATS', 42]];
        const [name, base] = spots[Math.floor(rand() * spots.length)];
        monthly(d, name, name.includes('COFFEE') ? 'Coffee Shops' : 'Restaurants', -jitter(base, base * 0.3));
      }

      // transport
      for (let i = 0; i < 3; i++) monthly(2 + Math.floor(rand() * 25), 'SHELL OIL 5744', 'Gasoline/Fuel', -jitter(52, 12));
      for (let i = 0; i < 4; i++) monthly(1 + Math.floor(rand() * 27), 'UBER TRIP', 'Taxi/Rideshare', -jitter(22, 10));

      // shopping — with a December blowout
      const shopCount = m === 12 ? 9 : 3 + Math.floor(rand() * 3);
      for (let i = 0; i < shopCount; i++) {
        const d = 1 + Math.floor(rand() * 27);
        const stores = [['AMAZON MKTPLACE', 54], ['TARGET 00281', 67], ['UNIQLO USA', 85], ['REI #43', 120]];
        const [name, base] = stores[Math.floor(rand() * stores.length)];
        monthly(d, name, 'General Merchandise', -jitter(base, base * 0.5));
      }
      if (m === 12) monthly(14, 'DELTA AIR LINES', 'Travel', -684);
      if (m === 7) { monthly(8, 'AIRBNB HMRSTAY', 'Travel', -912); monthly(9, 'DELTA AIR LINES', 'Travel', -458); }

      // savings & transfers (transfers auto-excluded from cash flow)
      monthly(3, 'TRANSFER TO VANGUARD BROKERAGE', 'Investment Purchase', -800, 'Everyday Checking');
      monthly(16, 'CHASE CREDIT CARD PAYMENT', 'Credit Card Payments', -jitter(1400, 300));
      monthly(16, 'PAYMENT RECEIVED — THANK YOU', 'Credit Card Payments', jitter(1400, 300), 'Chase Sapphire');
    });

    return txns;
  }

  // gym membership with a mid-year price increase
  function mi_price(mi) { return mi < 8 ? 89 : 104; }

  return { generate };
})();
