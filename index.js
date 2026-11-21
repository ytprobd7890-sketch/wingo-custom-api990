const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");

// Firebase Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://start-7868c-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// 🔥 1. SERVER ROOT (Test karne ke liye)
app.get("/", (req, res) => {
  res.send("🤖 WinGo Custom API is Running 24/7! Go to /api/history for data.");
});

// 🔥 2. HAMARI CUSTOM API URL (Ye 500 records dega) 🔥
app.get("/api/history", async (req, res) => {
  try {
    const historyRef = db.ref("wingo_db/history");
    const snapshot = await historyRef.once("value");
    const data = snapshot.val() || {};
    
    // Data ko array me badalna aur latest se sort karna
    let records = Object.values(data).sort((a, b) => a.period > b.period ? -1 : 1);
    
    // Sirf latest 500 records lena
    records = records.slice(0, 500);

    // API Response JSON format me
    res.json({
      status: true,
      message: "WinGo 30S Latest 500 Records",
      total_records: records.length,
      data: records
    });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
});

// 🔥 3. BACKGROUND COLLECTOR (Original API se naya data lana) 🔥
async function syncData() {
  try {
    console.log(`⏰ Fetching data from Original API...`);
    
    // Direct connection (Singapore region me ye block nahi hoga)
    const response = await axios.get(API_URL + "?ts=" + Date.now(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
      }
    });

    const list = response.data.list || (response.data.data && response.data.data.list);
    if (!list || list.length === 0) return;

    const historyRef = db.ref("wingo_db/history");
    const snapshot = await historyRef.once("value");
    let existingData = snapshot.val() || {};
    let updates = {};
    let newCount = 0;

    for (const item of list) {
      const period = item.issueNumber || item.period || item.drawNo;
      const number = parseInt(item.number ?? item.winNumber ?? item.result);

      if (!period || isNaN(number) || number < 0 || number > 9) continue;

      if (!existingData[period]) {
        updates[period] = {
          period: period,
          number: number,
          bigSmall: number >= 5 ? "B" : "S",
          color: item.color || "green",
          ts: Date.now()
        };
        existingData[period] = true; 
        newCount++;
      }
    }

    if (newCount > 0) {
      await historyRef.update(updates);
      console.log(`✅ Added ${newCount} new records.`);
    } else {
      console.log(`ℹ️ No new records.`);
    }

    // 500 Records Limit
    const allKeys = Object.keys(existingData);
    if (allKeys.length > 500) {
      allKeys.sort((a, b) => b > a ? 1 : -1);
      const keysToRemove = allKeys.slice(500);
      const removeUpdates = {};
      keysToRemove.forEach(key => { removeUpdates[key] = null; });
      await historyRef.update(removeUpdates);
      console.log(`✂️ Trimmed old records. Total is now 500.`);
    }

  } catch (error) {
    console.error("❌ Sync Error:", error.message);
  }
}

// Har 30 second me data fetch karo
setInterval(syncData, 30000);
syncData(); 

// Server Start
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API URL: /api/history`);
});
