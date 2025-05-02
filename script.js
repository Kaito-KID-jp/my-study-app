// ====================================================================
// AI問題生成学習アプリ - アプリケーションロジック V3.0
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
    studyFilter: 'all',          // 現在選択中の学習フィルター ('all', etc.)

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
    fileReader: new FileReader(), // ファイル読み込み用 (再利用)
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
 * @property {number} totalCorrect - 累計正解数
 * @property {number} totalIncorrect - 累計不正解数
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
 * @typedef {{id: string, text: string, class?: string, onClick?: () => void, disabled?: boolean}} ModalButtonConfig
 */
/**
 * @typedef {Object} ModalOptions
 * @property {string} title - モーダルタイトル
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
    lowAccuracyThreshold: 50,
    theme: 'system',
    homeDecksPerPage: 10,
    dashboardQuestionsPerPage: 10
};
const DASHBOARD_TREND_SESSIONS = 30;
const DASHBOARD_ACCURACY_THRESHOLDS = { LOW: 49, MEDIUM: 79 };
const MAX_RECENT_HISTORY = 5;
const NOTIFICATION_DURATION = 4000;
const DEBOUNCE_DELAY = 300;
const MIN_DEBOUNCE_DELAY = 100; // 短いデバウンス
// CRITICAL_ELEMENT_IDS の更新 (v3.0)
const CRITICAL_ELEMENT_IDS = [
    'app-container', 'app-loading-overlay', 'global-notification', 'modal-overlay',
    'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen', 'prompt-guide-screen',
    'deck-list', 'options-buttons-container', 'question-text', 'dashboard-analysis-controls-panel',
    'app-nav' //ナビゲーション要素を追加
];
const DATE_FORMAT_OPTIONS = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
};
const PAGINATION_BUTTON_COUNT = 5;

// ====================================================================
// DOM要素参照 & グローバル変数
// ====================================================================
const dom = {}; // DOM要素をキャッシュするオブジェクト
let searchDebounceTimer = null; // 検索用デバウンスタ
let filterCountDebounceTimer = null; // ホームフィルターカウント更新用
let resizeDebounceTimer = null; // リサイズイベント用
let systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

// ====================================================================
// 初期化 (Initialization)
// ====================================================================
document.addEventListener('DOMContentLoaded', initializeApp);

/** アプリケーション全体の初期化処理 */
async function initializeApp() {
    console.log(`Initializing AI Study App V${appState.appVersion}...`);
    const startTime = performance.now();
    updateLoadingOverlay(true, "初期化中...");

    try {
        // 1. DOM要素のキャッシュと検証
        logInitStep("1. Caching DOM elements");
        if (!cacheDOMElements()) { // cacheDOMElements内でcriticalFoundを見る
            throw new Error("致命的なUI要素が見つかりません。アプリを起動できません。");
        }
        logInitStep("1. DOM caching complete");

        // 2. LocalStorageからデータ読み込みと検証
        logInitStep("2. Loading data from LocalStorage");
        loadInitialData();
        logInitStep("2. Initial data loaded");

        // 3. 初期設定をUIに適用（テーマ含む）
        logInitStep("3. Applying initial settings to UI");
        applyTheme(appState.settings.theme);
        applyInitialSettingsToUI();
        logInitStep("3. Initial settings applied");

        // 4. イベントリスナー設定
        logInitStep("4. Setting up event listeners");
        setupGlobalEventListeners();
        setupScreenEventListeners();
        logInitStep("4. Event listeners set up");

        // 5. 初期UI状態の更新
        logInitStep("5. Updating initial UI state");
        updateHomeUI();
        populateDashboardDeckSelect();
        logInitStep("5. Initial UI state updated");

        // 6. 最後に表示していた画面、またはホーム画面に遷移
        const lastScreen = loadData(LS_KEYS.LAST_SCREEN) || 'home-screen';
        logInitStep(`6. Navigating to initial screen: ${lastScreen}`);
        const initialScreen = (lastScreen === 'study-screen' && !appState.isStudyActive) ? 'home-screen' : lastScreen;
        navigateToScreen(initialScreen, true); // Pass isInitialLoad = true
        logInitStep("6. Navigation complete");

        // 7. ダッシュボードの初回レンダリング（必要なら）
        if (appState.activeScreen === 'dashboard-screen') {
            logInitStep("7. Initial dashboard rendering");
            await renderDashboard();
        } else {
             logInitStep("7. Skipping initial dashboard rendering");
        }

        appState.isLoading = false; // Ensure isLoading is set correctly
        const endTime = performance.now();
        console.log(`App initialization successful in ${(endTime - startTime).toFixed(2)} ms.`);

    } catch (error) {
        console.error("CRITICAL ERROR during app initialization:", error);
        handleInitializationError(error);
    } finally {
        setTimeout(() => {
            updateLoadingOverlay(false);
            console.log("Loading overlay hidden.");
        }, appState.isLoading ? 500 : 200);
    }
}


/**
 * アプリケーションで利用するDOM要素への参照をキャッシュする
 * @returns {boolean} 必須要素が全て見つかった場合は true, そうでない場合は false
 */
function cacheDOMElements() {
    console.log("Caching DOM elements...");
    let allFound = true;
    let criticalFound = true;
    // V3.0のHTMLに合わせたIDリスト
    const ids = [
        // Critical / General
        'app-container', 'app-loading-overlay', 'global-notification', 'notification-message',
        'notification-icon', 'notification-close-button', 'app-init-error', 'theme-toggle-button', 'app-nav',
        // Screens
        'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen', 'prompt-guide-screen',
        // Modal
        'modal-overlay', 'modal-dialog', 'modal-title', 'modal-body', 'modal-footer', 'modal-close-button',
        // Home Screen
        'json-file-input', 'load-status', 'deck-list-controls', 'deck-search-input', 'deck-sort-select',
        'deck-list', 'deck-list-pagination', 'current-deck-info', 'current-deck-name', 'total-questions',
        'current-deck-last-studied', 'current-deck-accuracy', 'reset-history-button', 'start-study-button',
        'study-filter-options', 'filtered-question-count-display', 'low-accuracy-threshold-display-filter',
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
        // V3.0ではQuestion Detail Viewの固定IDは不要（モーダル内で動的生成される要素にIDを付与）
        // Settings Screen
        'settings-container', 'setting-shuffle-options', 'setting-low-accuracy-threshold',
        'setting-home-items-per-page', 'setting-dashboard-items-per-page',
        'setting-theme', 'export-data-button', 'import-data-input', 'import-status', 'reset-all-data-button',
        'save-settings-button', 'settings-save-status',
        // Prompt Guide Screen
        'prompt-field-topic', 'prompt-field-count', 'prompt-field-level', 'copy-prompt-button', 'copy-status',
        'prompt-text-template', 'json-check-area', 'json-check-input', 'json-check-button', 'json-check-status',
    ];


    ids.forEach(id => {
        const camelCaseId = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        dom[camelCaseId] = document.getElementById(id);
        if (!dom[camelCaseId]) {
            const isCritical = CRITICAL_ELEMENT_IDS.includes(id);
            // DOM要素が見つからない警告は重要なので残す
            console.warn(`DOM element${isCritical ? ' [CRITICAL]' : ''} not found: #${id}`);
            if (isCritical) {
                criticalFound = false; // Mark critical failure
            }
            allFound = false; // Mark any failure
        }
    });

    // Query selectors for dynamic/multiple elements
    dom.navButtons = document.querySelectorAll('.nav-button');
    dom.screens = document.querySelectorAll('.screen');
    dom.evalButtons = document.querySelectorAll('.eval-button');
    dom.studyFilterRadios = document.querySelectorAll('input[name="study-filter"]');
    dom.appHeaderTitle = document.querySelector('.app-header h1.app-title');
    dom.appBody = document.body; // Cache body

    // Check results of query selectors
    if (dom.navButtons.length === 0) { console.warn("No navigation buttons found."); criticalFound = false; } // Nav is critical now
    if (dom.screens.length === 0) { console.warn("No screen elements found."); criticalFound = false; } // Screens are critical
    if (dom.evalButtons.length === 0) { console.warn("No evaluation buttons found."); } // Less critical
    if (dom.studyFilterRadios.length === 0) { console.warn("No study filter radio buttons found."); } // Less critical

    console.log(`DOM caching: ${allFound ? 'All listed' : 'Some listed'} elements found. Critical elements ${criticalFound ? 'found' : 'MISSING'}.`);
    return criticalFound; // Return if critical elements are found
}


/** 初期化時のエラーを処理する */
function handleInitializationError(error) {
    appState.isLoading = false; // Ensure loading stops eventually
    const errorDisplay = dom.appInitError;
    const container = dom.appContainer;

    if (container) container.innerHTML = ''; // Clear potentially broken UI
    if (errorDisplay) {
        errorDisplay.textContent = `致命的なエラー: ${error.message} アプリを初期化できません。ページを再読み込みするか、開発者にご連絡ください。`;
        errorDisplay.style.display = 'block';
        errorDisplay.setAttribute('aria-hidden', 'false');
    } else {
        // Fallback if even the error display fails
        alert(`致命的なエラー: ${error.message} アプリを初期化できません。`);
    }
    // Ensure overlay is hidden, handled in finally block
}

/** ローディングオーバーレイの表示/非表示とテキスト更新 */
function updateLoadingOverlay(show, text = "読み込み中...") {
    if (!dom.appLoadingOverlay) return;
    const overlay = dom.appLoadingOverlay;
    requestAnimationFrame(() => {
        if (show) {
            overlay.querySelector('p').textContent = text;
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    });
}

/** 初期化ステップをコンソールに出力 */
function logInitStep(message) {
    console.log(`%cINIT: ${message}`, 'color: #3498db; font-weight: bold;');
}

// ====================================================================
// データ永続化 (LocalStorage Persistence)
// ====================================================================

/**
 * 指定されたキーでデータをLocalStorageに安全に保存する
 * @param {string} key 保存キー
 * @param {any} data 保存するデータ
 * @returns {boolean} 保存成功なら true, 失敗なら false
 */
function saveData(key, data) {
    if (appState.isSavingData) {
        console.warn(`Data save already in progress for key "${key}". Skipping.`);
        return false;
    }
    appState.isSavingData = true; // Set saving flag

    try {
        // Handle undefined explicitly if necessary, though stringify handles it often
        if (data === undefined) {
            localStorage.removeItem(key);
            console.log(`Data removed from LocalStorage for key "${key}" due to undefined value.`);
        } else {
            const jsonData = JSON.stringify(data);
            localStorage.setItem(key, jsonData);
        }
        // console.debug(`Data saved to LocalStorage: ${key}`);
        return true;
    } catch (e) {
        console.error(`Failed to save data to LocalStorage for key "${key}":`, e);
        let message = `データ (${key}) の保存中にエラーが発生しました。`;
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || String(e).toLowerCase().includes('quota'))) {
            const sizeMB = calculateLocalStorageUsage();
            message = `データ保存失敗: ブラウザの保存容量(約 ${sizeMB} MB)の上限に達した可能性があります。設定画面から不要な問題集を削除するか、全データをエクスポートしてください。`;
        }
        showNotification(message, 'error', 8000);
        return false;
    } finally {
         appState.isSavingData = false; // Clear saving flag
    }
}

/**
 * 指定されたキーでLocalStorageからデータを安全に読み込み、検証・修復する
 * @param {string} key 読み込みキー
 * @param {any} [defaultValue=null] データが見つからない場合や無効な場合に返す値
 * @returns {any} 読み込んだデータ、または defaultValue
 */
function loadData(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        if (data === null) {
            // console.debug(`No data found in LocalStorage for key "${key}". Returning default.`);
            return defaultValue;
        }

        const parsedData = JSON.parse(data);

        // Data Type Specific Validation/Repair
        if (key === LS_KEYS.SETTINGS) {
             return repairAndValidateSettings(parsedData); // Handles null/undefined/invalid
        } else if (key === LS_KEYS.DECKS) {
             return repairAndValidateAllDecks(parsedData); // Handles null/undefined/invalid
        } else if (key === LS_KEYS.CURRENT_DECK_ID || key === LS_KEYS.LAST_SCREEN) {
             // Allow null or string for IDs/Screen name
             return (typeof parsedData === 'string' || parsedData === null) ? parsedData : defaultValue;
        }
        // Add other key checks if needed

        return parsedData;

    } catch (e) {
        console.error(`Failed to load/parse data from LocalStorage (Key: ${key}). Returning default. Error:`, e);
        showNotification(`保存データ (Key: ${key}) の読み込みに失敗しました。データが破損している可能性があります。デフォルト値を使用します。`, 'warning', 6000);
        // Optionally try to remove corrupted data, but be careful
        // try { localStorage.removeItem(key); } catch (removeError) { console.error(...) }
        return defaultValue;
    }
}

/** 全デッキデータの検証と修復 */
function repairAndValidateAllDecks(loadedDecks) {
    if (typeof loadedDecks !== 'object' || loadedDecks === null) {
        return {}; // Return empty object if data is invalid
    }
    let dataModified = false;
    const validDecks = {};
    for (const deckId in loadedDecks) {
        if (Object.hasOwnProperty.call(loadedDecks, deckId)) {
            const deck = loadedDecks[deckId];
            // Basic Deck Structure Validation
            if (typeof deck !== 'object' || deck === null || typeof deck.id !== 'string' || deck.id !== deckId || typeof deck.name !== 'string') {
                 console.warn(`Invalid deck structure or ID mismatch removed for ID "${deckId}".`);
                 dataModified = true;
                 continue;
            }

            const repairedDeck = { // Default values
                lastStudied: null,
                totalCorrect: 0,
                totalIncorrect: 0,
                sessionHistory: [],
                questions: [],
                ...deck, // Spread loaded data over defaults
                id: deckId, // Ensure ID from key is used
            };

            // Detailed Property Validation & Repair
            if (typeof repairedDeck.lastStudied !== 'number' && repairedDeck.lastStudied !== null) { repairedDeck.lastStudied = null; dataModified = true; }
            if (typeof repairedDeck.totalCorrect !== 'number' || !Number.isFinite(repairedDeck.totalCorrect) || repairedDeck.totalCorrect < 0) { repairedDeck.totalCorrect = 0; dataModified = true; }
            if (typeof repairedDeck.totalIncorrect !== 'number' || !Number.isFinite(repairedDeck.totalIncorrect) || repairedDeck.totalIncorrect < 0) { repairedDeck.totalIncorrect = 0; dataModified = true; }
            if (!Array.isArray(repairedDeck.sessionHistory)) { repairedDeck.sessionHistory = []; dataModified = true; }
            const originalSessionLength = repairedDeck.sessionHistory.length; // Store before filter
            repairedDeck.sessionHistory = repairedDeck.sessionHistory.filter(isValidSessionHistory);
            if(repairedDeck.sessionHistory.length !== originalSessionLength) dataModified = true;

            if (!Array.isArray(repairedDeck.questions)) { repairedDeck.questions = []; dataModified = true; }
            const validQuestions = [];
            // Keep track of whether modification occurred *within* questions array
            let questionsModified = false;
            repairedDeck.questions.forEach((q, index) => {
                const originalQ = JSON.stringify(q); // Store original for comparison
                const repairedQ = repairAndValidateQuestion(q, deckId, index);
                if (repairedQ) {
                    validQuestions.push(repairedQ);
                    if(originalQ !== JSON.stringify(repairedQ)) {
                        questionsModified = true; // Flag if repair changed the question
                        dataModified = true;
                    }
                } else {
                    questionsModified = true; // Question was removed
                    dataModified = true;
                }
            });
            repairedDeck.questions = validQuestions;


             // Add deck to result even if questions array becomes empty after repair
             validDecks[deckId] = repairedDeck;
        }
    }

    if (dataModified) {
        console.warn("Deck data structure required repair/validation during load.");
    }
    return validDecks;
}

/** 個々の問題データの検証と修復 */
function repairAndValidateQuestion(q, deckId = 'unknown', index = -1) {
    if (typeof q !== 'object' || q === null) {
         console.warn(`Invalid question object removed (Deck: ${deckId}, Index: ${index}).`);
         return null;
    }
    const questionLogPrefix = `Question Validation (Deck: ${deckId}, Index: ${index}):`;

    const repairedQ = { // Default structure skeleton
         id: '', question: '', options: [], correctAnswer: '', explanation: '', history: [], ...q };

    // Ensure and validate ID
    if (typeof repairedQ.id !== 'string' || !repairedQ.id) {
         repairedQ.id = generateUUID('q_repair');
         console.warn(`${questionLogPrefix} Missing or invalid question ID, generated new ID: ${repairedQ.id}`);
    }

    // Validate required text fields
    if (typeof repairedQ.question !== 'string' || repairedQ.question.trim() === '') {
         console.warn(`${questionLogPrefix} Invalid or empty question text. Question skipped.`); return null;
    }
    repairedQ.question = repairedQ.question.trim();

    // Validate options array and contents
    if (!Array.isArray(repairedQ.options)) {
        console.warn(`${questionLogPrefix} 'options' is not an array. Question skipped.`); return null;
    }
    const originalOptionsLength = repairedQ.options.length;
    repairedQ.options = repairedQ.options
        .map(opt => String(opt ?? '').trim())
        .filter(opt => opt);
    if (repairedQ.options.length < 2) {
        console.warn(`${questionLogPrefix} Less than 2 valid options found after cleaning [Original: ${originalOptionsLength}]. Question skipped.`); return null;
    }

    // Validate correctAnswer
    if (typeof repairedQ.correctAnswer !== 'string' || repairedQ.correctAnswer.trim() === '') {
        console.warn(`${questionLogPrefix} Invalid or empty 'correctAnswer'. Question skipped.`); return null;
    }
    repairedQ.correctAnswer = repairedQ.correctAnswer.trim();
    if (!repairedQ.options.includes(repairedQ.correctAnswer)) {
        console.warn(`${questionLogPrefix} 'correctAnswer' ("${repairedQ.correctAnswer}") not found in valid options [${repairedQ.options.join(', ')}]. Question skipped.`); return null;
    }

    // Ensure explanation is string
    repairedQ.explanation = String(repairedQ.explanation ?? '').trim();

    // Validate history array and its contents
    if (!Array.isArray(repairedQ.history)) {
        repairedQ.history = [];
    }
     const originalHistoryLength = repairedQ.history.length;
    repairedQ.history = repairedQ.history.filter(isValidQuestionHistory);
     if (repairedQ.history.length !== originalHistoryLength) {
          console.warn(`${questionLogPrefix} Invalid history entries removed.`);
     }

    // Return the cleaned/validated question object
    return repairedQ;
}


/** 設定データの検証とデフォルト値による補完 */
function repairAndValidateSettings(loadedSettings) {
    if (typeof loadedSettings !== 'object' || loadedSettings === null) {
        return { ...DEFAULT_SETTINGS };
    }

    const repairedSettings = { ...DEFAULT_SETTINGS };
    let modified = false;

    for (const key in DEFAULT_SETTINGS) {
        if (Object.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
            const defaultValue = DEFAULT_SETTINGS[key];
            const loadedValue = loadedSettings[key];

            if (loadedValue === undefined || typeof loadedValue !== typeof defaultValue) {
                 if (loadedValue !== undefined) {
                     console.warn(`Settings: Key "${key}" has invalid type (${typeof loadedValue}), expected (${typeof defaultValue}). Using default.`);
                     modified = true;
                 }
                 continue;
            }

             let isValid = true;
             let validatedValue = loadedValue;
             switch(key) {
                 case 'lowAccuracyThreshold':
                    isValid = Number.isInteger(loadedValue) && loadedValue >= 1 && loadedValue <= 99;
                    break;
                 case 'homeDecksPerPage':
                     isValid = Number.isInteger(loadedValue) && [10, 20, 50].includes(loadedValue);
                     break;
                 case 'dashboardQuestionsPerPage':
                     isValid = Number.isInteger(loadedValue) && [10, 20, 50, 100].includes(loadedValue);
                     break;
                case 'theme':
                     isValid = ['light', 'dark', 'system'].includes(loadedValue);
                     break;
                 case 'shuffleOptions':
                    isValid = typeof loadedValue === 'boolean';
                    break;
             }

             if(isValid) {
                repairedSettings[key] = validatedValue;
             } else {
                 console.warn(`Settings: Key "${key}" has invalid value (${loadedValue}). Using default.`);
                 modified = true;
             }
        }
    }

    for (const key in loadedSettings) {
         if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
             console.warn(`Settings: Found unexpected key "${key}" in loaded data. Ignoring.`);
             modified = true;
         }
    }

    if (modified) {
         console.warn("Settings data structure required repair/validation.");
    }

    return repairedSettings;
}

/** 個々の QuestionHistory entry の形式を検証 */
function isValidQuestionHistory(h) {
    return Boolean(
        h && typeof h === 'object' &&
        typeof h.ts === 'number' && Number.isFinite(h.ts) && h.ts > 0 &&
        typeof h.correct === 'boolean' &&
        ([null, 'difficult', 'normal', 'easy'].includes(h.evaluation) || h.evaluation === undefined)
    );
}

/** 個々の SessionHistory entry の形式を検証 */
function isValidSessionHistory(s) {
     return Boolean(
        s && typeof s === 'object' &&
        typeof s.ts === 'number' && Number.isFinite(s.ts) && s.ts > 0 &&
        typeof s.correct === 'number' && Number.isInteger(s.correct) && s.correct >= 0 &&
        typeof s.incorrect === 'number' && Number.isInteger(s.incorrect) && s.incorrect >= 0
    );
}

/** アプリ起動時にLocalStorageから初期データを読み込む */
function loadInitialData() {
    appState.settings = loadData(LS_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
    appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage;
    appState.allDecks = loadData(LS_KEYS.DECKS, {});
    appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID, null);

    if (appState.currentDeckId !== null && !appState.allDecks[appState.currentDeckId]) {
        console.warn(`Current deck ID "${appState.currentDeckId}" invalid or deck missing. Resetting.`);
        appState.currentDeckId = null;
        saveData(LS_KEYS.CURRENT_DECK_ID, null);
    }

    appState.currentDashboardDeckId = appState.currentDeckId;

    console.log("Initial data loaded/validated:", {
        settings: appState.settings,
        deckCount: Object.keys(appState.allDecks).length,
        currentDeckId: appState.currentDeckId,
    });
}

/** LocalStorage の使用量をおおよそ計算 (文字列長ベース) */
function calculateLocalStorageUsage() {
     let totalBytes = 0;
     try {
         for (let i = 0; i < localStorage.length; i++) {
             const key = localStorage.key(i);
             if (key) {
                const value = localStorage.getItem(key);
                if (value) {
                   totalBytes += key.length + value.length;
                }
            }
         }
         const sizeMB = (totalBytes * 2 / (1024 * 1024)).toFixed(2);
         return sizeMB;
     } catch(e) {
         console.error("Could not calculate LocalStorage usage:", e);
         return "?";
     }
}

// ====================================================================
// UI制御関数 (UI Control Functions)
// ====================================================================

// --- Themes ---
/** テーマを適用し、状態とUIを更新 */
function applyTheme(theme) {
    const body = dom.appBody;
    body.classList.remove('theme-light', 'theme-dark');

    let newTheme = theme;
    if (theme === 'system') {
         newTheme = systemThemeMediaQuery.matches ? 'dark' : 'light';
    }

    body.classList.add(`theme-${newTheme}`);
    appState.settings.theme = theme; // Store selected setting

    updateThemeToggleButton(newTheme);

    if (appState.charts.studyTrends || appState.charts.questionAccuracy) {
        updateChartThemes();
    }
    console.log(`Theme applied: ${theme} (Resolved to: ${newTheme})`);
}

/** システムテーマ変更イベントのハンドラ */
function handleSystemThemeChange(event) {
    console.log("System theme change detected.");
    if (appState.settings.theme === 'system') {
        applyTheme('system');
    }
}

/** 現在bodyに適用されているテーマ('light' or 'dark')を取得 */
function getCurrentAppliedTheme() {
    return dom.appBody.classList.contains('theme-dark') ? 'dark' : 'light';
}

/** テーマ切り替えボタンのアイコンとaria-labelを更新 */
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

/** Chart.jsのテーマ（色など）を更新する */
function updateChartThemes() {
    console.log("Updating chart themes...");
    if (appState.activeScreen === 'dashboard-screen' && appState.currentDashboardDeckId) {
        const deck = appState.allDecks[appState.currentDashboardDeckId];
        if(deck) {
            // Re-render charts to apply new colors based on updated CSS variables
            renderDashboardTrendsChart(deck);
            renderDashboardQuestionAnalysis();
        }
    }
}

// --- Notifications ---
/** グローバル通知を表示 */
function showNotification(message, type = 'info', duration = NOTIFICATION_DURATION) {
    if (!dom.globalNotification || !dom.notificationMessage || !dom.notificationIcon) {
        console.warn("Notification elements not found, cannot display:", { message, type });
        return;
    }
    clearTimeout(appState.notificationTimeout);
    appState.notificationTimeout = null;

    dom.notificationMessage.textContent = message;
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
    dom.notificationIcon.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i>`;

    dom.globalNotification.className = `notification ${type}`; // Reset and set type
    dom.globalNotification.setAttribute('aria-hidden', 'false');

    if (duration > 0) {
        appState.notificationTimeout = setTimeout(hideNotification, duration);
    }
}

/** グローバル通知を非表示 */
function hideNotification() {
    if (!dom.globalNotification) return;
    clearTimeout(appState.notificationTimeout);
    appState.notificationTimeout = null;
    dom.globalNotification.setAttribute('aria-hidden', 'true');
}

// --- Modals ---
/**
 * モーダルダイアログを表示する
 * @param {ModalOptions} options - モーダルの設定
 */
function showModal(options) {
    const { title, content, buttons = [], size = 'md', onClose } = options;
    if (!dom.modalOverlay || !dom.modalDialog || !dom.modalTitle || !dom.modalBody || !dom.modalFooter || !dom.modalCloseButton) {
        console.error("Modal elements not found.");
        return;
    }
    if (appState.isModalOpen) {
         console.warn("Attempted to open modal while another is open. Ignoring.");
         return;
    }
    appState.lastFocusedElement = document.activeElement; // Store focus

    dom.modalTitle.innerHTML = title; // Allow HTML
    dom.modalDialog.className = `modal-dialog modal-${size}`;
    dom.modalDialog.removeAttribute('aria-describedby'); // Remove potential old description

    dom.modalBody.innerHTML = '';
    if (typeof content === 'string') {
        dom.modalBody.innerHTML = content;
        // If content is simple text, consider adding an ID for aria-describedby
        // const descId = `modal-desc-${generateUUID()}`;
        // dom.modalBody.id = descId;
        // dom.modalDialog.setAttribute('aria-describedby', descId);
    } else if (content instanceof HTMLElement) {
        dom.modalBody.appendChild(content);
        // Potentially set aria-describedby if content element has a suitable ID
    }

    dom.modalFooter.innerHTML = '';
    if (buttons.length > 0) {
        buttons.forEach(btnConfig => {
            const button = createButton(btnConfig);
            dom.modalFooter.appendChild(button);
        });
        dom.modalFooter.style.display = 'flex';
    } else {
        dom.modalFooter.style.display = 'none';
    }

    // Assign event listeners
    dom.modalCloseButton.onclick = () => closeModal(onClose);
    dom.modalOverlay.onclick = (event) => {
        if (event.target === dom.modalOverlay) {
             closeModal(onClose);
        }
    };

    dom.modalOverlay.style.display = 'flex';
    dom.modalDialog.setAttribute('aria-labelledby', 'modal-title');
    appState.isModalOpen = true;

    // Delay focus to allow transition/render
    setTimeout(() => {
         // Try focusing the first button in the footer, then title, then dialog
         const firstButton = dom.modalFooter.querySelector('button');
         if (firstButton) {
              firstButton.focus();
         } else {
             dom.modalDialog.focus(); // Focus dialog as fallback
         }
    }, 100);
}

/** モーダルダイアログを閉じる */
function closeModal(onCloseCallback) {
     if (!dom.modalOverlay || !appState.isModalOpen) return;
     appState.isModalOpen = false;

     // Clear listeners to prevent potential memory leaks if needed, although onclick reassignment might be enough
     dom.modalCloseButton.onclick = null;
     dom.modalOverlay.onclick = null;

     if (onCloseCallback && typeof onCloseCallback === 'function') {
         try {
             onCloseCallback();
         } catch (e) { console.error("Error in modal onClose callback:", e); }
     }

     dom.modalOverlay.style.display = 'none';
     // Defer clearing content to avoid visual glitch during fade-out? Optional.
     // setTimeout(() => {
     //     dom.modalBody.innerHTML = '';
     //     dom.modalFooter.innerHTML = '';
     // }, 300); // Match transition duration


     if (appState.lastFocusedElement && typeof appState.lastFocusedElement.focus === 'function') {
         console.log("Returning focus to:", appState.lastFocusedElement);
          appState.lastFocusedElement.focus();
     } else {
          console.warn("Could not return focus, last focused element not found or invalid.");
          dom.appBody.focus();
     }
     appState.lastFocusedElement = null;
}


// --- UI Updates (General) ---
/** 初期設定値をUIコントロールに反映 */
function applyInitialSettingsToUI() {
    loadSettingsToUI();

    safeSetText(dom.dashboardFilterThresholdLow, DASHBOARD_ACCURACY_THRESHOLDS.LOW);
    safeSetText(dom.dashboardFilterThresholdMediumLow, DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1);
    safeSetText(dom.dashboardFilterThresholdMediumHigh, DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM);
    safeSetText(dom.dashboardFilterThresholdHigh, DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1);
    safeSetText(dom.dashboardTrendsSessionsCount, DASHBOARD_TREND_SESSIONS);
}

/** 指定IDの画面に遷移し、関連するUI状態を更新 */
function navigateToScreen(screenId, isInitialLoad = false) {
    if (!dom.screens || !dom.navButtons) {
        console.error("Navigation failed: Screen or Nav elements missing.");
        showNotification("画面遷移エラー", "error");
        return;
    }
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen || !targetScreen.classList.contains('screen')) {
        console.error(`Navigation failed: Screen #${screenId} not found or invalid.`);
        showNotification(`指定画面(#${screenId})が見つかりません。ホームを表示します。`, "warning");
        screenId = 'home-screen';
        if (!document.getElementById(screenId)) return;
    }

    if (!isInitialLoad && screenId === appState.activeScreen) {
        console.log(`Already on screen: ${screenId}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    console.log(`Navigating to screen: ${screenId}`);
    // const previousScreen = appState.activeScreen;
    appState.activeScreen = screenId;
    saveData(LS_KEYS.LAST_SCREEN, screenId);

    dom.screens.forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active'); // Null check

    dom.navButtons.forEach(button => {
        const isActive = button.dataset.target === screenId;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    // --- Screen Specific Actions & Focus Management ---
    const focusTargetSelectors = {
        'home-screen': '#deck-search-input', // Focus search first
        'dashboard-screen': '#dashboard-deck-select',
        'settings-screen': '#setting-shuffle-options',
        'prompt-guide-screen': '#prompt-field-topic',
        'study-screen': '#options-buttons-container button:first-child',
    };

    switch (screenId) {
        case 'home-screen':
             updateHomeUI();
            break;
        case 'dashboard-screen':
            populateDashboardDeckSelect();
            // Select first deck logic or render dashboard
            if (!appState.currentDashboardDeckId && Object.keys(appState.allDecks).length > 0) {
                 const firstDeckId = Object.keys(appState.allDecks).sort((a,b) => (appState.allDecks[a]?.name || '').localeCompare(appState.allDecks[b]?.name || ''))[0];
                 if(firstDeckId) selectDashboardDeck(firstDeckId);
            } else {
                 renderDashboard(); // Render current or no-deck state
            }
            break;
        case 'settings-screen':
            loadSettingsToUI();
            break;
         case 'prompt-guide-screen':
            updatePromptPlaceholders();
            break;
        case 'study-screen':
             if (!appState.isStudyActive) {
                console.warn("Navigated directly to study screen without active session. Redirecting home.");
                navigateToScreen('home-screen');
                 return;
             }
             // Focus logic inside displayCurrentQuestion is sufficient here
            break;
    }

    // Focus management
    setTimeout(() => {
         // Attempt focus on primary target for the screen
         const focusTarget = document.querySelector(focusTargetSelectors[screenId]);
        if (focusTarget) {
             focusTarget.focus();
         } else {
             // Fallback: Focus the screen container itself if target not found/visible
             document.getElementById(screenId)?.focus(); // Add tabindex="-1" to screen sections if needed
         }
     }, 150); // Increased delay slightly


    if (!isInitialLoad) {
         window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}


// ====================================================================
// イベントリスナー設定 (Event Listener Setup)
// ====================================================================
/** アプリケーション全体のグローバルイベントリスナーを設定 */
function setupGlobalEventListeners() {
     safeAddEventListener(window, 'resize', debounce(handleResize, DEBOUNCE_DELAY), { passive: true });
     safeAddEventListener(window, 'keydown', handleGlobalKeyDown);
     safeAddEventListener(systemThemeMediaQuery, 'change', handleSystemThemeChange);
}

/** アプリケーションの各画面要素に固有のイベントリスナーを設定 */
function setupScreenEventListeners() {
    // Header & Nav
    safeAddEventListener(dom.appHeaderTitle, 'click', navigateToHome);
    safeAddEventListener(dom.themeToggleButton, 'click', toggleTheme);
     if (dom.navButtons) {
         dom.navButtons.forEach(button => safeAddEventListener(button, 'click', handleNavClick));
     }

    // Notification Close
    safeAddEventListener(dom.notificationCloseButton, 'click', hideNotification);

    // --- Home Screen ---
    safeAddEventListener(dom.jsonFileInput, 'change', handleFileSelect);
     safeAddEventListener(dom.deckSearchInput, 'input', debounce(handleDeckSearchInput, DEBOUNCE_DELAY));
     safeAddEventListener(dom.deckSortSelect, 'change', handleDeckSortChange);
    safeAddEventListener(dom.deckList, 'click', handleDeckListClick);
    safeAddEventListener(dom.deckList, 'keydown', handleDeckListKeydown);
     safeAddEventListener(dom.deckListPagination, 'click', handleDeckPaginationClick);
     safeAddEventListener(dom.resetHistoryButton, 'click', handleResetHistoryClick);
    safeAddEventListener(dom.startStudyButton, 'click', startStudy);
    if (dom.studyFilterRadios) {
        dom.studyFilterRadios.forEach(radio => safeAddEventListener(radio, 'change', handleStudyFilterChange));
    }

    // --- Study Screen ---
     safeAddEventListener(dom.optionsButtonsContainer, 'click', handleOptionButtonClick);
    safeAddEventListener(dom.quitStudyHeaderButton, 'click', () => confirmQuitStudy(true));
    safeAddEventListener(dom.retryButton, 'click', retryCurrentQuestion);
    if (dom.evalButtons) {
        dom.evalButtons.forEach(button => safeAddEventListener(button, 'click', handleEvaluation));
    }
     safeAddEventListener(dom.backToHomeButton, 'click', navigateToHome);

    // --- Dashboard Screen ---
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

    // --- Settings Screen ---
     safeAddEventListener(dom.settingShuffleOptions, 'change', () => setSettingsUnsavedStatus(true));
     safeAddEventListener(dom.settingLowAccuracyThreshold, 'input', debounce(handleSettingThresholdInput, DEBOUNCE_DELAY));
     safeAddEventListener(dom.settingLowAccuracyThreshold, 'change', handleSettingThresholdChange);
     safeAddEventListener(dom.settingHomeItemsPerPage, 'change', () => setSettingsUnsavedStatus(true));
     safeAddEventListener(dom.settingDashboardItemsPerPage, 'change', () => setSettingsUnsavedStatus(true));
     safeAddEventListener(dom.settingTheme, 'change', handleThemeSettingChange);
     safeAddEventListener(dom.saveSettingsButton, 'click', saveSettings);
     safeAddEventListener(dom.exportDataButton, 'click', exportAllData);
     safeAddEventListener(dom.importDataInput, 'change', handleImportFileSelect);
     safeAddEventListener(dom.resetAllDataButton, 'click', handleResetAllDataClick);

    // --- AI Prompt Guide Screen ---
     safeAddEventListener(dom.promptFieldTopic, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
     safeAddEventListener(dom.promptFieldCount, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
     safeAddEventListener(dom.promptFieldLevel, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
     safeAddEventListener(dom.copyPromptButton, 'click', copyPromptToClipboard);
     safeAddEventListener(dom.jsonCheckInput, 'input', debounce(handleJsonCheckInput, DEBOUNCE_DELAY));
     safeAddEventListener(dom.jsonCheckButton, 'click', checkJsonFormat);

    console.log("Screen event listeners setup complete.");
}

/**
 * 安全にイベントリスナーを追加するヘルパー関数
 * @param {EventTarget | null} element - 対象要素 (nullの可能性あり)
 * @param {string} event - イベント名
 * @param {Function} handler - ハンドラ関数
 * @param {boolean | AddEventListenerOptions} [options={}] - オプション
 */
function safeAddEventListener(element, event, handler, options = {}) {
    if (element && typeof element.addEventListener === 'function') {
        element.addEventListener(event, handler, options);
    } else {
        // 要素が見つからない場合、キャッシュ段階で警告が出ているのでここでは抑制しても良い
        // console.warn(`Listener not added: Element for "${event}" event handler is null or invalid.`);
    }
}

/**
 * デバウンス関数: 指定時間内に連続して発生したイベントは最後のものだけ実行
 * @param {Function} func - 実行する関数
 * @param {number} wait - 遅延時間 (ms)
 * @returns {Function} デバウンスされた関数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this; // Capture context
        const later = () => {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// ====================================================================
// グローバルイベントハンドラ
// ====================================================================
/** ウィンドウリサイズ時のハンドラ */
function handleResize() {
     clearTimeout(resizeDebounceTimer);
     resizeDebounceTimer = setTimeout(() => {
         console.log("Window resized");
         toggleDashboardControlsBasedOnSize(); // Adjust layout based on size
     }, MIN_DEBOUNCE_DELAY);
}

/** グローバルなキーダウンイベントハンドラ (ESCでモーダル閉じるなど) */
function handleGlobalKeyDown(event) {
    if (event.key === 'Escape') {
         if (appState.isModalOpen && dom.modalOverlay && dom.modalCloseButton) {
              console.log("ESC key pressed, closing modal.");
             // Find the onClose callback if associated with the close button
              const onCloseCallback = dom.modalCloseButton.onclick ? dom.modalCloseButton.onclick.bind(dom.modalCloseButton) : undefined; // Need to adjust this to actually get callback stored somewhere else
              closeModal(onCloseCallback);
         }
        // else if (appState.isStudyActive) {
        //     confirmQuitStudy(true); // ESC also quits study?
        // }
    }
}


// ====================================================================
// テーマ関連処理
// ====================================================================
/** テーマ切り替えボタンクリック時のハンドラ */
function toggleTheme() {
     const currentAppliedTheme = getCurrentAppliedTheme();
     const nextTheme = currentAppliedTheme === 'light' ? 'dark' : 'light';
     applyTheme(nextTheme); // Manually selecting means no longer 'system'
     // Save this selection
     saveSettings(); // Save updated settings (theme included)
}

/** 設定画面のテーマ選択変更時のハンドラ */
function handleThemeSettingChange(event) {
     const selectedTheme = event.target.value;
     applyTheme(selectedTheme); // Preview theme change
     setSettingsUnsavedStatus(true); // Mark settings as unsaved
     showNotification("テーマ設定が変更されました。右下の「設定を保存」を押してください。", "info", 3000);
}

// ====================================================================
// ナビゲーションと画面共通処理
// ====================================================================
/** ヘッダータイトルクリックやホームボタンでホームに戻る */
function navigateToHome() {
     if (appState.isStudyActive) {
         confirmQuitStudy(true, 'home-screen');
     } else {
         navigateToScreen('home-screen');
     }
}

/** ナビゲーションボタンクリック時のハンドラ */
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

/** ファイル選択input変更時のハンドラ（新規デッキ読み込み） */
function handleFileSelect(event) {
    const fileInput = event.target;
    if (!fileInput) return; // Safety check
    handleFileUpload(fileInput, processNewDeckFile);
}

/** インポート用ファイル選択input変更時のハンドラ */
function handleImportFileSelect(event) {
     const fileInput = event.target;
     if (!fileInput) return;
     handleFileUpload(fileInput, processImportDataFile, dom.importStatus);
}

/** 共通ファイルアップロード処理 */
function handleFileUpload(fileInput, processFunction, statusElement = dom.loadStatus) {
    if (!fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    fileInput.value = ''; // Clear input immediately to allow re-selecting same file

    updateStatusMessage(statusElement, "", "info"); // Clear previous

    if (!file.type.includes('json') && !file.name.toLowerCase().endsWith('.json')) {
        updateStatusMessage(statusElement, "JSONファイル形式ではありません", "warning");
        showNotification('ファイル形式エラー: JSONファイルを選択してください。', 'warning');
        return;
    }
     if (file.size > 10 * 1024 * 1024) { // Limit file size (e.g., 10MB)
        updateStatusMessage(statusElement, "ファイルサイズ超過 (最大10MB)", "warning");
        showNotification('ファイルサイズエラー (最大10MB)。', 'warning');
        return;
    }

    updateStatusMessage(statusElement, "読み込み中...", "info");
    updateLoadingOverlay(true, `ファイル (${file.name}) 処理中...`);

    const reader = new FileReader(); // Use a new reader instance each time

    reader.onload = (e) => {
        const content = e.target?.result;
        // Ensure reader result is processed AFTER this handler finishes
        setTimeout(() => {
            processFunction(content, file.name, statusElement);
            updateLoadingOverlay(false);
            clearStatusMessageAfterDelay(statusElement, 5000);
        }, 0);
    };
    reader.onerror = (e) => {
         console.error("File reading error:", reader.error);
         updateStatusMessage(statusElement, "ファイル読み取りエラー", "error");
         showNotification(`ファイル読み取りエラー: ${reader.error}`, "error");
         updateLoadingOverlay(false);
    };
     reader.onabort = () => {
         console.log("File reading aborted.");
         updateStatusMessage(statusElement, "読み込み中断", "info");
         updateLoadingOverlay(false);
     };

    reader.readAsText(file);
}

/** 読み込んだ新規デッキJSONファイルを処理 */
function processNewDeckFile(content, fileName, statusElement) {
    let newDeckId = null;
    try {
        if (typeof content !== 'string' || content.trim() === '') {
             throw new Error("ファイル内容が空または不正。");
        }
        let data;
        try {
             data = JSON.parse(content);
        } catch (parseError) { throw new Error(`JSON解析失敗: ${parseError.message}`); }

        const validationResult = validateDeckJsonData(data);
        if (!validationResult.isValid) {
            throw new Error(`JSON形式エラー: ${validationResult.message}`);
        }
        if (!validationResult.questions || validationResult.questions.length === 0) {
             throw new Error("JSON内に有効な問題が見つかりませんでした。");
        }

        let baseName = fileName.replace(/\.json$/i, '');
        const newDeck = createNewDeck(baseName, validationResult.questions);
        newDeckId = newDeck.id;

        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
            delete appState.allDecks[newDeckId]; // Rollback state addition
            throw new Error("LocalStorage保存失敗。");
        }

        console.log("New deck added:", newDeck);
        updateStatusMessage(statusElement, `成功: ${newDeck.name} (${newDeck.questions.length}問)`, "success");
        showNotification(`問題集「${newDeck.name}」(${newDeck.questions.length}問) を追加しました。`, 'success');

         updateHomeUI(true); // Force update even if not on home
        populateDashboardDeckSelect();
         selectDeck(newDeckId); // Auto-select

    } catch (error) {
        console.error("Error processing new deck file:", error);
        updateStatusMessage(statusElement, `エラー: ${error.message}`, "error");
        showNotification(`ファイル処理エラー: ${error.message}`, 'error', 8000);
        // Rollback state if added but save failed
        if (newDeckId && !localStorage.getItem(LS_KEYS.DECKS)?.includes(newDeckId)) {
             delete appState.allDecks[newDeckId];
        }
    }
}


/**
 * JSONデータが期待されるデッキ形式か検証する (複数問題対応)
 * @param {any} data - JSON.parse() されたデータ
 * @returns {{isValid: boolean, message: string, questions: {question:string, options:string[], correctAnswer:string, explanation:string}[] | null}} 検証結果
 */
function validateDeckJsonData(data) {
    if (!Array.isArray(data)) {
        return { isValid: false, message: "データが配列形式ではありません。", questions: null };
    }
    if (data.length === 0) {
        // Accept empty arrays as valid input, but maybe warn?
         console.log("Validated empty deck JSON data.");
        return { isValid: true, message: "問題が空の有効な配列です。", questions: [] };
    }

    const validatedQuestions = [];
    const questionIds = new Set(); // Used only if IDs are checked

    for (let i = 0; i < data.length; i++) {
        const qData = data[i];
        const validatedQ = repairAndValidateQuestion(qData, 'import-check', i);

        if (!validatedQ) {
             return { isValid: false, message: `問題 ${i + 1} のデータ構造が不正です (ログ参照)。`, questions: null };
        }

        // Add extracted valid question data (without ID or history from file)
        validatedQuestions.push({
            question: validatedQ.question,
            options: validatedQ.options,
            correctAnswer: validatedQ.correctAnswer,
            explanation: validatedQ.explanation,
        });
    }

    return { isValid: true, message: "データは有効です。", questions: validatedQuestions };
}

/** 新しいデッキオブジェクトを作成し、状態に追加 */
function createNewDeck(baseName, questionsData) {
    let deckName = generateUniqueDeckName(baseName);
    const deckId = generateUUID('deck');

    const newDeck = {
        id: deckId,
        name: deckName,
        questions: questionsData.map((q) => ({
            id: generateUUID(`q_${deckId}`), // Generate unique app-internal ID
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            history: [] // Always initialize history
        })),
        lastStudied: null,
        totalCorrect: 0,
        totalIncorrect: 0,
        sessionHistory: []
    };

    appState.allDecks[deckId] = newDeck;
    return newDeck;
}

/** デッキ名が衝突しないように調整 */
function generateUniqueDeckName(baseName) {
    let deckName = baseName.trim() || '無名の問題集';
    const lowerCaseName = deckName.toLowerCase();
    if (!Object.values(appState.allDecks).some(d => d.name.toLowerCase() === lowerCaseName)) {
        return deckName;
    }
    let counter = 2;
    let lowerCaseAttempt;
    do {
        deckName = `${baseName.trim()} (${counter})`;
        lowerCaseAttempt = deckName.toLowerCase();
        counter++;
    } while (Object.values(appState.allDecks).some(d => d.name.toLowerCase() === lowerCaseAttempt))

    return deckName;
}

/** 全データのエクスポート処理 */
function exportAllData() {
    try {
        updateLoadingOverlay(true, "データエクスポート準備中...");
        const exportData = {
            appVersion: appState.appVersion,
            exportTimestamp: Date.now(),
            settings: appState.settings,
            allDecks: appState.allDecks,
            currentDeckId: appState.currentDeckId,
        };

        const jsonData = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' }); // Specify charset
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        link.download = `ai-study-app-data_v${appState.appVersion}_${timestamp}.json`;
        link.href = url;

        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => { // Delay cleanup slightly
             document.body.removeChild(link);
             URL.revokeObjectURL(url);
             updateLoadingOverlay(false);
             showNotification("全データをエクスポートしました。", "success");
             console.log("Data exported successfully.");
        }, 100);

    } catch (error) {
        console.error("Error exporting data:", error);
        showNotification(`データのエクスポートエラー: ${error.message}`, "error");
        updateLoadingOverlay(false);
    }
}

/** インポートされたデータファイルを処理 */
function processImportDataFile(content, fileName, statusElement) {
    try {
        if (typeof content !== 'string' || content.trim() === '') {
            throw new Error("インポートファイル内容が空または不正。");
        }
        let data;
        try {
             data = JSON.parse(content);
        } catch (parseError) { throw new Error(`JSON解析失敗: ${parseError.message}`); }

        if (typeof data !== 'object' || data === null || typeof data.allDecks !== 'object' || typeof data.settings !== 'object') {
             throw new Error("インポートファイル形式不正 (allDecks, settings必須)。");
        }

         // --- Import Mode Selection using Modal ---
         showModal({
            title: 'データのインポートモード選択',
            content: `<p>ファイル「<strong>${escapeHtml(fileName)}</strong>」をインポートします。モードを選択してください:</p>
                        <p><strong>全置換:</strong> 現在の全データ (問題集・設定) を削除し、ファイル内容で置き換えます。(復元不可)</p>
                        <p><strong>マージ:</strong> ファイル内のデッキを現在のデータに追加/上書きし、設定もファイルの内容で更新します。</p>`,
            buttons: [
                { id: 'import-replace', text: '<i class="fas fa-exclamation-triangle"></i> 全置換', class: 'danger', onClick: () => {
                    closeModal(); // Close selection modal first
                    // Confirm destructive action again
                    const confirmation = prompt(`警告！ 全データ置換を実行します。現在のデータは失われます。\n続行するには「REPLACE」と入力:`);
                    if (confirmation === "REPLACE") {
                        updateLoadingOverlay(true, `データ置換中...`);
                         setTimeout(() => { // Allow UI update before potentially long operation
                            replaceDataFromImport(data, statusElement);
                             updateLoadingOverlay(false);
                        }, 50);
                    } else {
                        showNotification("置換インポートがキャンセルされました。", "info");
                        updateStatusMessage(statusElement, "置換キャンセル", "info");
                    }
                }},
                { id: 'import-merge', text: '<i class="fas fa-code-merge"></i> マージ', class: 'primary', onClick: () => {
                     closeModal();
                     updateLoadingOverlay(true, `データマージ中...`);
                      setTimeout(() => {
                          mergeDataFromImport(data, statusElement);
                           updateLoadingOverlay(false);
                     }, 50);
                }},
                { id: 'import-cancel', text: 'キャンセル', class: 'secondary', onClick: () => {
                     closeModal();
                     showNotification("インポートがキャンセルされました。", "info");
                     updateStatusMessage(statusElement, "キャンセル", "info");
                }}
            ],
            size: 'md'
         });

    } catch (error) {
        console.error("Error processing import file:", error);
        updateStatusMessage(statusElement, `エラー: ${error.message}`, "error");
        showNotification(`インポート処理エラー: ${error.message}`, 'error', 8000);
    }
}


/** インポートデータで全置換 */
function replaceDataFromImport(importedData, statusElement) {
    try {
        console.log("Validating imported data for replacement...");
        const repairedSettings = repairAndValidateSettings(importedData.settings);
        const repairedDecks = repairAndValidateAllDecks(importedData.allDecks);

        // Clear current state
        appState.allDecks = {}; // Reset decks in memory first
        appState.settings = DEFAULT_SETTINGS; // Reset settings in memory

        // Apply imported data
        appState.settings = repairedSettings;
        appState.allDecks = repairedDecks;

        appState.currentDeckId = null;
        if (importedData.currentDeckId && repairedDecks[importedData.currentDeckId]) {
             appState.currentDeckId = importedData.currentDeckId;
        } else if (Object.keys(repairedDecks).length > 0) {
             appState.currentDeckId = Object.keys(repairedDecks)[0];
        }
        appState.currentDashboardDeckId = appState.currentDeckId; // Sync dashboard selection

        // --- Save Replaced Data ---
         console.log("Saving replaced data...");
        let saveSuccess = true;
         saveSuccess &&= saveData(LS_KEYS.SETTINGS, appState.settings);
         saveSuccess &&= saveData(LS_KEYS.DECKS, appState.allDecks);
         saveSuccess &&= saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId);
         saveSuccess &&= saveData(LS_KEYS.LAST_SCREEN, 'home-screen'); // Reset last screen

        if (!saveSuccess) {
            // Critical failure: Attempt to restore original data? Very hard.
            // Safest bet is to clear local storage and force reload?
             localStorage.clear(); // Drastic measure
             throw new Error("置換データの保存失敗。安全のため全データをクリアし再読み込みします。");
        }

        // --- Refresh UI Post-Save ---
         applyTheme(appState.settings.theme);
         loadSettingsToUI(); // Apply settings to its screen
         applyInitialSettingsToUI(); // Apply general UI settings
         updateHomeUI(true); // Force home screen refresh
         populateDashboardDeckSelect();
         navigateToScreen('home-screen', true); // Force navigation to home

         updateStatusMessage(statusElement, `置換インポート成功 (${Object.keys(appState.allDecks).length}デッキ)`, "success");
        showNotification("データをファイルの内容で完全に置き換えました。", "success");

    } catch (error) {
        console.error("Error during replace import:", error);
         updateStatusMessage(statusElement, `置換エラー: ${error.message}`, "error");
        showNotification(`置換インポートエラー: ${error.message}`, 'error');
         // If error occurred after save, state might be inconsistent. Suggest reload.
         showNotification("エラー発生。アプリの状態が不安定な可能性があります。再読み込みしてください。", "warning", 10000);
    }
}


/** インポートデータでマージ */
function mergeDataFromImport(importedData, statusElement) {
     let addedCount = 0;
     let updatedCount = 0;
     const originalDecks = { ...appState.allDecks }; // Backup current decks
     const originalSettings = { ...appState.settings }; // Backup current settings

     try {
         console.log("Validating imported decks for merging...");
        const validImportedDecks = repairAndValidateAllDecks(importedData.allDecks || {});

        if (Object.keys(validImportedDecks).length === 0) {
             showNotification("ファイルに有効な問題集データがありませんでした。", "warning");
            updateStatusMessage(statusElement, "有効デッキなし", "warning");
            return;
        }

        // Merge decks: Add or Overwrite based on ID
        for (const deckId in validImportedDecks) {
             if (appState.allDecks[deckId]) { updatedCount++; } else { addedCount++; }
             appState.allDecks[deckId] = validImportedDecks[deckId]; // Overwrite/Add
         }
         console.log(`Deck merge summary: Added ${addedCount}, Updated ${updatedCount}`);

         // Merge settings: Overwrite current with validated imported settings
         console.log("Validating and merging imported settings...");
         const mergedSettings = repairAndValidateSettings(importedData.settings);
         appState.settings = mergedSettings;
         console.log("Settings merged:", appState.settings);

        // Validate/Update currentDeckId
        // Only update if current selection becomes invalid after merge,
        // or if importing preferred ID and current is null.
        if (appState.currentDeckId !== null && !appState.allDecks[appState.currentDeckId]) {
            // Current selection was overwritten/removed by merge, try imported ID
            if (importedData.currentDeckId && appState.allDecks[importedData.currentDeckId]) {
                appState.currentDeckId = importedData.currentDeckId;
                 console.log(`Current deck removed by merge, using imported selection: ${appState.currentDeckId}`);
             } else {
                 appState.currentDeckId = null; // Fallback to null if imported ID also invalid
                 console.log("Current deck removed by merge, imported ID also invalid.");
             }
        } else if (appState.currentDeckId === null && importedData.currentDeckId && appState.allDecks[importedData.currentDeckId]) {
             appState.currentDeckId = importedData.currentDeckId; // Set imported ID if currently none
             console.log(`No deck selected, using imported selection: ${appState.currentDeckId}`);
        }
         appState.currentDashboardDeckId = appState.currentDeckId; // Sync dashboard


        // --- Save Merged Data ---
        console.log("Saving merged data...");
        let saveSuccess = true;
         saveSuccess &&= saveData(LS_KEYS.SETTINGS, appState.settings);
         saveSuccess &&= saveData(LS_KEYS.DECKS, appState.allDecks);
         saveSuccess &&= saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId);

         if (!saveSuccess) {
            // Rollback state on save failure
             appState.allDecks = originalDecks;
             appState.settings = originalSettings;
              appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID, null); // Re-load original ID
              appState.currentDashboardDeckId = appState.currentDeckId;
             throw new Error("マージデータの保存失敗。変更は取り消されました。");
        }

        // --- Refresh UI Post-Save ---
        applyTheme(appState.settings.theme);
        loadSettingsToUI();
         applyInitialSettingsToUI(); // Re-apply settings derived values
        updateHomeUI(true); // Force refresh home
        populateDashboardDeckSelect();
         if (appState.activeScreen === 'dashboard-screen') renderDashboard(); // Refresh dash if open


         updateStatusMessage(statusElement, `マージ成功 (追加${addedCount}, 更新${updatedCount})`, "success");
        showNotification(`データをマージしました (追加 ${addedCount}, 更新 ${updatedCount})。設定も更新されました。`, "success");

     } catch (error) {
         console.error("Error during merge import:", error);
         updateStatusMessage(statusElement, `マージエラー: ${error.message}`, "error");
         showNotification(`マージインポートエラー: ${error.message}`, 'error');
         // Ensure state consistency by potentially reloading original data after error
         appState.allDecks = originalDecks;
         appState.settings = originalSettings;
          appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID, null); // Ensure stable state
          appState.currentDashboardDeckId = appState.currentDeckId;
     }
}

/** アプリの全データを削除 */
function handleResetAllDataClick() {
     showModal({
        title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 全データ削除の最終確認`,
        content: `<p><strong>警告！ この操作は絶対に元に戻せません。</strong></p>
                    <p>すべての問題集、学習履歴、設定が完全に削除されます。続行する前に、必要であればデータをエクスポートしてください。</p>
                   <hr>
                    <label for="delete-confirm-input">確認のため「DELETE ALL DATA」と入力してください:</label>
                    <input type="text" id="delete-confirm-input" class="confirm-input" style="width: 100%; margin-top: 5px;" placeholder="DELETE ALL DATA">
                   <p id="delete-confirm-error" class="status-message error" style="display:none; margin-top: 5px;"></p>`,
        buttons: [
            { id: 'confirm-delete-all-btn', text: '<i class="fas fa-trash-alt"></i> 全て削除する', class: 'danger', onClick: deleteAllDataConfirmed },
            { id: 'cancel-delete-all-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
        ],
        size: 'md'
    });
     setTimeout(() => document.getElementById('delete-confirm-input')?.focus(), 100);
}

/** 全データ削除を最終確認（テキスト入力）後、実行 */
function deleteAllDataConfirmed() {
     const confirmInput = document.getElementById('delete-confirm-input');
     const errorMsg = document.getElementById('delete-confirm-error');
     if (!confirmInput || !errorMsg) return;

     if (confirmInput.value !== "DELETE ALL DATA") {
         errorMsg.textContent = "入力が一致しません。";
         errorMsg.style.display = 'block';
         confirmInput.focus();
         return;
     }

    // --- Proceed with deletion ---
     closeModal(); // Close confirm modal
     console.warn("Initiating FULL data reset!");
    updateLoadingOverlay(true, "全データを削除中...");

    try {
         const keysToRemove = Object.values(LS_KEYS); // Get all known keys
         keysToRemove.forEach(key => localStorage.removeItem(key));
          // Add any other keys if necessary

         // Reset appState completely
         appState.allDecks = {};
         appState.settings = { ...DEFAULT_SETTINGS };
         appState.currentDeckId = null;
         appState.currentDashboardDeckId = null;
         resetStudyState();
         resetDashboardFiltersAndState(true);
         appState.homeDeckCurrentPage = 1;
         appState.homeDeckFilterQuery = '';
         appState.homeDeckSortOrder = 'lastStudiedDesc';
         appState.studyFilter = 'all';


         // --- Refresh UI ---
         applyTheme(appState.settings.theme);
         applyInitialSettingsToUI();
         updateHomeUI(true);
         populateDashboardDeckSelect();
         navigateToScreen('home-screen', true); // Go home forcefully

        console.log("All application data has been reset from LocalStorage and state.");
        showNotification("すべてのアプリデータが削除されました。", "success");

    } catch (error) {
        console.error("Error during full data reset:", error);
        showNotification(`データ削除エラー: ${error.message}`, "error");
    } finally {
        updateLoadingOverlay(false);
    }
}


// --- Status Message Handling ---
/**
 * ステータスメッセージを指定要素に表示/更新
 * @param {HTMLElement | null} element - 表示対象の要素
 * @param {string} message - 表示メッセージ
 * @param {NotificationType} type - メッセージ種別 ('info', 'success', 'warning', 'error')
 */
function updateStatusMessage(element, message, type = 'info') {
    if (element) {
        element.textContent = message;
        element.className = `status-message ${type}`;
        // Ensure aria-live based on severity for screen readers
        element.setAttribute('aria-live', (type === 'error' || type === 'warning') ? 'assertive' : 'polite');
    }
}

/**
 * ステータスメッセージを一定時間後にクリアする
 * @param {HTMLElement | null} element - 対象要素
 * @param {number} delay - 遅延時間 (ms)
 */
function clearStatusMessageAfterDelay(element, delay = 5000) {
    if (element) { // Clear previous timer if any associated with this element
         clearTimeout(element.clearStatusTimer);
    }
    element.clearStatusTimer = setTimeout(() => {
        if (element && !element.classList.contains('error') && !element.classList.contains('warning')) { // Clear only non-critical messages
            updateStatusMessage(element, '', 'info');
        }
    }, delay);
}

// ====================================================================
// ホーム画面関連処理 (Home Screen)
// ====================================================================

/** ホーム画面全体のUIを更新 */
function updateHomeUI(forceUpdate = false) {
     if (!forceUpdate && appState.activeScreen !== 'home-screen') return;

     updateDeckListControlsVisibility();
     updateFilteredDeckList(); // Handles list + pagination render
     updateTopScreenDisplay(); // Handles current deck info + filter counts/buttons
}

/** デッキリストのコントロール表示/非表示を切り替え */
function updateDeckListControlsVisibility() {
     const deckCount = Object.keys(appState.allDecks).length;
     // Show controls if more than 1 deck exists, or always if preference set? Let's say > 0.
     const showControls = deckCount > 0;
     if (dom.deckListControls) {
         dom.deckListControls.style.display = showControls ? 'flex' : 'none';
     }
     // Hide pagination if controls are hidden
      if (!showControls && dom.deckListPagination) {
           dom.deckListPagination.style.display = 'none';
     }
}

/** デッキリストの検索入力ハンドラ */
function handleDeckSearchInput(event) {
     appState.homeDeckFilterQuery = event.target.value;
     appState.homeDeckCurrentPage = 1; // Reset page
     updateFilteredDeckList();
}

/** デッキリストのソート順変更ハンドラ */
function handleDeckSortChange(event) {
    appState.homeDeckSortOrder = event.target.value;
    appState.homeDeckCurrentPage = 1;
    updateFilteredDeckList();
}

/** フィルタリングとソートを適用したデッキリストを取得 */
function getFilteredAndSortedDecks() {
    let decks = Object.values(appState.allDecks);
    const query = appState.homeDeckFilterQuery.toLowerCase().trim();

    // Apply Search Filter
    if (query) {
        try {
             const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
             decks = decks.filter(deck => regex.test(deck.name));
         } catch(e) {
             console.error("Deck search regex error:", e);
             decks = decks.filter(deck => deck.name.toLowerCase().includes(query));
         }
    }

    // Apply Sorting
    decks.sort((a, b) => {
        switch (appState.homeDeckSortOrder) {
            case 'nameAsc': return (a.name || '').localeCompare(b.name || '', 'ja');
            case 'nameDesc': return (b.name || '').localeCompare(a.name || '', 'ja');
            case 'questionCountAsc': return (a.questions?.length || 0) - (b.questions?.length || 0);
            case 'questionCountDesc': return (b.questions?.length || 0) - (a.questions?.length || 0);
            case 'lastStudiedDesc':
            default:
                const tsA = a.lastStudied || 0;
                const tsB = b.lastStudied || 0;
                if (tsB !== tsA) return tsB - tsA;
                return (a.name || '').localeCompare(b.name || '', 'ja');
        }
    });

    return decks;
}

/** ホーム画面のデッキリストとページネーションを更新 */
function updateFilteredDeckList() {
     const filteredDecks = getFilteredAndSortedDecks();
     const totalDecks = filteredDecks.length;
     const decksPerPage = appState.settings.homeDecksPerPage;
     const totalPages = Math.ceil(totalDecks / decksPerPage) || 1;

     appState.homeDeckCurrentPage = Math.max(1, Math.min(appState.homeDeckCurrentPage, totalPages));

     const startIndex = (appState.homeDeckCurrentPage - 1) * decksPerPage;
     const endIndex = startIndex + decksPerPage;
     const decksToShow = filteredDecks.slice(startIndex, endIndex);

     renderDeckList(decksToShow);
     renderDeckPagination(totalDecks, totalPages, appState.homeDeckCurrentPage);
}

/** デッキリストのレンダリング */
function renderDeckList(decks) {
     if (!dom.deckList) return;
     dom.deckList.innerHTML = '';
     dom.deckList.scrollTop = 0;

     if (decks.length === 0) {
         const message = appState.homeDeckFilterQuery
             ? `検索語「${escapeHtml(appState.homeDeckFilterQuery)}」に一致する問題集はありません。`
             : "利用可能な問題集がありません。";
         dom.deckList.innerHTML = `<li class="no-decks-message">${message}</li>`;
         return;
     }

     const fragment = document.createDocumentFragment();
     decks.forEach(deck => {
         const li = document.createElement('li');
         li.dataset.deckId = deck.id;
         li.tabIndex = 0;
         li.setAttribute('role', 'button');
         li.setAttribute('aria-label', `問題集 ${escapeHtml(deck.name || '名称未設定')} を選択`);
         li.classList.toggle('active-deck', deck.id === appState.currentDeckId);
         li.setAttribute('aria-selected', String(deck.id === appState.currentDeckId));

         const infoDiv = document.createElement('div');
         infoDiv.className = 'deck-info';
         const nameSpan = document.createElement('span');
         nameSpan.className = 'deck-name';
         nameSpan.textContent = `${escapeHtml(deck.name || '名称未設定')} (${deck.questions?.length || 0}問)`;
         const historySpan = document.createElement('span');
         historySpan.className = 'deck-history';
         const { accuracyText } = calculateOverallAccuracy(deck);
         historySpan.textContent = `${deck.lastStudied ? `最終学習: ${formatDate(deck.lastStudied)}` : '未学習'} / ${accuracyText}`;
         infoDiv.appendChild(nameSpan);
         infoDiv.appendChild(historySpan);

         const actionsDiv = document.createElement('div');
         actionsDiv.className = 'deck-actions no-print';
         const selectBtn = createButton({
             text: '<i class="fas fa-check-circle" aria-hidden="true"></i> 選択',
             class: 'small primary select-deck',
             ariaLabel: `問題集 ${escapeHtml(deck.name || '名称未設定')} を選択`,
             data: { 'deckId': deck.id }, // Use camelCase for data attributes access
             disabled: deck.id === appState.currentDeckId,
         });
         const deleteBtn = createButton({
             text: '<i class="fas fa-trash-alt" aria-hidden="true"></i> 削除',
             class: 'small danger delete-deck',
             ariaLabel: `問題集 ${escapeHtml(deck.name || '名称未設定')} を削除`,
             data: { 'deckId': deck.id },
         });
         actionsDiv.appendChild(selectBtn);
         actionsDiv.appendChild(deleteBtn);

         li.appendChild(infoDiv);
         li.appendChild(actionsDiv);
         fragment.appendChild(li);
     });
     dom.deckList.appendChild(fragment);
}

/** デッキリストページネーションのレンダリング */
function renderDeckPagination(totalItems, totalPages, currentPage) {
     renderGenericPagination(dom.deckListPagination, totalItems, totalPages, currentPage, 'deck-page-nav'); // Use specific prefix
}

/** ホーム画面のデッキリストページ遷移ハンドラ */
function handleDeckPaginationClick(event) {
     const targetPage = getPageFromPaginationClick(event, 'deck-page-nav'); // Use specific prefix
     if (targetPage !== null) {
         appState.homeDeckCurrentPage = targetPage;
         updateFilteredDeckList();
         dom.deckList?.focus();
     }
}

/** ホーム画面の「現在の問題集」情報とフィルター関連を更新 */
function updateTopScreenDisplay() {
    const deckSelected = !!appState.currentDeckId && !!appState.allDecks[appState.currentDeckId];
    const currentDeck = deckSelected ? appState.allDecks[appState.currentDeckId] : null;

    safeSetText(dom.currentDeckName, currentDeck ? escapeHtml(currentDeck.name || '名称未設定') : '未選択');
    safeSetText(dom.totalQuestions, currentDeck ? (currentDeck.questions?.length ?? 0).toString() : '0');
    safeSetText(dom.currentDeckLastStudied, currentDeck?.lastStudied ? formatDate(currentDeck.lastStudied) : '-');

    if (dom.currentDeckAccuracy) {
         const { accuracyText } = calculateOverallAccuracy(currentDeck);
         dom.currentDeckAccuracy.textContent = accuracyText;
    }

    // Filter Options & Buttons
    if (dom.studyFilterOptions) dom.studyFilterOptions.style.display = deckSelected ? 'block' : 'none';
    if (dom.lowAccuracyThresholdDisplayFilter) {
        safeSetText(dom.lowAccuracyThresholdDisplayFilter, appState.settings.lowAccuracyThreshold);
    }

    updateHomeActionButtonsState(currentDeck);

    // Update filter counts (debounced)
     clearTimeout(filterCountDebounceTimer);
     filterCountDebounceTimer = setTimeout(updateAllFilterCounts, MIN_DEBOUNCE_DELAY);
}

/** ホーム画面のアクションボタン（開始、リセット）の状態を更新 */
function updateHomeActionButtonsState(currentDeck) {
     if (dom.resetHistoryButton) {
        let hasHistory = currentDeck && (
            (currentDeck.lastStudied !== null) ||
            (currentDeck.totalCorrect > 0) ||
            (currentDeck.totalIncorrect > 0) ||
            (currentDeck.sessionHistory?.length > 0) ||
            (currentDeck.questions?.some(q => q.history?.length > 0))
        );
         dom.resetHistoryButton.disabled = !hasHistory;
         setAriaDisabled(dom.resetHistoryButton, !hasHistory);
         dom.resetHistoryButton.title = hasHistory
             ? "選択中の問題集の全学習履歴をリセットします (要確認)"
             : (currentDeck ? "リセットする履歴がありません" : "問題集を選択してください");
     }
     // Start button state depends on filter counts, handled elsewhere
}


/** ホーム画面: フィルター選択ラジオ内の問題数カウントを更新 */
function updateAllFilterCounts() {
     const deck = appState.allDecks[appState.currentDeckId];
     if (!deck) {
          // Clear all counts
          dom.studyFilterRadios.forEach(radio => {
               const countSpan = radio.nextElementSibling?.querySelector('.filter-count');
               if(countSpan) countSpan.textContent = `(0)`;
          });
          if(dom.filteredQuestionCountDisplay) dom.filteredQuestionCountDisplay.textContent = "対象問題数: 0問";
           updateStudyButtonsState(0);
          return;
     }

    let totalSelectedFiltered = 0;
     try {
          dom.studyFilterRadios.forEach(radio => {
              const filterValue = radio.value;
               const list = getFilteredStudyList(filterValue);
               const count = list.length;
               const countSpan = radio.nextElementSibling?.querySelector('.filter-count');
               if(countSpan) countSpan.textContent = `(${count})`;

               if(radio.checked) {
                   totalSelectedFiltered = count;
               }
          });
     } catch (error) { console.error("Error updating filter counts:", error); }

     // Update main count display & button state
    if(dom.filteredQuestionCountDisplay) {
        dom.filteredQuestionCountDisplay.textContent = `総対象問題数: ${totalSelectedFiltered}問`;
    }
    updateStudyButtonsState(totalSelectedFiltered);
}

/** ホーム画面: Start Study ボタンの有効/無効とツールチップを更新 */
function updateStudyButtonsState(filteredCount) {
    if (!dom.startStudyButton) return;
    const canStart = filteredCount > 0;
    dom.startStudyButton.disabled = !canStart;
    setAriaDisabled(dom.startStudyButton, !canStart);

    if (!appState.currentDeckId) {
         dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
     } else if (!canStart) {
         const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
         const filterText = selectedRadio?.nextElementSibling?.querySelector('.filter-text')?.textContent.trim() || '選択条件';
         dom.startStudyButton.title = `「${escapeHtml(filterText)}」に該当する問題がありません。`;
     } else {
         dom.startStudyButton.title = `選択中のフィルター (${filteredCount}問) で学習を開始します`;
     }
}

/** デッキリストのクリックイベント処理（委任） */
function handleDeckListClick(event) {
    const listItem = event.target.closest('li[data-deck-id]');
    if (!listItem) return;
    const deckId = listItem.dataset.deckId;
    if (!deckId) return;

    const selectButton = event.target.closest('.select-deck');
    const deleteButton = event.target.closest('.delete-deck');

    if (selectButton && !selectButton.disabled) {
         event.stopPropagation(); selectDeck(deckId);
    } else if (deleteButton && !deleteButton.disabled) {
        event.stopPropagation(); handleDeleteDeckClick(deckId);
    } else if (listItem.getAttribute('role') === 'button' && deckId !== appState.currentDeckId) {
         selectDeck(deckId);
    }
}

/** デッキリストのキーダウンイベント処理（委任） */
function handleDeckListKeydown(event) {
     const currentItem = event.target;
     if (!currentItem.matches('li[data-deck-id]')) return;

    switch (event.key) {
        case 'Enter': case ' ':
             event.preventDefault();
             const deckId = currentItem.dataset.deckId;
             if (deckId && deckId !== appState.currentDeckId) selectDeck(deckId);
            break;
         case 'ArrowDown':
         case 'ArrowUp':
             event.preventDefault();
             focusSiblingListItem(currentItem, event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling');
             break;
         case 'Home':
         case 'End':
             event.preventDefault();
             focusSiblingListItem(currentItem, event.key === 'Home' ? 'firstElementChild' : 'lastElementChild', currentItem.parentElement);
             break;
    }
}

/** フォーカス可能な兄弟リスト要素にフォーカスを移動 */
function focusSiblingListItem(currentItem, directionProperty, parent = currentItem.parentElement) {
     if (!parent) return;
     let sibling = (directionProperty === 'firstElementChild' || directionProperty === 'lastElementChild')
                   ? parent[directionProperty]
                   : currentItem[directionProperty];
     // Loop to find the next focusable sibling
     while (sibling && (!sibling.matches || !sibling.matches('li[data-deck-id]') || sibling.offsetParent === null)) {
        sibling = sibling[directionProperty];
     }
     sibling?.focus(); // Focus if found
}

/** 指定されたIDのデッキを選択状態にする */
function selectDeck(deckId) {
    if (!deckId || !appState.allDecks[deckId] || deckId === appState.currentDeckId) return;

    appState.currentDeckId = deckId;
    appState.currentDashboardDeckId = deckId;
    saveData(LS_KEYS.CURRENT_DECK_ID, deckId);

    console.log("Deck selected:", deckId);
    showNotification(`問題集「${escapeHtml(appState.allDecks[deckId]?.name || '無名')}」を選択しました。`, 'success', 2500);

    appState.studyFilter = 'all'; // Reset filter
    const allFilterRadio = document.getElementById('filter-all');
    if (allFilterRadio) allFilterRadio.checked = true;

    updateHomeUI(true); // Force UI update
    if(dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = deckId;

    if (appState.activeScreen === 'dashboard-screen') {
        resetDashboardFiltersAndState(false);
        renderDashboard();
    }
}

/** デッキ削除ボタンクリック時の処理 */
function handleDeleteDeckClick(deckId) {
     const deck = appState.allDecks[deckId];
     if (!deck) return;

     showModal({
         title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 問題集削除確認`,
         content: `<p>問題集「<strong>${escapeHtml(deck.name || '名称未設定')}</strong>」(${deck.questions?.length ?? 0}問) とその学習履歴を完全に削除します。</p><p style="font-weight:bold; color:var(--danger-dark);">この操作は元に戻せません！</p>`,
         buttons: [
             { id: 'confirm-delete-btn', text: '削除する', class: 'danger', onClick: () => { deleteDeckConfirmed(deckId); closeModal(); } },
             { id: 'cancel-delete-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ]
     });
}

/** デッキ削除を最終確認後、実行 */
function deleteDeckConfirmed(deckId) {
    if (!deckId || !appState.allDecks[deckId]) {
        showNotification("削除対象が見つかりません。", "error"); return;
    }
    const deckName = appState.allDecks[deckId].name || '無名';
    console.log(`Deleting deck: ${deckName} (ID: ${deckId})`);
    updateLoadingOverlay(true, `「${escapeHtml(deckName)}」を削除中...`);

     const originalDecks = { ...appState.allDecks };
     delete appState.allDecks[deckId];
     let selectionChanged = false;
     if (appState.currentDeckId === deckId) { appState.currentDeckId = null; selectionChanged = true; }
     if (appState.currentDashboardDeckId === deckId) { appState.currentDashboardDeckId = null; if(dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = ""; selectionChanged = true; }

     if (saveData(LS_KEYS.DECKS, appState.allDecks)) {
         if (selectionChanged) saveData(LS_KEYS.CURRENT_DECK_ID, null);
         showNotification(`問題集「${escapeHtml(deckName)}」を削除しました。`, "success");
         updateHomeUI(true);
         populateDashboardDeckSelect();
         if (appState.activeScreen === 'dashboard-screen' && selectionChanged) renderDashboard();
     } else {
         appState.allDecks = originalDecks; // Rollback
         showNotification("問題集削除エラー（保存失敗）。", "error");
     }
     updateLoadingOverlay(false);
}

/** 学習履歴リセットボタンクリック時の処理 */
function handleResetHistoryClick() {
     const deckId = appState.currentDeckId;
     if (!deckId || !appState.allDecks[deckId]) return;
     const deck = appState.allDecks[deckId];

     showModal({
         title: `<i class="fas fa-history" style="color:var(--warning-color);"></i> 学習履歴リセット確認`,
         content: `<p>問題集「<strong>${escapeHtml(deck.name)}</strong>」の全学習履歴をリセットします。</p><p><strong>この操作は元に戻せません！</strong></p><hr><label for="reset-confirm-input">確認のため、問題集名を入力してください:</label><input type="text" id="reset-confirm-input" class="confirm-input" style="width: 100%; margin-top: 5px;" placeholder="${escapeHtml(deck.name)}"><p id="reset-confirm-error" class="status-message error" style="display:none; margin-top: 5px;"></p>`,
         buttons: [
             { id: 'confirm-reset-btn', text: '履歴リセット実行', class: 'danger', onClick: () => resetHistoryConfirmed(deckId) },
             { id: 'cancel-reset-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ],
          onClose: () => { document.getElementById('reset-confirm-input')?.removeEventListener('input', clearResetError); } // Clean listener
     });
      const confirmInput = document.getElementById('reset-confirm-input');
      safeAddEventListener(confirmInput, 'input', clearResetError); // Clear error on input
      setTimeout(() => confirmInput?.focus(), 100);
}
/** 履歴リセット確認モーダルのエラーメッセージをクリア */
function clearResetError(){
     const errorMsg = document.getElementById('reset-confirm-error');
     if (errorMsg) errorMsg.style.display = 'none';
}

/** 履歴リセットを最終確認（名称入力）後、実行 */
function resetHistoryConfirmed(deckId) {
     const deck = appState.allDecks[deckId];
     const confirmInput = document.getElementById('reset-confirm-input');
     const errorMsg = document.getElementById('reset-confirm-error');
     if (!deck || !confirmInput || !errorMsg) return;

     if (confirmInput.value !== deck.name) {
         errorMsg.textContent = "入力された問題集名が一致しません。";
         errorMsg.style.display = 'block';
         confirmInput.focus();
         return;
     }

     closeModal();
     console.log(`Resetting history for deck: ${deck.name} (ID: ${deckId})`);
    updateLoadingOverlay(true, `「${escapeHtml(deck.name)}」の履歴リセット中...`);

     const originalDeck = JSON.parse(JSON.stringify(deck));

     try {
         deck.lastStudied = null;
         deck.totalCorrect = 0;
         deck.totalIncorrect = 0;
         deck.sessionHistory = [];
         deck.questions.forEach(q => { q.history = []; });

         if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             appState.allDecks[deckId] = originalDeck; // Rollback
             throw new Error("履歴リセット後の保存に失敗。");
         }
         showNotification(`問題集「${escapeHtml(deck.name)}」の学習履歴をリセットしました。`, "success");
         updateHomeUI(true);
         if (appState.currentDashboardDeckId === deckId && appState.activeScreen === 'dashboard-screen') {
             renderDashboard();
         }
     } catch (error) {
         console.error("Error resetting history:", error);
         showNotification(`履歴リセットエラー: ${error.message}`, "error");
     } finally {
         updateLoadingOverlay(false);
     }
}

/** ホーム画面: 学習フィルター選択ハンドラ */
function handleStudyFilterChange(event) {
     if (event.target.checked && event.target.name === 'study-filter') {
         appState.studyFilter = event.target.value;
         console.log("Study filter changed to:", appState.studyFilter);
          clearTimeout(filterCountDebounceTimer);
          filterCountDebounceTimer = setTimeout(updateAllFilterCounts, MIN_DEBOUNCE_DELAY);
     }
}

/**
 * 現在選択されているデッキとフィルターに基づいて、学習対象の問題リストを取得する
 * @param {string} [filter=appState.studyFilter] - 使用するフィルター値 (指定なければstateの値)
 * @returns {QuestionData[]} フィルターされた問題データの配列 (常に配列を返す)
 */
function getFilteredStudyList(filter = appState.studyFilter) {
    const deck = appState.allDecks[appState.currentDeckId];
    if (!deck || !Array.isArray(deck.questions)) return [];

    const questions = deck.questions;
    const lowThreshold = appState.settings.lowAccuracyThreshold;

    let filteredQuestions = [];
    try {
        switch (filter) {
            case 'lowAccuracy':
                filteredQuestions = questions.filter(q => {
                    const stats = calculateQuestionAccuracy(q);
                     return stats.totalCount > 0 && stats.accuracy <= lowThreshold;
                });
                break;
            case 'incorrect':
                filteredQuestions = questions.filter(q => q.history?.length > 0 && !q.history[q.history.length - 1].correct);
                break;
            case 'unanswered':
                filteredQuestions = questions.filter(q => !q.history || q.history.length === 0);
                break;
            case 'difficult': case 'normal': case 'easy':
                 filteredQuestions = questions.filter(q => q.history?.length > 0 && q.history[q.history.length - 1].evaluation === filter);
                break;
            case 'all': default:
                filteredQuestions = [...questions];
                break;
        }
    } catch (e) {
        console.error(`Error filtering questions with filter "${filter}":`, e);
        return []; // Return empty array on filtering error
    }
    return filteredQuestions;
}


// ====================================================================
// 学習フロー (Study Flow)
// ====================================================================
/** 学習セッションを開始する */
function startStudy() {
    const deck = appState.allDecks[appState.currentDeckId];
    if (!deck) { showNotification('問題集を選択してください。', 'warning'); return; }

    const filteredList = getFilteredStudyList();
    if (filteredList.length === 0) {
         const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
         const filterText = selectedRadio?.nextElementSibling?.querySelector('.filter-text')?.textContent.trim() || '選択条件';
        showNotification(`「${escapeHtml(filterText)}」に該当する問題がありません。`, 'warning');
        return;
    }

    appState.studyList = shuffleArray([...filteredList]); // Shuffle question order
    console.log(`Study session started with ${appState.studyList.length} questions.`);

    appState.currentQuestionIndex = 0;
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
    appState.isStudyActive = true;

    // Setup Study UI
    if (dom.studyScreenTitle) dom.studyScreenTitle.querySelector('span').textContent = escapeHtml(deck.name || '名称未設定');
     setActiveClass(dom.studyCompleteMessage, false);
     safeSetStyle(dom.studyCompleteMessage, 'display', 'none');
     safeSetStyle(dom.quitStudyHeaderButton, 'display', 'inline-block');
     safeSetStyle(dom.studyCard, 'display', 'block');
     safeSetStyle(dom.evaluationControls, 'display', 'none');
     safeSetStyle(dom.answerArea, 'display', 'none');
     safeSetStyle(dom.retryButton, 'display', 'none');

    navigateToScreen('study-screen');
    displayCurrentQuestion();
     updateStudyProgress(); // Initialize progress bar
}

/** 現在の問題を画面に表示 */
function displayCurrentQuestion() {
    if (!appState.isStudyActive || !dom.questionText || !dom.optionsButtonsContainer || appState.currentQuestionIndex < 0 || appState.currentQuestionIndex >= appState.studyList.length) {
        console.warn("displayCurrentQuestion: Invalid state/elements.", { active:appState.isStudyActive, index:appState.currentQuestionIndex });
         if (appState.isStudyActive) showStudyCompletion();
        return;
    }
    const questionData = appState.studyList[appState.currentQuestionIndex];
    if (!isValidQuestion(questionData)) {
         console.error(`Skipping invalid question data at index ${appState.currentQuestionIndex}.`);
         showNotification(`問題 ${appState.currentQuestionIndex + 1} データ不正のためスキップ`, 'warning');
         moveToNextQuestion();
        return;
    }
    console.log(`Displaying Q ${appState.currentQuestionIndex + 1}/${appState.studyList.length}`);

    // Reset UI
    resetQuestionUI();

    // Display new question content
    safeSetText(dom.questionCounter, `${appState.currentQuestionIndex + 1} / ${appState.studyList.length}`);
    safeSetText(dom.questionText, questionData.question);
    renderOptions(questionData.options, appState.settings.shuffleOptions);
    safeSetText(dom.answerText, questionData.correctAnswer);
    safeSetText(dom.explanationText, questionData.explanation || '解説はありません。');

    updateStudyProgress(); // Update progress bar

    // Focus first option after render
    setTimeout(() => dom.optionsButtonsContainer?.querySelector('.option-button')?.focus(), 50);
}

/** 問題表示前のUIリセット */
function resetQuestionUI(){
    if(dom.optionsButtonsContainer) {
         dom.optionsButtonsContainer.innerHTML = '';
         dom.optionsButtonsContainer.setAttribute('aria-busy', 'true');
    }
    safeSetStyle(dom.answerArea, 'display', 'none');
    safeSetStyle(dom.evaluationControls, 'display', 'none');
    if(dom.feedbackContainer) dom.feedbackContainer.className = 'feedback-container'; // Reset class
    if(dom.feedbackMessage) dom.feedbackMessage.querySelector('span').textContent = '';
    if(dom.studyCard) dom.studyCard.className = 'card study-card-active'; // Reset correct/incorrect border
    safeSetStyle(dom.retryButton, 'display', 'none');
    if(dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
}

/** 選択肢ボタンをレンダリング */
function renderOptions(optionsSource, shouldShuffle) {
    if(!dom.optionsButtonsContainer) return;
    dom.optionsButtonsContainer.innerHTML = ''; // Clear previous
    const options = shouldShuffle ? shuffleArray([...optionsSource]) : [...optionsSource];
    const fragment = document.createDocumentFragment();
    options.forEach((option, index) => {
        fragment.appendChild(createButton({
            text: escapeHtml(option),
             class: 'option-button',
             data: { optionValue: option },
             ariaLabel: `選択肢 ${index + 1}: ${option}`
         }));
     });
     dom.optionsButtonsContainer.appendChild(fragment);
     dom.optionsButtonsContainer.removeAttribute('aria-busy');
}

/** 学習進捗バーとテキストを更新 */
function updateStudyProgress() {
    if (!dom.studyProgressBar || !dom.studyProgressText || !dom.studyProgressContainer) return;
    const total = appState.studyList.length;
    const currentIdx = appState.currentQuestionIndex; // 0-based index

    if (appState.isStudyActive && total > 0 && currentIdx >= 0) {
        const currentNum = currentIdx + 1;
        const progressPercent = Math.min(100, Math.round((currentNum / total) * 100));
        dom.studyProgressBar.value = currentNum;
        dom.studyProgressBar.max = total;
        safeSetText(dom.studyProgressText, `${currentNum} / ${total} (${progressPercent}%)`);
        dom.studyProgressContainer.style.visibility = 'visible';
    } else {
        dom.studyProgressContainer.style.visibility = 'hidden'; // Hide if not studying
    }
}

/** 選択肢ボタンクリック時のハンドラ */
function handleOptionButtonClick(event) {
    const clickedButton = event.target.closest('.option-button');
    if (!clickedButton || clickedButton.disabled || !appState.isStudyActive) return;

    const allOptions = dom.optionsButtonsContainer?.querySelectorAll('.option-button');
    if (allOptions) allOptions.forEach(btn => btn.disabled = true);

    const selectedOption = clickedButton.dataset.optionValue;
    const questionData = appState.studyList[appState.currentQuestionIndex];
     if (!isValidQuestion(questionData)) {
         showNotification("解答処理エラー", "error");
          if(allOptions) allOptions.forEach(btn => btn.disabled = false); // Re-enable
         return;
     }

    handleAnswerSubmission(selectedOption, questionData.correctAnswer);
}

/** 解答提出後の処理 */
function handleAnswerSubmission(selectedOption, correctAnswer) {
    const isCorrect = selectedOption === correctAnswer;
    const questionData = appState.studyList[appState.currentQuestionIndex];
    if (!questionData || !dom.studyCard || !dom.feedbackContainer || !dom.feedbackMessage || !dom.feedbackIcon) {
        console.error("Feedback error: Elements/data missing."); return;
    }

    console.log(`Answer: Sel="${selectedOption}", Ans="${correctAnswer}", Correct=${isCorrect}`);

    // Update stats & feedback UI
    appState.studyStats[isCorrect ? 'currentSessionCorrect' : 'currentSessionIncorrect']++;
    dom.studyCard.classList.toggle('correct-answer', isCorrect);
    dom.studyCard.classList.toggle('incorrect-answer', !isCorrect);
    safeSetText(dom.feedbackMessage.querySelector('span'), isCorrect ? '正解！' : '不正解...');
    dom.feedbackContainer.className = `feedback-container ${isCorrect ? 'correct' : 'incorrect'}`;
    dom.feedbackIcon.className = `feedback-icon fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'}`;
    safeSetStyle(dom.retryButton, 'display', isCorrect ? 'none' : 'inline-block');

    // Highlight options
    dom.optionsButtonsContainer?.querySelectorAll('.option-button').forEach(button => {
         const optionVal = button.dataset.optionValue;
         button.classList.remove('success', 'danger');
         if (optionVal === correctAnswer) button.classList.add('success');
         else if (optionVal === selectedOption) button.classList.add('danger');
         else button.style.opacity = '0.5';
     });

    // Show answer area & eval panel
    safeSetStyle(dom.answerArea, 'display', 'block');
    safeSetStyle(dom.evaluationControls, 'display', 'flex');

    // Scroll and focus evaluation panel
     dom.evaluationControls.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
     setTimeout(() => dom.evaluationControls.querySelector('.eval-button')?.focus(), 100);
}

/** 理解度評価ボタンクリックハンドラ */
function handleEvaluation(event) {
     const evalButton = event.target.closest('.eval-button');
     if (!evalButton || evalButton.disabled || !appState.isStudyActive) return;

     const evaluation = evalButton.dataset.levelChange;
     if (!evaluation || !['difficult', 'normal', 'easy'].includes(evaluation)) return;

     if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = true); // Prevent double-click

     const questionData = appState.studyList?.[appState.currentQuestionIndex];
     const isCorrect = dom.feedbackContainer?.classList.contains('correct') ?? false; // Get result from UI

     if (!questionData || !questionData.id || !appState.currentDeckId) {
         console.error("Evaluation error: context missing.");
         if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable on error
         return;
     }

    // Record history (handles save and potential rollback)
     if (recordQuestionHistory(appState.currentDeckId, questionData.id, isCorrect, evaluation)) {
        moveToNextQuestion(); // Move on if history saved successfully
    } else {
         showNotification("学習履歴の保存に失敗しました。", "error");
         if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable on failure
     }
}

/** 問題の解答履歴を記録し、デッキデータを保存 */
function recordQuestionHistory(deckId, questionId, isCorrect, evaluation) {
    const deck = appState.allDecks[deckId];
     const questionInDeck = deck?.questions?.find(q => q.id === questionId);
    if (!questionInDeck) { console.error(`History Error: QID ${questionId} not found in Deck ${deckId}.`); return false; }

    if (!Array.isArray(questionInDeck.history)) questionInDeck.history = [];
    questionInDeck.history.push({ ts: Date.now(), correct: isCorrect, evaluation: evaluation });
    deck.lastStudied = Date.now();

    // Important: Only update cumulative counts when history is *first* recorded for this answer.
    // However, V3.0 uses Dashboard recalculation, so we don't need to update totals here.

     if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
         questionInDeck.history.pop(); // Rollback history push
         console.error("History Save Failed.");
         return false;
     }
    // console.log(`History recorded for Q:${questionId}, Result:${isCorrect}, Eval:${evaluation}`);
    return true;
}


/** 次の問題へ移動、または学習完了処理 */
function moveToNextQuestion() {
    appState.currentQuestionIndex++;
     if (appState.currentQuestionIndex < appState.studyList.length) {
         displayCurrentQuestion();
     } else {
         showStudyCompletion();
     }
}

/** 学習セッション完了処理 */
function showStudyCompletion() {
     if (!dom.studyCompleteMessage || !appState.isStudyActive) return; // Prevent multiple calls

    console.log("Study session completed. Stats:", appState.studyStats);
     appState.isStudyActive = false;

    saveSessionHistory(); // Save stats *before* potentially resetting them

    // Hide study elements
     safeSetStyle(dom.studyCard, 'display', 'none');
     safeSetStyle(dom.evaluationControls, 'display', 'none');
     safeSetStyle(dom.quitStudyHeaderButton, 'display', 'none');
     safeSetStyle(dom.studyProgressContainer, 'visibility', 'hidden');


    // Display results
     safeSetText(dom.sessionCorrectCount, appState.studyStats.currentSessionCorrect);
     safeSetText(dom.sessionIncorrectCount, appState.studyStats.currentSessionIncorrect);
     safeSetStyle(dom.studyCompleteMessage, 'display', 'block');
     dom.studyCompleteMessage.focus();


    // Reset study list/index, stats reset in saveSessionHistory
     appState.studyList = [];
     appState.currentQuestionIndex = -1;

    updateHomeUI(true); // Update home screen (stats etc.)
}

/** 現在のセッション履歴を保存 */
function saveSessionHistory() {
    const deck = appState.allDecks[appState.currentDeckId];
    if (!deck) return;

    const { currentSessionCorrect: correct, currentSessionIncorrect: incorrect } = appState.studyStats;
    if (correct > 0 || incorrect > 0) {
        if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
         deck.sessionHistory.push({ ts: Date.now(), correct, incorrect });
         deck.lastStudied = Date.now(); // Ensure lastStudied updated

        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             console.error(`Failed to save session history for deck ${deck.id}`);
         } else {
             console.log(`Session history saved for deck ${deck.id}.`);
         }
    } else { console.log("Skipping session history save (no answers)."); }

    // Reset stats after attempting save, ready for next session or quit
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
}

/** 現在の問題を再挑戦する */
function retryCurrentQuestion() {
    if (!appState.isStudyActive || appState.currentQuestionIndex < 0 || !dom.answerArea || !dom.optionsButtonsContainer) {
        return;
    }
     console.log(`Retrying question ${appState.currentQuestionIndex + 1}`);
    // Reset UI only, do not modify stats here. Let next answer determine final outcome.
    resetQuestionUI(); // Resets options, feedback, etc.
     displayCurrentQuestion(); // Re-display the same question
}


/** 学習の中断を確認し、必要に応じて画面遷移 */
function confirmQuitStudy(showConfirmation = true, navigateTo = 'home-screen') {
    if (!appState.isStudyActive) return true;

    let quitConfirmed = showConfirmation
         ? confirm("学習セッションを中断しますか？\nここまでの解答履歴と統計は保存されます。")
         : true;

    if (quitConfirmed) {
        console.log(`Processing study quit. Navigating to: ${navigateTo}`);
         appState.isStudyActive = false;
         saveSessionHistory(); // Save progress before quitting
        resetStudyScreenUI(); // Clear UI elements related to study
        navigateToScreen(navigateTo);
         showNotification("学習を中断しました。", "info", 3000);
        updateHomeUI(true); // Refresh home potentially
        return true;
    } else {
        console.log("Study quit cancelled.");
        return false;
    }
}

/** 学習状態を完全にリセット */
function resetStudyState() {
     appState.isStudyActive = false;
     appState.studyList = [];
     appState.currentQuestionIndex = -1;
     appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
     resetStudyScreenUI();
     console.log("Full study state reset.");
}


// ====================================================================
// ダッシュボード関連処理 (Dashboard)
// ====================================================================
// ... (Functions from V3.0 JS: populateDashboardDeckSelect, handleDashboardDeckChange, toggleDashboardControls, etc.) ...
// Make sure these functions correctly reference updated DOM IDs (e.g., dashboard-analysis-controls-panel)
// and state variables (appState.settings.dashboardQuestionsPerPage)

// ... Include all V3.0 Dashboard functions:
// populateDashboardDeckSelect, handleDashboardDeckChange, selectDashboardDeck,
// toggleDashboardControls, toggleDashboardControlsBasedOnSize, handleDashboardFilterChange,
// handleDashboardSearchInput, applyDashboardSearch, clearDashboardSearch, handleDashboardSortChange,
// handleDashboardItemsPerPageChange, setDashboardViewMode, resetDashboardFiltersAndState,
// renderDashboard, renderDashboardOverview, calculateOverallAccuracy, renderDashboardTrendsChart,
// renderDashboardQuestionAnalysis, renderDashboardQuestionList, handleQuestionItemClick,
// handleQuestionItemKeydown, showDetailForListItem, createQuestionDetailElement (renders to element, used by modal),
// renderDashboardQuestionAnalysisChart, renderDashboardPagination, handleDashboardPaginationClick,
// getFilteredAndSortedQuestionStats
// Ensure Chart.js functions (renderDashboardTrendsChart, renderDashboardQuestionAnalysisChart) use getBaseChartOptions and renderChart.


// ====================================================================
// 設定画面関連処理 (Settings)
// ====================================================================
// ... (Functions from V3.0 JS: loadSettingsToUI, handleSettingThresholdInput, handleSettingThresholdChange, handleSettingShuffleChange, setSettingsUnsavedStatus, saveSettings) ...


// ====================================================================
// AIプロンプトガイド関連処理 (Prompt Guide)
// ====================================================================
// ... (Functions from V3.0 JS: updatePromptPlaceholders, copyPromptToClipboard, handleJsonCheckInput, checkJsonFormat) ...


// ====================================================================
// ヘルパー関数 (Utilities)
// ====================================================================
// ... (Functions from V3.0 JS: generateUUID, shuffleArray, formatDate, safeSetText, safeSetValue, safeSetChecked, ...) ...
// ... (escapeHtml, setActiveClass, setAriaPressed, setAriaDisabled, destroyChart, checkChartJSAvaible, ...) ...
// ... (getBaseChartOptions, deepMerge, isObject, getHue, renderChart, renderGenericPagination, ...) ...
// ... (getPaginationButtons, getPageFromPaginationClick, calculateQuestionAccuracy, getAccuracyClass, ...) ...
// ... (createButton, isValidQuestion, copyTextToClipboard) ...

// ====================================================================
// Polyfills & Compatibility (Optional, if needed) - V3.0維持
// ====================================================================
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        var el = this;
        do {
            if (el.matches && el.matches(s)) return el; // Use Element.matches
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}


// ====================================================================
// End of file: script.js V3.0 (Corrected Again)
// ====================================================================
