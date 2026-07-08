/* ==========================================================================
   CloudTxt Core Logic - Firebase Realtime Integration & WordCloud Engine
   ========================================================================== */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const btnSettings = document.getElementById("btn-settings");
const settingsModal = document.getElementById("settings-modal");
const modalClose = document.getElementById("modal-close");
const btnSaveConfig = document.getElementById("btn-save-config");
const btnClearConfig = document.getElementById("btn-clear-config");
const jsonConfigInput = document.getElementById("json-config");
const wordForm = document.getElementById("word-form");
const inputWord = document.getElementById("input-word");
const inputName = document.getElementById("input-name");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const cloudCanvas = document.getElementById("cloud-canvas");
const cloudEmpty = document.getElementById("cloud-empty");
const tooltip = document.getElementById("cloud-tooltip");
const tooltipWord = document.getElementById("tooltip-word");
const tooltipCount = document.getElementById("tooltip-count");
const tooltipNames = document.getElementById("tooltip-names");

// Modal Config Tabs
const btnToggleJson = document.getElementById("btn-toggle-json");
const btnToggleFields = document.getElementById("btn-toggle-fields");
const configJsonArea = document.getElementById("config-json-area");
const configFieldsArea = document.getElementById("config-fields-area");

const fieldKeys = ["apiKey", "authDomain", "projectId", "appId"];

// Firebase App State
let db = null;
let unsubscribe = null;
let currentCloudData = {}; // Map of normalizedWord -> { originalWord, count, names: Set }

// Initialize: Load Saved Configuration
document.addEventListener("DOMContentLoaded", () => {
  setupConfigTabToggle();
  initFirebaseFromStorage();
  resizeCanvas();
  
  // Event Listeners
  btnSettings.addEventListener("click", () => showModal(true));
  modalClose.addEventListener("click", () => showModal(false));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) showModal(false);
  });
  
  btnSaveConfig.addEventListener("click", handleSaveConfig);
  btnClearConfig.addEventListener("click", handleClearConfig);
  wordForm.addEventListener("submit", handleSubmitWord);
  
  window.addEventListener("resize", () => {
    resizeCanvas();
    renderWordCloud();
  });
});

// Canvas Auto-Resizing
function resizeCanvas() {
  const container = cloudCanvas.parentElement;
  cloudCanvas.width = container.clientWidth;
  cloudCanvas.height = container.clientHeight;
}

// Config Modal Tabs Toggle
function setupConfigTabToggle() {
  btnToggleJson.addEventListener("click", () => {
    btnToggleJson.classList.add("active");
    btnToggleFields.classList.remove("active");
    configJsonArea.classList.add("active");
    configFieldsArea.classList.remove("active");
  });
  
  btnToggleFields.addEventListener("click", () => {
    btnToggleFields.classList.add("active");
    btnToggleJson.classList.remove("active");
    configFieldsArea.classList.add("active");
    configJsonArea.classList.remove("active");
  });
}

// Firebase Initialization
function initFirebaseFromStorage() {
  const savedConfig = localStorage.getItem("cloudtxt_firebase_config");
  if (!savedConfig) {
    updateStatus(false, "尚未設定 Firebase 連線");
    toggleEmptyState(true);
    return;
  }
  
  try {
    const config = JSON.parse(savedConfig);
    
    // Safety check
    if (!config.projectId || !config.apiKey) {
      throw new Error("設定檔欄位不齊全");
    }
    
    // Prevent double initialization
    if (getApps().length === 0) {
      const app = initializeApp(config);
      db = getFirestore(app);
    }
    
    updateStatus(true, `已連接到 Firebase (${config.projectId})`);
    listenToCloudData();
  } catch (err) {
    console.error("Firebase 初始化失敗：", err);
    updateStatus(false, "Firebase 設定錯誤，請重新設定", true);
    toggleEmptyState(true);
  }
}

// Update Database Connectivity Status Indicator
function updateStatus(isOnline, text, isError = false) {
  statusDot.className = "status-indicator " + (isOnline ? "online" : (isError ? "offline" : ""));
  statusText.textContent = text;
  if (isOnline) {
    btnSettings.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg> 已連接
    `;
  } else {
    btnSettings.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg> 設定連線
    `;
  }
}

// Show/Hide Configuration Modal
function showModal(visible) {
  if (visible) {
    // Populate form fields if config already exists
    const savedConfig = localStorage.getItem("cloudtxt_firebase_config");
    if (savedConfig) {
      jsonConfigInput.value = JSON.stringify(JSON.parse(savedConfig), null, 2);
      try {
        const config = JSON.parse(savedConfig);
        fieldKeys.forEach(key => {
          const el = document.getElementById(`field-${key}`);
          if (el) el.value = config[key] || "";
        });
      } catch (e) {}
    }
    settingsModal.classList.add("visible");
  } else {
    settingsModal.classList.remove("visible");
  }
}

// Save Firebase Config
function handleSaveConfig() {
  let config = {};
  
  if (btnToggleJson.classList.contains("active")) {
    // Parse JSON paste input
    const jsonText = jsonConfigInput.value.trim();
    if (!jsonText) {
      alert("請填寫 Config JSON！");
      return;
    }
    try {
      // Handle potential prefix code like "const firebaseConfig = "
      let parsedJson = jsonText;
      if (jsonText.includes("{") && jsonText.includes("}")) {
        const start = jsonText.indexOf("{");
        const end = jsonText.lastIndexOf("}") + 1;
        parsedJson = jsonText.substring(start, end);
      }
      
      // Clean up Javascript keys that aren't strictly JSON (optional but nice)
      // For simple robust parsing, we parse it as JSON
      config = JSON.parse(parsedJson);
    } catch (e) {
      alert("JSON 格式解析錯誤，請確認輸入為正確的 JSON 物件結構。");
      return;
    }
  } else {
    // Gather manual input fields
    fieldKeys.forEach(key => {
      const val = document.getElementById(`field-${key}`).value.trim();
      if (val) config[key] = val;
    });
  }
  
  // Validate minimum requirements
  if (!config.apiKey || !config.projectId) {
    alert("設定不完整，必須包含 apiKey 與 projectId 欄位。");
    return;
  }
  
  localStorage.setItem("cloudtxt_firebase_config", JSON.stringify(config));
  showModal(false);
  
  // Reload to apply the new connection
  window.location.reload();
}

// Clear Firebase Config
function handleClearConfig() {
  if (confirm("您確定要清除目前所有的 Firebase 連線設定嗎？")) {
    localStorage.removeItem("cloudtxt_firebase_config");
    if (unsubscribe) unsubscribe();
    db = null;
    window.location.reload();
  }
}

// Real-Time Listener on Cloud Database
function listenToCloudData() {
  if (unsubscribe) unsubscribe();
  
  const colRef = collection(db, "wordcloud");
  
  unsubscribe = onSnapshot(colRef, (snapshot) => {
    currentCloudData = {};
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.word || !data.name) return;
      
      const word = data.word.trim();
      const name = data.name.trim();
      const normWord = word.toLowerCase(); // Group case-insensitively
      
      if (!currentCloudData[normWord]) {
        currentCloudData[normWord] = {
          originalWord: word, // Preserve capitalization of the first submitter
          count: 0,
          names: new Set()
        };
      }
      
      currentCloudData[normWord].count += 1;
      currentCloudData[normWord].names.add(name);
    });
    
    toggleEmptyState(Object.keys(currentCloudData).length === 0);
    renderWordCloud();
  }, (error) => {
    console.error("讀取 Firestore 資料失敗：", error);
    updateStatus(false, "資料庫讀取授權失敗 (請確認 Firestore 安全規則已啟用)", true);
  });
}

function toggleEmptyState(isEmpty) {
  if (isEmpty) {
    cloudEmpty.style.display = "flex";
    cloudCanvas.style.display = "none";
  } else {
    cloudEmpty.style.display = "none";
    cloudCanvas.style.display = "block";
  }
}

// Render Word Cloud Canvas using wordcloud2.js
function renderWordCloud() {
  if (Object.keys(currentCloudData).length === 0) return;
  
  // Convert map to list format required by wordcloud2: [ [word, weight], ... ]
  const list = [];
  
  // Find max frequency to calculate linear scaling factor
  let maxCount = 1;
  Object.values(currentCloudData).forEach(item => {
    if (item.count > maxCount) maxCount = item.count;
  });
  
  // Calculate size multiplier based on canvas dimensions and frequency
  // Standard word size: from 14px to 68px
  const minFontSize = 14;
  const maxFontSize = 68;
  
  Object.values(currentCloudData).forEach(item => {
    // Dynamic weight factor calculation
    let size = minFontSize;
    if (maxCount > 1) {
      size = minFontSize + ((item.count - 1) / (maxCount - 1)) * (maxFontSize - minFontSize);
    } else {
      size = 28; // Default medium font size if all words have a frequency of 1
    }
    list.push([item.originalWord, size]);
  });
  
  // Colors palette
  const colors = [
    "#c084fc", // Light Purple
    "#a855f7", // Purple
    "#818cf8", // Indigo
    "#6366f1", // Dark Indigo
    "#38bdf8", // Sky Blue
    "#0ea5e9", // Blue
    "#22d3ee", // Cyan
    "#06b6d4"  // Dark Cyan
  ];
  
  WordCloud(cloudCanvas, {
    list: list,
    gridSize: Math.round(16 * cloudCanvas.width / 1024),
    weightFactor: 1,
    fontFamily: '"Outfit", "Noto Sans TC", sans-serif',
    color: () => colors[Math.floor(Math.random() * colors.length)],
    backgroundColor: "transparent",
    rotateRatio: 0.35,
    rotationSteps: 2,
    minRotation: -Math.PI / 6,
    maxRotation: Math.PI / 6,
    shape: "circle",
    ellipticity: 0.65,
    drawOutOfBound: false,
    hover: handleWordHover
  });
}

// Handle Canvas Hover Event
function handleWordHover(item, dimension, event) {
  if (!item) {
    // No item hovered: hide tooltip
    tooltip.classList.remove("visible");
    return;
  }
  
  const [word] = item;
  const normWord = word.toLowerCase();
  const data = currentCloudData[normWord];
  
  if (!data) return;
  
  // Populate Tooltip Details
  tooltipWord.textContent = data.originalWord;
  tooltipCount.textContent = data.count;
  
  // Format submitters list
  const namesArray = Array.from(data.names);
  tooltipNames.innerHTML = `👤 輸入者：${namesArray.join(", ")}`;
  
  // Position Tooltip (with mouse tracking offset)
  const offset = 15;
  tooltip.style.left = `${event.pageX + offset}px`;
  tooltip.style.top = `${event.pageY + offset}px`;
  
  tooltip.classList.add("visible");
}

// Handle New Word Form Submission
async function handleSubmitWord(e) {
  e.preventDefault();
  
  if (!db) {
    alert("請先點擊右上角「設定連線」配置您的 Firebase 專案！");
    showModal(true);
    return;
  }
  
  const word = inputWord.value.trim();
  const name = inputName.value.trim();
  
  if (!word || !name) return;
  
  btnSaveConfig.disabled = true; // Temporary button block
  
  try {
    const colRef = collection(db, "wordcloud");
    await addDoc(colRef, {
      word: word,
      name: name,
      timestamp: serverTimestamp()
    });
    
    // Clear inputs and show visual feedback
    inputWord.value = "";
    inputWord.focus();
    
    // Subtle button animation feedback
    const btn = document.getElementById("btn-submit");
    btn.style.transform = "scale(0.95)";
    setTimeout(() => btn.style.transform = "", 150);
    
  } catch (err) {
    console.error("新增詞彙失敗：", err);
    alert("傳送資料失敗，請檢查您的 Firebase 連線設定與 Firestore 寫入規則。");
  } finally {
    btnSaveConfig.disabled = false;
  }
}
