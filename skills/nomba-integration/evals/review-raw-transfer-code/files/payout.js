// Pays a vendor through Nomba. Called from our admin dashboard.
const axios = require("axios");

const CLIENT_ID = "4f1c2a7e-0b9d-4e3a-9f61-2c8d7b5e1a90";
const CLIENT_SECRET = "EXAMPLE-not-a-real-secret-0000"; // stands in for a real secret pasted into code
const ACCOUNT_ID = "b2e5c8a1-7d4f-4c9e-a3b6-1f0e9d8c7b6a";
const BASE = "https://api.nomba.com";

async function getToken() {
  const res = await axios.post(`${BASE}/v1/auth/token/issue`, {
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }, { headers: { accountId: ACCOUNT_ID } });
  return res.data.data.access_token;
}

async function payVendor(vendor, amount, db) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const token = await getToken(); // fresh token every attempt
      const res = await axios.post(`${BASE}/v2/transfers/bank`, {
        amount,
        accountNumber: vendor.accountNumber,
        accountName: vendor.name, // name as typed by the vendor at signup
        bankCode: vendor.bankCode,
        merchantTxRef: `vendor-${vendor.id}-${Date.now()}`,
        narration: "Vendor payout",
      }, { headers: { Authorization: `Bearer ${token}`, accountId: ACCOUNT_ID }, timeout: 10000 });

      if (res.data.data.status === "SUCCESS") {
        await db.query("UPDATE payouts SET status='paid' WHERE vendor_id=$1", [vendor.id]);
      } else {
        // anything else counts as failed: put the money back on the vendor balance
        await db.query("UPDATE vendors SET balance = balance + $1 WHERE id=$2", [amount, vendor.id]);
      }
      return res.data.data;
    } catch (err) {
      console.log("payout attempt failed", err.config, err.message);
      if (attempt === 3) {
        await db.query("UPDATE vendors SET balance = balance + $1 WHERE id=$2", [amount, vendor.id]);
        throw err;
      }
    }
  }
}

module.exports = { payVendor };
