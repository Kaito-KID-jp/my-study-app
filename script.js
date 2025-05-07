// ====================================================================
// AI問題生成学習アプリ - アプリケーションロジック V3.0 (改修版)
// ====================================================================

"use strict";

// ====================================================================
// アプリケーション状態 (State)
// ====================================================================
const appState = {
    // Data & Core State
    allDecks: {}, // { deckId: DeckData, ... }
    currentDeckId: null, // ホーム画面で選択中のデッキID
    settings: {}, // 初期化時にデフォルト値で埋められる
    activeScreen: 'home-screen', // 現在表示中の画面ID
    isLoading: true, // アプリがローディング中か
    isStudyActive: false, // 学習セッションが進行中か
    isModalOpen: false, // モーダルが表示されているか

    // Study Session State
    studyList: [],               // 現在の学習セッションの問題リスト (QuestionData[])
    currentQuestionIndex: -1,    // studyList 内の現在の問題インデックス
    studyStats: {               // 現在の学習セッション中の統計
        currentSessionCorrect: 0,
        currentSessionIncorrect: 0,
    },

    // Home Screen UI State
    homeDeckFilterQuery: '',      // ホーム画面デッキリストの検索クエリ
    homeDeckSortOrder: 'lastStudiedDesc', // ホーム画面デッキリストのソート順
    homeDeckCurrentPage: 1,      // ホーム画面デッキリストの現在のページ
    studyFilter: 'all',          // 現在選択中の学習フィルター ('all', 'lowAccuracy', 'incorrect', 'unanswered', 'difficult', 'normal', 'easy')

    // Dashboard Screen UI State
    currentDashboardDeckId: null, // ダッシュボード画面で表示中のデッキID
    dashboardQuestionsPerPage: 10, // UIと同期用 (初期値は設定から)
    dashboardCurrentPage: 1,
    dashboardFilterAccuracy: 'all',
    dashboardSearchQuery: '',
    dashboardSortOrder: 'accuracyAsc',
    dashboardViewMode: 'list',
    isDashboardControlsCollapsed: true, // モバイルでのコントロールパネル状態

    // Utility State
    notificationTimeout: null,     // 通知表示用のタイマーID
    charts: {                   // Chart.jsインスタンス
        studyTrends: null,
        questionAccuracy: null
    },
    appVersion: '3.0',          // アプリバージョン
    lastFocusedElement: null,    // モーダル等からフォーカスを戻すため
    fileReader: new FileReader(), // ファイル読み込み用 (再利用 - 注意: 状態を持つ可能性あり)
    isSavingData: false,         // データ保存中のフラグ (多重保存防止)
};

// ====================================================================
// 型定義 (コメントとして)
// ====================================================================
/**
 * @typedef {Object} QuestionHistory 解答履歴
 * @property {number} ts - 解答タイムスタンプ (Date.now())
 * @property {boolean} correct - 正誤
 * @property {'difficult'|'normal'|'easy'|null} evaluation - 理解度評価
 */
/**
 * @typedef {Object} QuestionData 問題データ
 * @property {string} id - 質問のユニークID
 * @property {string} question - 問題文
 * @property {string[]} options - 選択肢の配列
 * @property {string} correctAnswer - 正解の選択肢 (options 内のいずれか)
 * @property {string} explanation - 解説文 (空文字の場合もある)
 * @property {QuestionHistory[]} history - 解答履歴
 */
/**
 * @typedef {Object} SessionHistory セッション履歴
 * @property {number} ts - セッション完了/中断タイムスタンプ
 * @property {number} correct - セッション中の正解数
 * @property {number} incorrect - セッション中の不正解数
 */
/**
 * @typedef {Object} DeckData 問題集データ
 * @property {string} id - デッキのユニークID
 * @property {string} name - デッキ名
 * @property {QuestionData[]} questions - 問題の配列
 * @property {number|null} lastStudied - 最終学習日時 (タイムスタンプ or null)
 * @property {number} totalCorrect - 累計正解数 (V3では直接更新せず、必要時に計算)
 * @property {number} totalIncorrect - 累計不正解数 (V3では直接更新せず、必要時に計算)
 * @property {SessionHistory[]} sessionHistory - セッション履歴
 */
/**
 * @typedef {Object} AppSettings アプリ設定
 * @property {boolean} shuffleOptions
 * @property {number} lowAccuracyThreshold
 * @property {'light'|'dark'|'system'} theme
 * @property {number} homeDecksPerPage
 * @property {number} dashboardQuestionsPerPage
 */
/**
 * @typedef {Object} ExportData エクスポート用データ形式
 * @property {string} appVersion - エクスポート元のアプリバージョン
 * @property {number} exportTimestamp - エクスポート日時
 * @property {Object<string, DeckData>} allDecks - 全デッキデータ
 * @property {AppSettings} settings - アプリ設定
 * @property {string|null} currentDeckId - エクスポート時の選択中デッキID
 */
/**
 * @typedef {'info'|'success'|'warning'|'error'} NotificationType
 */
/**
 * @typedef {{id: string, text: string, class?: string, onClick?: () => void, disabled?: boolean, ariaLabel?: string, data?: {[key: string]: string}}} ModalButtonConfig
 */
/**
 * @typedef {Object} ModalOptions
 * @property {string} title - モーダルタイトル (HTML許可)
 * @property {string | HTMLElement} content - モーダル本文 (HTML文字列またはDOM要素)
 * @property {ModalButtonConfig[]} [buttons] - フッターボタン設定の配列
 * @property {string} [size='md'] - モーダルサイズ ('sm', 'md', 'lg', 'xl')
 * @property {() => void} [onClose] - 閉じるボタンやオーバーレイクリック時のコールバック
 */

// ====================================================================
// 定数
// ====================================================================
const LS_KEYS = {
    DECKS: 'studyAppDecks_v3',
    CURRENT_DECK_ID: 'studyAppCurrentDeckId_v3',
    SETTINGS: 'studyAppSettings_v3',
    LAST_SCREEN: 'studyAppLastScreen_v3'
};
const DEFAULT_SETTINGS = {
    shuffleOptions: true,
    lowAccuracyThreshold: 50, // %
    theme: 'system',
    homeDecksPerPage: 10,
    dashboardQuestionsPerPage: 10
};
const DASHBOARD_TREND_SESSIONS = 30;
const DASHBOARD_ACCURACY_THRESHOLDS = { LOW: 49, MEDIUM: 79 };
const MAX_RECENT_HISTORY = 5;
const NOTIFICATION_DURATION = 4000; // 4秒
const DEBOUNCE_DELAY = 300; // ms
const MIN_DEBOUNCE_DELAY = 100; // 短いデバウンス用 (ms)
const CRITICAL_ELEMENT_IDS = [ // 必須DOM要素IDリスト
    'app-container', 'app-loading-overlay', 'global-notification', 'modal-overlay',
    'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen', 'prompt-guide-screen',
    'deck-list', 'options-buttons-container', 'question-text', 'dashboard-analysis-controls-panel',
    'app-nav', 'app-header-title',
];
const DATE_FORMAT_OPTIONS = { // Intl.DateTimeFormat オプション
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
};
const PAGINATION_BUTTON_COUNT = 5; // ページネーション表示ボタン数 (Current ± (COUNT-1)/2 )
const SCROLL_OPTIONS = { behavior: 'smooth', block: 'start' };
const SCROLL_TOP_OPTIONS = { top: 0, behavior: 'smooth' }; // 修正1: スマホでのスクロール挙動改善のため、behaviorを明示
const FOCUS_DELAY = 150;
const SCROLL_DELAY = 100; // 修正1: スクロール開始までの遅延を少し増やす

// ====================================================================
// DOM要素参照 & グローバル変数
// ====================================================================
const dom = {}; // DOM要素をキャッシュするオブジェクト
let searchDebounceTimer = null;
let filterCountDebounceTimer = null;
let resizeDebounceTimer = null;
let systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

// ====================================================================
// 初期化 (Initialization)
// ====================================================================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log(`Initializing AI Study App V${appState.appVersion}...`);
    const startTime = performance.now();
    updateLoadingOverlay(true, "初期化中...");

    try {
        logInitStep("1. Caching DOM elements");
        if (!cacheDOMElements()) {
            throw new Error("致命的なUI要素が見つかりません。アプリを起動できません。");
        }
        logInitStep("1. DOM caching complete");

        logInitStep("2. Loading data from LocalStorage");
        loadInitialData();
        logInitStep("2. Initial data loaded");

        logInitStep("3. Applying initial settings to UI");
        applyTheme(appState.settings.theme);
        applyInitialSettingsToUI();
        logInitStep("3. Initial settings applied");

        logInitStep("4. Setting up event listeners");
        setupGlobalEventListeners();
        setupScreenEventListeners();
        logInitStep("4. Event listeners set up");

        logInitStep("5. Updating initial UI state");
        updateHomeUI();
        populateDashboardDeckSelect();
        logInitStep("5. Initial UI state updated");

        const lastScreen = loadData(LS_KEYS.LAST_SCREEN) || 'home-screen';
        logInitStep(`6. Navigating to initial screen: ${lastScreen}`);
        const initialScreen = (lastScreen === 'study-screen' && !appState.isStudyActive) ? 'home-screen' : lastScreen;
        navigateToScreen(initialScreen, true);
        logInitStep("6. Navigation complete");

        if (appState.activeScreen === 'dashboard-screen') {
             logInitStep("7. Initial dashboard rendering");
             await renderDashboard();
         } else {
              logInitStep("7. Skipping initial dashboard rendering");
         }

        appState.isLoading = false;
        const endTime = performance.now();
        console.log(`App initialization successful in ${(endTime - startTime).toFixed(2)} ms.`);

    } catch (error) {
        console.error("CRITICAL ERROR during app initialization:", error);
        handleInitializationError(error);
    } finally {
        setTimeout(() => {
            updateLoadingOverlay(false);
            console.log("Loading overlay hidden.");
        }, appState.isLoading ? 500 : 100);
    }
}

function cacheDOMElements() {
    console.log("Caching DOM elements...");
    let allFound = true;
    let criticalFound = true;
    const ids = [
        // Critical / General
        'app-container', 'app-loading-overlay', 'global-notification', 'notification-message',
        'notification-icon', 'notification-close-button', 'app-init-error', 'theme-toggle-button', 'app-nav',
        'app-header-title',
        // Screens
        'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen', 'prompt-guide-screen',
        // Modal
        'modal-overlay', 'modal-dialog', 'modal-title', 'modal-body', 'modal-footer', 'modal-close-button',
        // Home Screen
        'json-file-input', 'load-status', 'deck-list-controls', 'deck-search-input', 'deck-sort-select',
        'deck-list', 'deck-list-pagination', 'current-deck-info', 'current-deck-name', 'total-questions',
        'current-deck-last-studied', 'current-deck-accuracy', 'reset-history-button', 'start-study-button',
        'study-filter-options', 'filtered-question-count-display', 'low-accuracy-threshold-display-filter',
        'study-filter-select', // 修正5: ホーム画面フィルターのselect要素
        // Study Screen
        'study-progress-container', 'study-progress-bar', 'study-progress-text', 'study-screen-title',
        'study-card', 'question-counter', 'question-text', 'options-buttons-container', 'answer-area',
        'feedback-container', 'feedback-message', 'feedback-icon', 'answer-text', 'explanation-text', 'retry-button',
        'evaluation-controls', 'study-complete-message', 'session-correct-count', 'session-incorrect-count',
        'back-to-home-button', 'quit-study-header-button',
        // Dashboard Screen
        'dashboard-deck-select', 'dashboard-content', 'dashboard-no-deck-message',
        'dashboard-controls-toggle', 'dashboard-analysis-controls-panel',
        'dashboard-overview', 'dashboard-deck-name', 'dashboard-total-questions', 'dashboard-total-answered',
        'dashboard-overall-accuracy', 'dashboard-last-studied',
        'dashboard-trends', 'study-trends-chart-container', 'study-trends-chart', 'study-trends-no-data',
        'dashboard-trends-sessions-count',
        'dashboard-question-analysis',
        'dashboard-filter-accuracy', 'dashboard-filter-threshold-low', 'dashboard-filter-threshold-medium-low',
        'dashboard-filter-threshold-medium-high', 'dashboard-filter-threshold-high',
        'dashboard-search-query', 'dashboard-search-button', 'dashboard-search-clear', 'dashboard-sort-order',
        'view-mode-list', 'view-mode-chart', 'dashboard-items-per-page',
        'question-analysis-view', 'question-list-view', 'question-chart-view',
        'question-accuracy-list', 'question-pagination', 'question-accuracy-chart-container',
        'question-accuracy-chart', 'question-accuracy-no-data',
        // Settings Screen
        'settings-container', 'setting-shuffle-options', 'setting-low-accuracy-threshold',
        'setting-home-items-per-page', 'setting-dashboard-items-per-page',
        'setting-theme', 'export-data-button', 'import-data-input', 'import-status', 'reset-all-data-button',
        'save-settings-button', 'settings-save-status',
        'plain-json-input', 'generate-json-file-button', 'generate-json-status', // 修正2: JSONテキストからのファイル生成機能
        // Prompt Guide Screen
        'prompt-field-topic', 'prompt-field-count', 'prompt-field-level', 'copy-prompt-button', 'copy-status',
        'prompt-text-template', 'json-check-area', 'json-check-input', 'json-check-button', 'json-check-status',
    ];

    ids.forEach(id => {
        const camelCaseId = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        dom[camelCaseId] = document.getElementById(id);
        if (!dom[camelCaseId]) {
            const isCritical = CRITICAL_ELEMENT_IDS.includes(id);
            console.warn(`DOM element${isCritical ? ' [CRITICAL]' : ''} not found: #${id}`);
            if (isCritical) criticalFound = false;
            allFound = false;
        }
    });

    dom.navButtons = document.querySelectorAll('.nav-button');
    dom.screens = document.querySelectorAll('.screen');
    dom.evalButtons = document.querySelectorAll('.eval-button');
    // 修正5: studyFilterRadios は不要になったので削除 (代わりに studyFilterSelect を使用)
    dom.appBody = document.body;

    if (dom.navButtons.length === 0) { console.warn("No navigation buttons found."); criticalFound = false; }
    if (dom.screens.length === 0) { console.warn("No screen elements found."); criticalFound = false; }
    if (dom.evalButtons.length === 0) console.warn("No evaluation buttons found.");
    // 修正5: studyFilterRadios のチェックは不要

    console.log(`DOM caching: ${allFound ? 'All listed' : 'Some listed'} elements found. Critical elements ${criticalFound ? 'found' : 'MISSING'}.`);
    return criticalFound;
}

function handleInitializationError(error) {
    appState.isLoading = false;
    const errorDisplay = dom.appInitError;
    const container = dom.appContainer;
    if (container) container.innerHTML = '';
    if (errorDisplay) {
        errorDisplay.textContent = `致命的なエラー: ${error.message} アプリを初期化できません。ページを再読み込みするか、開発者にご連絡ください。`;
        errorDisplay.style.display = 'block';
        errorDisplay.setAttribute('aria-hidden', 'false');
    } else {
        alert(`致命的なエラー: ${error.message} アプリを初期化できません。`);
    }
}

function updateLoadingOverlay(show, text = "読み込み中...") {
    if (!dom.appLoadingOverlay) return;
    const overlay = dom.appLoadingOverlay;
    if (show) {
        overlay.querySelector('p').textContent = text;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
    } else {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
}

function logInitStep(message) {
    console.log(`%cINIT: ${message}`, 'color: #3498db; font-weight: bold;');
}

// ====================================================================
// データ永続化 (LocalStorage Persistence)
// ====================================================================
function saveData(key, data) {
    if (appState.isSavingData) {
        console.warn(`Data save already in progress for key "${key}". Skipping.`);
        return false;
    }
    appState.isSavingData = true;

    try {
        if (data === undefined) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(data));
        }
        return true;
    } catch (e) {
        console.error(`Failed to save data to LocalStorage for key "${key}":`, e);
        let message = `データ (${key}) の保存中にエラーが発生しました。`;
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || String(e).toLowerCase().includes('quota'))) {
            const sizeMB = calculateLocalStorageUsage();
            message = `データ保存失敗: ブラウザの保存容量(現在約 ${sizeMB} MB)の上限に達した可能性があります。`;
        }
        showNotification(message, 'error', 8000);
        return false;
    } finally {
         appState.isSavingData = false;
    }
}

function loadData(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        if (data === null) return defaultValue;
        const parsedData = JSON.parse(data);
        if (key === LS_KEYS.SETTINGS) return repairAndValidateSettings(parsedData);
        if (key === LS_KEYS.DECKS) return repairAndValidateAllDecks(parsedData);
        if (key === LS_KEYS.CURRENT_DECK_ID || key === LS_KEYS.LAST_SCREEN) {
             return (typeof parsedData === 'string' || parsedData === null) ? parsedData : defaultValue;
        }
        return parsedData;
    } catch (e) {
        console.error(`Failed to load/parse data from LocalStorage (Key: ${key}). Error:`, e);
        showNotification(`保存データ (Key: ${key}) の読み込みに失敗しました。デフォルト値を使用します。`, 'warning', 6000);
        return defaultValue;
    }
}

function repairAndValidateAllDecks(loadedDecks) {
    if (typeof loadedDecks !== 'object' || loadedDecks === null) return {};
    let dataModified = false;
    const validDecks = {};
    for (const deckId in loadedDecks) {
        if (!Object.hasOwnProperty.call(loadedDecks, deckId)) continue;
        const deck = loadedDecks[deckId];
        if (typeof deck !== 'object' || deck === null || typeof deck.id !== 'string' || deck.id !== deckId || typeof deck.name !== 'string') {
            dataModified = true; continue;
        }
        const repairedDeck = {
            lastStudied: null, totalCorrect: 0, totalIncorrect: 0, sessionHistory: [], questions: [],
            ...deck, id: deckId, name: deck.name.trim() || `無名の問題集 (${deckId.substring(0, 6)})`,
        };
        if (typeof repairedDeck.lastStudied !== 'number' && repairedDeck.lastStudied !== null) { repairedDeck.lastStudied = null; dataModified = true; }
        if (!Array.isArray(repairedDeck.sessionHistory)) { repairedDeck.sessionHistory = []; dataModified = true; }
        repairedDeck.sessionHistory = repairedDeck.sessionHistory.filter(isValidSessionHistory);
        if (!Array.isArray(repairedDeck.questions)) { repairedDeck.questions = []; dataModified = true; }
        const validQuestions = [];
        repairedDeck.questions.forEach((q, index) => {
            const repairedQ = repairAndValidateQuestion(q, deckId, index);
            if (repairedQ) validQuestions.push(repairedQ); else dataModified = true;
        });
        repairedDeck.questions = validQuestions;
        validDecks[deckId] = repairedDeck;
    }
    if (dataModified) console.warn("Deck data structure required repair/validation during load.");
    return validDecks;
}

function repairAndValidateQuestion(q, deckId = 'unknown', index = -1) {
    if (typeof q !== 'object' || q === null) return null;
    const questionLogPrefix = `Question Validation (Deck: ${deckId}, Index: ${index}, QID: ${q?.id || 'N/A'}):`;
    let modified = false;
    const repairedQ = { id: '', question: '', options: [], correctAnswer: '', explanation: '', history: [], ...q };
    if (typeof repairedQ.id !== 'string' || !repairedQ.id) { repairedQ.id = generateUUID('q_repair'); modified = true; }
    if (typeof repairedQ.question !== 'string') return null;
    repairedQ.question = repairedQ.question.trim();
    if (repairedQ.question === '') return null;
    if (!Array.isArray(repairedQ.options)) return null;
    repairedQ.options = repairedQ.options.map(opt => String(opt ?? '').trim()).filter(opt => opt);
    if (repairedQ.options.length < 2) return null;
    if (typeof repairedQ.correctAnswer !== 'string') return null;
    repairedQ.correctAnswer = repairedQ.correctAnswer.trim();
    if (repairedQ.correctAnswer === '') return null;
    if (!repairedQ.options.includes(repairedQ.correctAnswer)) return null;
    repairedQ.explanation = String(repairedQ.explanation ?? '').trim();
    if (!Array.isArray(repairedQ.history)) { repairedQ.history = []; modified = true; }
    repairedQ.history = repairedQ.history.filter(isValidQuestionHistory);
    if (modified) console.log(`${questionLogPrefix} Data was repaired/validated.`);
    return repairedQ;
}

function repairAndValidateSettings(loadedSettings) {
    if (typeof loadedSettings !== 'object' || loadedSettings === null) return { ...DEFAULT_SETTINGS };
    const repairedSettings = { ...DEFAULT_SETTINGS };
    let modified = false;
    for (const key in DEFAULT_SETTINGS) {
        if (!Object.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
        const defaultValue = DEFAULT_SETTINGS[key];
        const loadedValue = loadedSettings[key];
        if (loadedValue === undefined) continue;
        if (typeof loadedValue !== typeof defaultValue) { modified = true; continue; }
        let isValid = true;
        switch(key) {
            case 'lowAccuracyThreshold': isValid = Number.isInteger(loadedValue) && loadedValue >= 1 && loadedValue <= 99; break;
            case 'homeDecksPerPage': isValid = Number.isInteger(loadedValue) && [10, 20, 50].includes(loadedValue); break;
            case 'dashboardQuestionsPerPage': isValid = Number.isInteger(loadedValue) && [10, 20, 50, 100].includes(loadedValue); break;
            case 'theme': isValid = ['light', 'dark', 'system'].includes(loadedValue); break;
        }
        if(isValid) repairedSettings[key] = loadedValue; else modified = true;
    }
    for (const key in loadedSettings) {
         if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) { modified = true; }
    }
    if (modified) console.warn("Settings data structure required repair/validation.");
    return repairedSettings;
}

function isValidQuestionHistory(h) {
    return Boolean(h && typeof h === 'object' && typeof h.ts === 'number' && h.ts > 0 &&
                   typeof h.correct === 'boolean' &&
                   (h.evaluation === null || ['difficult', 'normal', 'easy'].includes(h.evaluation) || h.evaluation === undefined));
}
function isValidSessionHistory(s) {
    return Boolean(s && typeof s === 'object' && typeof s.ts === 'number' && s.ts > 0 &&
                   typeof s.correct === 'number' && Number.isInteger(s.correct) && s.correct >= 0 &&
                   typeof s.incorrect === 'number' && Number.isInteger(s.incorrect) && s.incorrect >= 0);
}

function loadInitialData() {
    appState.settings = loadData(LS_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
    appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage;
    appState.allDecks = loadData(LS_KEYS.DECKS, {});
    appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID, null);
    if (appState.currentDeckId !== null && !appState.allDecks[appState.currentDeckId]) {
        appState.currentDeckId = null;
        saveData(LS_KEYS.CURRENT_DECK_ID, null);
    }
    appState.currentDashboardDeckId = appState.currentDeckId;
    console.log("Initial data loaded/validated:", { settings: appState.settings, deckCount: Object.keys(appState.allDecks).length, currentDeckId: appState.currentDeckId });
}

function calculateLocalStorageUsage() {
     let totalBytes = 0;
     try {
         for (let i = 0; i < localStorage.length; i++) {
             const key = localStorage.key(i);
             if (key?.startsWith('studyApp')) {
                const value = localStorage.getItem(key);
                if (value) totalBytes += (key.length + value.length) * 2;
            }
         }
         return (totalBytes / (1024 * 1024)).toFixed(2);
     } catch(e) { return "?"; }
}

// ====================================================================
// UI制御関数 (UI Control Functions)
// ====================================================================
function applyTheme(theme) {
    if (!dom.appBody) return;
    dom.appBody.classList.remove('theme-light', 'theme-dark');
    let newTheme = theme === 'system' ? (systemThemeMediaQuery.matches ? 'dark' : 'light') : theme;
    dom.appBody.classList.add(`theme-${newTheme}`);
    appState.settings.theme = theme;
    updateThemeToggleButton(newTheme);
    if (appState.charts.studyTrends || appState.charts.questionAccuracy) updateChartThemes();
    console.log(`Theme applied: ${theme} (Resolved to: ${newTheme})`);
}
function handleSystemThemeChange() { if (appState.settings.theme === 'system') applyTheme('system'); }
function getCurrentAppliedTheme() { return dom.appBody?.classList.contains('theme-dark') ? 'dark' : 'light'; }
function updateThemeToggleButton(appliedTheme) {
     if (!dom.themeToggleButton) return;
     const lightIcon = dom.themeToggleButton.querySelector('.theme-icon-light');
     const darkIcon = dom.themeToggleButton.querySelector('.theme-icon-dark');
     const srText = dom.themeToggleButton.querySelector('.sr-only');
     if (lightIcon && darkIcon && srText) {
         lightIcon.style.display = (appliedTheme === 'light') ? 'none' : 'inline-block';
         darkIcon.style.display = (appliedTheme === 'dark') ? 'none' : 'inline-block';
         srText.textContent = `現在のテーマ: ${appliedTheme === 'dark' ? 'ダーク' : 'ライト'}`;
         dom.themeToggleButton.title = `${appliedTheme === 'dark' ? 'ライト' : 'ダーク'}モードに切り替え`;
     }
}
function updateChartThemes() {
    if (appState.activeScreen === 'dashboard-screen' && appState.currentDashboardDeckId) {
        const deck = appState.allDecks[appState.currentDashboardDeckId];
        if(deck) {
            renderDashboardTrendsChart(deck);
            renderDashboardQuestionAnalysisChart(getFilteredAndSortedQuestionStats());
        }
    }
}

function showNotification(message, type = 'info', duration = NOTIFICATION_DURATION) {
    if (!dom.globalNotification || !dom.notificationMessage || !dom.notificationIcon) return;
    clearTimeout(appState.notificationTimeout);
    dom.notificationMessage.textContent = message;
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
    dom.notificationIcon.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i>`;
    dom.globalNotification.className = `notification ${type}`;
    dom.globalNotification.setAttribute('aria-hidden', 'false');
    if (duration > 0 && !isNaN(duration)) {
        appState.notificationTimeout = setTimeout(hideNotification, duration);
    }
}
function hideNotification() {
    if (!dom.globalNotification) return;
    clearTimeout(appState.notificationTimeout);
    appState.notificationTimeout = null;
    dom.globalNotification.setAttribute('aria-hidden', 'true');
}

function showModal(options) {
    const { title, content, buttons = [], size = 'md', onClose } = options;
    if (!dom.modalOverlay || !dom.modalDialog || !dom.modalTitle || !dom.modalBody || !dom.modalFooter || !dom.modalCloseButton) return;
    if (appState.isModalOpen) return;
    appState.lastFocusedElement = document.activeElement;
    dom.modalTitle.innerHTML = title;
    dom.modalDialog.className = `modal-dialog modal-${size}`;
    dom.modalDialog.removeAttribute('aria-describedby');
    dom.modalBody.innerHTML = '';
    if (typeof content === 'string') {
        dom.modalBody.innerHTML = content;
        const firstDescElement = dom.modalBody.querySelector('[id]');
        if (firstDescElement) dom.modalDialog.setAttribute('aria-describedby', firstDescElement.id);
    } else if (content instanceof HTMLElement) {
        dom.modalBody.appendChild(content);
        if (content.id) dom.modalDialog.setAttribute('aria-describedby', content.id);
    }
    dom.modalFooter.innerHTML = '';
    if (buttons.length > 0) {
        buttons.forEach(btnConfig => dom.modalFooter.appendChild(createButton(btnConfig)));
        dom.modalFooter.style.display = 'flex';
    } else {
        dom.modalFooter.style.display = 'none';
    }
    const handleClose = () => closeModal(onClose);
    dom.modalCloseButton.onclick = handleClose;
    dom.modalOverlay.onclick = (event) => { if (event.target === dom.modalOverlay) handleClose(); };
    dom.modalDialog.onkeydown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); handleClose(); } };
    dom.modalOverlay.style.display = 'flex';
    dom.modalDialog.setAttribute('aria-labelledby', 'modal-title');
    appState.isModalOpen = true;
    setTimeout(() => {
         const firstButton = dom.modalFooter.querySelector('button:not([disabled])');
         if (firstButton) firstButton.focus(); else dom.modalDialog.focus();
    }, FOCUS_DELAY);
}
function closeModal(onCloseCallback) {
     if (!dom.modalOverlay || !appState.isModalOpen) return;
     appState.isModalOpen = false;
     dom.modalCloseButton.onclick = null;
     dom.modalOverlay.onclick = null;
     dom.modalDialog.onkeydown = null;
     if (onCloseCallback && typeof onCloseCallback === 'function') {
         try { onCloseCallback(); } catch (e) { console.error("Error in modal onClose callback:", e); }
     }
     dom.modalOverlay.style.display = 'none';
     if (appState.lastFocusedElement && typeof appState.lastFocusedElement.focus === 'function') {
          appState.lastFocusedElement.focus();
     } else {
          dom.appBody?.focus();
     }
     appState.lastFocusedElement = null;
}

function applyInitialSettingsToUI() {
    loadSettingsToUI();
    safeSetText(dom.dashboardFilterThresholdLow, DASHBOARD_ACCURACY_THRESHOLDS.LOW);
    safeSetText(dom.dashboardFilterThresholdMediumLow, DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1);
    safeSetText(dom.dashboardFilterThresholdMediumHigh, DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM);
    safeSetText(dom.dashboardFilterThresholdHigh, DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1);
    safeSetText(dom.dashboardTrendsSessionsCount, DASHBOARD_TREND_SESSIONS);
    appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage;
    safeSetValue(dom.dashboardItemsPerPage, appState.dashboardQuestionsPerPage.toString());
    safeSetValue(dom.settingHomeItemsPerPage, appState.settings.homeDecksPerPage.toString());
}

function navigateToScreen(screenId, isInitialLoad = false) {
    if (!dom.screens || !dom.navButtons) {
        showNotification("画面遷移エラーが発生しました", "error");
        return;
    }
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen || !targetScreen.classList.contains('screen')) {
        showNotification(`指定画面(#${screenId})が見つかりません。ホーム画面を表示します。`, "warning");
        screenId = 'home-screen';
        if (!document.getElementById(screenId)) return;
    }

    if (!isInitialLoad && screenId === appState.activeScreen) {
        // 修正1: スマホでのスクロール挙動改善のため、画面遷移時も明示的にトップへスクロール
        // ただし、学習画面は専用のスクロールロジックがあるので除外
        if (screenId !== 'study-screen') {
            window.scrollTo(SCROLL_TOP_OPTIONS);
        }
        return;
    }

    appState.activeScreen = screenId;
    if (!isInitialLoad) saveData(LS_KEYS.LAST_SCREEN, screenId);

    dom.screens.forEach(screen => screen.classList.remove('active'));
    targetScreen.classList.add('active');

    dom.navButtons.forEach(button => {
        const isActive = button.dataset.target === screenId;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    const focusTargetSelectors = {
        'home-screen': '#deck-search-input',
        'study-screen': '#options-buttons-container button:first-child',
        'dashboard-screen': '#dashboard-deck-select',
        'settings-screen': '#setting-shuffle-options',
        'prompt-guide-screen': '#prompt-field-topic',
    };

    switch (screenId) {
        case 'home-screen': updateHomeUI(); break;
        case 'dashboard-screen':
            populateDashboardDeckSelect();
            if (!appState.currentDashboardDeckId && Object.keys(appState.allDecks).length > 0) {
                 const firstDeckId = Object.keys(appState.allDecks).sort((a,b) => (appState.allDecks[a]?.name || '').localeCompare(appState.allDecks[b]?.name || ''))[0];
                 if(firstDeckId) selectDashboardDeck(firstDeckId);
            } else {
                 renderDashboard();
            }
             toggleDashboardControlsBasedOnSize();
            break;
        case 'settings-screen': loadSettingsToUI(); break;
        case 'prompt-guide-screen': updatePromptPlaceholders(); break;
        case 'study-screen':
             if (!appState.isStudyActive && !isInitialLoad) {
                navigateToScreen('home-screen'); return;
             }
             // 修正1: 学習画面開始時もトップへスクロール
             window.scrollTo(SCROLL_TOP_OPTIONS);
            break;
    }

    setTimeout(() => {
         const focusTarget = document.querySelector(focusTargetSelectors[screenId]);
        if (focusTarget && focusTarget.offsetParent !== null) {
             focusTarget.focus();
         } else {
             const screenElement = document.getElementById(screenId);
             if (screenElement) {
                 screenElement.setAttribute('tabindex', '-1');
                 screenElement.focus();
             } else {
                 dom.appHeaderTitle?.focus();
             }
         }
     }, FOCUS_DELAY);

    // 修正1: 学習画面以外で、初期ロードでない場合にトップへスクロール
    if (!isInitialLoad && screenId !== 'study-screen') {
         window.scrollTo(SCROLL_TOP_OPTIONS);
    }
}


// ====================================================================
// イベントリスナー設定 (Event Listener Setup)
// ====================================================================
function setupGlobalEventListeners() {
     safeAddEventListener(window, 'resize', debounce(handleResize, DEBOUNCE_DELAY), { passive: true });
     safeAddEventListener(window, 'keydown', handleGlobalKeyDown);
     safeAddEventListener(systemThemeMediaQuery, 'change', handleSystemThemeChange);
}

function setupScreenEventListeners() {
    safeAddEventListener(dom.appHeaderTitle, 'click', navigateToHome);
    safeAddEventListener(dom.themeToggleButton, 'click', toggleTheme);
    if (dom.navButtons) dom.navButtons.forEach(button => safeAddEventListener(button, 'click', handleNavClick));
    safeAddEventListener(dom.notificationCloseButton, 'click', hideNotification);

    // Home Screen
    safeAddEventListener(dom.jsonFileInput, 'change', handleFileSelect);
    safeAddEventListener(dom.deckSearchInput, 'input', debounce(handleDeckSearchInput, DEBOUNCE_DELAY));
    safeAddEventListener(dom.deckSortSelect, 'change', handleDeckSortChange);
    safeAddEventListener(dom.deckList, 'click', handleDeckListClick);
    safeAddEventListener(dom.deckList, 'keydown', handleDeckListKeydown);
    safeAddEventListener(dom.deckListPagination, 'click', handleDeckPaginationClick);
    safeAddEventListener(dom.resetHistoryButton, 'click', handleResetHistoryClick);
    safeAddEventListener(dom.startStudyButton, 'click', startStudy);
    // 修正5: studyFilterRadios から studyFilterSelect に変更
    safeAddEventListener(dom.studyFilterSelect, 'change', handleStudyFilterChange);


    // Study Screen
    safeAddEventListener(dom.optionsButtonsContainer, 'click', handleOptionButtonClick);
    safeAddEventListener(dom.quitStudyHeaderButton, 'click', () => confirmQuitStudy(true));
    safeAddEventListener(dom.retryButton, 'click', retryCurrentQuestion);
    if (dom.evalButtons) dom.evalButtons.forEach(button => safeAddEventListener(button, 'click', handleEvaluation));
    safeAddEventListener(dom.backToHomeButton, 'click', navigateToHome);

    // Dashboard Screen
    safeAddEventListener(dom.dashboardDeckSelect, 'change', handleDashboardDeckChange);
    safeAddEventListener(dom.dashboardControlsToggle, 'click', toggleDashboardControls);
    safeAddEventListener(dom.dashboardFilterAccuracy, 'change', handleDashboardFilterChange);
    safeAddEventListener(dom.dashboardSearchQuery, 'input', debounce(handleDashboardSearchInput, DEBOUNCE_DELAY));
    safeAddEventListener(dom.dashboardSearchQuery, 'keydown', (e) => { if (e.key === 'Enter') applyDashboardSearch(); });
    safeAddEventListener(dom.dashboardSearchButton, 'click', applyDashboardSearch);
    safeAddEventListener(dom.dashboardSearchClear, 'click', clearDashboardSearch);
    safeAddEventListener(dom.dashboardSortOrder, 'change', handleDashboardSortChange);
    safeAddEventListener(dom.dashboardItemsPerPage, 'change', handleDashboardItemsPerPageChange);
    safeAddEventListener(dom.viewModeList, 'click', () => setDashboardViewMode('list'));
    safeAddEventListener(dom.viewModeChart, 'click', () => setDashboardViewMode('chart'));
    safeAddEventListener(dom.questionAccuracyList, 'click', handleQuestionItemClick);
    safeAddEventListener(dom.questionAccuracyList, 'keydown', handleQuestionItemKeydown);
    safeAddEventListener(dom.questionPagination, 'click', handleDashboardPaginationClick);

    // Settings Screen
    safeAddEventListener(dom.settingShuffleOptions, 'change', () => setSettingsUnsavedStatus(true));
    safeAddEventListener(dom.settingLowAccuracyThreshold, 'input', debounce(handleSettingThresholdInput, MIN_DEBOUNCE_DELAY));
    safeAddEventListener(dom.settingLowAccuracyThreshold, 'change', handleSettingThresholdChange);
    safeAddEventListener(dom.settingHomeItemsPerPage, 'change', () => setSettingsUnsavedStatus(true));
    safeAddEventListener(dom.settingDashboardItemsPerPage, 'change', () => setSettingsUnsavedStatus(true));
    safeAddEventListener(dom.settingTheme, 'change', handleThemeSettingChange);
    safeAddEventListener(dom.saveSettingsButton, 'click', saveSettings);
    safeAddEventListener(dom.exportDataButton, 'click', exportAllData);
    safeAddEventListener(dom.importDataInput, 'change', handleImportFileSelect);
    safeAddEventListener(dom.resetAllDataButton, 'click', handleResetAllDataClick);
    // 修正2: JSONテキストからファイル生成機能のイベントリスナー
    safeAddEventListener(dom.generateJsonFileButton, 'click', handleGenerateJsonFile);


    // Prompt Guide Screen
    safeAddEventListener(dom.promptFieldTopic, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
    safeAddEventListener(dom.promptFieldCount, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
    safeAddEventListener(dom.promptFieldLevel, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
    safeAddEventListener(dom.copyPromptButton, 'click', copyPromptToClipboard);
    safeAddEventListener(dom.jsonCheckInput, 'input', debounce(handleJsonCheckInput, MIN_DEBOUNCE_DELAY));
    safeAddEventListener(dom.jsonCheckButton, 'click', checkJsonFormat);

    console.log("Screen event listeners setup complete.");
}

function safeAddEventListener(element, event, handler, options = {}) {
    if (element && typeof element.addEventListener === 'function') {
        element.addEventListener(event, handler, options);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => { timeout = null; func.apply(context, args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ====================================================================
// グローバルイベントハンドラ
// ====================================================================
function handleResize() {
     clearTimeout(resizeDebounceTimer);
     resizeDebounceTimer = setTimeout(() => {
         toggleDashboardControlsBasedOnSize();
     }, DEBOUNCE_DELAY);
}
function handleGlobalKeyDown(event) {
    if (event.key === 'Escape' && appState.isModalOpen) {
        closeModal();
    }
}

// ====================================================================
// テーマ関連処理
// ====================================================================
function toggleTheme() {
     const nextTheme = getCurrentAppliedTheme() === 'light' ? 'dark' : 'light';
     appState.settings.theme = nextTheme;
     applyTheme(nextTheme);
     saveSettings();
     showNotification(`テーマを${nextTheme === 'light' ? 'ライト' : 'ダーク'}に変更しました`, 'info', 2000);
}
function handleThemeSettingChange(event) {
     applyTheme(event.target.value);
     setSettingsUnsavedStatus(true);
     showNotification("テーマ設定が変更されました。右下の「設定を保存」を押してください。", "info", 3000);
}

// ====================================================================
// ナビゲーションと画面共通処理
// ====================================================================
function navigateToHome() {
     if (appState.isStudyActive) {
         confirmQuitStudy(true, 'home-screen');
     } else {
         navigateToScreen('home-screen');
     }
}
function handleNavClick(event) {
    const targetButton = event.target.closest('.nav-button');
    if (!targetButton || targetButton.disabled) return;
    const targetScreenId = targetButton.dataset.target;
    if (!targetScreenId) return;
    if (appState.isStudyActive && targetScreenId !== 'study-screen') {
        confirmQuitStudy(true, targetScreenId);
    } else {
        navigateToScreen(targetScreenId);
    }
}

// ====================================================================
// ファイル操作 (JSON Deck Handling, Import/Export)
// ====================================================================
function handleFileSelect(event) {
    const fileInput = event.target;
    if (!fileInput) return;
    handleFileUpload(fileInput, processNewDeckFile, dom.loadStatus);
}
function handleImportFileSelect(event) {
     const fileInput = event.target;
     if (!fileInput) return;
     handleFileUpload(fileInput, processImportDataFile, dom.importStatus);
}
function handleFileUpload(fileInput, processFunction, statusElement = dom.loadStatus) {
    if (!fileInput.files || fileInput.files.length === 0) {
        updateStatusMessage(statusElement, "ファイルが選択されていません", "info"); return;
    }
    const file = fileInput.files[0];
    fileInput.value = ''; // Reset for same file selection
    updateStatusMessage(statusElement, "", "info");
    if (!file.type.includes('json') && !file.name.toLowerCase().endsWith('.json')) {
        updateStatusMessage(statusElement, "エラー: JSONファイルを選択してください", "warning");
        showNotification('ファイル形式エラー: JSONファイルのみ読み込めます。', 'warning'); return;
    }
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        updateStatusMessage(statusElement, `エラー: ファイルサイズ超過 (${(file.size / (1024*1024)).toFixed(1)}MB / 最大10MB)`, "warning");
        showNotification(`ファイルサイズが大きすぎます (最大 ${maxSize / (1024*1024)}MB)。`, 'warning'); return;
    }
    updateStatusMessage(statusElement, `ファイル「${escapeHtml(file.name)}」を読み込み中...`, "info");
    updateLoadingOverlay(true, `ファイル (${escapeHtml(file.name)}) 処理中...`);
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result;
        setTimeout(() => {
            try { processFunction(content, file.name, statusElement); }
            catch(processError) {
                 updateStatusMessage(statusElement, `処理エラー: ${processError.message}`, "error");
                 showNotification(`ファイル「${escapeHtml(file.name)}」の処理中にエラー: ${processError.message}`, "error");
            } finally {
                updateLoadingOverlay(false);
                clearStatusMessageAfterDelay(statusElement, 5000);
            }
        }, 0);
    };
    reader.onerror = () => {
         updateStatusMessage(statusElement, `ファイル読み取りエラー: ${reader.error?.message || '不明'}`, "error");
         showNotification(`ファイル「${escapeHtml(file.name)}」の読み取りエラー。`, "error");
         updateLoadingOverlay(false); clearStatusMessageAfterDelay(statusElement, 5000);
    };
    reader.onabort = () => {
         updateStatusMessage(statusElement, "読み込みが中断されました", "info");
         updateLoadingOverlay(false); clearStatusMessageAfterDelay(statusElement, 5000);
     };
    reader.readAsText(file);
}

function processNewDeckFile(content, fileName, statusElement) {
    let newDeckId = null;
    try {
        if (typeof content !== 'string' || content.trim() === '') throw new Error("ファイル内容が空または無効です。");
        let data;
        try { data = JSON.parse(content); }
        catch (parseError) { throw new Error(`JSON解析失敗: ${parseError.message}.`); }
        const validationResult = validateDeckJsonData(data);
        if (!validationResult.isValid) throw new Error(`JSON形式エラー: ${validationResult.message}`);
        if (!validationResult.questions || validationResult.questions.length === 0) throw new Error("JSONファイル内に有効な問題が見つかりませんでした。");
        const newDeck = createNewDeck(fileName.replace(/\.json$/i, ''), validationResult.questions);
        newDeckId = newDeck.id;
        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
            delete appState.allDecks[newDeckId];
            throw new Error("デッキデータの保存に失敗しました。");
        }
        updateStatusMessage(statusElement, `成功: 「${escapeHtml(newDeck.name)}」(${newDeck.questions.length}問) を追加。`, "success");
        showNotification(`問題集「${escapeHtml(newDeck.name)}」(${newDeck.questions.length}問) を追加しました。`, 'success');
        updateHomeUI(true);
        populateDashboardDeckSelect();
        selectDeck(newDeckId);
    } catch (error) {
        console.error(`Error processing new deck file "${fileName}":`, error);
        updateStatusMessage(statusElement, `エラー: ${error.message}`, "error");
        showNotification(`ファイル処理エラー: ${error.message}`, 'error', 8000);
        if (newDeckId && appState.allDecks[newDeckId] && !localStorage.getItem(LS_KEYS.DECKS)?.includes(newDeckId)) {
             delete appState.allDecks[newDeckId];
        }
    }
}

function validateDeckJsonData(data) {
    if (!Array.isArray(data)) return { isValid: false, message: "データがJSON配列形式ではありません。", questions: null };
    if (data.length === 0) return { isValid: true, message: "JSON配列は空ですが、形式は有効です。", questions: [] };
    const validatedQuestions = [];
    const errors = [];
    for (let i = 0; i < data.length; i++) {
        const validatedQ = repairAndValidateQuestion(data[i], 'import-check', i);
        if (!validatedQ) {
             errors.push(`問題 ${i + 1}: データ構造が無効。`);
             return { isValid: false, message: errors.join(' '), questions: null };
        }
        validatedQuestions.push({
            question: validatedQ.question, options: validatedQ.options,
            correctAnswer: validatedQ.correctAnswer, explanation: validatedQ.explanation,
        });
    }
    if (errors.length > 0) return { isValid: false, message: errors.join(' '), questions: null };
    return { isValid: true, message: `データは有効です (${validatedQuestions.length}問)。`, questions: validatedQuestions };
}

function createNewDeck(baseName, questionsData) {
    let deckName = generateUniqueDeckName(baseName);
    const deckId = generateUUID('deck');
    const newDeck = {
        id: deckId, name: deckName,
        questions: questionsData.map((q, index) => ({
            id: generateUUID(`q_${deckId}_${index}`), ...q, history: []
        })),
        lastStudied: null, totalCorrect: 0, totalIncorrect: 0, sessionHistory: []
    };
    appState.allDecks[deckId] = newDeck;
    return newDeck;
}

function generateUniqueDeckName(baseName) {
    let deckName = (baseName || '無名の問題集').trim() || '無名の問題集';
    const lowerCaseName = deckName.toLowerCase();
    if (!Object.values(appState.allDecks).some(d => d.name.toLowerCase() === lowerCaseName)) return deckName;
    let counter = 2;
    while (true) {
        let potentialName = `${deckName} (${counter})`;
        if (!Object.values(appState.allDecks).some(d => d.name.toLowerCase() === potentialName.toLowerCase())) {
            return potentialName;
        }
        counter++;
        if (counter > 100) return `${deckName}_${Date.now()}`; // Safety break
    }
}

function exportAllData() {
    try {
        updateLoadingOverlay(true, "データエクスポート準備中...");
        const exportData = {
            appVersion: appState.appVersion, exportTimestamp: Date.now(),
            settings: appState.settings, allDecks: appState.allDecks, currentDeckId: appState.currentDeckId,
        };
        const jsonData = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        link.download = `ai-study-app-data_v${appState.appVersion}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
             document.body.removeChild(link); URL.revokeObjectURL(url);
             updateLoadingOverlay(false);
             showNotification("全データをエクスポートしました。", "success");
        }, 150);
    } catch (error) {
        showNotification(`データのエクスポートエラー: ${error.message}`, "error");
        updateLoadingOverlay(false);
    }
}

function processImportDataFile(content, fileName, statusElement) {
    try {
        if (typeof content !== 'string' || content.trim() === '') throw new Error("インポートファイル空または無効。");
        let data;
        try { data = JSON.parse(content); }
        catch (parseError) { throw new Error(`JSON解析失敗: ${parseError.message}.`); }
        if (typeof data !== 'object' || data === null || typeof data.allDecks !== 'object' || typeof data.settings !== 'object') {
             throw new Error("インポートファイル形式不正。'allDecks' と 'settings' が必要。");
        }
        if (data.appVersion && data.appVersion !== appState.appVersion) {
             console.warn(`Importing data from a different app version (File: ${data.appVersion}, Current: ${appState.appVersion}).`);
        }
         showModal({
            title: 'データのインポートモード選択',
            content: `<p>ファイル「<strong>${escapeHtml(fileName)}</strong>」(Ver: ${data.appVersion || '不明'})をインポートします。</p><p>モードを選択:</p><ul><li style="margin-bottom:10px"><strong><i class="fas fa-exchange-alt"></i> 全置換:</strong> 現在の全データ(問題集・設定)を削除し、ファイル内容で置換。<span style="color:var(--danger-color); font-weight:bold;">(元に戻せません)</span></li><li><strong><i class="fas fa-code-merge"></i> マージ:</strong> 問題集を追加/上書き。設定も更新。</li></ul>`,
            buttons: [
                { text: '<i class="fas fa-exclamation-triangle"></i> 全置換', class: 'danger', onClick: () => {
                    closeModal();
                    const conf = prompt(`警告！ 全データ置換を実行します。\n現在のデータは完全に失われます。\n続行するには「REPLACE」と入力:`);
                    if (conf === "REPLACE") {
                        updateLoadingOverlay(true, `データ置換中...`);
                        setTimeout(() => { replaceDataFromImport(data, statusElement); updateLoadingOverlay(false); }, 50);
                    } else {
                        showNotification("置換インポートキャンセル", "info"); updateStatusMessage(statusElement, "置換キャンセル", "info"); clearStatusMessageAfterDelay(statusElement);
                    }
                }},
                { text: '<i class="fas fa-code-merge"></i> マージ', class: 'primary', onClick: () => {
                     closeModal(); updateLoadingOverlay(true, `データマージ中...`);
                     setTimeout(() => { mergeDataFromImport(data, statusElement); updateLoadingOverlay(false); }, 50);
                }},
                { text: 'キャンセル', class: 'secondary', onClick: () => {
                     closeModal(); showNotification("インポートキャンセル", "info");
                     updateStatusMessage(statusElement, "キャンセル", "info"); clearStatusMessageAfterDelay(statusElement);
                }}
            ], size: 'lg'
         });
    } catch (error) {
        updateStatusMessage(statusElement, `エラー: ${error.message}`, "error");
        showNotification(`インポート処理エラー: ${error.message}`, 'error', 8000);
        updateLoadingOverlay(false);
    }
}

function replaceDataFromImport(importedData, statusElement) {
    try {
        const repairedSettings = repairAndValidateSettings(importedData.settings);
        const repairedDecks = repairAndValidateAllDecks(importedData.allDecks);
        const importedCurrentDeckId = (typeof importedData.currentDeckId === 'string' && repairedDecks[importedData.currentDeckId]) ? importedData.currentDeckId : null;
        appState.settings = repairedSettings;
        appState.allDecks = repairedDecks;
        appState.currentDeckId = importedCurrentDeckId || (Object.keys(repairedDecks).length > 0 ? Object.keys(repairedDecks)[0] : null);
        appState.currentDashboardDeckId = appState.currentDeckId;
        let saveSuccess = saveData(LS_KEYS.SETTINGS, appState.settings) &&
                          saveData(LS_KEYS.DECKS, appState.allDecks) &&
                          saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId) &&
                          saveData(LS_KEYS.LAST_SCREEN, 'home-screen');
        if (!saveSuccess) {
             localStorage.clear();
             throw new Error("置換データの保存失敗。全データをクリアしました。再読み込みしてください。");
        }
        applyTheme(appState.settings.theme);
        applyInitialSettingsToUI();
        updateHomeUI(true);
        populateDashboardDeckSelect();
        resetDashboardFiltersAndState(true);
        if(appState.activeScreen === 'dashboard-screen') renderDashboard();
        navigateToScreen('home-screen', true);
        updateStatusMessage(statusElement, `置換インポート成功 (${Object.keys(appState.allDecks).length}デッキ)`, "success");
        showNotification("データをファイルの内容で完全に置き換えました。", "success");
    } catch (error) {
        updateStatusMessage(statusElement, `置換エラー: ${error.message}`, "error");
        showNotification(`置換インポートエラー: ${error.message}`, 'error', 10000);
        showNotification("エラー発生。ページ再読み込み推奨。", "warning", 10000);
    }
}

function mergeDataFromImport(importedData, statusElement) {
     let addedCount = 0, updatedCount = 0;
     const originalDecks = JSON.parse(JSON.stringify(appState.allDecks));
     const originalSettings = { ...appState.settings };
     const originalCurrentDeckId = appState.currentDeckId;
     try {
        const validImportedDecks = repairAndValidateAllDecks(importedData.allDecks || {});
        const validImportedSettings = repairAndValidateSettings(importedData.settings);
        for (const deckId in validImportedDecks) {
             if (Object.hasOwnProperty.call(validImportedDecks, deckId)) {
                 appState.allDecks[deckId] ? updatedCount++ : addedCount++;
                 appState.allDecks[deckId] = validImportedDecks[deckId];
             }
        }
        appState.settings = validImportedSettings;
        const importedCDI = importedData.currentDeckId;
        if (appState.currentDeckId !== null && !appState.allDecks[appState.currentDeckId]) {
             appState.currentDeckId = (importedCDI && appState.allDecks[importedCDI]) ? importedCDI : null;
        } else if (appState.currentDeckId === null && importedCDI && appState.allDecks[importedCDI]) {
             appState.currentDeckId = importedCDI;
        }
        appState.currentDashboardDeckId = appState.currentDeckId;
        let saveSuccess = saveData(LS_KEYS.SETTINGS, appState.settings) &&
                          saveData(LS_KEYS.DECKS, appState.allDecks) &&
                          saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId);
         if (!saveSuccess) {
            appState.allDecks = originalDecks; appState.settings = originalSettings;
            appState.currentDeckId = originalCurrentDeckId; appState.currentDashboardDeckId = originalCurrentDeckId;
            throw new Error("マージデータの保存失敗。変更は取り消されました。");
        }
        applyTheme(appState.settings.theme);
        applyInitialSettingsToUI();
        updateHomeUI(true);
        populateDashboardDeckSelect();
        if (appState.activeScreen === 'dashboard-screen') renderDashboard();
        updateStatusMessage(statusElement, `マージ成功 (追加 ${addedCount}, 更新 ${updatedCount} デッキ)`, "success");
        showNotification(`データをマージ (追加 ${addedCount}, 更新 ${updatedCount})。設定も更新。`, "success");
     } catch (error) {
         updateStatusMessage(statusElement, `マージエラー: ${error.message}`, "error");
         showNotification(`マージインポートエラー: ${error.message}`, 'error', 10000);
         appState.allDecks = originalDecks; appState.settings = originalSettings;
         appState.currentDeckId = originalCurrentDeckId; appState.currentDashboardDeckId = originalCurrentDeckId;
         showNotification("エラー発生。ページ再読み込み推奨。", "warning", 10000);
     }
}

function handleResetAllDataClick() {
     showModal({
        title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 全データ削除の最終確認`,
        content: `<p><strong>警告！ この操作は絶対に元に戻せません。</strong></p><p>すべての問題集、学習履歴、設定が完全に削除されます。</p><hr><label for="delete-confirm-input">削除を確認するには、<strong>DELETE ALL DATA</strong> と入力:</label><input type="text" id="delete-confirm-input" class="confirm-input" style="width:100%;margin-top:5px" placeholder="DELETE ALL DATA" aria-describedby="delete-confirm-error"><p id="delete-confirm-error" class="status-message error" style="display:none;margin-top:5px" aria-live="assertive"></p>`,
        buttons: [
            { text: '<i class="fas fa-trash-alt"></i> 全て削除', class: 'danger', onClick: deleteAllDataConfirmed },
            { text: 'キャンセル', class: 'secondary', onClick: closeModal }
        ],
        size: 'md',
         onClose: () => {
             const confirmInput = document.getElementById('delete-confirm-input');
             if(confirmInput) confirmInput.removeEventListener('input', clearResetError);
         }
    });
     const confirmInput = document.getElementById('delete-confirm-input');
     safeAddEventListener(confirmInput, 'input', clearResetError);
     setTimeout(() => confirmInput?.focus(), 100);
}
function deleteAllDataConfirmed() {
     const confirmInput = document.getElementById('delete-confirm-input');
     const errorMsg = document.getElementById('delete-confirm-error');
     if (!confirmInput || !errorMsg) return;
     if (confirmInput.value.trim() !== "DELETE ALL DATA") {
         errorMsg.textContent = "入力が一致しません。「DELETE ALL DATA」と正確に入力してください。";
         errorMsg.style.display = 'block'; confirmInput.focus(); confirmInput.select(); return;
     }
     closeModal();
    updateLoadingOverlay(true, "全データを削除中...");
    try {
         Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
         appState.allDecks = {}; appState.settings = { ...DEFAULT_SETTINGS };
         appState.currentDeckId = null; appState.currentDashboardDeckId = null;
         resetStudyState(); resetDashboardFiltersAndState(true);
         appState.homeDeckCurrentPage = 1; appState.homeDeckFilterQuery = '';
         appState.homeDeckSortOrder = 'lastStudiedDesc'; appState.studyFilter = 'all';
         applyTheme(appState.settings.theme); applyInitialSettingsToUI();
         updateHomeUI(true); populateDashboardDeckSelect();
         navigateToScreen('home-screen', true);
        showNotification("すべてのアプリデータが削除されました。", "success");
    } catch (error) {
        showNotification(`データ削除エラー: ${error.message}`, "error");
        showNotification("エラー発生。ページ再読み込み推奨。", "warning", 10000);
    } finally {
        updateLoadingOverlay(false);
    }
}

// 修正2: JSONテキストからファイル生成機能のハンドラ
function handleGenerateJsonFile() {
    const jsonString = dom.plainJsonInput?.value;
    const statusElement = dom.generateJsonStatus;

    if (!jsonString || jsonString.trim() === '') {
        updateStatusMessage(statusElement, 'JSONテキストが空です。', 'warning');
        clearStatusMessageAfterDelay(statusElement);
        return;
    }

    try {
        // JSON形式をパースして検証（deck形式である必要はない、有効なJSONかどうかが主）
        JSON.parse(jsonString); // これが失敗したらcatchへ

        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        link.download = `generated_deck_${timestamp}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            updateStatusMessage(statusElement, 'JSONファイルがダウンロードされました。', 'success');
            clearStatusMessageAfterDelay(statusElement);
        }, 150);

    } catch (error) {
        console.error("Error generating JSON file from text:", error);
        updateStatusMessage(statusElement, `JSON形式エラー: ${error.message}`, 'error');
        // エラーメッセージは自動で消さない
        showNotification(`JSONファイル生成エラー: ${error.message}`, 'error');
    }
}


function clearResetError(){
     const errorMsg = document.getElementById('reset-confirm-error') || document.getElementById('delete-confirm-error');
     if (errorMsg) { errorMsg.style.display = 'none'; errorMsg.textContent = ''; }
}
function updateStatusMessage(element, message, type = 'info') {
    if (element) {
        element.textContent = message;
        element.className = `status-message ${type}`;
        element.setAttribute('aria-live', (type === 'error' || type === 'warning') ? 'assertive' : 'polite');
        element.style.display = message ? 'inline-block' : 'none';
    }
}
const statusClearTimers = {};
function clearStatusMessageAfterDelay(element, delay = 5000) {
    if (element && element.id) {
        const timerId = element.id;
        clearTimeout(statusClearTimers[timerId]);
        statusClearTimers[timerId] = setTimeout(() => {
            const currentElement = document.getElementById(element.id);
            if (currentElement && !currentElement.classList.contains('error') && !currentElement.classList.contains('warning')) {
                updateStatusMessage(currentElement, '', 'info');
            }
            delete statusClearTimers[timerId];
        }, delay);
    }
}

// ====================================================================
// ホーム画面関連処理 (Home Screen)
// ====================================================================
function updateHomeUI(forceUpdate = false) {
     if (!forceUpdate && appState.activeScreen !== 'home-screen') return;
     updateDeckListControlsVisibility();
     updateFilteredDeckList();
     updateTopScreenDisplay();
}
function updateDeckListControlsVisibility() {
     const showControls = Object.keys(appState.allDecks).length > 0;
     safeSetStyle(dom.deckListControls, 'display', showControls ? 'flex' : 'none');
     if (!showControls) safeSetStyle(dom.deckListPagination, 'display', 'none');
}
function handleDeckSearchInput(event) {
     appState.homeDeckFilterQuery = event.target.value;
     appState.homeDeckCurrentPage = 1;
     updateFilteredDeckList();
}
function handleDeckSortChange(event) {
    appState.homeDeckSortOrder = event.target.value;
    appState.homeDeckCurrentPage = 1;
    updateFilteredDeckList();
}
function getFilteredAndSortedDecks() {
    let decks = Object.values(appState.allDecks);
    const query = appState.homeDeckFilterQuery.toLowerCase().trim();
    if (query) {
        try { decks = decks.filter(deck => (deck.name || '').toLowerCase().includes(query)); }
        catch(e) { decks = decks.filter(deck => (deck.name || '').toLowerCase().includes(query)); }
    }
    decks.sort((a, b) => {
        const nameA = a.name || '', nameB = b.name || '';
        const countA = a.questions?.length || 0, countB = b.questions?.length || 0;
        const studiedA = a.lastStudied || 0, studiedB = b.lastStudied || 0;
        switch (appState.homeDeckSortOrder) {
            case 'nameAsc': return nameA.localeCompare(nameB, 'ja');
            case 'nameDesc': return nameB.localeCompare(nameA, 'ja');
            case 'questionCountAsc': return countA - countB || nameA.localeCompare(nameB, 'ja');
            case 'questionCountDesc': return countB - countA || nameA.localeCompare(nameB, 'ja');
            default: return studiedB - studiedA || nameA.localeCompare(nameB, 'ja');
        }
    });
    return decks;
}
function updateFilteredDeckList() {
     const filteredDecks = getFilteredAndSortedDecks();
     const totalDecks = filteredDecks.length;
     const decksPerPage = appState.settings.homeDecksPerPage || DEFAULT_SETTINGS.homeDecksPerPage;
     const totalPages = Math.ceil(totalDecks / decksPerPage) || 1;
     appState.homeDeckCurrentPage = Math.max(1, Math.min(appState.homeDeckCurrentPage, totalPages));
     const startIndex = (appState.homeDeckCurrentPage - 1) * decksPerPage;
     const decksToShow = filteredDecks.slice(startIndex, startIndex + decksPerPage);
     renderDeckList(decksToShow);
     renderDeckPagination(totalDecks, totalPages, appState.homeDeckCurrentPage);
}
function renderDeckList(decks) {
     if (!dom.deckList) return;
     dom.deckList.innerHTML = ''; dom.deckList.scrollTop = 0;
     if (decks.length === 0) {
         const message = appState.homeDeckFilterQuery ? `検索語「${escapeHtml(appState.homeDeckFilterQuery)}」一致なし。` :
                         (Object.keys(appState.allDecks).length === 0 ? '問題集がありません。<br>「新規問題集(JSON)を読み込む」から追加してください。' : '表示する問題集がありません。');
         dom.deckList.innerHTML = `<li class="no-decks-message">${message}</li>`; return;
     }
     const fragment = document.createDocumentFragment();
     decks.forEach(deck => {
         const li = document.createElement('li');
         li.dataset.deckId = deck.id; li.tabIndex = 0;
         li.setAttribute('role', 'button');
         const isActive = deck.id === appState.currentDeckId;
         li.classList.toggle('active-deck', isActive);
         li.setAttribute('aria-selected', String(isActive));
         li.setAttribute('aria-label', `問題集 ${escapeHtml(deck.name || '名称未設定')} を選択`);
         const { accuracyText } = calculateOverallAccuracy(deck);
         const lastStudiedText = deck.lastStudied ? `最終学習: ${formatDate(deck.lastStudied)}` : '未学習';
         li.innerHTML = `
            <div class="deck-info">
                <span class="deck-name">${escapeHtml(deck.name || '名称未設定')} (${deck.questions?.length || 0}問)</span>
                <span class="deck-history">${lastStudiedText} / 正答率: ${accuracyText}</span>
            </div>
            <div class="deck-actions no-print">
                ${createButton({ text: '<i class="fas fa-check-circle" aria-hidden="true"></i> 選択', class: `small ${isActive ? 'secondary' : 'primary'} select-deck`, ariaLabel: `問題集 ${escapeHtml(deck.name || '名称未設定')} を選択`, data: { 'deckId': deck.id }, disabled: isActive }).outerHTML}
                ${createButton({ text: '<i class="fas fa-trash-alt" aria-hidden="true"></i> 削除', class: 'small danger delete-deck', ariaLabel: `問題集 ${escapeHtml(deck.name || '名称未設定')} を削除`, data: { 'deckId': deck.id } }).outerHTML}
            </div>`;
         fragment.appendChild(li);
     });
     dom.deckList.appendChild(fragment);
}
function renderDeckPagination(totalItems, totalPages, currentPage) {
     renderGenericPagination(dom.deckListPagination, totalItems, totalPages, currentPage, 'deck-page-nav');
}
function handleDeckPaginationClick(event) {
     const targetPage = getPageFromPaginationClick(event, 'deck-page-nav');
     if (targetPage !== null && targetPage !== appState.homeDeckCurrentPage) {
         appState.homeDeckCurrentPage = targetPage;
         updateFilteredDeckList();
         dom.deckList?.focus();
     }
}
function updateTopScreenDisplay() {
    const deckSelected = !!appState.currentDeckId && !!appState.allDecks[appState.currentDeckId];
    const currentDeck = deckSelected ? appState.allDecks[appState.currentDeckId] : null;
    safeSetText(dom.currentDeckName, currentDeck ? escapeHtml(currentDeck.name || '名称未設定') : '未選択');
    safeSetText(dom.totalQuestions, currentDeck ? (currentDeck.questions?.length ?? 0).toString() : '0');
    safeSetText(dom.currentDeckLastStudied, currentDeck?.lastStudied ? formatDate(currentDeck.lastStudied) : '-');
    const { accuracyText } = calculateOverallAccuracy(currentDeck);
    safeSetText(dom.currentDeckAccuracy, accuracyText);
    safeSetStyle(dom.studyFilterOptions, 'display', deckSelected ? 'block' : 'none');
    safeSetText(dom.lowAccuracyThresholdDisplayFilter, appState.settings.lowAccuracyThreshold);
    updateHomeActionButtonsState(currentDeck);
    clearTimeout(filterCountDebounceTimer);
    filterCountDebounceTimer = setTimeout(() => { if(appState.activeScreen === 'home-screen') updateAllFilterCounts(); }, MIN_DEBOUNCE_DELAY);
}
function updateHomeActionButtonsState(currentDeck) {
     if (dom.resetHistoryButton) {
        let hasHistory = currentDeck && (currentDeck.lastStudied !== null || currentDeck.sessionHistory?.length > 0 || currentDeck.questions?.some(q => q.history?.length > 0));
        dom.resetHistoryButton.disabled = !hasHistory;
        setAriaDisabled(dom.resetHistoryButton, !hasHistory);
        dom.resetHistoryButton.title = hasHistory ? `「${escapeHtml(currentDeck.name)}」の全学習履歴リセット` : (currentDeck ? "リセットする履歴なし" : "問題集を選択");
     }
     if (dom.startStudyButton) {
         dom.startStudyButton.disabled = !currentDeck;
         setAriaDisabled(dom.startStudyButton, !currentDeck);
         if(!currentDeck) dom.startStudyButton.title = "学習開始する問題集を選択";
     }
}

function updateAllFilterCounts() {
     const deck = appState.allDecks[appState.currentDeckId];
     // 修正5: studyFilterRadios を studyFilterSelect に変更
     const filterSelect = dom.studyFilterSelect;

     if (!deck || !filterSelect) {
        if (filterSelect) { // フィルターオプションカウントをリセット
            Array.from(filterSelect.options).forEach(option => {
                const text = option.textContent.replace(/\s*\(\d+\)$/, ''); // カウント部分を削除
                option.textContent = `${text} (0)`;
            });
        }
        safeSetText(dom.filteredQuestionCountDisplay, "対象問題数: 0問");
        updateStudyButtonsState(0);
        return;
     }

    let totalSelectedFiltered = 0;
    try {
        Array.from(filterSelect.options).forEach(option => {
            const filterValue = option.value;
            const list = getFilteredStudyList(filterValue);
            const count = list?.length || 0;
            const baseText = option.textContent.replace(/\s*\(\d+\)$/, '').replace(/\s*\[.*?\]%?\)$/, ''); // 既存カウントと閾値表示を削除
            
            let displayText = baseText;
            if (filterValue === 'lowAccuracy') {
                 displayText = `苦手 (正答率 ≤ ${appState.settings.lowAccuracyThreshold}%)`;
            }
            option.textContent = `${displayText} (${count})`;

            if(filterSelect.value === filterValue) { // 現在選択されているフィルター
                totalSelectedFiltered = count;
                appState.studyFilter = filterValue; // 状態を同期
            }
        });
    } catch (error) {
        console.error("Error updating filter counts:", error);
        safeSetText(dom.filteredQuestionCountDisplay, "エラー発生");
        updateStudyButtonsState(0);
        return;
    }
    safeSetText(dom.filteredQuestionCountDisplay, `総対象問題数: ${totalSelectedFiltered}問`);
    updateStudyButtonsState(totalSelectedFiltered);
}

function updateStudyButtonsState(filteredCount) {
    if (!dom.startStudyButton) return;
    const canStart = filteredCount > 0;
    dom.startStudyButton.disabled = !canStart;
    setAriaDisabled(dom.startStudyButton, !canStart);
    if (!appState.currentDeckId) {
         dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
     } else if (!canStart) {
         const selectedOptionText = dom.studyFilterSelect?.options[dom.studyFilterSelect.selectedIndex]?.textContent.replace(/\s*\(\d+\)$/, '') || '選択した条件';
         dom.startStudyButton.title = `「${escapeHtml(selectedOptionText)}」に該当する問題がありません。`;
     } else {
         dom.startStudyButton.title = `選択中のフィルター条件 (${filteredCount}問) で学習を開始します`;
     }
}

function handleDeckListClick(event) {
    const listItem = event.target.closest('li[data-deck-id]');
    if (!listItem) return;
    const deckId = listItem.dataset.deckId;
    if (!deckId) return;
    const selectButton = event.target.closest('.select-deck');
    const deleteButton = event.target.closest('.delete-deck');
    if (selectButton && !selectButton.disabled) { event.stopPropagation(); selectDeck(deckId); }
    else if (deleteButton && !deleteButton.disabled) { event.stopPropagation(); handleDeleteDeckClick(deckId); }
    else if (listItem.getAttribute('role') === 'button' && deckId !== appState.currentDeckId) { selectDeck(deckId); }
}
function handleDeckListKeydown(event) {
     const currentItem = event.target.closest('li[data-deck-id]');
     if (!currentItem) return;
    switch (event.key) {
        case 'Enter': case ' ':
             event.preventDefault();
             const deckId = currentItem.dataset.deckId;
             if (deckId && deckId !== appState.currentDeckId) selectDeck(deckId);
            break;
         case 'ArrowDown': case 'ArrowUp':
             event.preventDefault();
             focusSiblingListItem(currentItem, event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling');
             break;
         case 'Home': case 'End':
             event.preventDefault();
             focusSiblingListItem(currentItem, event.key === 'Home' ? 'firstElementChild' : 'lastElementChild', currentItem.parentElement);
             break;
    }
}
function focusSiblingListItem(currentItem, property, parent = currentItem.parentElement) {
     if (!parent) return;
     let sibling = (property === 'firstElementChild' || property === 'lastElementChild') ? parent[property] : currentItem[property];
     while (sibling && (!sibling.matches || !sibling.matches('li[data-deck-id]'))) sibling = sibling[property];
     sibling?.focus();
}
function selectDeck(deckId) {
    if (!deckId || !appState.allDecks[deckId] || deckId === appState.currentDeckId) return;
    appState.currentDeckId = deckId;
    appState.currentDashboardDeckId = deckId;
    saveData(LS_KEYS.CURRENT_DECK_ID, deckId);
    showNotification(`問題集「${escapeHtml(appState.allDecks[deckId].name)}」を選択しました。`, 'success', 2500);
    appState.studyFilter = 'all'; // 修正5: デッキ選択時にフィルターをリセット
    if(dom.studyFilterSelect) dom.studyFilterSelect.value = 'all'; // UIもリセット
    updateHomeUI(true);
    safeSetValue(dom.dashboardDeckSelect, deckId);
    if (appState.activeScreen === 'dashboard-screen') {
        resetDashboardFiltersAndState(false);
        renderDashboard();
    }
}
function handleDeleteDeckClick(deckId) {
     const deck = appState.allDecks[deckId];
     if (!deck) { showNotification("削除対象の問題集が見つかりません。", "error"); return; }
     showModal({
         title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 問題集削除確認`,
         content: `<p>「<strong>${escapeHtml(deck.name)}</strong>」(${deck.questions?.length ?? 0}問) と全学習履歴を削除します。<br><strong style="color:var(--danger-dark);">元に戻せません！</strong></p>`,
         buttons: [
             { text: '<i class="fas fa-trash-alt"></i> 削除', class: 'danger', onClick: () => { deleteDeckConfirmed(deckId); closeModal(); } },
             { text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ], size: 'md'
     });
}
function deleteDeckConfirmed(deckId) {
    if (!deckId || !appState.allDecks[deckId]) { showNotification("削除対象なし", "error"); return; }
    const deckName = appState.allDecks[deckId].name || '無名';
    updateLoadingOverlay(true, `「${escapeHtml(deckName)}」削除中...`);
    const originalDecks = JSON.parse(JSON.stringify(appState.allDecks));
    const originalCurrentDeckId = appState.currentDeckId, originalDashboardDeckId = appState.currentDashboardDeckId;
    delete appState.allDecks[deckId];
    let selectionChanged = false;
    if (appState.currentDeckId === deckId) { appState.currentDeckId = null; selectionChanged = true; }
    if (appState.currentDashboardDeckId === deckId) { appState.currentDashboardDeckId = null; selectionChanged = true; }
    if (saveData(LS_KEYS.DECKS, appState.allDecks)) {
        if (selectionChanged) { saveData(LS_KEYS.CURRENT_DECK_ID, null); safeSetValue(dom.dashboardDeckSelect, ""); }
        showNotification(`「${escapeHtml(deckName)}」を削除しました。`, "success");
        updateHomeUI(true); populateDashboardDeckSelect();
        if (appState.activeScreen === 'dashboard-screen' && selectionChanged) renderDashboard();
    } else {
        appState.allDecks = originalDecks; appState.currentDeckId = originalCurrentDeckId; appState.currentDashboardDeckId = originalDashboardDeckId;
        showNotification("問題集削除失敗 (保存エラー)。変更は取消。", "error");
    }
    updateLoadingOverlay(false);
}
function handleResetHistoryClick() {
     const deckId = appState.currentDeckId;
     if (!deckId || !appState.allDecks[deckId]) { showNotification("問題集未選択", "warning"); return; }
     const deck = appState.allDecks[deckId];
     showModal({
         title: `<i class="fas fa-history" style="color:var(--warning-color);"></i> 学習履歴リセット確認`,
         content: `<p>「<strong>${escapeHtml(deck.name)}</strong>」の全学習履歴をリセットします。<br><strong style="color:var(--danger-dark);">元に戻せません！</strong></p><hr><label for="reset-confirm-input">確認のため「${escapeHtml(deck.name)}」と入力:</label><input type="text" id="reset-confirm-input" class="confirm-input" style="width:100%;margin-top:5px" placeholder="${escapeHtml(deck.name)}" aria-describedby="reset-confirm-error"><p id="reset-confirm-error" class="status-message error" style="display:none;margin-top:5px" aria-live="assertive"></p>`,
         buttons: [
             { text: '<i class="fas fa-eraser"></i> リセット実行', class: 'danger', onClick: () => resetHistoryConfirmed(deckId) },
             { text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ],
          onClose: () => { const ci = document.getElementById('reset-confirm-input'); if(ci) ci.removeEventListener('input', clearResetError); },
          size: 'md'
     });
      const ci = document.getElementById('reset-confirm-input');
      safeAddEventListener(ci, 'input', clearResetError); setTimeout(() => ci?.focus(), 100);
}
function resetHistoryConfirmed(deckId) {
     const deck = appState.allDecks[deckId];
     const confirmInput = document.getElementById('reset-confirm-input');
     const errorMsg = document.getElementById('reset-confirm-error');
     if (!deck || !confirmInput || !errorMsg) { closeModal(); return; }
     if (confirmInput.value.trim() !== deck.name) {
         errorMsg.textContent = "問題集名が一致しません。"; errorMsg.style.display = 'block';
         confirmInput.focus(); confirmInput.select(); return;
     }
     closeModal();
    updateLoadingOverlay(true, `「${escapeHtml(deck.name)}」の履歴リセット中...`);
     const originalDeck = JSON.parse(JSON.stringify(deck));
     try {
         deck.lastStudied = null; deck.totalCorrect = 0; deck.totalIncorrect = 0;
         deck.sessionHistory = []; deck.questions.forEach(q => { q.history = []; });
         if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             appState.allDecks[deckId] = originalDeck; throw new Error("履歴リセット後のデータ保存失敗。");
         }
         showNotification(`「${escapeHtml(deck.name)}」の学習履歴をリセット。`, "success");
         updateHomeUI(true);
         if (appState.currentDashboardDeckId === deckId && appState.activeScreen === 'dashboard-screen') renderDashboard();
     } catch (error) {
         showNotification(`履歴リセットエラー: ${error.message}`, "error");
         if (appState.allDecks[deckId] !== originalDeck) appState.allDecks[deckId] = originalDeck;
     } finally {
         updateLoadingOverlay(false);
     }
}

// 修正5: handleStudyFilterChange を <select> 要素に対応
function handleStudyFilterChange(event) {
     const newFilter = event.target.value;
     appState.studyFilter = newFilter;
     console.log("Study filter changed to:", appState.studyFilter);
     clearTimeout(filterCountDebounceTimer);
     filterCountDebounceTimer = setTimeout(updateAllFilterCounts, MIN_DEBOUNCE_DELAY);
}

function getFilteredStudyList(filter = appState.studyFilter) {
    const deck = appState.allDecks[appState.currentDeckId];
    if (!deck || !Array.isArray(deck.questions) || deck.questions.length === 0) return [];
    const questions = deck.questions;
    const lowThreshold = appState.settings.lowAccuracyThreshold || DEFAULT_SETTINGS.lowAccuracyThreshold;
    let filteredQuestions = [];
    try {
        switch (filter) {
            case 'lowAccuracy': filteredQuestions = questions.filter(q => { const stats = calculateQuestionAccuracy(q); return stats.totalCount > 0 && stats.accuracy <= lowThreshold; }); break;
            case 'incorrect': filteredQuestions = questions.filter(q => q.history?.length > 0 && !q.history[q.history.length - 1].correct); break;
            case 'unanswered': filteredQuestions = questions.filter(q => !q.history || q.history.length === 0); break;
            case 'difficult': case 'normal': case 'easy': filteredQuestions = questions.filter(q => q.history?.length > 0 && q.history[q.history.length - 1].evaluation === filter); break;
            default: filteredQuestions = [...questions]; break;
        }
    } catch (e) {
        showNotification(`フィルター処理エラー (${filter})`, 'error'); return [];
    }
    return filteredQuestions;
}


// ====================================================================
// 学習フロー (Study Flow)
// ====================================================================
function startStudy() {
    const deck = appState.allDecks[appState.currentDeckId];
    if (!deck) { showNotification('問題集を選択してください。', 'warning'); return; }
    const filteredList = getFilteredStudyList();
    if (filteredList.length === 0) {
         const selectedOptionText = dom.studyFilterSelect?.options[dom.studyFilterSelect.selectedIndex]?.textContent.replace(/\s*\(\d+\)$/, '') || '選択した条件';
        showNotification(`「${escapeHtml(selectedOptionText)}」に該当する問題がありません。`, 'warning'); return;
    }
    appState.studyList = shuffleArray([...filteredList]);
    appState.currentQuestionIndex = 0;
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
    appState.isStudyActive = true;
    if (dom.studyScreenTitle) {
        const titleSpan = dom.studyScreenTitle.querySelector('span');
        if(titleSpan) titleSpan.textContent = escapeHtml(deck.name || '名称未設定');
    }
    safeSetStyle(dom.studyCompleteMessage, 'display', 'none');
    setActiveClass(dom.studyCompleteMessage, false);
    safeSetStyle(dom.quitStudyHeaderButton, 'display', 'inline-block');
    safeSetStyle(dom.studyCard, 'display', 'block');
    safeSetStyle(dom.answerArea, 'display', 'none');
    safeSetStyle(dom.evaluationControls, 'display', 'none');
    safeSetStyle(dom.retryButton, 'display', 'none');
    navigateToScreen('study-screen'); // navigateToScreen内でスクロールとフォーカスを処理
    displayCurrentQuestion();
    updateStudyProgress();
}

function displayCurrentQuestion() {
    if (!appState.isStudyActive || appState.currentQuestionIndex < 0 || appState.currentQuestionIndex >= appState.studyList.length) {
         if (appState.isStudyActive) showStudyCompletion();
        return;
    }
    const questionData = appState.studyList[appState.currentQuestionIndex];
    if (!isValidQuestion(questionData)) {
         showNotification(`問題 ${appState.currentQuestionIndex + 1} のデータ形式不正。スキップします。`, 'warning', 5000);
         moveToNextQuestion(); return;
    }
    resetQuestionUI();
    safeSetText(dom.questionCounter, `${appState.currentQuestionIndex + 1} / ${appState.studyList.length}`);
    safeSetText(dom.questionText, questionData.question);
    renderOptions(questionData.options, appState.settings.shuffleOptions);
    safeSetText(dom.answerText, questionData.correctAnswer);
    safeSetText(dom.explanationText, questionData.explanation || '解説はありません。');
    updateStudyProgress();
    // 修正1: フォーカスはnavigateToScreenまたはmoveToNextQuestionで行うため、ここでの個別フォーカスは削除
}

function resetQuestionUI(){
    if(dom.optionsButtonsContainer) { dom.optionsButtonsContainer.innerHTML = ''; dom.optionsButtonsContainer.setAttribute('aria-busy', 'true'); }
    safeSetStyle(dom.answerArea, 'display', 'none');
    safeSetStyle(dom.evaluationControls, 'display', 'none');
    if(dom.feedbackContainer) dom.feedbackContainer.className = 'feedback-container';
    if(dom.feedbackMessage) { const span = dom.feedbackMessage.querySelector('span'); if (span) span.textContent = ''; }
    if(dom.feedbackIcon) dom.feedbackIcon.className = 'feedback-icon fas';
    if(dom.studyCard) dom.studyCard.className = 'card study-card-active';
    safeSetStyle(dom.retryButton, 'display', 'none');
    if(dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
}

function renderOptions(optionsSource, shouldShuffle) {
    if(!dom.optionsButtonsContainer) return;
    dom.optionsButtonsContainer.innerHTML = '';
    const options = shouldShuffle ? shuffleArray([...optionsSource]) : [...optionsSource];
    const fragment = document.createDocumentFragment();
    options.forEach((option, index) => {
        fragment.appendChild(createButton({
            text: escapeHtml(option), class: 'option-button', data: { optionValue: option },
            ariaLabel: `選択肢 ${index + 1}: ${escapeHtml(option)}`
         }));
     });
     dom.optionsButtonsContainer.appendChild(fragment);
     dom.optionsButtonsContainer.removeAttribute('aria-busy');
}

function updateStudyProgress() {
    if (!dom.studyProgressBar || !dom.studyProgressText || !dom.studyProgressContainer) return;
    const total = appState.studyList.length;
    const currentIdx = appState.currentQuestionIndex;
    if (appState.isStudyActive && total > 0 && currentIdx >= 0) {
        const currentNum = currentIdx + 1;
        const progressPercent = Math.min(100, Math.max(0, Math.round((currentNum / total) * 100)));
        dom.studyProgressBar.value = currentNum; dom.studyProgressBar.max = total;
        safeSetText(dom.studyProgressText, `${currentNum} / ${total} (${progressPercent}%)`);
        dom.studyProgressContainer.style.visibility = 'visible';
    } else {
        dom.studyProgressContainer.style.visibility = 'hidden';
    }
}

function handleOptionButtonClick(event) {
    const clickedButton = event.target.closest('.option-button');
    if (!clickedButton || clickedButton.disabled || !appState.isStudyActive) return;
    const allOptions = dom.optionsButtonsContainer?.querySelectorAll('.option-button');
    if (allOptions) allOptions.forEach(btn => btn.disabled = true);
    const selectedOption = clickedButton.dataset.optionValue;
    const questionData = appState.studyList[appState.currentQuestionIndex];
    if (!isValidQuestion(questionData)) {
         showNotification("解答処理中にエラー。", "error");
         if(allOptions) allOptions.forEach(btn => btn.disabled = false); return;
    }
    handleAnswerSubmission(selectedOption, questionData.correctAnswer);
}

function handleAnswerSubmission(selectedOption, correctAnswer) {
    const isCorrect = selectedOption === correctAnswer;
    const questionData = appState.studyList[appState.currentQuestionIndex];
    if (!questionData || !dom.studyCard || !dom.feedbackContainer || !dom.feedbackMessage || !dom.feedbackIcon || !dom.optionsButtonsContainer || !dom.answerArea) {
        showNotification("フィードバック表示エラー。", "error"); return;
    }
    appState.studyStats[isCorrect ? 'currentSessionCorrect' : 'currentSessionIncorrect']++;
    dom.studyCard.classList.remove('correct-answer', 'incorrect-answer');
    dom.studyCard.classList.add(isCorrect ? 'correct-answer' : 'incorrect-answer');
    safeSetText(dom.feedbackMessage.querySelector('span'), isCorrect ? '正解！' : '不正解...');
    dom.feedbackContainer.className = `feedback-container ${isCorrect ? 'correct' : 'incorrect'}`;
    dom.feedbackIcon.className = `feedback-icon fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'}`;
    safeSetStyle(dom.retryButton, 'display', isCorrect ? 'none' : 'inline-block');
    dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
         const optionVal = button.dataset.optionValue;
         button.classList.remove('success', 'danger');
         button.style.opacity = '1';
         if (optionVal === correctAnswer) button.classList.add('success');
         else if (optionVal === selectedOption) button.classList.add('danger');
         else button.style.opacity = '0.6';
     });
    safeSetStyle(dom.answerArea, 'display', 'block');
    safeSetStyle(dom.evaluationControls, 'display', 'flex');
    setTimeout(() => { // 修正1: スクロールロジック改善
        if (dom.answerArea?.offsetParent !== null) {
            // スマートフォンでは、評価パネルが表示されると画面下部が隠れることがあるため、
            // answerArea全体ではなく、評価パネルの直前（例えばexplanationText）にスクロールした方が良い場合もある。
            // ここでは、より確実に表示されるよう、answerAreaの開始位置にスクロールする。
            dom.answerArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // block: 'nearest' で過度なスクロールを防ぐ
            setTimeout(() => dom.evaluationControls?.querySelector('.eval-button')?.focus(), FOCUS_DELAY + SCROLL_DELAY + 50);
        } else {
             dom.evaluationControls?.querySelector('.eval-button')?.focus();
        }
    }, SCROLL_DELAY);
}

function handleEvaluation(event) {
     const evalButton = event.target.closest('.eval-button');
     if (!evalButton || evalButton.disabled || !appState.isStudyActive) return;
     const evaluation = evalButton.dataset.levelChange;
     if (!evaluation || !['difficult', 'normal', 'easy'].includes(evaluation)) return;
     if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = true);
     const questionData = appState.studyList?.[appState.currentQuestionIndex];
     const isCorrect = dom.feedbackContainer?.classList.contains('correct') ?? false;
     if (!questionData || !questionData.id || !appState.currentDeckId) {
         showNotification("評価記録エラー。", "error");
         if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); return;
     }
     if (recordQuestionHistory(appState.currentDeckId, questionData.id, isCorrect, evaluation)) {
        moveToNextQuestion();
    } else {
         showNotification("学習履歴保存失敗。", "error");
         if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
     }
}

function recordQuestionHistory(deckId, questionId, isCorrect, evaluation) {
    const deck = appState.allDecks[deckId];
    if (!deck || !Array.isArray(deck.questions)) return false;
    const questionInDeck = deck.questions.find(q => q.id === questionId);
    if (!questionInDeck) return false;
    if (!Array.isArray(questionInDeck.history)) questionInDeck.history = [];
    questionInDeck.history.push({ ts: Date.now(), correct: isCorrect, evaluation: evaluation });
    deck.lastStudied = Date.now();
    if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
         questionInDeck.history.pop(); return false;
    }
    return true;
}

function moveToNextQuestion() {
    appState.currentQuestionIndex++;
     if (appState.currentQuestionIndex < appState.studyList.length) {
         // 修正1: スクロールとフォーカスを改善
         window.scrollTo({ top: 0, behavior: 'auto' }); // 即時スクロール
         setTimeout(() => {
             displayCurrentQuestion(); // この中でフォーカスが試みられる
             // 学習画面の主要コンテンツ（例：質問文）にフォーカスを当てる
             dom.questionText?.focus({ preventScroll: true }); // preventScrollで二重スクロールを防ぐ
         }, SCROLL_DELAY + 50); // 表示更新とレンダリングのための適切な遅延
     } else {
         showStudyCompletion();
     }
}

function showStudyCompletion() {
     if (!dom.studyCompleteMessage || !appState.isStudyActive) return;
    const studyWasActive = appState.isStudyActive;
    appState.isStudyActive = false;
    if (studyWasActive) saveSessionHistory(); // studyStatsはこの中でリセットされる

    safeSetStyle(dom.studyCard, 'display', 'none');
    safeSetStyle(dom.evaluationControls, 'display', 'none');
    safeSetStyle(dom.quitStudyHeaderButton, 'display', 'none');
    safeSetStyle(dom.studyProgressContainer, 'visibility', 'hidden');

    // 修正6: studyStatsはsaveSessionHistoryでリセットされる前に値を取得
    const finalCorrect = appState.studyStats.currentSessionCorrect;
    const finalIncorrect = appState.studyStats.currentSessionIncorrect;

    safeSetText(dom.sessionCorrectCount, finalCorrect); // 正しい値をセット
    safeSetText(dom.sessionIncorrectCount, finalIncorrect); // 正しい値をセット

    safeSetStyle(dom.studyCompleteMessage, 'display', 'block');
    setActiveClass(dom.studyCompleteMessage, true);
    dom.studyCompleteMessage.setAttribute('tabindex', '-1');
    dom.studyCompleteMessage.focus();

    appState.studyList = [];
    appState.currentQuestionIndex = -1;
    // studyStatsはsaveSessionHistoryでリセットされるのでここでは不要
    updateHomeUI(true);
}

function saveSessionHistory() {
    const deckId = appState.currentDeckId;
    const deck = appState.allDecks[deckId];

    // 修正6: studyStatsをここで使用し、その後リセット
    const { currentSessionCorrect: correct, currentSessionIncorrect: incorrect } = appState.studyStats;

    if (!deck) {
        console.error("Cannot save session history: Current deck not found.");
        appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 }; // ここでリセット
        return;
    }

    if (correct > 0 || incorrect > 0) {
        if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
        deck.sessionHistory.push({ ts: Date.now(), correct: correct, incorrect: incorrect });
        deck.lastStudied = Date.now();
        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             deck.sessionHistory.pop();
             showNotification("今回の学習セッション履歴の保存に失敗しました。", "error");
         } else {
             console.log(`Session history saved for deck ${deck.id}: C=${correct}, I=${incorrect}`);
         }
    } else {
        if (appState.currentDeckId) {
             deck.lastStudied = Date.now();
             if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                  console.error(`Failed to update lastStudied for deck ${deck.id} after empty session.`);
             }
        }
    }
    // セッション統計をリセット
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
}

function retryCurrentQuestion() {
    if (!appState.isStudyActive || appState.currentQuestionIndex < 0 || !dom.answerArea || !dom.optionsButtonsContainer) return;
    resetQuestionUI();
    displayCurrentQuestion();
    showNotification("もう一度挑戦してください。", "info", 2000);
}

function confirmQuitStudy(showConfirmation = true, navigateTo = 'home-screen') {
    if (!appState.isStudyActive) {
        if(appState.activeScreen !== navigateTo) navigateToScreen(navigateTo);
        return true;
    }
    let quitConfirmed = !showConfirmation || confirm("学習セッションを中断しますか？\nここまでの解答履歴と今回のセッション統計は保存されます。");
    if (quitConfirmed) {
        const studyWasActive = appState.isStudyActive;
        appState.isStudyActive = false;
        if (studyWasActive) saveSessionHistory();
        resetStudyScreenUI();
        navigateToScreen(navigateTo);
        showNotification("学習を中断しました。", "info", 3000);
        updateHomeUI(true);
        return true;
    }
    return false;
}

function resetStudyScreenUI() {
     safeSetStyle(dom.studyCard, 'display', 'none');
     safeSetStyle(dom.evaluationControls, 'display', 'none');
     safeSetStyle(dom.studyCompleteMessage, 'display', 'none');
     setActiveClass(dom.studyCompleteMessage, false);
     safeSetStyle(dom.quitStudyHeaderButton, 'display', 'none');
     safeSetStyle(dom.studyProgressContainer, 'visibility', 'hidden');
     safeSetText(dom.questionCounter, '');
     safeSetText(dom.questionText, '');
     if(dom.optionsButtonsContainer) dom.optionsButtonsContainer.innerHTML = '';
     if(dom.feedbackMessage) { const span = dom.feedbackMessage.querySelector('span'); if (span) span.textContent = ''; }
}

function resetStudyState() {
     appState.isStudyActive = false; appState.studyList = []; appState.currentQuestionIndex = -1;
     appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
     resetStudyScreenUI();
}

// ====================================================================
// ダッシュボード関連処理 (Dashboard)
// ====================================================================
function populateDashboardDeckSelect() {
    if (!dom.dashboardDeckSelect) return;
    dom.dashboardDeckSelect.innerHTML = '<option value="">-- 問題集を選択してください --</option>';
    const decks = Object.values(appState.allDecks);
    if (decks.length === 0) {
        safeSetStyle(dom.dashboardContent, 'display', 'none'); safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'block'); return;
    }
    decks.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
    const fragment = document.createDocumentFragment();
    decks.forEach(deck => {
        const option = document.createElement('option');
        option.value = deck.id; option.textContent = escapeHtml(deck.name || '名称未設定');
        fragment.appendChild(option);
    });
    dom.dashboardDeckSelect.appendChild(fragment);
    safeSetValue(dom.dashboardDeckSelect, appState.currentDashboardDeckId || '');
    if (appState.currentDashboardDeckId && appState.allDecks[appState.currentDashboardDeckId]) {
        safeSetStyle(dom.dashboardContent, 'display', 'block'); safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'none');
    } else {
        safeSetStyle(dom.dashboardContent, 'display', 'none'); safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'block');
    }
}
function handleDashboardDeckChange(event) { selectDashboardDeck(event.target.value || null); }
function selectDashboardDeck(deckId) {
    if (deckId === appState.currentDashboardDeckId) return;
    appState.currentDashboardDeckId = deckId;
    resetDashboardFiltersAndState(false);
    renderDashboard();
}
function toggleDashboardControls() {
    if (dom.dashboardAnalysisControlsPanel && dom.dashboardControlsToggle) {
        const isCollapsed = dom.dashboardAnalysisControlsPanel.classList.toggle('collapsed');
        appState.isDashboardControlsCollapsed = isCollapsed;
        dom.dashboardControlsToggle.setAttribute('aria-expanded', String(!isCollapsed));
    }
}
function toggleDashboardControlsBasedOnSize() {
     const isMobile = window.innerWidth <= 768;
     safeSetStyle(dom.dashboardControlsToggle, 'display', isMobile ? 'flex' : 'none');
     if (dom.dashboardAnalysisControlsPanel && dom.dashboardControlsToggle) {
         if (!isMobile) {
             dom.dashboardAnalysisControlsPanel.classList.remove('collapsed');
             dom.dashboardControlsToggle.setAttribute('aria-expanded', 'true');
             appState.isDashboardControlsCollapsed = false;
         } else {
              const shouldBeCollapsed = appState.isDashboardControlsCollapsed;
              dom.dashboardAnalysisControlsPanel.classList.toggle('collapsed', shouldBeCollapsed);
              dom.dashboardControlsToggle.setAttribute('aria-expanded', String(!shouldBeCollapsed));
         }
     }
}
function handleDashboardFilterChange(event) { appState.dashboardFilterAccuracy = event.target.value; appState.dashboardCurrentPage = 1; renderDashboardQuestionAnalysis(); }
function handleDashboardSearchInput(event) { appState.dashboardSearchQuery = event.target.value; safeSetAttribute(dom.dashboardSearchButton, 'disabled', !appState.dashboardSearchQuery); appState.dashboardCurrentPage = 1; renderDashboardQuestionAnalysis(); }
function applyDashboardSearch() { appState.dashboardCurrentPage = 1; renderDashboardQuestionAnalysis(); }
function clearDashboardSearch() { safeSetValue(dom.dashboardSearchQuery, ''); appState.dashboardSearchQuery = ''; safeSetAttribute(dom.dashboardSearchButton, 'disabled', true); appState.dashboardCurrentPage = 1; renderDashboardQuestionAnalysis(); }
function handleDashboardSortChange(event) { appState.dashboardSortOrder = event.target.value; appState.dashboardCurrentPage = 1; renderDashboardQuestionAnalysis(); }
function handleDashboardItemsPerPageChange(event) {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && [10, 20, 50, 100].includes(value)) {
         appState.dashboardQuestionsPerPage = value; appState.dashboardCurrentPage = 1; renderDashboardQuestionAnalysis();
    }
}
function setDashboardViewMode(mode) {
     if (mode !== 'list' && mode !== 'chart') return;
     appState.dashboardViewMode = mode;
     setActiveClass(dom.viewModeList, mode === 'list'); setActiveClass(dom.viewModeChart, mode === 'chart');
     setAriaPressed(dom.viewModeList, mode === 'list'); setAriaPressed(dom.viewModeChart, mode === 'chart');
     setActiveClass(dom.questionListView, mode === 'list'); setActiveClass(dom.questionChartView, mode === 'chart');
     renderDashboardQuestionAnalysis();
 }
function resetDashboardFiltersAndState(resetDeck = false) {
     if(resetDeck) appState.currentDashboardDeckId = null;
     appState.dashboardCurrentPage = 1; appState.dashboardFilterAccuracy = 'all';
     appState.dashboardSearchQuery = ''; appState.dashboardSortOrder = 'accuracyAsc';
     appState.dashboardViewMode = 'list'; appState.isDashboardControlsCollapsed = true;
     safeSetValue(dom.dashboardDeckSelect, ''); safeSetValue(dom.dashboardFilterAccuracy, 'all');
     safeSetValue(dom.dashboardSearchQuery, ''); safeSetValue(dom.dashboardSortOrder, 'accuracyAsc');
     safeSetValue(dom.dashboardItemsPerPage, appState.settings.dashboardQuestionsPerPage);
     setDashboardViewMode('list'); toggleDashboardControlsBasedOnSize();
}
async function renderDashboard() {
    if (!dom.dashboardContent || !dom.dashboardNoDeckMessage) return;
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck) {
        safeSetStyle(dom.dashboardContent, 'display', 'none'); safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'block');
        destroyChart('studyTrends'); destroyChart('questionAccuracy'); return;
    }
    safeSetStyle(dom.dashboardContent, 'display', 'block'); safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'none');
    safeSetText(dom.dashboardDeckName, escapeHtml(deck.name));
    renderDashboardOverview(deck); renderDashboardTrendsChart(deck); renderDashboardQuestionAnalysis();
}
function renderDashboardOverview(deck) {
    if (!dom.dashboardOverview) return;
    const stats = calculateOverallAccuracy(deck);
    safeSetText(dom.dashboardTotalQuestions, deck.questions?.length ?? 0);
    safeSetText(dom.dashboardTotalAnswered, stats.totalAnswered);
    safeSetText(dom.dashboardOverallAccuracy, stats.accuracyText);
    safeSetText(dom.dashboardLastStudied, formatDate(deck.lastStudied));
}
function renderDashboardTrendsChart(deck) {
    if (!dom.studyTrendsChart || !checkChartJSAvaible()) {
        safeSetStyle(dom.studyTrendsChartContainer, 'display', 'block'); safeSetStyle(dom.studyTrendsNoData, 'display', 'block');
        safeSetStyle(dom.studyTrendsChart, 'display', 'none'); destroyChart('studyTrends'); return;
    }
    destroyChart('studyTrends');
    const sessions = deck.sessionHistory || [];
    if (sessions.length < 1) {
        safeSetStyle(dom.studyTrendsChartContainer, 'display', 'block'); safeSetStyle(dom.studyTrendsNoData, 'display', 'block');
        safeSetStyle(dom.studyTrendsChart, 'display', 'none'); return;
    }
    const recentSessions = sessions.slice(-DASHBOARD_TREND_SESSIONS);
    const labels = recentSessions.map((s, i) => `セッション ${sessions.length - recentSessions.length + i + 1}`);
    const correctData = recentSessions.map(s => s.correct);
    const incorrectData = recentSessions.map(s => s.incorrect);
    const accuracyData = recentSessions.map(s => (s.correct + s.incorrect > 0) ? Math.round((s.correct / (s.correct + s.incorrect)) * 100) : 0);
    const currentTheme = getCurrentAppliedTheme();
    const gridColor = currentTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const textColor = currentTheme === 'dark' ? '#e0e0e0' : '#333';
    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim();
    const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger-color').trim();
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
    const ctx = dom.studyTrendsChart.getContext('2d');
    appState.charts.studyTrends = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '正解', data: correctData, backgroundColor: successColor, order: 1 },
                { label: '不正解', data: incorrectData, backgroundColor: dangerColor, order: 1 },
                { label: '正答率 (%)', data: accuracyData, type: 'line', borderColor: primaryColor, backgroundColor: 'transparent', borderWidth: 2, pointBackgroundColor: primaryColor, pointRadius: 3, yAxisID: 'y1', order: 0, tension: 0.1 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, stacked: true, title: { display: true, text: '問題数', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
                y1: { position: 'right', min: 0, max: 100, title: { display: true, text: '正答率 (%)', color: textColor }, grid: { drawOnChartArea: false }, ticks: { color: textColor } },
                x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor } }
            },
            plugins: {
                tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => `${ctx.dataset.label||''}: ${ctx.dataset.label==='正答率 (%)'?ctx.parsed.y+'%':ctx.parsed.y+'問'}` } },
                legend: { labels: { color: textColor } }
            }
        }
    });
    safeSetStyle(dom.studyTrendsChartContainer, 'display', 'block'); safeSetStyle(dom.studyTrendsNoData, 'display', 'none');
    safeSetStyle(dom.studyTrendsChart, 'display', 'block');
}
function renderDashboardQuestionAnalysis() {
    const questionStats = getFilteredAndSortedQuestionStats();
    if (appState.dashboardViewMode === 'list') {
        renderDashboardQuestionList(questionStats);
        setActiveClass(dom.questionListView, true); setActiveClass(dom.questionChartView, false);
    } else {
        renderDashboardQuestionAnalysisChart(questionStats);
        setActiveClass(dom.questionListView, false); setActiveClass(dom.questionChartView, true);
    }
}
function renderDashboardQuestionList(questionStats) {
    if (!dom.questionAccuracyList) return;
    dom.questionAccuracyList.innerHTML = '';
    if (questionStats.length === 0) {
        safeSetHTML(dom.questionAccuracyList, '<li class="status-message info-message">フィルター条件に該当する問題がありません。</li>');
        renderDashboardPagination(0); return;
    }
    const startIdx = (appState.dashboardCurrentPage - 1) * appState.dashboardQuestionsPerPage;
    const pageQuestions = questionStats.slice(startIdx, startIdx + appState.dashboardQuestionsPerPage);
    const fragment = document.createDocumentFragment();
    pageQuestions.forEach(q => {
        const li = document.createElement('li');
        li.className = 'question-accuracy-item'; li.dataset.questionId = q.id;
        li.tabIndex = 0; li.setAttribute('role', 'button');
        const accuracyClass = q.totalCount === 0 ? 'unanswered' : getAccuracyClass(q.accuracy);
        const accuracyDisplay = q.totalCount === 0 ? '未解答' : `${q.accuracy}%`;
        const countsDisplay = q.totalCount === 0 ? '' : `(${q.correctCount}/${q.totalCount})`;
        li.setAttribute('aria-label', `問題詳細: ${escapeHtml(q.questionText.substring(0,50))}... 正答率 ${accuracyDisplay}`);
        li.innerHTML = `<div class="question-text-preview">${escapeHtml(q.questionText)}</div><div class="score-container"><span class="accuracy ${accuracyClass}">${accuracyDisplay}</span><span class="answer-counts">${countsDisplay}</span></div>`;
        fragment.appendChild(li);
    });
    dom.questionAccuracyList.appendChild(fragment);
    renderDashboardPagination(questionStats.length);
}
function handleQuestionItemClick(event) { const li = event.target.closest('.question-accuracy-item'); if (li?.dataset.questionId) showDetailForListItem(li.dataset.questionId); }
function handleQuestionItemKeydown(event) {
    const currentItem = event.target.closest('.question-accuracy-item'); if (!currentItem) return;
    switch (event.key) {
        case 'Enter': case ' ': event.preventDefault(); if (currentItem.dataset.questionId) showDetailForListItem(currentItem.dataset.questionId); break;
        case 'ArrowDown': case 'ArrowUp': event.preventDefault(); focusSiblingListItem(currentItem, event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling'); break;
        case 'Home': case 'End': event.preventDefault(); focusSiblingListItem(currentItem, event.key === 'Home' ? 'firstElementChild' : 'lastElementChild', currentItem.parentElement); break;
    }
}
function showDetailForListItem(questionId) {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    const question = deck?.questions.find(q => q.id === questionId);
    if (!question) { showNotification("問題詳細が見つかりません。", "error"); return; }
    const detailElement = createQuestionDetailElement(question);
    showModal({ title: `問題詳細`, content: detailElement, buttons: [{ text: '閉じる', class: 'secondary', onClick: closeModal }], size: 'lg' });
}
function createQuestionDetailElement(questionData) {
    const div = document.createElement('div');
    div.id = `q-detail-${questionData.id}`; div.className = 'question-detail-modal-content';
    const stats = calculateQuestionAccuracy(questionData);
    const accuracyClass = stats.totalCount === 0 ? 'unanswered' : getAccuracyClass(stats.accuracy);
    const accuracyDisplay = stats.totalCount === 0 ? '未解答' : `${stats.accuracy}%`;
    const countsDisplay = stats.totalCount === 0 ? '' : `(${stats.correctCount}/${stats.totalCount})`;
    div.innerHTML = `<div id="question-detail-view" role="document"><h4>問題文</h4><p>${escapeHtml(questionData.question)}</p><h4>選択肢</h4><ul>${questionData.options.map((opt, i) => `<li ${opt===questionData.correctAnswer?'style="font-weight:bold;color:var(--success-color);"':''}>${i+1}. ${escapeHtml(opt)}${opt===questionData.correctAnswer?' <i class="fas fa-check" style="margin-left:5px;"></i>':''}</li>`).join('')}</ul><h4>正解</h4><p>${escapeHtml(questionData.correctAnswer)}</p><h4>解説</h4><p>${escapeHtml(questionData.explanation||'解説なし')}</p><hr><h4>統計</h4><p>正答率: <strong class="${accuracyClass}">${accuracyDisplay}</strong> ${countsDisplay}</p><h4>解答履歴 (最新 ${MAX_RECENT_HISTORY}件)</h4></div>`;
    const historyList = document.createElement('ul');
    historyList.className = 'question-history-list'; historyList.setAttribute('aria-label', '最新解答履歴');
    if (!questionData.history || questionData.history.length === 0) {
        historyList.innerHTML = '<li>履歴がありません。</li>';
    } else {
        questionData.history.slice(-MAX_RECENT_HISTORY).reverse().forEach(h => {
            const li = document.createElement('li');
            const evalMap = {'difficult':'難', 'normal':'普', 'easy':'易'};
            li.innerHTML = `<span>${formatDate(h.ts)}:</span> <span class="history-status ${h.correct?'correct':'incorrect'}">${h.correct?'正解':'不正解'}</span>${h.evaluation?` <span class="eval">(${evalMap[h.evaluation]||h.evaluation})</span>`:''}`;
            historyList.appendChild(li);
        });
        if (questionData.history.length > MAX_RECENT_HISTORY) historyList.innerHTML += `<li style="font-style:italic;">... 他 ${questionData.history.length - MAX_RECENT_HISTORY}件の履歴あり</li>`;
    }
    div.querySelector('#question-detail-view').appendChild(historyList);
    return div;
}
function renderDashboardQuestionAnalysisChart(questionStats) {
    if (!dom.questionAccuracyChart || !checkChartJSAvaible()) {
        safeSetStyle(dom.questionAccuracyChartContainer,'display','block'); safeSetStyle(dom.questionAccuracyNoData,'display','block');
        safeSetStyle(dom.questionAccuracyChart,'display','none'); destroyChart('questionAccuracy'); return;
    }
    destroyChart('questionAccuracy');
    const answeredQuestions = questionStats.filter(q => q.totalCount > 0);
    if (answeredQuestions.length === 0) {
        safeSetStyle(dom.questionAccuracyChartContainer,'display','block'); safeSetStyle(dom.questionAccuracyNoData,'display','block');
        safeSetStyle(dom.questionAccuracyChart,'display','none'); return;
    }
    const accuracyRanges = { low: {count:0, qIds:[]}, medium: {count:0, qIds:[]}, high: {count:0, qIds:[]} };
    answeredQuestions.forEach(q => {
        if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) { accuracyRanges.low.count++; accuracyRanges.low.qIds.push(q.id); }
        else if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) { accuracyRanges.medium.count++; accuracyRanges.medium.qIds.push(q.id); }
        else { accuracyRanges.high.count++; accuracyRanges.high.qIds.push(q.id); }
    });
    const labels = [`0-${DASHBOARD_ACCURACY_THRESHOLDS.LOW}%`, `${DASHBOARD_ACCURACY_THRESHOLDS.LOW+1}-${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM}%`, `${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM+1}-100%`];
    const data = [accuracyRanges.low.count, accuracyRanges.medium.count, accuracyRanges.high.count];
    const currentTheme = getCurrentAppliedTheme();
    const gridColor = currentTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const textColor = currentTheme === 'dark' ? '#e0e0e0' : '#333';
    const bgColors = [getComputedStyle(document.documentElement).getPropertyValue('--danger-color').trim(), getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim(), getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim()];
    const ctx = dom.questionAccuracyChart.getContext('2d');
    appState.charts.questionAccuracy = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: '問題数', data, backgroundColor: bgColors, borderColor: bgColors, borderWidth: 1 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid:{color:gridColor}, ticks:{color:textColor} }, x: { beginAtZero: true, title:{display:true,text:'問題数',color:textColor}, grid:{color:gridColor}, ticks:{color:textColor, stepSize:1, callback:v=>Number.isInteger(v)?v:null} } },
            plugins: { legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.parsed.x}問`}} },
            onClick: (e, els)=>{ if(els.length>0){const idx=els[0].index; const key=Object.keys(accuracyRanges)[idx]; const ids=accuracyRanges[key].qIds; if(ids.length>0)showQuestionListModal(key,ids); else showNotification("この範囲に該当問題なし", "info", 2000);}},
            onHover: (e,el)=>{if(e.native&&e.native.target)e.native.target.style.cursor = el[0]?'pointer':'default';}
        }
    });
    safeSetStyle(dom.questionAccuracyChartContainer,'display','block'); safeSetStyle(dom.questionAccuracyNoData,'display','none');
    safeSetStyle(dom.questionAccuracyChart,'display','block');
}
function showQuestionListModal(rangeKey, questionIds) {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck || !Array.isArray(deck.questions) || questionIds.length === 0) { showNotification("問題リスト作成不可", "error"); return; }
    const rangeLabels = { low: `正答率 0-${DASHBOARD_ACCURACY_THRESHOLDS.LOW}%`, medium: `正答率 ${DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1}-${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM}%`, high: `正答率 ${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1}-100%`};
    const title = `${rangeLabels[rangeKey] || '問題リスト'} (${questionIds.length}問)`;
    const questionsInList = questionIds.map(id => deck.questions.find(q => q.id === id)).filter(q => q !== undefined);
    const listElement = document.createElement('ul');
    listElement.className = 'modal-question-list'; listElement.setAttribute('role','list');
    Object.assign(listElement.style, {listStyle:'none', padding:'0', maxHeight:'60vh', overflowY:'auto'});
    if (questionsInList.length === 0) { listElement.innerHTML = '<li>該当問題なし</li>'; }
    else {
        questionsInList.sort((a,b)=>calculateQuestionAccuracy(a).accuracy - calculateQuestionAccuracy(b).accuracy);
        questionsInList.forEach(q => {
            const qStats = calculateQuestionAccuracy(q);
            const accuracyClass = qStats.totalCount === 0 ? 'unanswered' : getAccuracyClass(qStats.accuracy);
            const accuracyDisplay = qStats.totalCount === 0 ? '未解答' : `${qStats.accuracy}%`;
            const countsDisplay = qStats.totalCount === 0 ? '' : `(${qStats.correctCount}/${qStats.totalCount})`;
            const listItem = document.createElement('li');
            listItem.className = 'modal-question-list-item';
            Object.assign(listItem.style, {display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px',borderBottom:'1px solid var(--border-color)',cursor:'pointer'});
            listItem.innerHTML = `<div class="question-text-preview" style="flex-grow:1;margin-right:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(q.question)}</div><div class="question-stats" style="flex-shrink:0;text-align:right;"><span class="accuracy ${accuracyClass}" style="font-weight:bold;margin-right:5px;">${accuracyDisplay}</span><span class="counts" style="font-size:0.9em;color:var(--text-light);">${countsDisplay}</span></div>`;
            listItem.dataset.questionId = q.id; listItem.tabIndex = 0; listItem.setAttribute('role','button');
            listItem.setAttribute('aria-label', `問題詳細: ${escapeHtml(q.question.substring(0,50))}... ${accuracyDisplay}`);
            listItem.onclick = () => { closeModal(); showDetailForListItem(q.id); };
            listItem.onkeydown = e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();closeModal();showDetailForListItem(q.id);}};
            listItem.onmouseenter = () => listItem.style.backgroundColor = 'var(--bg-hover)';
            listItem.onmouseleave = () => listItem.style.backgroundColor = '';
            listElement.appendChild(listItem);
        });
    }
    showModal({ title, content: listElement, buttons: [{text:'閉じる',class:'secondary',onClick:closeModal}], size: 'lg' });
    setTimeout(() => listElement.querySelector('.modal-question-list-item')?.focus(), 100);
}
function renderDashboardPagination(totalItems) {
    const itemsPerPage = appState.dashboardQuestionsPerPage || DEFAULT_SETTINGS.dashboardQuestionsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    renderGenericPagination(dom.questionPagination, totalItems, totalPages, appState.dashboardCurrentPage, 'dashboard-page-nav');
}
function handleDashboardPaginationClick(event) {
    if (!appState.allDecks[appState.currentDashboardDeckId]) return;
    const totalItems = getFilteredAndSortedQuestionStats().length;
    const itemsPerPage = appState.dashboardQuestionsPerPage || DEFAULT_SETTINGS.dashboardQuestionsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const targetPage = getPageFromPaginationClick(event, 'dashboard-page-nav');
    if (targetPage !== null && targetPage !== appState.dashboardCurrentPage && targetPage >= 1 && targetPage <= totalPages) {
        appState.dashboardCurrentPage = targetPage; renderDashboardQuestionAnalysis();
        if (appState.dashboardViewMode === 'list') dom.questionAccuracyList?.focus();
    }
}
function getFilteredAndSortedQuestionStats() {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck || !Array.isArray(deck.questions)) return [];
    const questionStats = deck.questions.map((q, index) => {
        const stats = calculateQuestionAccuracy(q);
        return { ...stats, id: q.id, questionText: q.question, explanationText: q.explanation, optionsText: q.options.join(' '), lastAnsweredTimestamp: q.history?.length > 0 ? q.history[q.history.length - 1].ts : 0, originalIndex: index };
    });
    return applyDashboardSorting(applyDashboardFilters(questionStats));
}
function applyDashboardFilters(questionStats) {
    const filterAccuracy = appState.dashboardFilterAccuracy;
    const query = appState.dashboardSearchQuery.toLowerCase().trim();
    return questionStats.filter(q => {
        const accuracy = q.totalCount > 0 ? q.accuracy : -1;
        if (filterAccuracy === 'low' && (accuracy === -1 || accuracy > DASHBOARD_ACCURACY_THRESHOLDS.LOW)) return false;
        if (filterAccuracy === 'medium' && (accuracy === -1 || accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW || accuracy > DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM)) return false;
        if (filterAccuracy === 'high' && (accuracy === -1 || accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM)) return false;
        if (filterAccuracy === 'unanswered' && accuracy !== -1) return false;
        if (query && !`${q.questionText} ${q.optionsText} ${q.explanationText}`.toLowerCase().includes(query)) return false;
        return true;
    });
}
function applyDashboardSorting(questionStats) {
    const sortOrder = appState.dashboardSortOrder;
    return [...questionStats].sort((a, b) => {
        switch (sortOrder) {
            case 'accuracyAsc': if(a.accuracy===-1&&b.accuracy!==-1)return -1; if(a.accuracy!==-1&&b.accuracy===-1)return 1; return (a.accuracy-b.accuracy)||(a.originalIndex-b.originalIndex);
            case 'accuracyDesc': if(a.accuracy===-1&&b.accuracy!==-1)return 1; if(a.accuracy!==-1&&b.accuracy===-1)return -1; return (b.accuracy-a.accuracy)||(a.originalIndex-b.originalIndex);
            case 'mostIncorrect': return (b.incorrectCount-a.incorrectCount)||(b.totalCount-a.totalCount)||(a.originalIndex-b.originalIndex);
            case 'lastAnswered': return (b.lastAnsweredTimestamp-a.lastAnsweredTimestamp)||(a.originalIndex-b.originalIndex);
            default: return a.originalIndex-b.originalIndex;
        }
    });
}

// ====================================================================
// 設定画面関連処理 (Settings)
// ====================================================================
function loadSettingsToUI() {
    safeSetChecked(dom.settingShuffleOptions, appState.settings.shuffleOptions);
    safeSetValue(dom.settingLowAccuracyThreshold, appState.settings.lowAccuracyThreshold);
    safeSetValue(dom.settingHomeItemsPerPage, appState.settings.homeDecksPerPage);
    safeSetValue(dom.settingDashboardItemsPerPage, appState.settings.dashboardQuestionsPerPage);
    safeSetValue(dom.settingTheme, appState.settings.theme);
    setSettingsUnsavedStatus(false);
}
function handleSettingThresholdInput(event) {
    const value = parseInt(event.target.value, 10);
    event.target.style.borderColor = (isNaN(value) || value < 1 || value > 99) ? 'var(--danger-color)' : '';
    if (!isNaN(value) && value >= 1 && value <= 99) setSettingsUnsavedStatus(true);
}
function handleSettingThresholdChange(event) {
    let value = parseInt(event.target.value, 10);
    value = (isNaN(value) || value < 1) ? 1 : (value > 99 ? 99 : value);
    event.target.value = value; event.target.style.borderColor = '';
    setSettingsUnsavedStatus(true);
}
function setSettingsUnsavedStatus(isUnsaved) {
    if (dom.saveSettingsButton) { dom.saveSettingsButton.disabled = !isUnsaved; setAriaDisabled(dom.saveSettingsButton, !isUnsaved); }
    if(dom.settingsSaveStatus) updateStatusMessage(dom.settingsSaveStatus, isUnsaved ? "未保存の変更があります。" : "", isUnsaved ? "warning" : "info");
}
function saveSettings() {
    try {
         const newSettings = {
             shuffleOptions: dom.settingShuffleOptions.checked,
             lowAccuracyThreshold: parseInt(dom.settingLowAccuracyThreshold.value,10)||DEFAULT_SETTINGS.lowAccuracyThreshold,
             homeDecksPerPage: parseInt(dom.settingHomeItemsPerPage.value,10)||DEFAULT_SETTINGS.homeDecksPerPage,
             dashboardQuestionsPerPage: parseInt(dom.settingDashboardItemsPerPage.value,10)||DEFAULT_SETTINGS.dashboardQuestionsPerPage,
             theme: dom.settingTheme.value||DEFAULT_SETTINGS.theme,
         };
         if (newSettings.lowAccuracyThreshold < 1 || newSettings.lowAccuracyThreshold > 99) newSettings.lowAccuracyThreshold = DEFAULT_SETTINGS.lowAccuracyThreshold;
         if (![10,20,50].includes(newSettings.homeDecksPerPage)) newSettings.homeDecksPerPage = DEFAULT_SETTINGS.homeDecksPerPage;
         if (![10,20,50,100].includes(newSettings.dashboardQuestionsPerPage)) newSettings.dashboardQuestionsPerPage = DEFAULT_SETTINGS.dashboardQuestionsPerPage;
         if (!['light','dark','system'].includes(newSettings.theme)) newSettings.theme = DEFAULT_SETTINGS.theme;
         appState.settings = newSettings;
         appState.dashboardQuestionsPerPage = newSettings.dashboardQuestionsPerPage;
         if (saveData(LS_KEYS.SETTINGS, appState.settings)) {
             setSettingsUnsavedStatus(false);
             updateStatusMessage(dom.settingsSaveStatus, "設定を保存しました。", "success");
             showNotification("設定が保存されました。", "success");
             applyTheme(appState.settings.theme); applyInitialSettingsToUI();
             updateHomeUI(true); renderDashboard();
         } else {
             updateStatusMessage(dom.settingsSaveStatus, "設定の保存に失敗。", "error");
         }
         clearStatusMessageAfterDelay(dom.settingsSaveStatus, 3000);
    } catch (error) {
        showNotification(`設定保存エラー: ${error.message}`, "error");
        updateStatusMessage(dom.settingsSaveStatus, "保存エラー。", "error");
    }
}

// ====================================================================
// AIプロンプトガイド関連処理 (Prompt Guide)
// ====================================================================
function updatePromptPlaceholders() {
     const topic = dom.promptFieldTopic?.value || '[専門分野]';
     const count = dom.promptFieldCount?.value || '[問題数]';
     const level = dom.promptFieldLevel?.value || '[対象レベル]';
     if (dom.promptTextTemplate) {
          dom.promptTextTemplate.querySelectorAll('.prompt-placeholder').forEach(ph => {
              const targetId = ph.dataset.target; let value = '[?]';
              if (targetId === 'prompt-field-topic') value = topic;
              else if (targetId === 'prompt-field-count') value = count;
              else if (targetId === 'prompt-field-level') value = level;
              ph.textContent = escapeHtml(value);
          });
     }
}
function copyPromptToClipboard() {
    const promptText = dom.promptTextTemplate?.textContent;
    if (promptText) {
         copyTextToClipboard(promptText)
             .then(() => { updateStatusMessage(dom.copyStatus, 'コピーしました！', 'success'); clearStatusMessageAfterDelay(dom.copyStatus, 2000); })
             .catch(err => { updateStatusMessage(dom.copyStatus, 'コピー失敗', 'error'); showNotification("プロンプトコピー失敗。", "error"); clearStatusMessageAfterDelay(dom.copyStatus, 3000); });
    } else { updateStatusMessage(dom.copyStatus, 'コピー対象なし', 'warning'); clearStatusMessageAfterDelay(dom.copyStatus, 3000); }
}
function handleJsonCheckInput() { updateStatusMessage(dom.jsonCheckStatus, '', 'info'); }
function checkJsonFormat() {
    const jsonString = dom.jsonCheckInput?.value;
    if (!jsonString || jsonString.trim() === '') { updateStatusMessage(dom.jsonCheckStatus, '入力が空です', 'warning'); return; }
    try {
        const data = JSON.parse(jsonString);
        const validation = validateDeckJsonData(data); // デッキ形式も検証
        if (!validation.isValid) throw new Error(validation.message);
        updateStatusMessage(dom.jsonCheckStatus, `有効な問題JSON形式です (${validation.questions?.length ?? 0}問)。`, 'success');
        clearStatusMessageAfterDelay(dom.jsonCheckStatus, 5000);
    } catch (error) {
        updateStatusMessage(dom.jsonCheckStatus, `JSON形式エラー: ${error.message}`, 'error');
    }
}

// ====================================================================
// ヘルパー関数 (Utilities)
// ====================================================================
function generateUUID(prefix = '') { return (prefix ? prefix + '_' : '') + ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
function formatDate(timestamp) {
    if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) return '-';
    try { return new Intl.DateTimeFormat('ja-JP', DATE_FORMAT_OPTIONS).format(new Date(timestamp)); }
    catch (e) { try { return new Date(timestamp).toLocaleString('ja-JP'); } catch { return 'Invalid Date'; } }
}
function safeSetText(element, text) { if (element) element.textContent = text ?? ''; }
function safeSetHTML(element, html) { if (element) element.innerHTML = html ?? ''; }
function safeSetValue(element, value) { if (element) element.value = value ?? ''; }
function safeSetChecked(element, isChecked) { if (element && typeof element.checked === 'boolean') element.checked = !!isChecked; }
function safeSetStyle(element, property, value) { if (element?.style && property !== undefined && value !== undefined) element.style[property] = value; }
function safeSetAttribute(element, attribute, value) { if (element) { if (value === null || value === undefined || value === false) element.removeAttribute(attribute); else element.setAttribute(attribute, String(value)); }}
function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return unsafe; return unsafe.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function setActiveClass(element, isActive) { if (element) element.classList.toggle('active', !!isActive); }
function setAriaPressed(element, isPressed) { if (element) element.setAttribute('aria-pressed', String(!!isPressed)); }
function setAriaDisabled(element, isDisabled) { if (element) { element.setAttribute('aria-disabled', String(!!isDisabled)); if (isDisabled) element.setAttribute('tabindex', '-1'); else element.removeAttribute('tabindex'); }}
function destroyChart(chartKey) { if (appState.charts[chartKey]) { try { appState.charts[chartKey].destroy(); } catch (e) { console.error(`Error destroying chart '${chartKey}':`, e); } appState.charts[chartKey] = null; }}
function checkChartJSAvaible() { const available = typeof Chart !== 'undefined'; if (!available) console.warn("Chart.js library is not loaded."); return available; }

function renderGenericPagination(containerElement, totalItems, totalPages, currentPage, ariaLabelPrefix) {
    if (!containerElement) return;
    containerElement.innerHTML = '';
    if (totalPages <= 1) { containerElement.style.display = 'none'; return; }
    containerElement.style.display = 'flex';
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createButton({ text: '<i class="fas fa-chevron-left"></i>', class: 'small secondary icon-button page-nav-prev', ariaLabel: `${ariaLabelPrefix}: 前のページ`, disabled: currentPage === 1, data: { pageTarget: 'prev' } }));
    getPaginationButtons(totalPages, currentPage, PAGINATION_BUTTON_COUNT).forEach(page => {
        if (page === '...') { const span = document.createElement('span'); span.textContent = '...'; span.className = 'page-ellipsis'; span.setAttribute('aria-hidden', 'true'); fragment.appendChild(span); }
        else { fragment.appendChild(createButton({ text: String(page), class: `small page-nav-number ${page === currentPage ? 'primary active' : 'secondary'}`, ariaLabel: `${ariaLabelPrefix}: ${page}ページ ${page === currentPage ? '(現在地)' : ''}`, ariaCurrent: page === currentPage ? 'page' : undefined, data: { pageTarget: String(page) } })); }
    });
    fragment.appendChild(createButton({ text: '<i class="fas fa-chevron-right"></i>', class: 'small secondary icon-button page-nav-next', ariaLabel: `${ariaLabelPrefix}: 次のページ`, disabled: currentPage === totalPages, data: { pageTarget: 'next' } }));
    const pageInfo = document.createElement('span'); pageInfo.className = 'page-info'; pageInfo.textContent = `${currentPage} / ${totalPages} ページ (${totalItems}件)`; pageInfo.setAttribute('aria-live', 'polite');
    containerElement.appendChild(fragment); containerElement.appendChild(pageInfo);
}
function getPaginationButtons(totalPages, currentPage, maxButtons = 5) {
    const buttons = []; const half = Math.floor((maxButtons - 1) / 2);
    let start = Math.max(1, currentPage - half), end = Math.min(totalPages, currentPage + half);
    if (currentPage - half < 1) end = Math.min(totalPages, maxButtons);
    if (currentPage + half > totalPages) start = Math.max(1, totalPages - maxButtons + 1);
    if (start > 1) { buttons.push(1); if (start > 2) buttons.push('...'); }
    for (let i = start; i <= end; i++) buttons.push(i);
    if (end < totalPages) { if (end < totalPages - 1) buttons.push('...'); buttons.push(totalPages); }
    return buttons;
}
function getPageFromPaginationClick(event, prefix) {
    const button = event.target.closest('button[data-page-target]');
    if (!button || button.disabled) return null;
    const target = button.dataset.pageTarget;
    let currentPageState = prefix === 'deck-page-nav' ? appState.homeDeckCurrentPage : appState.dashboardCurrentPage;
    let newPage = null;
    if (target === 'prev') newPage = currentPageState - 1;
    else if (target === 'next') newPage = currentPageState + 1;
    else if (!isNaN(parseInt(target, 10))) newPage = parseInt(target, 10);
    return (newPage !== null && newPage >= 1) ? newPage : null;
}
function calculateQuestionAccuracy(questionData) {
     if (!questionData || !Array.isArray(questionData.history)) return { accuracy:0,correctCount:0,incorrectCount:0,totalCount:0,lastAnswerCorrect:null};
     const history = questionData.history, totalCount = history.length;
     if (totalCount === 0) return { accuracy:0,correctCount:0,incorrectCount:0,totalCount:0,lastAnswerCorrect:null};
     const correctCount = history.filter(h => h.correct).length;
     return { accuracy: Math.round((correctCount/totalCount)*100), correctCount, incorrectCount: totalCount-correctCount, totalCount, lastAnswerCorrect: history[totalCount-1]?.correct??null };
}
function calculateOverallAccuracy(deck) {
    if (!deck || !Array.isArray(deck.questions) || deck.questions.length === 0) return { accuracy:0,totalAnswered:0,accuracyText:'-',correctCount:0,incorrectCount:0};
    let totalCorrect = 0, totalAnswered = 0;
    deck.questions.forEach(q => { const stats = calculateQuestionAccuracy(q); totalAnswered += stats.totalCount; totalCorrect += stats.correctCount; });
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect/totalAnswered)*100) : 0;
    return { accuracy, totalAnswered, accuracyText: totalAnswered>0?`${accuracy}% (${totalCorrect}/${totalAnswered})`:'-', correctCount:totalCorrect, incorrectCount: totalAnswered-totalCorrect };
}
function getAccuracyClass(accuracy) {
    if (accuracy === null || accuracy === undefined || isNaN(accuracy)) return 'unanswered';
    if (accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) return 'low';
    if (accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) return 'medium';
    return 'high';
}
function createButton(config) {
    const button = document.createElement('button'); button.type = 'button';
    if (config.id) button.id = config.id;
    button.innerHTML = config.text || '';
    button.className = `button ${config.class || ''}`;
    if (config.onClick) button.addEventListener('click', config.onClick);
    if (config.disabled) { button.disabled = true; setAriaDisabled(button, true); }
    if (config.ariaLabel) button.setAttribute('aria-label', config.ariaLabel);
    if (config.ariaCurrent) button.setAttribute('aria-current', config.ariaCurrent);
    if (config.data) for (const key in config.data) if (Object.hasOwnProperty.call(config.data, key)) button.dataset[key] = config.data[key];
    return button;
}
function isValidQuestion(questionData) {
    return Boolean(questionData && typeof questionData === 'object' &&
        typeof questionData.id === 'string' && questionData.id &&
        typeof questionData.question === 'string' && questionData.question.trim() &&
        Array.isArray(questionData.options) && questionData.options.length >= 2 &&
        typeof questionData.correctAnswer === 'string' && questionData.correctAnswer.trim() &&
        questionData.options.includes(questionData.correctAnswer) &&
        (typeof questionData.explanation === 'string' || questionData.explanation === null || questionData.explanation === undefined) &&
        Array.isArray(questionData.history));
}
async function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
      try {
          const textArea = document.createElement("textarea"); textArea.value = text;
          Object.assign(textArea.style, {position:"fixed",opacity:"0",left:"-9999px"});
          document.body.appendChild(textArea); textArea.focus(); textArea.select();
          const successful = document.execCommand('copy'); document.body.removeChild(textArea);
          if (!successful) throw new Error('Fallback copy failed'); return Promise.resolve();
      } catch (err) { return Promise.reject(new Error('コピー機能を利用できません。')); }
    }
    try { await navigator.clipboard.writeText(text); return Promise.resolve(); }
    catch (err) { return Promise.reject(new Error('クリップボードへのコピーに失敗しました。')); }
}

// ====================================================================
// Polyfills & Compatibility (Optional)
// ====================================================================
if (!Element.prototype.matches) Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
if (!Element.prototype.closest) Element.prototype.closest = function(s) { var el = this; do { if (Element.prototype.matches.call(el, s)) return el; el = el.parentElement || el.parentNode; } while (el !== null && el.nodeType === 1); return null; };

// ====================================================================
// End of file
// ====================================================================
