// firebase-config.js — LV Spices Product Changeover Record
// Project: productchange-2cff7 | Collection: product_changeover_records

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCkluMSa881RYCY7ANemfpBbFKn053mFRU",
  authDomain: "productchange-2cff7.firebaseapp.com",
  projectId: "productchange-2cff7",
  storageBucket: "productchange-2cff7.firebasestorage.app",
  messagingSenderId: "120513252555",
  appId: "1:120513252555:web:f6dee145a2470e78b9df4e"
};

export const COLLECTION_NAME = "product_changeover_records";

let db = null;

export function updateCloudBadge(connected) {
  const badge = document.getElementById('cloud-status-badge');
  const text  = document.getElementById('cloud-status-text');
  if (!badge || !text) return;
  if (connected) {
    badge.className = 'cloud-badge connected';
    text.textContent = 'Cloud Synced';
  } else {
    badge.className = 'cloud-badge offline';
    text.textContent = 'Offline Mode';
  }
}

export function initFirebase() {
  if (db) return db;
  try {
    const app = getApps().find(a => a.name === 'pco') || initializeApp(firebaseConfig, 'pco');
    db = getFirestore(app);
    updateCloudBadge(true);
    return db;
  } catch (err) {
    console.warn('[Firebase PCO] Init error:', err);
    updateCloudBadge(false);
    return null;
  }
}

export async function saveRecord(record) {
  const database = initFirebase();
  if (!database) return false;
  try {
    const ref = doc(database, COLLECTION_NAME, record.id);
    await setDoc(ref, { ...record, updatedAt: Date.now() }, { merge: true });
    updateCloudBadge(true);
    return true;
  } catch (err) {
    console.error('[Firebase PCO] Save error:', err);
    updateCloudBadge(false);
    return false;
  }
}

export async function loadAllRecords() {
  const database = initFirebase();
  if (!database) return [];
  try {
    const q = query(collection(database, COLLECTION_NAME), orderBy("date", "desc"), limit(500));
    const snap = await getDocs(q);
    const records = [];
    snap.forEach(d => records.push(d.data()));
    updateCloudBadge(true);
    return records;
  } catch (err) {
    console.warn('[Firebase PCO] Load error:', err);
    updateCloudBadge(false);
    return [];
  }
}

try { initFirebase(); } catch (e) {}
