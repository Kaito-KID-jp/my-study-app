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
        if (!cacheDOMElements()) {
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
        navigateToScreen(initialScreen, true); // isInitialLoad = true
        logInitStep("6. Navigation complete");

        // 7. ダッシュボードの初回レンダリング（必要なら）
        if (appState.activeScreen === 'dashboard-screen') {
             logInitStep("7. Initial dashboard rendering");
             await renderDashboard();
         } else {
              logInitStep("7. Skipping initial dashboard rendering");
         }

        appState.isLoading = false; // ローディング完了
        const endTime = performance.now();
        console.log(`App initialization successful in ${(endTime - startTime).toFixed(2)} ms.`);

    } catch (error) {
        console.error("CRITICAL ERROR during app initialization:", error);
        handleInitializationError(error);
    } finally {
        // ローディングオーバーレイを少し遅れて非表示にする
        setTimeout(() => {
            updateLoadingOverlay(false);
            console.log("Loading overlay hidden.");
        }, appState.isLoading ? 500 : 100); // エラー時は長め、成功時は短めに待つ
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
        'app-header-title', // ヘッダータイトル追加
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
        // Dashboard Screen (IDは存在)
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
        'question-analysis-view', 'question-list-view', 'question-chart-view', // question-list-view is used
        'question-accuracy-list', 'question-pagination', 'question-accuracy-chart-container', // question-list-view needs these
        'question-accuracy-chart', 'question-accuracy-no-data',
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
    dom.appBody = document.body; // Cache body

    // Check results of query selectors
    if (dom.navButtons.length === 0) { console.warn("No navigation buttons found."); criticalFound = false; }
    if (dom.screens.length === 0) { console.warn("No screen elements found."); criticalFound = false; }
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
    // Ensure overlay is hidden, handled in initializeApp finally block
}

/** ローディングオーバーレイの表示/非表示とテキスト更新 */
function updateLoadingOverlay(show, text = "読み込み中...") {
    if (!dom.appLoadingOverlay) return;
    const overlay = dom.appLoadingOverlay;
    // requestAnimationFrame を使うと非表示が遅れる場合があるので直接操作
    if (show) {
        overlay.querySelector('p').textContent = text;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
    } else {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
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
        // Handle undefined explicitly to remove item
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
            message = `データ保存失敗: ブラウザの保存容量(現在約 ${sizeMB} MB)の上限に達した可能性があります。設定画面から不要な問題集を削除するか、全データをエクスポートしてください。`;
        }
        showNotification(message, 'error', 8000); // Show error longer
        return false;
    } finally {
         appState.isSavingData = false; // Clear saving flag regardless of outcome
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
             return repairAndValidateSettings(parsedData);
        } else if (key === LS_KEYS.DECKS) {
             return repairAndValidateAllDecks(parsedData);
        } else if (key === LS_KEYS.CURRENT_DECK_ID || key === LS_KEYS.LAST_SCREEN) {
             // Allow null or string for IDs/Screen name
             return (typeof parsedData === 'string' || parsedData === null) ? parsedData : defaultValue;
        }
        // Add other key checks if needed for future keys

        return parsedData; // Return parsed data if no specific validation needed

    } catch (e) {
        console.error(`Failed to load/parse data from LocalStorage (Key: ${key}). Returning default. Error:`, e);
        showNotification(`保存データ (Key: ${key}) の読み込みに失敗しました。データが破損している可能性があります。デフォルト値を使用します。`, 'warning', 6000);
        // Optionally try to remove corrupted data - risky if error is temporary
        // try { localStorage.removeItem(key); } catch (removeError) { console.error(...) }
        return defaultValue;
    }
}

/** 全デッキデータの検証と修復 */
function repairAndValidateAllDecks(loadedDecks) {
    if (typeof loadedDecks !== 'object' || loadedDecks === null) {
        console.warn("Invalid deck data structure (not an object or null). Returning empty object.");
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

            const repairedDeck = { // Default values ensure all keys exist
                lastStudied: null,
                totalCorrect: 0, // V3: Not actively maintained, calculated on demand
                totalIncorrect: 0, // V3: Not actively maintained, calculated on demand
                sessionHistory: [],
                questions: [],
                ...deck, // Spread loaded data over defaults
                id: deckId, // Ensure ID from key is used
                name: deck.name.trim() || `無名の問題集 (${deckId.substring(0, 6)})`, // Ensure name is trimmed and not empty
            };

            // Detailed Property Validation & Repair
            if (typeof repairedDeck.lastStudied !== 'number' && repairedDeck.lastStudied !== null) { repairedDeck.lastStudied = null; dataModified = true; }
            if (typeof repairedDeck.totalCorrect !== 'number' || !Number.isFinite(repairedDeck.totalCorrect) || repairedDeck.totalCorrect < 0) { repairedDeck.totalCorrect = 0; dataModified = true; }
            if (typeof repairedDeck.totalIncorrect !== 'number' || !Number.isFinite(repairedDeck.totalIncorrect) || repairedDeck.totalIncorrect < 0) { repairedDeck.totalIncorrect = 0; dataModified = true; }
            if (!Array.isArray(repairedDeck.sessionHistory)) { repairedDeck.sessionHistory = []; dataModified = true; }
            const originalSessionLength = repairedDeck.sessionHistory.length;
            repairedDeck.sessionHistory = repairedDeck.sessionHistory.filter(isValidSessionHistory);
            if(repairedDeck.sessionHistory.length !== originalSessionLength) dataModified = true;

            if (!Array.isArray(repairedDeck.questions)) { repairedDeck.questions = []; dataModified = true; }
            const validQuestions = [];
            let questionsModified = false;
            repairedDeck.questions.forEach((q, index) => {
                const originalQJson = JSON.stringify(q); // Store original for comparison after potential repair
                const repairedQ = repairAndValidateQuestion(q, deckId, index);
                if (repairedQ) {
                    validQuestions.push(repairedQ);
                    if(originalQJson !== JSON.stringify(repairedQ)) {
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
        // Consider notifying user if significant repairs happened? Maybe too noisy.
    }
    return validDecks;
}

/** 個々の問題データの検証と修復 */
function repairAndValidateQuestion(q, deckId = 'unknown', index = -1) {
    if (typeof q !== 'object' || q === null) {
         console.warn(`Invalid question object removed (Deck: ${deckId}, Index: ${index}).`);
         return null;
    }
    const questionLogPrefix = `Question Validation (Deck: ${deckId}, Index: ${index}, QID: ${q?.id || 'N/A'}):`;
    let modified = false; // Track if repairs were made

    const repairedQ = { // Default structure skeleton
         id: '', question: '', options: [], correctAnswer: '', explanation: '', history: [], ...q };

    // Ensure and validate ID
    if (typeof repairedQ.id !== 'string' || !repairedQ.id) {
         repairedQ.id = generateUUID('q_repair');
         console.warn(`${questionLogPrefix} Missing or invalid question ID, generated new ID: ${repairedQ.id}`);
         modified = true;
    }

    // Validate required text fields
    if (typeof repairedQ.question !== 'string') {
         console.warn(`${questionLogPrefix} 'question' is not a string. Question skipped.`); return null;
    }
    const originalQuestion = repairedQ.question;
    repairedQ.question = repairedQ.question.trim();
    if (repairedQ.question === '') {
        console.warn(`${questionLogPrefix} Empty question text after trimming. Question skipped.`); return null;
    }
    if(originalQuestion !== repairedQ.question) modified = true;

    // Validate options array and contents
    if (!Array.isArray(repairedQ.options)) {
        console.warn(`${questionLogPrefix} 'options' is not an array. Question skipped.`); return null;
    }
    const originalOptions = JSON.stringify(repairedQ.options); // Store for comparison
    repairedQ.options = repairedQ.options
        .map(opt => String(opt ?? '').trim()) // Convert to string, trim
        .filter(opt => opt); // Remove empty options
    if (JSON.stringify(repairedQ.options) !== originalOptions) modified = true;
    if (repairedQ.options.length < 2) { // Need at least two valid options
        console.warn(`${questionLogPrefix} Less than 2 valid options found after cleaning. Question skipped.`); return null;
    }

    // Validate correctAnswer
    if (typeof repairedQ.correctAnswer !== 'string') {
        console.warn(`${questionLogPrefix} 'correctAnswer' is not a string. Question skipped.`); return null;
    }
    const originalCorrectAnswer = repairedQ.correctAnswer;
    repairedQ.correctAnswer = repairedQ.correctAnswer.trim();
    if (repairedQ.correctAnswer === '') {
        console.warn(`${questionLogPrefix} Empty 'correctAnswer' after trimming. Question skipped.`); return null;
    }
    if (originalCorrectAnswer !== repairedQ.correctAnswer) modified = true;

    // Ensure correctAnswer exists within the *repaired* options
    if (!repairedQ.options.includes(repairedQ.correctAnswer)) {
        console.warn(`${questionLogPrefix} 'correctAnswer' ("${repairedQ.correctAnswer}") not found in valid options [${repairedQ.options.join(', ')}]. Question skipped.`); return null;
    }

    // Ensure explanation is string and trim
    const originalExplanation = repairedQ.explanation;
    repairedQ.explanation = String(repairedQ.explanation ?? '').trim();
    if (repairedQ.explanation !== originalExplanation) modified = true;

    // Validate history array and its contents
    if (!Array.isArray(repairedQ.history)) {
        repairedQ.history = [];
        modified = true;
    }
     const originalHistoryLength = repairedQ.history.length;
    repairedQ.history = repairedQ.history.filter(isValidQuestionHistory);
     if (repairedQ.history.length !== originalHistoryLength) {
          console.warn(`${questionLogPrefix} Invalid history entries removed.`);
          modified = true;
     }

     if (modified) {
          console.log(`${questionLogPrefix} Data was repaired/validated.`);
     }

    // Return the cleaned/validated question object
    return repairedQ;
}


/** 設定データの検証とデフォルト値による補完 */
function repairAndValidateSettings(loadedSettings) {
    if (typeof loadedSettings !== 'object' || loadedSettings === null) {
        console.warn("Invalid settings data loaded, using defaults.");
        return { ...DEFAULT_SETTINGS };
    }

    const repairedSettings = { ...DEFAULT_SETTINGS }; // Start with defaults
    let modified = false;

    for (const key in DEFAULT_SETTINGS) {
        if (Object.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
            const defaultValue = DEFAULT_SETTINGS[key];
            const loadedValue = loadedSettings[key];
            const expectedType = typeof defaultValue;
            const loadedType = typeof loadedValue;

            if (loadedValue === undefined) {
                // Key missing, keep default, no warning needed unless tracking data migration
                continue;
            }

            if (loadedType !== expectedType) {
                console.warn(`Settings: Key "${key}" has invalid type (${loadedType}), expected (${expectedType}). Using default.`);
                modified = true;
                continue; // Skip to next key, use default
            }

             // Type is correct, now validate value
             let isValid = true;
             let validatedValue = loadedValue; // Assume valid initially

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
                    isValid = typeof loadedValue === 'boolean'; // Type check already done, so always true here
                    break;
                 // Add validation for future settings here
             }

             if(isValid) {
                repairedSettings[key] = validatedValue;
             } else {
                 console.warn(`Settings: Key "${key}" has invalid value (${loadedValue}). Using default (${defaultValue}).`);
                 modified = true;
                 // Keep the default value already in repairedSettings
             }
        }
    }

    // Check for unexpected keys in loaded data
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
    // Check if h is an object and has the required properties with correct types
    const isValid = Boolean(
        h && typeof h === 'object' &&
        typeof h.ts === 'number' && Number.isFinite(h.ts) && h.ts > 0 && // Valid timestamp
        typeof h.correct === 'boolean' && // Must be boolean
        (h.evaluation === null || ['difficult', 'normal', 'easy'].includes(h.evaluation) || h.evaluation === undefined) // Valid evaluation or null/undefined
    );
    if (!isValid) console.warn("Invalid QuestionHistory entry detected:", h);
    return isValid;
}

/** 個々の SessionHistory entry の形式を検証 */
function isValidSessionHistory(s) {
    const isValid = Boolean(
        s && typeof s === 'object' &&
        typeof s.ts === 'number' && Number.isFinite(s.ts) && s.ts > 0 && // Valid timestamp
        typeof s.correct === 'number' && Number.isInteger(s.correct) && s.correct >= 0 && // Non-negative integer
        typeof s.incorrect === 'number' && Number.isInteger(s.incorrect) && s.incorrect >= 0 // Non-negative integer
    );
     if (!isValid) console.warn("Invalid SessionHistory entry detected:", s);
    return isValid;
}

/** アプリ起動時にLocalStorageから初期データを読み込む */
function loadInitialData() {
    appState.settings = loadData(LS_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
    appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage; // Sync state with loaded setting
    appState.allDecks = loadData(LS_KEYS.DECKS, {});
    appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID, null);

    // Ensure currentDeckId is valid after loading decks
    if (appState.currentDeckId !== null && !appState.allDecks[appState.currentDeckId]) {
        console.warn(`Current deck ID "${appState.currentDeckId}" invalid or deck missing. Resetting currentDeckId to null.`);
        appState.currentDeckId = null;
        saveData(LS_KEYS.CURRENT_DECK_ID, null); // Persist the reset
    }

    // Set initial dashboard deck ID (might be null)
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
             if (key && key.startsWith('studyApp')) { // Only calculate for app keys
                const value = localStorage.getItem(key);
                if (value) {
                   // Rough estimate: UTF-16 characters can take up to 4 bytes,
                   // but localStorage stores as UTF-16 string. Length might be sufficient.
                   // Using 2 bytes per character as a common approximation.
                   totalBytes += (key.length + value.length) * 2;
                }
            }
         }
         const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
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
    if (!body) return;
    body.classList.remove('theme-light', 'theme-dark');

    let newTheme = theme;
    if (theme === 'system') {
         newTheme = systemThemeMediaQuery.matches ? 'dark' : 'light';
    }

    body.classList.add(`theme-${newTheme}`);
    appState.settings.theme = theme; // Store the user's selected setting ('light', 'dark', or 'system')

    updateThemeToggleButton(newTheme); // Update button based on applied theme

    // Update charts if they exist
    if (appState.charts.studyTrends || appState.charts.questionAccuracy) {
        updateChartThemes();
    }
    console.log(`Theme applied: ${theme} (Resolved to: ${newTheme})`);
}

/** システムテーマ変更イベントのハンドラ */
function handleSystemThemeChange(event) {
    console.log("System theme change detected.");
    if (appState.settings.theme === 'system') {
        applyTheme('system'); // Re-apply to resolve based on new system preference
    }
}

/** 現在bodyに適用されているテーマ('light' or 'dark')を取得 */
function getCurrentAppliedTheme() {
    return dom.appBody?.classList.contains('theme-dark') ? 'dark' : 'light';
}

/** テーマ切り替えボタンのアイコンとaria-labelを更新 */
function updateThemeToggleButton(appliedTheme) {
     if (!dom.themeToggleButton) return;
     const lightIcon = dom.themeToggleButton.querySelector('.theme-icon-light');
     const darkIcon = dom.themeToggleButton.querySelector('.theme-icon-dark');
     const srText = dom.themeToggleButton.querySelector('.sr-only');

     if (lightIcon && darkIcon && srText) {
         // Hide the icon corresponding to the *current* theme
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
            renderDashboardQuestionAnalysisChart(getFilteredAndSortedQuestionStats()); // Re-render analysis chart too
        }
    }
}

// --- Notifications ---
/** グローバル通知を表示 */
function showNotification(message, type = 'info', duration = NOTIFICATION_DURATION) {
    if (!dom.globalNotification || !dom.notificationMessage || !dom.notificationIcon || !dom.notificationCloseButton) {
        console.warn("Notification elements not found, cannot display:", { message, type });
        return;
    }
    // Clear existing timeout if any
    clearTimeout(appState.notificationTimeout);
    appState.notificationTimeout = null;

    dom.notificationMessage.textContent = message;
    // Use Font Awesome classes directly
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
    dom.notificationIcon.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i>`;

    dom.globalNotification.className = `notification ${type}`; // Reset and set type class
    dom.globalNotification.setAttribute('aria-hidden', 'false');

    // Set timer to hide notification automatically if duration is positive
    if (duration > 0 && !isNaN(duration)) {
        appState.notificationTimeout = setTimeout(hideNotification, duration);
    }
}

/** グローバル通知を非表示 */
function hideNotification() {
    if (!dom.globalNotification) return;
    clearTimeout(appState.notificationTimeout);
    appState.notificationTimeout = null;
    dom.globalNotification.setAttribute('aria-hidden', 'true');
    // Optionally reset content after fade out? Usually not necessary.
    // setTimeout(() => {
    //    dom.notificationMessage.textContent = '';
    //    dom.globalNotification.className = 'notification';
    // }, 400); // Match CSS transition duration
}

// --- Modals ---
/**
 * モーダルダイアログを表示する
 * @param {ModalOptions} options - モーダルの設定
 */
function showModal(options) {
    const { title, content, buttons = [], size = 'md', onClose } = options;
    if (!dom.modalOverlay || !dom.modalDialog || !dom.modalTitle || !dom.modalBody || !dom.modalFooter || !dom.modalCloseButton) {
        console.error("Modal elements not found. Cannot display modal.");
        return;
    }
    if (appState.isModalOpen) {
         console.warn("Attempted to open modal while another is already open. Ignoring.");
         return;
    }
    appState.lastFocusedElement = document.activeElement; // Store focus before modal opens

    dom.modalTitle.innerHTML = title; // Allow HTML in title
    dom.modalDialog.className = `modal-dialog modal-${size}`; // Apply size class
    dom.modalDialog.removeAttribute('aria-describedby'); // Clear previous description association

    dom.modalBody.innerHTML = ''; // Clear previous content
    if (typeof content === 'string') {
        dom.modalBody.innerHTML = content;
        // Try to find the first element with an ID in the content to use for aria-describedby
        const firstDescElement = dom.modalBody.querySelector('[id]');
        if (firstDescElement) {
            dom.modalDialog.setAttribute('aria-describedby', firstDescElement.id);
        }
    } else if (content instanceof HTMLElement) {
        dom.modalBody.appendChild(content);
        // If the appended element has an ID, use it
        if (content.id) {
            dom.modalDialog.setAttribute('aria-describedby', content.id);
        }
    }

    dom.modalFooter.innerHTML = ''; // Clear previous buttons
    if (buttons.length > 0) {
        buttons.forEach(btnConfig => {
            const button = createButton(btnConfig);
            dom.modalFooter.appendChild(button);
        });
        dom.modalFooter.style.display = 'flex'; // Show footer if buttons exist
    } else {
        dom.modalFooter.style.display = 'none'; // Hide footer if no buttons
    }

    // Internal function to handle closing logic
    const handleClose = () => closeModal(onClose); // Pass the original onClose callback

    // Assign event listeners using the handleClose function
    dom.modalCloseButton.onclick = handleClose;
    dom.modalOverlay.onclick = (event) => {
        // Close only if the overlay itself (the backdrop) is clicked, not the dialog
        if (event.target === dom.modalOverlay) {
             handleClose();
        }
    };
    // Add ESC key listener specifically for the modal when open
    dom.modalDialog.onkeydown = (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation(); // Prevent global handler if modal handles it
            handleClose();
        }
    };

    dom.modalOverlay.style.display = 'flex'; // Show the modal overlay
    dom.modalDialog.setAttribute('aria-labelledby', 'modal-title'); // Link title for accessibility
    appState.isModalOpen = true;

    // Delay focus to allow transition/render and ensure element is visible
    setTimeout(() => {
         // Try focusing the first button in the footer
         const firstButton = dom.modalFooter.querySelector('button');
         if (firstButton && !firstButton.disabled) {
              firstButton.focus();
         } else {
              // Fallback: Focus the modal dialog itself (requires tabindex="-1" on dialog)
              dom.modalDialog.focus();
         }
    }, 100); // 100ms delay seems reasonable
}

/** モーダルダイアログを閉じる */
function closeModal(onCloseCallback) {
     if (!dom.modalOverlay || !appState.isModalOpen) return;
     appState.isModalOpen = false;

     // Clean up listeners immediately to prevent potential issues
     dom.modalCloseButton.onclick = null;
     dom.modalOverlay.onclick = null;
     dom.modalDialog.onkeydown = null; // Remove keydown listener

     // Execute the callback if provided
     if (onCloseCallback && typeof onCloseCallback === 'function') {
         try {
             onCloseCallback();
         } catch (e) { console.error("Error in modal onClose callback:", e); }
     }

     dom.modalOverlay.style.display = 'none'; // Hide the modal
     // Optionally clear content after fade out animation completes (match CSS transition)
     // setTimeout(() => {
     //     dom.modalBody.innerHTML = '';
     //     dom.modalFooter.innerHTML = '';
     // }, 300);

     // Return focus to the element that had focus before the modal opened
     if (appState.lastFocusedElement && typeof appState.lastFocusedElement.focus === 'function') {
         console.log("Returning focus to:", appState.lastFocusedElement);
          appState.lastFocusedElement.focus();
     } else {
          console.warn("Could not return focus, last focused element not found or invalid. Focusing body.");
          dom.appBody?.focus(); // Fallback to body focus
     }
     appState.lastFocusedElement = null; // Clear the stored element
}


// --- UI Updates (General) ---
/** 初期設定値をUIコントロールに反映 */
function applyInitialSettingsToUI() {
    // Load settings values into the Settings screen UI elements
    loadSettingsToUI();

    // Update dashboard threshold displays
    safeSetText(dom.dashboardFilterThresholdLow, DASHBOARD_ACCURACY_THRESHOLDS.LOW);
    safeSetText(dom.dashboardFilterThresholdMediumLow, DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1);
    safeSetText(dom.dashboardFilterThresholdMediumHigh, DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM);
    safeSetText(dom.dashboardFilterThresholdHigh, DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1);
    safeSetText(dom.dashboardTrendsSessionsCount, DASHBOARD_TREND_SESSIONS);

    // Sync dashboard items per page state with settings
    appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage;
    safeSetValue(dom.dashboardItemsPerPage, appState.dashboardQuestionsPerPage.toString());
    // Sync home items per page setting
    safeSetValue(dom.settingHomeItemsPerPage, appState.settings.homeDecksPerPage.toString());
}

/** 指定IDの画面に遷移し、関連するUI状態を更新 */
function navigateToScreen(screenId, isInitialLoad = false) {
    if (!dom.screens || !dom.navButtons) {
        console.error("Navigation failed: Screen or Nav elements missing.");
        showNotification("画面遷移エラーが発生しました", "error");
        return;
    }
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen || !targetScreen.classList.contains('screen')) {
        console.error(`Navigation failed: Screen #${screenId} not found or invalid. Defaulting to home.`);
        showNotification(`指定画面(#${screenId})が見つかりません。ホーム画面を表示します。`, "warning");
        screenId = 'home-screen'; // Fallback to home
        if (!document.getElementById(screenId)) return; // Critical error if even home is missing
    }

    // Avoid unnecessary navigation if already on the target screen, unless initial load
    if (!isInitialLoad && screenId === appState.activeScreen) {
        console.log(`Already on screen: ${screenId}. Scrolling to top.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    console.log(`Navigating to screen: ${screenId}`);
    const previousScreen = appState.activeScreen;
    appState.activeScreen = screenId;
    if (!isInitialLoad) { // Don't save last screen on initial load if it's derived
        saveData(LS_KEYS.LAST_SCREEN, screenId);
    }

    // Update screen visibility
    dom.screens.forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');

    // Update navigation button states
    dom.navButtons.forEach(button => {
        const isActive = button.dataset.target === screenId;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    // --- Screen Specific Actions & Focus Management ---
    // Define primary focus targets for each screen
    const focusTargetSelectors = {
        'home-screen': '#deck-search-input', // Focus search input first
        'study-screen': '#options-buttons-container button:first-child', // Focus first option (if available)
        'dashboard-screen': '#dashboard-deck-select', // Focus deck selector
        'settings-screen': '#setting-shuffle-options', // Focus first setting
        'prompt-guide-screen': '#prompt-field-topic', // Focus first input field
    };

    // Execute actions specific to the target screen
    switch (screenId) {
        case 'home-screen':
             updateHomeUI(); // Refresh home screen content
            break;
        case 'dashboard-screen':
            populateDashboardDeckSelect(); // Refresh select options
            // Select first deck logic or render dashboard
            if (!appState.currentDashboardDeckId && Object.keys(appState.allDecks).length > 0) {
                 const firstDeckId = Object.keys(appState.allDecks).sort((a,b) => (appState.allDecks[a]?.name || '').localeCompare(appState.allDecks[b]?.name || ''))[0];
                 if(firstDeckId) selectDashboardDeck(firstDeckId); // Select the first deck automatically
            } else {
                 renderDashboard(); // Render current or no-deck state
            }
             toggleDashboardControlsBasedOnSize(); // Adjust controls visibility based on screen size
            break;
        case 'settings-screen':
            loadSettingsToUI(); // Refresh settings display
            break;
         case 'prompt-guide-screen':
            updatePromptPlaceholders(); // Refresh prompt template
            break;
        case 'study-screen':
             // Redirect home if trying to access study screen without an active session
             if (!appState.isStudyActive && !isInitialLoad) {
                console.warn("Navigated directly to study screen without active session. Redirecting home.");
                navigateToScreen('home-screen');
                 return; // Stop further processing for study screen
             }
             // Focus logic is handled within displayCurrentQuestion or when eval panel appears
            break;
    }

    // Focus Management: Attempt to focus the primary target for the screen after a short delay
    setTimeout(() => {
         const focusTarget = document.querySelector(focusTargetSelectors[screenId]);
        if (focusTarget && focusTarget.offsetParent !== null) { // Check if visible
             focusTarget.focus();
         } else {
             // Fallback: Focus the screen container itself (add tabindex="-1" to screen sections if needed)
             // Or focus the header title as a general fallback
             const screenElement = document.getElementById(screenId);
             if (screenElement) {
                 screenElement.setAttribute('tabindex', '-1'); // Make it focusable
                 screenElement.focus();
             } else {
                 dom.appHeaderTitle?.focus();
             }
         }
     }, 150); // Delay allows screen transition/rendering

    // Scroll to top after navigation (except initial load)
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
     safeAddEventListener(systemThemeMediaQuery, 'change', handleSystemThemeChange); // Listen for OS theme changes
}

/** アプリケーションの各画面要素に固有のイベントリスナーを設定 */
function setupScreenEventListeners() {
    // Header & Nav
    safeAddEventListener(dom.appHeaderTitle, 'click', navigateToHome); // Click title to go home
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
    safeAddEventListener(dom.deckList, 'click', handleDeckListClick); // Use event delegation
    safeAddEventListener(dom.deckList, 'keydown', handleDeckListKeydown); // For keyboard navigation
     safeAddEventListener(dom.deckListPagination, 'click', handleDeckPaginationClick); // Delegation
     safeAddEventListener(dom.resetHistoryButton, 'click', handleResetHistoryClick);
    safeAddEventListener(dom.startStudyButton, 'click', startStudy);
    if (dom.studyFilterRadios) { // Add listener to each radio button
        dom.studyFilterRadios.forEach(radio => safeAddEventListener(radio, 'change', handleStudyFilterChange));
    }

    // --- Study Screen ---
     safeAddEventListener(dom.optionsButtonsContainer, 'click', handleOptionButtonClick); // Delegation
    safeAddEventListener(dom.quitStudyHeaderButton, 'click', () => confirmQuitStudy(true)); // Show confirmation
    safeAddEventListener(dom.retryButton, 'click', retryCurrentQuestion);
    if (dom.evalButtons) { // Add listener to each evaluation button
        dom.evalButtons.forEach(button => safeAddEventListener(button, 'click', handleEvaluation));
    }
     safeAddEventListener(dom.backToHomeButton, 'click', navigateToHome); // Button on completion screen

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
    safeAddEventListener(dom.questionAccuracyList, 'click', handleQuestionItemClick); // For details
    safeAddEventListener(dom.questionAccuracyList, 'keydown', handleQuestionItemKeydown);
    safeAddEventListener(dom.questionPagination, 'click', handleDashboardPaginationClick);

    // --- Settings Screen ---
     safeAddEventListener(dom.settingShuffleOptions, 'change', () => setSettingsUnsavedStatus(true));
     // Use named function for event listener removal if needed, or just rely on save
     safeAddEventListener(dom.settingLowAccuracyThreshold, 'input', debounce(handleSettingThresholdInput, MIN_DEBOUNCE_DELAY));
     safeAddEventListener(dom.settingLowAccuracyThreshold, 'change', handleSettingThresholdChange);
     safeAddEventListener(dom.settingHomeItemsPerPage, 'change', () => setSettingsUnsavedStatus(true));
     safeAddEventListener(dom.settingDashboardItemsPerPage, 'change', () => setSettingsUnsavedStatus(true));
     safeAddEventListener(dom.settingTheme, 'change', handleThemeSettingChange); // Handles preview + marks unsaved

     safeAddEventListener(dom.saveSettingsButton, 'click', saveSettings);
     safeAddEventListener(dom.exportDataButton, 'click', exportAllData);
     safeAddEventListener(dom.importDataInput, 'change', handleImportFileSelect);
     safeAddEventListener(dom.resetAllDataButton, 'click', handleResetAllDataClick);

    // --- AI Prompt Guide Screen ---
     safeAddEventListener(dom.promptFieldTopic, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
     safeAddEventListener(dom.promptFieldCount, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
     safeAddEventListener(dom.promptFieldLevel, 'input', debounce(updatePromptPlaceholders, DEBOUNCE_DELAY));
     safeAddEventListener(dom.copyPromptButton, 'click', copyPromptToClipboard);
     safeAddEventListener(dom.jsonCheckInput, 'input', debounce(handleJsonCheckInput, MIN_DEBOUNCE_DELAY));
     safeAddEventListener(dom.jsonCheckButton, 'click', checkJsonFormat);

    console.log("Screen event listeners setup complete.");
}

/**
 * 安全にイベントリスナーを追加するヘルパー関数
 * @param {EventTarget | null} element - 対象要素 (nullの可能性あり)
 * @param {string} event - イベント名
 * @param {EventListenerOrEventListenerObject} handler - ハンドラ関数
 * @param {boolean | AddEventListenerOptions} [options={}] - オプション
 */
function safeAddEventListener(element, event, handler, options = {}) {
    if (element && typeof element.addEventListener === 'function') {
        element.addEventListener(event, handler, options);
    } else {
        // Log only if the element was expected but not found during caching
        // Cache function already warns, so maybe keep this quiet unless debugging
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
        const context = this; // Capture the correct 'this' context
        const later = () => {
            timeout = null;
            func.apply(context, args); // Execute with original context and args
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
     // Clear previous timer if exists
     clearTimeout(resizeDebounceTimer);
     // Set a new timer
     resizeDebounceTimer = setTimeout(() => {
         console.log("Window resized - executing debounced actions.");
         toggleDashboardControlsBasedOnSize(); // Adjust layout based on size
     }, DEBOUNCE_DELAY); // Use standard debounce delay
}

/** グローバルなキーダウンイベントハンドラ (ESCでモーダル閉じるなど) */
function handleGlobalKeyDown(event) {
    // Close modal on ESC key press if modal is open
    if (event.key === 'Escape' && appState.isModalOpen) {
        console.log("ESC key pressed, attempting to close modal.");
        // Find the onClose callback associated with the currently open modal
        // This relies on the `closeModal` function correctly handling the callback passed to `showModal`
        // We don't have direct access to the original 'onClose' here easily.
        // The `dom.modalCloseButton.onclick` might hold it if set directly, but better to rely on `closeModal` internal logic.
        closeModal(); // closeModal should handle associated callback if any was provided during showModal
    }
    // Add other global keybindings here if needed (e.g., focus search bar)
}


// ====================================================================
// テーマ関連処理
// ====================================================================
/** テーマ切り替えボタンクリック時のハンドラ */
function toggleTheme() {
     const currentAppliedTheme = getCurrentAppliedTheme();
     // Cycle through themes: system -> light -> dark -> system ... (or light -> dark -> light if system isn't desired toggle target)
     // Let's keep it simple: toggle between light and dark directly
     const nextTheme = currentAppliedTheme === 'light' ? 'dark' : 'light';
     appState.settings.theme = nextTheme; // Update setting directly
     applyTheme(nextTheme); // Apply the new theme
     saveSettings(); // Save the updated theme setting immediately
     showNotification(`テーマを${nextTheme === 'light' ? 'ライト' : 'ダーク'}に変更しました`, 'info', 2000); // Short notification
}

/** 設定画面のテーマ選択変更時のハンドラ */
function handleThemeSettingChange(event) {
     const selectedTheme = event.target.value;
     // Apply the theme immediately for preview
     applyTheme(selectedTheme);
     // Mark settings as unsaved (save button required)
     setSettingsUnsavedStatus(true);
     // Optionally notify user to save
     showNotification("テーマ設定が変更されました。右下の「設定を保存」を押してください。", "info", 3000);
}

// ====================================================================
// ナビゲーションと画面共通処理
// ====================================================================
/** ヘッダータイトルクリックやホームボタンでホームに戻る */
function navigateToHome() {
     if (appState.isStudyActive) {
         // Confirm before quitting study to go home
         confirmQuitStudy(true, 'home-screen'); // Pass target screen
     } else {
         navigateToScreen('home-screen');
     }
}

/** ナビゲーションボタンクリック時のハンドラ */
function handleNavClick(event) {
    const targetButton = event.target.closest('.nav-button');
    if (!targetButton || targetButton.disabled) return; // Ignore disabled buttons
    const targetScreenId = targetButton.dataset.target;
    if (!targetScreenId) {
        console.error("Navigation button missing data-target attribute.");
        return;
    }

    // If currently in a study session and trying to navigate away
    if (appState.isStudyActive && targetScreenId !== 'study-screen') {
        confirmQuitStudy(true, targetScreenId); // Ask confirmation, pass target screen
    } else {
        // Otherwise, navigate directly
        navigateToScreen(targetScreenId);
    }
}

// ====================================================================
// ファイル操作 (JSON Deck Handling, Import/Export)
// ====================================================================

/** ファイル選択input変更時のハンドラ（新規デッキ読み込み） */
function handleFileSelect(event) {
    const fileInput = event.target;
    if (!fileInput) return;
    handleFileUpload(fileInput, processNewDeckFile, dom.loadStatus);
}

/** インポート用ファイル選択input変更時のハンドラ */
function handleImportFileSelect(event) {
     const fileInput = event.target;
     if (!fileInput) return;
     handleFileUpload(fileInput, processImportDataFile, dom.importStatus); // Use different status element
}

/** 共通ファイルアップロード処理 */
function handleFileUpload(fileInput, processFunction, statusElement = dom.loadStatus) {
    if (!fileInput.files || fileInput.files.length === 0) {
        updateStatusMessage(statusElement, "ファイルが選択されていません", "info");
        return;
    }
    const file = fileInput.files[0];

    // Reset file input value to allow selecting the same file again
    fileInput.value = '';

    updateStatusMessage(statusElement, "", "info"); // Clear previous message

    // Basic File Validation (Type and Size)
    if (!file.type.includes('json') && !file.name.toLowerCase().endsWith('.json')) {
        updateStatusMessage(statusElement, "エラー: JSONファイルを選択してください", "warning");
        showNotification('ファイル形式エラー: JSONファイルのみ読み込めます。', 'warning');
        return;
    }
     const maxSize = 10 * 1024 * 1024; // 10 MB limit
     if (file.size > maxSize) {
        updateStatusMessage(statusElement, `エラー: ファイルサイズ超過 (${(file.size / (1024*1024)).toFixed(1)}MB / 最大10MB)`, "warning");
        showNotification(`ファイルサイズが大きすぎます (最大 ${maxSize / (1024*1024)}MB)。`, 'warning');
        return;
    }

    updateStatusMessage(statusElement, `ファイル「${escapeHtml(file.name)}」を読み込み中...`, "info");
    updateLoadingOverlay(true, `ファイル (${escapeHtml(file.name)}) 処理中...`);

    const reader = new FileReader(); // Use a new reader instance each time for safety

    reader.onload = (e) => {
        const content = e.target?.result;
        // Process content after the current execution context finishes
        setTimeout(() => {
            try {
                 processFunction(content, file.name, statusElement);
            } catch(processError) {
                 console.error(`Error during file processing function for ${file.name}:`, processError);
                 updateStatusMessage(statusElement, `処理エラー: ${processError.message}`, "error");
                 showNotification(`ファイル「${escapeHtml(file.name)}」の処理中にエラーが発生しました。`, "error");
            } finally {
                updateLoadingOverlay(false);
                clearStatusMessageAfterDelay(statusElement, 5000); // Clear status message after a delay
            }
        }, 0);
    };
    reader.onerror = (e) => {
         console.error(`File reading error for ${file.name}:`, reader.error);
         updateStatusMessage(statusElement, `ファイル読み取りエラー: ${reader.error?.message || '不明なエラー'}`, "error");
         showNotification(`ファイル「${escapeHtml(file.name)}」の読み取り中にエラーが発生しました。`, "error");
         updateLoadingOverlay(false);
         clearStatusMessageAfterDelay(statusElement, 5000);
    };
     reader.onabort = () => {
         console.log(`File reading aborted for ${file.name}.`);
         updateStatusMessage(statusElement, "読み込みが中断されました", "info");
         updateLoadingOverlay(false);
         clearStatusMessageAfterDelay(statusElement, 5000);
     };

    reader.readAsText(file); // Start reading the file
}

/** 読み込んだ新規デッキJSONファイルを処理 */
function processNewDeckFile(content, fileName, statusElement) {
    let newDeckId = null; // Keep track of potentially added deck ID for rollback
    try {
        if (typeof content !== 'string' || content.trim() === '') {
             throw new Error("ファイル内容が空または無効です。");
        }
        let data;
        try {
             data = JSON.parse(content);
        } catch (parseError) {
            // Provide more specific JSON parsing error feedback
             throw new Error(`JSON解析失敗: ${parseError.message}. ファイル形式を確認してください。`);
        }

        // Validate the structure of the parsed JSON data
        const validationResult = validateDeckJsonData(data);
        if (!validationResult.isValid) {
            // Use the specific validation message
            throw new Error(`JSON形式エラー: ${validationResult.message}`);
        }
        if (!validationResult.questions || validationResult.questions.length === 0) {
             // Handle case where JSON is valid but contains no questions
             throw new Error("JSONファイル内に有効な問題が見つかりませんでした。");
        }

        // Create and add the new deck
        let baseName = fileName.replace(/\.json$/i, ''); // Remove .json extension
        const newDeck = createNewDeck(baseName, validationResult.questions); // Creates deck and adds to appState.allDecks
        newDeckId = newDeck.id;

        // Save the updated decks collection to LocalStorage
        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
            // If saving fails, attempt to rollback the state change
            delete appState.allDecks[newDeckId];
            throw new Error("デッキデータの保存に失敗しました。LocalStorageの容量を確認してください。");
        }

        // Success feedback
        console.log("New deck added:", newDeck);
        updateStatusMessage(statusElement, `成功: 「${escapeHtml(newDeck.name)}」(${newDeck.questions.length}問) を追加しました。`, "success");
        showNotification(`問題集「${escapeHtml(newDeck.name)}」(${newDeck.questions.length}問) を追加しました。`, 'success');

        // Update UI elements
         updateHomeUI(true); // Force update home screen UI immediately
        populateDashboardDeckSelect(); // Update dashboard dropdown
         selectDeck(newDeckId); // Automatically select the newly added deck

    } catch (error) {
        console.error(`Error processing new deck file "${fileName}":`, error);
        updateStatusMessage(statusElement, `エラー: ${error.message}`, "error");
        showNotification(`ファイル処理エラー: ${error.message}`, 'error', 8000); // Show error longer
        // Attempt rollback if deck was added to state but save failed
        if (newDeckId && appState.allDecks[newDeckId] && !localStorage.getItem(LS_KEYS.DECKS)?.includes(newDeckId)) {
             console.log(`Rolling back state for deck ${newDeckId} due to save failure.`);
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
        return { isValid: false, message: "データがJSON配列形式ではありません。", questions: null };
    }
    if (data.length === 0) {
         // Empty array is technically valid JSON, but maybe not useful as a deck
         console.log("Validated empty deck JSON data (no questions).");
        return { isValid: true, message: "JSON配列は空ですが、形式は有効です。", questions: [] };
    }

    const validatedQuestions = [];
    const errors = []; // Collect specific errors

    for (let i = 0; i < data.length; i++) {
        const qData = data[i];
        const validatedQ = repairAndValidateQuestion(qData, 'import-check', i);

        if (!validatedQ) {
             // repairAndValidateQuestion logs specific issues, add general error here
             errors.push(`問題 ${i + 1}: データ構造が無効です (詳細はコンソールログ参照)。`);
             // Continue checking other questions? Or stop on first error? Stop for now.
             return { isValid: false, message: errors.join(' '), questions: null };
        }

        // Extract only necessary fields for creating a new deck question
        // Exclude history and potentially repaired ID from the source file
        validatedQuestions.push({
            question: validatedQ.question,
            options: validatedQ.options,
            correctAnswer: validatedQ.correctAnswer,
            explanation: validatedQ.explanation,
        });
    }

    if (errors.length > 0) {
         return { isValid: false, message: errors.join(' '), questions: null };
    }

    return { isValid: true, message: `データは有効です (${validatedQuestions.length}問)。`, questions: validatedQuestions };
}

/** 新しいデッキオブジェクトを作成し、状態に追加 */
function createNewDeck(baseName, questionsData) {
    let deckName = generateUniqueDeckName(baseName);
    const deckId = generateUUID('deck');

    const newDeck = {
        id: deckId,
        name: deckName,
        questions: questionsData.map((q, index) => ({ // Map validated data to internal QuestionData format
            id: generateUUID(`q_${deckId}_${index}`), // Generate unique app-internal ID
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            history: [] // Always initialize with empty history
        })),
        lastStudied: null,
        totalCorrect: 0, // Initialize stats
        totalIncorrect: 0,
        sessionHistory: [] // Initialize session history
    };

    // Add the new deck to the application state
    appState.allDecks[deckId] = newDeck;
    return newDeck;
}

/** デッキ名が衝突しないように調整 */
function generateUniqueDeckName(baseName) {
    let deckName = (baseName || '無名の問題集').trim();
    if (!deckName) deckName = '無名の問題集'; // Handle cases where trim results in empty string

    const lowerCaseName = deckName.toLowerCase();
    // Check if a deck with the same name (case-insensitive) already exists
    if (!Object.values(appState.allDecks).some(d => d.name.toLowerCase() === lowerCaseName)) {
        return deckName; // Name is unique, return as is
    }

    // Name collision detected, append counter
    let counter = 2;
    let lowerCaseAttempt;
    let uniqueNameFound = false;
    let potentialName;

    while (!uniqueNameFound) {
        potentialName = `${deckName} (${counter})`;
        lowerCaseAttempt = potentialName.toLowerCase();
        if (!Object.values(appState.allDecks).some(d => d.name.toLowerCase() === lowerCaseAttempt)) {
            uniqueNameFound = true;
            deckName = potentialName;
        } else {
            counter++;
            if (counter > 100) { // Safety break to prevent infinite loop in extreme cases
                console.warn("Could not generate unique deck name after 100 attempts, adding timestamp.");
                deckName = `${deckName}_${Date.now()}`;
                uniqueNameFound = true;
            }
        }
    }
    return deckName;
}

/** 全データのエクスポート処理 */
function exportAllData() {
    try {
        updateLoadingOverlay(true, "データエクスポート準備中...");

        // Create the data object to be exported
        const exportData = {
            appVersion: appState.appVersion,
            exportTimestamp: Date.now(),
            settings: appState.settings,
            allDecks: appState.allDecks,
            currentDeckId: appState.currentDeckId,
        };

        // Stringify the data with pretty printing (null, 2)
        const jsonData = JSON.stringify(exportData, null, 2);
        // Create a Blob with UTF-8 encoding specified
        const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        // Create a temporary link element for download
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        link.download = `ai-study-app-data_v${appState.appVersion}_${timestamp}.json`;
        link.href = url;
        link.style.display = 'none'; // Hide the link

        // Append, click, and remove the link
        document.body.appendChild(link);
        link.click();

        // Clean up after a short delay to ensure download starts
        setTimeout(() => {
             document.body.removeChild(link);
             URL.revokeObjectURL(url); // Release object URL resources
             updateLoadingOverlay(false);
             showNotification("全データをエクスポートしました。", "success");
             console.log("Data exported successfully.");
        }, 150); // Increased delay slightly

    } catch (error) {
        console.error("Error exporting data:", error);
        showNotification(`データのエクスポート中にエラーが発生しました: ${error.message}`, "error");
        updateLoadingOverlay(false);
    }
}

/** インポートされたデータファイルを処理 */
function processImportDataFile(content, fileName, statusElement) {
    try {
        if (typeof content !== 'string' || content.trim() === '') {
            throw new Error("インポートファイルの内容が空または無効です。");
        }
        let data;
        try {
             data = JSON.parse(content);
        } catch (parseError) {
            throw new Error(`JSON解析失敗: ${parseError.message}. ファイル形式を確認してください。`);
        }

        // Basic validation of the imported structure
        if (typeof data !== 'object' || data === null || typeof data.allDecks !== 'object' || typeof data.settings !== 'object') {
             throw new Error("インポートファイル形式が不正です。'allDecks' と 'settings' キーが必要です。");
        }
        // Optional: Check appVersion compatibility?
        if (data.appVersion && data.appVersion !== appState.appVersion) {
             console.warn(`Importing data from a different app version (File: ${data.appVersion}, Current: ${appState.appVersion}). Compatibility issues may arise.`);
             // Could show a warning in the modal here too.
        }

         // Show modal to choose import mode (Replace or Merge)
         showModal({
            title: 'データのインポートモード選択',
            content: `<p>ファイル「<strong>${escapeHtml(fileName)}</strong>」をインポートします。(バージョン: ${data.appVersion || '不明'})</p>
                        <p>インポートモードを選択してください:</p>
                        <ul style="list-style: none; padding-left: 0;">
                            <li style="margin-bottom: 10px;"><strong><i class="fas fa-exchange-alt"></i> 全置換:</strong> 現在の全てのデータ (問題集・設定) を削除し、ファイルの内容で完全に置き換えます。<span style="color:var(--danger-color); font-weight:bold;">(元に戻せません)</span></li>
                            <li><strong><i class="fas fa-code-merge"></i> マージ:</strong> ファイル内の問題集を現在のデータに追加または上書きします。設定もファイルの内容で更新されます。</li>
                        </ul>`,
            buttons: [
                { id: 'import-replace', text: '<i class="fas fa-exclamation-triangle"></i> 全置換', class: 'danger', onClick: () => {
                    closeModal(); // Close selection modal first
                    // Add another confirmation for destructive replace action using prompt
                    const confirmation = prompt(`警告！ 全データ置換を実行します。\n現在のデータは完全に失われ、元に戻すことはできません。\n\n続行するには、大文字で「REPLACE」と入力してください:`);
                    if (confirmation === "REPLACE") {
                        updateLoadingOverlay(true, `データ置換中...`);
                         // Use setTimeout to allow UI update before potentially long operation
                         setTimeout(() => {
                            replaceDataFromImport(data, statusElement); // Perform replacement
                             updateLoadingOverlay(false);
                        }, 50);
                    } else {
                        showNotification("置換インポートがキャンセルされました。", "info");
                        updateStatusMessage(statusElement, "置換キャンセル", "info");
                        clearStatusMessageAfterDelay(statusElement);
                    }
                }},
                { id: 'import-merge', text: '<i class="fas fa-code-merge"></i> マージ', class: 'primary', onClick: () => {
                     closeModal();
                     updateLoadingOverlay(true, `データマージ中...`);
                      setTimeout(() => {
                          mergeDataFromImport(data, statusElement); // Perform merge
                           updateLoadingOverlay(false);
                     }, 50);
                }},
                { id: 'import-cancel', text: 'キャンセル', class: 'secondary', onClick: () => {
                     closeModal();
                     showNotification("インポートがキャンセルされました。", "info");
                     updateStatusMessage(statusElement, "キャンセル", "info");
                     clearStatusMessageAfterDelay(statusElement);
                }}
            ],
            size: 'lg' // Use large modal for more text
         });

    } catch (error) {
        console.error(`Error processing import file "${fileName}":`, error);
        updateStatusMessage(statusElement, `エラー: ${error.message}`, "error");
        showNotification(`インポート処理エラー: ${error.message}`, 'error', 8000);
        updateLoadingOverlay(false); // Ensure overlay is hidden on error
    }
}


/** インポートデータで全置換 */
function replaceDataFromImport(importedData, statusElement) {
    try {
        console.log("Starting replace import. Validating imported data...");
        // Validate and repair the imported data first
        const repairedSettings = repairAndValidateSettings(importedData.settings);
        const repairedDecks = repairAndValidateAllDecks(importedData.allDecks);
        const importedCurrentDeckId = (typeof importedData.currentDeckId === 'string' && repairedDecks[importedData.currentDeckId])
            ? importedData.currentDeckId
            : null; // Validate imported currentDeckId

        console.log(`Validation complete. Settings: ${Object.keys(repairedSettings).length} keys. Decks: ${Object.keys(repairedDecks).length}. Current Deck ID: ${importedCurrentDeckId}`);

        // Apply imported data to application state
        appState.settings = repairedSettings;
        appState.allDecks = repairedDecks;
        appState.currentDeckId = importedCurrentDeckId;
        // If imported currentDeckId was invalid, try selecting the first available deck
        if (appState.currentDeckId === null && Object.keys(repairedDecks).length > 0) {
            appState.currentDeckId = Object.keys(repairedDecks)[0]; // Select first deck as fallback
            console.log(`Imported currentDeckId was invalid or null, selected first available deck: ${appState.currentDeckId}`);
        }
        appState.currentDashboardDeckId = appState.currentDeckId; // Sync dashboard selection

        // --- Save Replaced Data to LocalStorage ---
         console.log("Saving replaced data to LocalStorage...");
        let saveSuccess = true;
         saveSuccess &&= saveData(LS_KEYS.SETTINGS, appState.settings);
         saveSuccess &&= saveData(LS_KEYS.DECKS, appState.allDecks);
         saveSuccess &&= saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId);
         saveSuccess &&= saveData(LS_KEYS.LAST_SCREEN, 'home-screen'); // Reset last screen to home after replace

        if (!saveSuccess) {
            // This is a critical failure state. Attempting rollback is complex and might fail.
            // The safest approach might be to clear local storage entirely and notify the user to reload.
             console.error("CRITICAL: Failed to save replaced data after import. Clearing LocalStorage to prevent inconsistent state.");
             localStorage.clear(); // Drastic measure
             throw new Error("置換データの保存に失敗しました。アプリの状態が不安定になるのを防ぐため、全データをクリアしました。ページを再読み込みしてください。");
        }

        // --- Refresh UI Post-Save ---
         console.log("Data replaced and saved. Refreshing UI...");
         applyTheme(appState.settings.theme);
         applyInitialSettingsToUI(); // Re-apply all settings to UI elements
         updateHomeUI(true); // Force home screen refresh
        populateDashboardDeckSelect(); // Refresh dashboard dropdown
        resetDashboardFiltersAndState(true); // Reset dashboard state
        if(appState.activeScreen === 'dashboard-screen') renderDashboard(); // Refresh dashboard if visible

         // Navigate to home screen after successful replace
         navigateToScreen('home-screen', true); // Force navigation

         updateStatusMessage(statusElement, `置換インポート成功 (${Object.keys(appState.allDecks).length}デッキ)`, "success");
        showNotification("データをファイルの内容で完全に置き換えました。", "success");

    } catch (error) {
        console.error("Error during replace import:", error);
         updateStatusMessage(statusElement, `置換エラー: ${error.message}`, "error");
        showNotification(`置換インポートエラー: ${error.message}`, 'error', 10000);
         // Suggest reload if an error occurred, as state might be inconsistent
         showNotification("エラー発生。アプリの状態が不安定な可能性があります。ページを再読み込みすることを推奨します。", "warning", 10000);
    }
}


/** インポートデータでマージ */
function mergeDataFromImport(importedData, statusElement) {
     let addedCount = 0;
     let updatedCount = 0;
     const originalDecks = JSON.parse(JSON.stringify(appState.allDecks)); // Deep copy for potential rollback
     const originalSettings = { ...appState.settings };
     const originalCurrentDeckId = appState.currentDeckId;

     try {
         console.log("Starting merge import. Validating imported data...");
        // Validate imported decks and settings
        const validImportedDecks = repairAndValidateAllDecks(importedData.allDecks || {});
        const validImportedSettings = repairAndValidateSettings(importedData.settings); // Use validated settings

        if (Object.keys(validImportedDecks).length === 0) {
             // No decks to merge, but settings might still be updated
             console.log("No valid decks found in import file to merge.");
             // Proceed to update settings only
        } else {
             // Merge decks: Add new or overwrite existing based on ID
            for (const deckId in validImportedDecks) {
                 if (Object.hasOwnProperty.call(validImportedDecks, deckId)) {
                     if (appState.allDecks[deckId]) {
                         updatedCount++;
                         console.log(`Merging: Updating deck "${validImportedDecks[deckId].name}" (ID: ${deckId})`);
                     } else {
                         addedCount++;
                         console.log(`Merging: Adding new deck "${validImportedDecks[deckId].name}" (ID: ${deckId})`);
                     }
                     appState.allDecks[deckId] = validImportedDecks[deckId]; // Add or overwrite
                 }
             }
             console.log(`Deck merge summary: Added ${addedCount}, Updated ${updatedCount}`);
         }

         // Merge settings: Overwrite current settings with the validated imported settings
         console.log("Merging settings...");
         appState.settings = validImportedSettings;
         console.log("Settings merged:", appState.settings);

        // Validate/Update currentDeckId after merge
        const importedCurrentDeckId = importedData.currentDeckId;
        if (appState.currentDeckId !== null && !appState.allDecks[appState.currentDeckId]) {
             // The currently selected deck was removed or overwritten by the merge.
             console.warn(`Current deck (ID: ${appState.currentDeckId}) is no longer valid after merge.`);
             // Try using the currentDeckId from the imported file if it's now valid
             if (importedCurrentDeckId && appState.allDecks[importedCurrentDeckId]) {
                 appState.currentDeckId = importedCurrentDeckId;
                 console.log(`Setting current deck to imported selection: ${appState.currentDeckId}`);
             } else {
                 appState.currentDeckId = null; // Fallback to no selection
                 console.log("Imported currentDeckId is also invalid or null. Resetting current deck.");
             }
        } else if (appState.currentDeckId === null && importedCurrentDeckId && appState.allDecks[importedCurrentDeckId]) {
             // If no deck was selected before, use the imported selection if valid
             appState.currentDeckId = importedCurrentDeckId;
             console.log(`Setting current deck to imported selection: ${appState.currentDeckId}`);
        }
         appState.currentDashboardDeckId = appState.currentDeckId; // Sync dashboard selection

        // --- Save Merged Data ---
        console.log("Saving merged data...");
        let saveSuccess = true;
         saveSuccess &&= saveData(LS_KEYS.SETTINGS, appState.settings);
         saveSuccess &&= saveData(LS_KEYS.DECKS, appState.allDecks);
         saveSuccess &&= saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId);

         if (!saveSuccess) {
            // Rollback state on save failure
             console.error("Failed to save merged data. Rolling back changes.");
             appState.allDecks = originalDecks;
             appState.settings = originalSettings;
             appState.currentDeckId = originalCurrentDeckId;
             appState.currentDashboardDeckId = originalCurrentDeckId;
             throw new Error("マージデータの保存に失敗しました。変更は取り消されました。");
        }

        // --- Refresh UI Post-Save ---
        console.log("Data merged and saved. Refreshing UI...");
        applyTheme(appState.settings.theme);
        applyInitialSettingsToUI(); // Re-apply settings
        updateHomeUI(true); // Force refresh home
        populateDashboardDeckSelect(); // Refresh dashboard dropdown
        if (appState.activeScreen === 'dashboard-screen') renderDashboard(); // Refresh dashboard if open


         updateStatusMessage(statusElement, `マージ成功 (追加 ${addedCount}, 更新 ${updatedCount} デッキ)`, "success");
        showNotification(`データをマージしました (追加 ${addedCount}, 更新 ${updatedCount})。設定も更新されました。`, "success");

     } catch (error) {
         console.error("Error during merge import:", error);
         updateStatusMessage(statusElement, `マージエラー: ${error.message}`, "error");
         showNotification(`マージインポートエラー: ${error.message}`, 'error', 10000);
         // Attempt to restore original state after error
         appState.allDecks = originalDecks;
         appState.settings = originalSettings;
         appState.currentDeckId = originalCurrentDeckId;
         appState.currentDashboardDeckId = originalCurrentDeckId;
         console.log("Rolled back state due to merge error.");
         // Refresh UI to reflect rollback? Might be complex. A reload might be safer.
          showNotification("エラー発生。アプリの状態が不安定な可能性があります。ページを再読み込みすることを推奨します。", "warning", 10000);
     }
}

/** アプリの全データを削除 */
function handleResetAllDataClick() {
     showModal({
        title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 全データ削除の最終確認`,
        content: `<p><strong>警告！ この操作は絶対に元に戻せません。</strong></p>
                    <p>すべての問題集、学習履歴、設定が完全に削除されます。続行する前に、必要であれば設定画面からデータをエクスポートしてください。</p>
                   <hr>
                    <label for="delete-confirm-input">削除を確認するには、<strong>DELETE ALL DATA</strong> と入力してください:</label>
                    <input type="text" id="delete-confirm-input" class="confirm-input" style="width: 100%; margin-top: 5px;" placeholder="DELETE ALL DATA" aria-describedby="delete-confirm-error">
                   <p id="delete-confirm-error" class="status-message error" style="display:none; margin-top: 5px;" aria-live="assertive"></p>`, // aria-live for error
        buttons: [
            { id: 'confirm-delete-all-btn', text: '<i class="fas fa-trash-alt"></i> 全て削除する', class: 'danger', onClick: deleteAllDataConfirmed }, // Calls confirmation logic
            { id: 'cancel-delete-all-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
        ],
        size: 'md',
         onClose: () => { // Clean up event listener when modal closes regardless of how
             const confirmInput = document.getElementById('delete-confirm-input');
             if(confirmInput) confirmInput.removeEventListener('input', clearResetError);
         }
    });
     // Add listener to clear error message on input change & focus input
     const confirmInput = document.getElementById('delete-confirm-input');
     safeAddEventListener(confirmInput, 'input', clearResetError);
     setTimeout(() => confirmInput?.focus(), 100);
}

/** 全データ削除を最終確認（テキスト入力）後、実行 */
function deleteAllDataConfirmed() {
     const confirmInput = document.getElementById('delete-confirm-input');
     const errorMsg = document.getElementById('delete-confirm-error');
     if (!confirmInput || !errorMsg) return;

     if (confirmInput.value.trim() !== "DELETE ALL DATA") {
         errorMsg.textContent = "入力が一致しません。「DELETE ALL DATA」と正確に入力してください。";
         errorMsg.style.display = 'block';
         confirmInput.focus();
         confirmInput.select(); // Select text for easy retyping
         return;
     }

    // --- Proceed with deletion ---
     closeModal(); // Close confirm modal
     console.warn("Initiating FULL data reset!");
    updateLoadingOverlay(true, "全データを削除中...");

    try {
         // Clear all relevant LocalStorage keys
         const keysToRemove = Object.values(LS_KEYS);
         keysToRemove.forEach(key => localStorage.removeItem(key));
         console.log("Removed app data from LocalStorage keys:", keysToRemove.join(', '));
          // Optionally clear other related keys if any

         // Reset appState completely to defaults
         appState.allDecks = {};
         appState.settings = { ...DEFAULT_SETTINGS };
         appState.currentDeckId = null;
         appState.currentDashboardDeckId = null;
         resetStudyState(); // Reset any active study state
         resetDashboardFiltersAndState(true); // Reset dashboard state
         appState.homeDeckCurrentPage = 1;
         appState.homeDeckFilterQuery = '';
         appState.homeDeckSortOrder = 'lastStudiedDesc';
         appState.studyFilter = 'all';

         // --- Refresh UI to reflect the reset state ---
         console.log("Resetting UI...");
         applyTheme(appState.settings.theme); // Apply default/system theme
         applyInitialSettingsToUI(); // Apply default settings to UI elements
         updateHomeUI(true); // Force home screen refresh (will show empty state)
        populateDashboardDeckSelect(); // Refresh dashboard dropdown (will be empty)
         navigateToScreen('home-screen', true); // Go home forcefully

        console.log("All application data has been reset from LocalStorage and state.");
        showNotification("すべてのアプリデータが削除されました。", "success");

    } catch (error) {
        console.error("Error during full data reset:", error);
        showNotification(`データ削除中にエラーが発生しました: ${error.message}`, "error");
        // State might be inconsistent here, suggest reload
         showNotification("エラー発生。アプリの状態が不安定な可能性があります。ページを再読み込みすることを推奨します。", "warning", 10000);
    } finally {
        updateLoadingOverlay(false);
    }
}


/** 履歴リセット確認モーダルのエラーメッセージをクリア */
function clearResetError(){
     const errorMsg = document.getElementById('reset-confirm-error'); // Used by both delete and reset modals if ID is reused
     if (errorMsg) {
         errorMsg.style.display = 'none';
         errorMsg.textContent = '';
     }
     const deleteErrorMsg = document.getElementById('delete-confirm-error'); // Specific ID for delete modal
     if (deleteErrorMsg) {
          deleteErrorMsg.style.display = 'none';
          deleteErrorMsg.textContent = '';
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
        // Apply class based on type for styling
        element.className = `status-message ${type}`;
        // Ensure aria-live based on severity for screen readers
        element.setAttribute('aria-live', (type === 'error' || type === 'warning') ? 'assertive' : 'polite');
        // Make visible if message is not empty
        element.style.display = message ? 'inline-block' : 'none';
    }
}

/**
 * ステータスメッセージを一定時間後にクリアするタイマーIDを管理
 * @type {Object<string, number>}
 */
const statusClearTimers = {};

/**
 * ステータスメッセージを一定時間後にクリアする
 * @param {HTMLElement | null} element - 対象要素 (IDが必要)
 * @param {number} delay - 遅延時間 (ms)
 */
function clearStatusMessageAfterDelay(element, delay = 5000) {
    if (element && element.id) {
        const timerId = element.id; // Use element ID as timer key
        // Clear existing timer for this element, if any
        clearTimeout(statusClearTimers[timerId]);

        // Set a new timer
        statusClearTimers[timerId] = setTimeout(() => {
            // Check if the element still exists and doesn't contain an error/warning
            const currentElement = document.getElementById(element.id);
            if (currentElement && !currentElement.classList.contains('error') && !currentElement.classList.contains('warning')) {
                updateStatusMessage(currentElement, '', 'info'); // Clear the message
            }
            delete statusClearTimers[timerId]; // Remove timer ID reference
        }, delay);
    }
}

// ====================================================================
// ホーム画面関連処理 (Home Screen)
// ====================================================================

/** ホーム画面全体のUIを更新 */
function updateHomeUI(forceUpdate = false) {
     // Only update if the home screen is active or forceUpdate is true
     if (!forceUpdate && appState.activeScreen !== 'home-screen') return;

     updateDeckListControlsVisibility(); // Show/hide search & sort
     updateFilteredDeckList(); // Render the deck list and pagination
     updateTopScreenDisplay(); // Update current deck info, filter options, buttons
     console.log("Home UI updated.");
}

/** デッキリストのコントロール（検索・ソート）表示/非表示を切り替え */
function updateDeckListControlsVisibility() {
     const deckCount = Object.keys(appState.allDecks).length;
     // Show controls if there is at least one deck
     const showControls = deckCount > 0;
     safeSetStyle(dom.deckListControls, 'display', showControls ? 'flex' : 'none');

     // Also hide pagination if controls are hidden (implies no decks)
      if (!showControls) {
           safeSetStyle(dom.deckListPagination, 'display', 'none');
     }
}

/** デッキリストの検索入力ハンドラ */
function handleDeckSearchInput(event) {
     appState.homeDeckFilterQuery = event.target.value;
     appState.homeDeckCurrentPage = 1; // Reset to first page on new search
     updateFilteredDeckList(); // Update the list based on the new query
}

/** デッキリストのソート順変更ハンドラ */
function handleDeckSortChange(event) {
    appState.homeDeckSortOrder = event.target.value;
    appState.homeDeckCurrentPage = 1; // Reset to first page on sort change
    updateFilteredDeckList(); // Update the list with the new sort order
}

/** フィルタリングとソートを適用したデッキリストを取得 */
function getFilteredAndSortedDecks() {
    let decks = Object.values(appState.allDecks);
    const query = appState.homeDeckFilterQuery.toLowerCase().trim();

    // Apply Search Filter
    if (query) {
        try {
             // Basic case-insensitive search by name
             decks = decks.filter(deck => (deck.name || '').toLowerCase().includes(query));
             // For regex support (be careful with user input):
             // const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
             // decks = decks.filter(deck => regex.test(deck.name));
         } catch(e) {
             console.error("Deck search error (query likely invalid regex):", e);
             // Fallback to basic includes search on error
             decks = decks.filter(deck => (deck.name || '').toLowerCase().includes(query));
         }
    }

    // Apply Sorting
    decks.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        const countA = a.questions?.length || 0;
        const countB = b.questions?.length || 0;
        const studiedA = a.lastStudied || 0; // Treat null as 0 for sorting
        const studiedB = b.lastStudied || 0;

        switch (appState.homeDeckSortOrder) {
            case 'nameAsc': return nameA.localeCompare(nameB, 'ja'); // Japanese locale sort
            case 'nameDesc': return nameB.localeCompare(nameA, 'ja');
            case 'questionCountAsc': return countA - countB || nameA.localeCompare(nameB, 'ja'); // Secondary sort by name
            case 'questionCountDesc': return countB - countA || nameA.localeCompare(nameB, 'ja');
            case 'lastStudiedDesc': // Default sort
            default:
                // Sort by lastStudied descending (most recent first)
                // If timestamps are equal (or both 0/null), sort by name ascending
                return studiedB - studiedA || nameA.localeCompare(nameB, 'ja');
        }
    });

    return decks;
}

/** ホーム画面のデッキリストとページネーションを更新 */
function updateFilteredDeckList() {
     const filteredDecks = getFilteredAndSortedDecks();
     const totalDecks = filteredDecks.length;
     const decksPerPage = appState.settings.homeDecksPerPage || DEFAULT_SETTINGS.homeDecksPerPage;
     const totalPages = Math.ceil(totalDecks / decksPerPage) || 1; // Ensure totalPages is at least 1

     // Ensure currentPage is within valid range
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
     dom.deckList.innerHTML = ''; // Clear previous list
     dom.deckList.scrollTop = 0; // Scroll list to top

     if (decks.length === 0) {
         const message = appState.homeDeckFilterQuery
             ? `検索語「${escapeHtml(appState.homeDeckFilterQuery)}」に一致する問題集はありません。`
             : (Object.keys(appState.allDecks).length === 0
                  ? '問題集がありません。<br>「新規問題集(JSON)を読み込む」からファイルを追加してください。'
                  : '表示する問題集がありません。検索条件を確認してください。');
         dom.deckList.innerHTML = `<li class="no-decks-message">${message}</li>`;
         return;
     }

     const fragment = document.createDocumentFragment();
     decks.forEach(deck => {
         const li = document.createElement('li');
         li.dataset.deckId = deck.id;
         li.tabIndex = 0; // Make list items focusable
         li.setAttribute('role', 'button'); // Semantics for keyboard interaction
         li.setAttribute('aria-label', `問題集 ${escapeHtml(deck.name || '名称未設定')} を選択`);
         const isActive = deck.id === appState.currentDeckId;
         li.classList.toggle('active-deck', isActive);
         li.setAttribute('aria-selected', String(isActive)); // Indicate selection state

         // Deck Info Part
         const infoDiv = document.createElement('div');
         infoDiv.className = 'deck-info';

         const nameSpan = document.createElement('span');
         nameSpan.className = 'deck-name';
         nameSpan.textContent = `${escapeHtml(deck.name || '名称未設定')} (${deck.questions?.length || 0}問)`;

         const historySpan = document.createElement('span');
         historySpan.className = 'deck-history';
         const { accuracyText } = calculateOverallAccuracy(deck); // Calculate actual accuracy
         const lastStudiedText = deck.lastStudied ? `最終学習: ${formatDate(deck.lastStudied)}` : '未学習';
         historySpan.textContent = `${lastStudiedText} / 正答率: ${accuracyText}`;
         infoDiv.appendChild(nameSpan);
         infoDiv.appendChild(historySpan);

         // Deck Actions Part
         const actionsDiv = document.createElement('div');
         actionsDiv.className = 'deck-actions no-print';

         const selectBtn = createButton({
             text: '<i class="fas fa-check-circle" aria-hidden="true"></i> 選択',
             class: `small ${isActive ? 'secondary' : 'primary'} select-deck`, // Use primary if not active
             ariaLabel: `問題集 ${escapeHtml(deck.name || '名称未設定')} を選択`,
             data: { 'deckId': deck.id },
             disabled: isActive, // Disable select if already active
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
     // Use the generic pagination renderer
     renderGenericPagination(
         dom.deckListPagination,
         totalItems,
         totalPages,
         currentPage,
         'deck-page-nav' // Unique prefix for aria-label
     );
}

/** ホーム画面のデッキリストページ遷移ハンドラ */
function handleDeckPaginationClick(event) {
     const targetPage = getPageFromPaginationClick(event, 'deck-page-nav'); // Use specific prefix
     if (targetPage !== null && targetPage !== appState.homeDeckCurrentPage) {
         console.log(`Navigating deck list to page ${targetPage}`);
         appState.homeDeckCurrentPage = targetPage;
         updateFilteredDeckList();
         // Optionally focus the list after pagination
         dom.deckList?.focus();
     }
}

/** ホーム画面の「現在の問題集」情報とフィルター関連を更新 */
function updateTopScreenDisplay() {
    const deckSelected = !!appState.currentDeckId && !!appState.allDecks[appState.currentDeckId];
    const currentDeck = deckSelected ? appState.allDecks[appState.currentDeckId] : null;

    // Update Current Deck Info section
    safeSetText(dom.currentDeckName, currentDeck ? escapeHtml(currentDeck.name || '名称未設定') : '未選択');
    safeSetText(dom.totalQuestions, currentDeck ? (currentDeck.questions?.length ?? 0).toString() : '0');
    safeSetText(dom.currentDeckLastStudied, currentDeck?.lastStudied ? formatDate(currentDeck.lastStudied) : '-');

    // Calculate and display overall accuracy
    const { accuracyText } = calculateOverallAccuracy(currentDeck);
    safeSetText(dom.currentDeckAccuracy, accuracyText);

    // Show/hide study filter options based on deck selection
    safeSetStyle(dom.studyFilterOptions, 'display', deckSelected ? 'block' : 'none');
    // Update threshold display in filter label
    safeSetText(dom.lowAccuracyThresholdDisplayFilter, appState.settings.lowAccuracyThreshold);

    // Update state of Reset History and Start Study buttons
    updateHomeActionButtonsState(currentDeck);

    // Update filter counts (debounced for performance)
     clearTimeout(filterCountDebounceTimer);
     filterCountDebounceTimer = setTimeout(() => {
         if(appState.activeScreen === 'home-screen') { // Only update if still on home screen
             updateAllFilterCounts();
         }
     }, MIN_DEBOUNCE_DELAY);
}

/** ホーム画面のアクションボタン（開始、リセット）の状態を更新 */
function updateHomeActionButtonsState(currentDeck) {
     // Reset History Button State
     if (dom.resetHistoryButton) {
         // Check if the current deck has any history to reset
        let hasHistory = currentDeck && (
            (currentDeck.lastStudied !== null) ||
            // (currentDeck.totalCorrect > 0) || // V3: Recalculated
            // (currentDeck.totalIncorrect > 0) || // V3: Recalculated
            (currentDeck.sessionHistory?.length > 0) ||
            (currentDeck.questions?.some(q => q.history?.length > 0))
        );
         dom.resetHistoryButton.disabled = !hasHistory;
         setAriaDisabled(dom.resetHistoryButton, !hasHistory);
         dom.resetHistoryButton.title = hasHistory
             ? `選択中の問題集「${escapeHtml(currentDeck.name)}」の全学習履歴をリセットします (要確認)`
             : (currentDeck ? "リセットする履歴がありません" : "問題集を選択してください");
     }

     // Start Study Button state is determined by filter counts, handled in updateAllFilterCounts -> updateStudyButtonsState
     // Initial state depends on deck selection
     if (dom.startStudyButton) {
         dom.startStudyButton.disabled = !currentDeck; // Disable if no deck selected initially
         setAriaDisabled(dom.startStudyButton, !currentDeck);
         if(!currentDeck) {
             dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
         }
     }
}


/** ホーム画面: フィルター選択ラジオ内の問題数カウントを更新 */
function updateAllFilterCounts() {
     const deck = appState.allDecks[appState.currentDeckId];

     // If no deck is selected, clear all counts and disable start button
     if (!deck) {
          dom.studyFilterRadios?.forEach(radio => {
               const countSpan = radio.nextElementSibling?.querySelector('.filter-count');
               if(countSpan) countSpan.textContent = `(0)`;
          });
          safeSetText(dom.filteredQuestionCountDisplay, "対象問題数: 0問");
          updateStudyButtonsState(0); // Pass 0 to disable button
          return;
     }

    // Calculate counts for each filter option
    let totalSelectedFiltered = 0;
     try {
          dom.studyFilterRadios?.forEach(radio => {
              const filterValue = radio.value;
               const list = getFilteredStudyList(filterValue); // Get filtered list for this option
               const count = list?.length || 0; // Get count safely

               // Update the count display next to the radio button label
               const countSpan = radio.nextElementSibling?.querySelector('.filter-count');
               if(countSpan) countSpan.textContent = `(${count})`;

               // If this radio is the currently selected filter, store its count
               if(radio.checked) {
                   totalSelectedFiltered = count;
                   appState.studyFilter = filterValue; // Ensure state matches UI
               }
          });
     } catch (error) {
         console.error("Error updating filter counts:", error);
         // Handle potential errors during filtering
         safeSetText(dom.filteredQuestionCountDisplay, "エラー発生");
         updateStudyButtonsState(0); // Disable button on error
         return;
     }

     // Update the main count display and the Start Study button state
    safeSetText(dom.filteredQuestionCountDisplay, `総対象問題数: ${totalSelectedFiltered}問`);
    updateStudyButtonsState(totalSelectedFiltered); // Enable/disable button based on count
}

/** ホーム画面: Start Study ボタンの有効/無効とツールチップを更新 */
function updateStudyButtonsState(filteredCount) {
    if (!dom.startStudyButton) return;

    const canStart = filteredCount > 0;
    dom.startStudyButton.disabled = !canStart;
    setAriaDisabled(dom.startStudyButton, !canStart);

    // Update tooltip based on state
    if (!appState.currentDeckId) {
         dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
     } else if (!canStart) {
         const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
         const filterText = selectedRadio?.nextElementSibling?.querySelector('.filter-text')?.textContent.trim() || '選択した条件';
         dom.startStudyButton.title = `「${escapeHtml(filterText)}」に該当する問題がありません。フィルターを変更してください。`;
     } else {
         dom.startStudyButton.title = `選択中のフィルター条件 (${filteredCount}問) で学習を開始します`;
     }
}

/** デッキリストのクリックイベント処理（委任） */
function handleDeckListClick(event) {
    const listItem = event.target.closest('li[data-deck-id]');
    if (!listItem) return; // Click didn't happen on a list item
    const deckId = listItem.dataset.deckId;
    if (!deckId) return; // Should not happen if data-deck-id exists

    const selectButton = event.target.closest('.select-deck');
    const deleteButton = event.target.closest('.delete-deck');

    if (selectButton && !selectButton.disabled) {
         event.stopPropagation(); // Prevent li click handler if button clicked
         selectDeck(deckId);
    } else if (deleteButton && !deleteButton.disabled) {
        event.stopPropagation();
        handleDeleteDeckClick(deckId);
    } else if (listItem.getAttribute('role') === 'button' && deckId !== appState.currentDeckId) {
        // If the list item itself (not buttons) is clicked and it's not the active one, select it
         selectDeck(deckId);
    }
}

/** デッキリストのキーダウンイベント処理（委任） */
function handleDeckListKeydown(event) {
     const currentItem = event.target.closest('li[data-deck-id]');
     if (!currentItem) return; // Event didn't originate from a list item

    switch (event.key) {
        case 'Enter': case ' ': // Select item on Enter or Space
             event.preventDefault();
             const deckId = currentItem.dataset.deckId;
             if (deckId && deckId !== appState.currentDeckId) {
                 selectDeck(deckId);
             } else if (deckId && deckId === appState.currentDeckId) {
                 // Maybe trigger "Start Study" if already selected? Or just do nothing.
                 // Doing nothing is safer.
             }
            break;
         case 'ArrowDown': // Move focus down
         case 'ArrowUp':   // Move focus up
             event.preventDefault();
             const direction = event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling';
             focusSiblingListItem(currentItem, direction);
             break;
         case 'Home': // Move focus to first item
         case 'End':  // Move focus to last item
             event.preventDefault();
             const target = event.key === 'Home' ? 'firstElementChild' : 'lastElementChild';
             focusSiblingListItem(currentItem, target, currentItem.parentElement); // Pass parent
             break;
         case 'Delete': // Allow deleting with Del key? Maybe too risky.
             // const deleteButton = currentItem.querySelector('.delete-deck');
             // if (deleteButton && !deleteButton.disabled) {
             //    handleDeleteDeckClick(currentItem.dataset.deckId);
             // }
             break;
    }
}

/** フォーカス可能な兄弟リスト要素にフォーカスを移動 */
function focusSiblingListItem(currentItem, property, parent = currentItem.parentElement) {
     if (!parent) return;
     let sibling;

     if (property === 'firstElementChild' || property === 'lastElementChild') {
         sibling = parent[property];
     } else {
         sibling = currentItem[property];
     }

     // Skip non-element nodes or elements that are not list items with a deck ID
     while (sibling && (!sibling.matches || !sibling.matches('li[data-deck-id]'))) {
        sibling = sibling[property];
     }

     // If a valid sibling is found, focus it
     sibling?.focus();
}

/** 指定されたIDのデッキを選択状態にする */
function selectDeck(deckId) {
    if (!deckId || !appState.allDecks[deckId]) {
        console.warn(`Attempted to select invalid deck ID: ${deckId}`);
        return;
    }
    if (deckId === appState.currentDeckId) {
        console.log(`Deck ${deckId} is already selected.`);
        return; // Do nothing if already selected
    }

    appState.currentDeckId = deckId;
    appState.currentDashboardDeckId = deckId; // Sync dashboard selection
    saveData(LS_KEYS.CURRENT_DECK_ID, deckId); // Persist selection

    console.log("Deck selected:", deckId, appState.allDecks[deckId].name);
    showNotification(`問題集「${escapeHtml(appState.allDecks[deckId].name)}」を選択しました。`, 'success', 2500);

    // Reset study filter to 'all' when a new deck is selected
    appState.studyFilter = 'all';
    const allFilterRadio = document.getElementById('filter-all');
    if (allFilterRadio) allFilterRadio.checked = true;

    updateHomeUI(true); // Force update Home screen UI

    // Update Dashboard screen if it's active or potentially update its state
    safeSetValue(dom.dashboardDeckSelect, deckId); // Update dropdown selection
    if (appState.activeScreen === 'dashboard-screen') {
        resetDashboardFiltersAndState(false); // Reset filters but not deck selection
        renderDashboard(); // Re-render dashboard for the new deck
    }
}

/** デッキ削除ボタンクリック時の処理 */
function handleDeleteDeckClick(deckId) {
     const deck = appState.allDecks[deckId];
     if (!deck) {
         console.error(`Cannot delete: Deck with ID ${deckId} not found.`);
         showNotification("削除対象の問題集が見つかりません。", "error");
         return;
     }

     showModal({
         title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 問題集削除確認`,
         content: `<p>問題集「<strong>${escapeHtml(deck.name || '名称未設定')}</strong>」(${deck.questions?.length ?? 0}問) と、その全ての学習履歴を完全に削除します。</p><p style="font-weight:bold; color:var(--danger-dark);">この操作は元に戻せません！ 本当によろしいですか？</p>`,
         buttons: [
             { id: 'confirm-delete-btn', text: '<i class="fas fa-trash-alt"></i> 削除する', class: 'danger', onClick: () => { deleteDeckConfirmed(deckId); closeModal(); } },
             { id: 'cancel-delete-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ],
         size: 'md'
     });
}

/** デッキ削除を最終確認後、実行 */
function deleteDeckConfirmed(deckId) {
    if (!deckId || !appState.allDecks[deckId]) {
        showNotification("削除対象が見つかりません。", "error"); return;
    }
    const deckName = appState.allDecks[deckId].name || '無名';
    console.log(`Deleting deck: ${deckName} (ID: ${deckId})`);
    updateLoadingOverlay(true, `問題集「${escapeHtml(deckName)}」を削除中...`);

     // Keep a copy of the current state for potential rollback
     const originalDecks = JSON.parse(JSON.stringify(appState.allDecks));
     const originalCurrentDeckId = appState.currentDeckId;
     const originalDashboardDeckId = appState.currentDashboardDeckId;

     // Perform deletion from state
     delete appState.allDecks[deckId];
     let selectionChanged = false;
     if (appState.currentDeckId === deckId) {
         appState.currentDeckId = null;
         selectionChanged = true;
     }
     if (appState.currentDashboardDeckId === deckId) {
         appState.currentDashboardDeckId = null;
         selectionChanged = true;
     }

     // Attempt to save the updated state
     if (saveData(LS_KEYS.DECKS, appState.allDecks)) {
         // If save succeeds, also save the potentially changed currentDeckId
         if (selectionChanged) {
             saveData(LS_KEYS.CURRENT_DECK_ID, null);
             safeSetValue(dom.dashboardDeckSelect, ""); // Reset dashboard dropdown if needed
         }
         showNotification(`問題集「${escapeHtml(deckName)}」を削除しました。`, "success");
         // Refresh UI
         updateHomeUI(true);
         populateDashboardDeckSelect(); // Refresh dropdown
         if (appState.activeScreen === 'dashboard-screen' && selectionChanged) {
             renderDashboard(); // Re-render dashboard if selection was removed
         }
     } else {
         // If save fails, rollback the state changes
         console.error("Failed to save state after deck deletion. Rolling back.");
         appState.allDecks = originalDecks;
         appState.currentDeckId = originalCurrentDeckId;
         appState.currentDashboardDeckId = originalDashboardDeckId;
         showNotification("問題集の削除に失敗しました (データ保存エラー)。変更は取り消されました。", "error");
     }
     updateLoadingOverlay(false); // Hide loading overlay
}

/** 学習履歴リセットボタンクリック時の処理 */
function handleResetHistoryClick() {
     const deckId = appState.currentDeckId;
     if (!deckId || !appState.allDecks[deckId]) {
          showNotification("履歴をリセットする問題集が選択されていません。", "warning");
          return;
     }
     const deck = appState.allDecks[deckId];

     showModal({
         title: `<i class="fas fa-history" style="color:var(--warning-color);"></i> 学習履歴リセット確認`,
         content: `<p>問題集「<strong>${escapeHtml(deck.name)}</strong>」の<strong>全ての</strong>学習履歴 (解答履歴、セッション履歴、最終学習日) をリセットします。</p><p>問題自体は削除されません。</p><p style="font-weight:bold; color:var(--danger-dark);">この操作は元に戻せません！</p><hr><label for="reset-confirm-input">確認のため、問題集名「${escapeHtml(deck.name)}」を正確に入力してください:</label><input type="text" id="reset-confirm-input" class="confirm-input" style="width: 100%; margin-top: 5px;" placeholder="${escapeHtml(deck.name)}" aria-describedby="reset-confirm-error"><p id="reset-confirm-error" class="status-message error" style="display:none; margin-top: 5px;" aria-live="assertive"></p>`,
         buttons: [
             { id: 'confirm-reset-btn', text: '<i class="fas fa-eraser"></i> 履歴リセット実行', class: 'danger', onClick: () => resetHistoryConfirmed(deckId) }, // Pass deckId
             { id: 'cancel-reset-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ],
          onClose: () => { // Clean up listener on close
              const confirmInput = document.getElementById('reset-confirm-input');
              if(confirmInput) confirmInput.removeEventListener('input', clearResetError);
          },
          size: 'md'
     });
      const confirmInput = document.getElementById('reset-confirm-input');
      safeAddEventListener(confirmInput, 'input', clearResetError); // Clear error on input
      setTimeout(() => confirmInput?.focus(), 100); // Focus input after modal opens
}

/** 履歴リセットを最終確認（名称入力）後、実行 */
function resetHistoryConfirmed(deckId) {
     const deck = appState.allDecks[deckId];
     const confirmInput = document.getElementById('reset-confirm-input');
     const errorMsg = document.getElementById('reset-confirm-error');
     if (!deck || !confirmInput || !errorMsg) {
         console.error("Reset history confirmation elements not found.");
         closeModal(); // Close modal if elements are missing
         return;
     }

     // Trim input value for comparison
     if (confirmInput.value.trim() !== deck.name) {
         errorMsg.textContent = "入力された問題集名が一致しません。";
         errorMsg.style.display = 'block';
         confirmInput.focus();
         confirmInput.select();
         return;
     }

     // --- Proceed with history reset ---
     closeModal(); // Close confirm modal
     console.log(`Resetting history for deck: ${deck.name} (ID: ${deckId})`);
    updateLoadingOverlay(true, `「${escapeHtml(deck.name)}」の履歴リセット中...`);

     const originalDeck = JSON.parse(JSON.stringify(deck)); // Backup for rollback

     try {
         // Reset history-related properties in the deck object
         deck.lastStudied = null;
         deck.totalCorrect = 0; // Reset cumulative counts (though not actively used in V3 logic)
         deck.totalIncorrect = 0;
         deck.sessionHistory = [];
         deck.questions.forEach(q => { q.history = []; }); // Clear history for each question

         // Save the modified deck data
         if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             // Rollback state if save fails
             appState.allDecks[deckId] = originalDeck;
             throw new Error("履歴リセット後のデータ保存に失敗しました。");
         }
         showNotification(`問題集「${escapeHtml(deck.name)}」の学習履歴をリセットしました。`, "success");
         updateHomeUI(true); // Refresh home UI to show reset state
         // If dashboard is showing this deck, refresh it
         if (appState.currentDashboardDeckId === deckId && appState.activeScreen === 'dashboard-screen') {
             renderDashboard();
         }
     } catch (error) {
         console.error("Error resetting history:", error);
         showNotification(`履歴リセットエラー: ${error.message}`, "error");
         // Restore original deck data in case of error after modification but before save success
         if (appState.allDecks[deckId] !== originalDeck) {
             appState.allDecks[deckId] = originalDeck;
         }
     } finally {
         updateLoadingOverlay(false);
     }
}

/** ホーム画面: 学習フィルター選択ハンドラ */
function handleStudyFilterChange(event) {
     if (event.target.checked && event.target.name === 'study-filter') {
         const newFilter = event.target.value;
         appState.studyFilter = newFilter;
         console.log("Study filter changed to:", appState.studyFilter);
         // Debounce the update of filter counts and start button state
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
    if (!deck || !Array.isArray(deck.questions) || deck.questions.length === 0) {
        return []; // Return empty array if no deck, no questions, or invalid data
    }

    const questions = deck.questions;
    const lowThreshold = appState.settings.lowAccuracyThreshold || DEFAULT_SETTINGS.lowAccuracyThreshold;

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
                // Filter questions where the *last* answer was incorrect
                filteredQuestions = questions.filter(q => q.history?.length > 0 && !q.history[q.history.length - 1].correct);
                break;
            case 'unanswered':
                // Filter questions with no history entries
                filteredQuestions = questions.filter(q => !q.history || q.history.length === 0);
                break;
            case 'difficult':
            case 'normal':
            case 'easy':
                 // Filter questions where the *last* evaluation matches
                 filteredQuestions = questions.filter(q => q.history?.length > 0 && q.history[q.history.length - 1].evaluation === filter);
                break;
            case 'all': default:
                // Return all questions (create a shallow copy)
                filteredQuestions = [...questions];
                break;
        }
    } catch (e) {
        console.error(`Error filtering questions with filter "${filter}":`, e);
        showNotification(`フィルター処理中にエラーが発生しました (${filter})`, 'error');
        return []; // Return empty array on filtering error
    }
    // console.log(`Filter "${filter}" resulted in ${filteredQuestions.length} questions.`);
    return filteredQuestions;
}


// ====================================================================
// 学習フロー (Study Flow)
// ====================================================================
/** 学習セッションを開始する */
function startStudy() {
    const deck = appState.allDecks[appState.currentDeckId];
    if (!deck) {
        showNotification('学習を開始する問題集を選択してください。', 'warning');
        return;
    }

    // Get the list of questions based on the currently selected filter
    const filteredList = getFilteredStudyList(); // Uses appState.studyFilter by default
    if (filteredList.length === 0) {
         const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
         const filterText = selectedRadio?.nextElementSibling?.querySelector('.filter-text')?.textContent.trim() || '選択した条件';
        showNotification(`「${escapeHtml(filterText)}」に該当する問題がありません。フィルターを変更するか、問題を追加してください。`, 'warning');
        return;
    }

    // Shuffle the filtered list for the study session
    appState.studyList = shuffleArray([...filteredList]); // Use shuffleArray utility
    console.log(`Study session started with ${appState.studyList.length} questions for deck "${deck.name}". Filter: ${appState.studyFilter}`);

    // Initialize study state
    appState.currentQuestionIndex = 0;
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
    appState.isStudyActive = true;

    // Setup Study Screen UI elements
    if (dom.studyScreenTitle) {
        const titleSpan = dom.studyScreenTitle.querySelector('span');
        if(titleSpan) titleSpan.textContent = escapeHtml(deck.name || '名称未設定');
    }
    // Hide completion message, show study card and quit button
     safeSetStyle(dom.studyCompleteMessage, 'display', 'none');
     setActiveClass(dom.studyCompleteMessage, false); // Remove active class if any
     safeSetStyle(dom.quitStudyHeaderButton, 'display', 'inline-block'); // Show quit button in header
     safeSetStyle(dom.studyCard, 'display', 'block');
     // Ensure answer area and evaluation controls are hidden initially
     safeSetStyle(dom.answerArea, 'display', 'none');
     safeSetStyle(dom.evaluationControls, 'display', 'none');
     safeSetStyle(dom.retryButton, 'display', 'none'); // Hide retry button

    // Navigate to the study screen and display the first question
    navigateToScreen('study-screen');
    displayCurrentQuestion();
    updateStudyProgress(); // Initialize progress bar/text
}

/** 現在の問題を画面に表示 */
function displayCurrentQuestion() {
    if (!appState.isStudyActive || appState.currentQuestionIndex < 0 || appState.currentQuestionIndex >= appState.studyList.length) {
        console.warn("displayCurrentQuestion called with invalid state:", {
            isActive: appState.isStudyActive,
            index: appState.currentQuestionIndex,
            listLength: appState.studyList.length
        });
         // If study is active but index is out of bounds, it means study finished or error occurred
         if (appState.isStudyActive) {
            showStudyCompletion();
         }
        return;
    }

    const questionData = appState.studyList[appState.currentQuestionIndex];

    // Validate question data before displaying
    if (!isValidQuestion(questionData)) { // Assumes isValidQuestion utility exists
         console.error(`Skipping invalid question data at index ${appState.currentQuestionIndex}:`, questionData);
         showNotification(`問題 ${appState.currentQuestionIndex + 1} のデータ形式が不正なためスキップします。`, 'warning', 5000);
         moveToNextQuestion(); // Skip to the next question
        return;
    }
    console.log(`Displaying Q ${appState.currentQuestionIndex + 1}/${appState.studyList.length}: ${questionData.id}`);

    // Reset UI elements for the new question
    resetQuestionUI();

    // Display new question content
    safeSetText(dom.questionCounter, `${appState.currentQuestionIndex + 1} / ${appState.studyList.length}`);
    safeSetText(dom.questionText, questionData.question);
    renderOptions(questionData.options, appState.settings.shuffleOptions); // Render options (shuffled if setting is true)
    safeSetText(dom.answerText, questionData.correctAnswer); // Set correct answer text (hidden initially)
    safeSetText(dom.explanationText, questionData.explanation || '解説はありません。'); // Set explanation (hidden initially)

    updateStudyProgress(); // Update progress bar and text

    // Focus the first option button after rendering
    setTimeout(() => dom.optionsButtonsContainer?.querySelector('.option-button')?.focus(), 50);
}

/** 問題表示前のUIリセット */
function resetQuestionUI(){
    // Reset options container
    if(dom.optionsButtonsContainer) {
         dom.optionsButtonsContainer.innerHTML = ''; // Clear previous options
         dom.optionsButtonsContainer.setAttribute('aria-busy', 'true'); // Indicate loading state
    }
    // Hide answer and evaluation areas
    safeSetStyle(dom.answerArea, 'display', 'none');
    safeSetStyle(dom.evaluationControls, 'display', 'none');
    // Reset feedback container appearance
    if(dom.feedbackContainer) dom.feedbackContainer.className = 'feedback-container'; // Remove correct/incorrect classes
    if(dom.feedbackMessage) {
        const span = dom.feedbackMessage.querySelector('span');
        if (span) span.textContent = ''; // Clear feedback text
    }
    if(dom.feedbackIcon) dom.feedbackIcon.className = 'feedback-icon fas'; // Reset icon class
    // Reset study card border/appearance
    if(dom.studyCard) dom.studyCard.className = 'card study-card-active'; // Reset border state
    // Hide retry button
    safeSetStyle(dom.retryButton, 'display', 'none');
    // Re-enable evaluation buttons (they might be disabled from previous question)
    if(dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
}

/** 選択肢ボタンをレンダリング */
function renderOptions(optionsSource, shouldShuffle) {
    if(!dom.optionsButtonsContainer) return;
    dom.optionsButtonsContainer.innerHTML = ''; // Clear previous

    // Shuffle options if required, otherwise use original order
    const options = shouldShuffle ? shuffleArray([...optionsSource]) : [...optionsSource];

    const fragment = document.createDocumentFragment();
    options.forEach((option, index) => {
        // Create button for each option using the utility function
        fragment.appendChild(createButton({
            text: escapeHtml(option), // Escape HTML in option text
             class: 'option-button', // Base class for styling
             data: { optionValue: option }, // Store the original option value
             // Provide accessible label including option number
             ariaLabel: `選択肢 ${index + 1}: ${escapeHtml(option)}`
         }));
     });
     dom.optionsButtonsContainer.appendChild(fragment);
     dom.optionsButtonsContainer.removeAttribute('aria-busy'); // Mark as loaded
}

/** 学習進捗バーとテキストを更新 */
function updateStudyProgress() {
    if (!dom.studyProgressBar || !dom.studyProgressText || !dom.studyProgressContainer) return;
    const total = appState.studyList.length;
    const currentIdx = appState.currentQuestionIndex; // Current 0-based index

    if (appState.isStudyActive && total > 0 && currentIdx >= 0) {
        const currentNum = currentIdx + 1; // Display 1-based number
        // Calculate progress percentage, ensure it doesn't exceed 100
        const progressPercent = Math.min(100, Math.max(0, Math.round((currentNum / total) * 100)));

        // Update progress bar attributes
        dom.studyProgressBar.value = currentNum;
        dom.studyProgressBar.max = total;
        // Update progress text
        safeSetText(dom.studyProgressText, `${currentNum} / ${total} (${progressPercent}%)`);
        // Ensure progress container is visible
        dom.studyProgressContainer.style.visibility = 'visible';
    } else {
        // Hide progress bar if study is not active or list is empty
        dom.studyProgressContainer.style.visibility = 'hidden';
    }
}

/** 選択肢ボタンクリック時のハンドラ (イベント委任使用) */
function handleOptionButtonClick(event) {
    const clickedButton = event.target.closest('.option-button');
    // Ignore clicks if not on a button, button is disabled, or study is not active
    if (!clickedButton || clickedButton.disabled || !appState.isStudyActive) return;

    // Disable all option buttons immediately to prevent multiple clicks
    const allOptions = dom.optionsButtonsContainer?.querySelectorAll('.option-button');
    if (allOptions) allOptions.forEach(btn => btn.disabled = true);

    const selectedOption = clickedButton.dataset.optionValue;
    const questionData = appState.studyList[appState.currentQuestionIndex];

    // Double check if questionData is valid before proceeding
     if (!isValidQuestion(questionData)) { // Assumes utility exists
         console.error("Invalid question data found during answer submission.");
         showNotification("解答処理中にエラーが発生しました。", "error");
         // Re-enable options if error occurs? Or move to next? For now, re-enable.
         if(allOptions) allOptions.forEach(btn => btn.disabled = false);
         return;
     }

    // Process the submitted answer
    handleAnswerSubmission(selectedOption, questionData.correctAnswer);
}

/** 解答提出後の処理 */
function handleAnswerSubmission(selectedOption, correctAnswer) {
    const isCorrect = selectedOption === correctAnswer;
    const questionData = appState.studyList[appState.currentQuestionIndex];
    // Ensure critical elements exist before proceeding
    if (!questionData || !dom.studyCard || !dom.feedbackContainer || !dom.feedbackMessage || !dom.feedbackIcon || !dom.optionsButtonsContainer) {
        console.error("Feedback error: Required DOM elements or question data missing.");
        showNotification("フィードバック表示中にエラーが発生しました。", "error");
        return;
    }

    console.log(`Answer submitted: Selected="${selectedOption}", CorrectAns="${correctAnswer}", Result=${isCorrect}`);

    // Update session statistics
    appState.studyStats[isCorrect ? 'currentSessionCorrect' : 'currentSessionIncorrect']++;

    // Update UI to show feedback
    // Card border
    dom.studyCard.classList.remove('correct-answer', 'incorrect-answer'); // Clear previous state
    dom.studyCard.classList.add(isCorrect ? 'correct-answer' : 'incorrect-answer');
    // Feedback message and icon
    safeSetText(dom.feedbackMessage.querySelector('span'), isCorrect ? '正解！' : '不正解...');
    dom.feedbackContainer.className = `feedback-container ${isCorrect ? 'correct' : 'incorrect'}`;
    // Ensure icon class matches feedback (Font Awesome)
    dom.feedbackIcon.className = `feedback-icon fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'}`;
    // Show Retry button only if incorrect
    safeSetStyle(dom.retryButton, 'display', isCorrect ? 'none' : 'inline-block');

    // Highlight selected and correct options
    dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
         const optionVal = button.dataset.optionValue;
         button.classList.remove('success', 'danger'); // Clear previous highlights
         button.style.opacity = '1'; // Reset opacity

         if (optionVal === correctAnswer) {
             button.classList.add('success'); // Highlight correct answer
         } else if (optionVal === selectedOption) {
             button.classList.add('danger'); // Highlight selected incorrect answer
         } else {
             button.style.opacity = '0.6'; // Fade out other incorrect options
         }
         // Keep buttons disabled
     });

    // Reveal the answer/explanation area and evaluation controls
    safeSetStyle(dom.answerArea, 'display', 'block');
    safeSetStyle(dom.evaluationControls, 'display', 'flex'); // Use flex for layout

    // Scroll the evaluation controls into view and focus the first button
     dom.evaluationControls.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
     setTimeout(() => dom.evaluationControls.querySelector('.eval-button')?.focus(), 100);
}

/** 理解度評価ボタンクリックハンドラ */
function handleEvaluation(event) {
     const evalButton = event.target.closest('.eval-button');
     if (!evalButton || evalButton.disabled || !appState.isStudyActive) return;

     const evaluation = evalButton.dataset.levelChange; // Should be 'difficult', 'normal', or 'easy'
     if (!evaluation || !['difficult', 'normal', 'easy'].includes(evaluation)) {
         console.error("Invalid evaluation level:", evaluation);
         return;
     }

     // Disable all evaluation buttons to prevent multiple clicks during processing
     if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = true);

     const questionData = appState.studyList?.[appState.currentQuestionIndex];
     // Determine correctness from the UI state (feedback container class)
     const isCorrect = dom.feedbackContainer?.classList.contains('correct') ?? false;

     if (!questionData || !questionData.id || !appState.currentDeckId) {
         console.error("Evaluation error: Missing question data, ID, or deck ID.");
         showNotification("評価の記録中にエラーが発生しました。", "error");
         // Re-enable buttons on error
         if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
         return;
     }

    // Record the history entry (includes saving to LocalStorage)
     if (recordQuestionHistory(appState.currentDeckId, questionData.id, isCorrect, evaluation)) {
        moveToNextQuestion(); // Move to the next question if history saved successfully
    } else {
         showNotification("学習履歴の保存に失敗しました。再試行してください。", "error");
         // Re-enable evaluation buttons if saving failed
         if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
     }
}

/** 問題の解答履歴を記録し、デッキデータを保存 */
function recordQuestionHistory(deckId, questionId, isCorrect, evaluation) {
    const deck = appState.allDecks[deckId];
    if (!deck || !Array.isArray(deck.questions)) {
        console.error(`History Error: Deck not found or invalid (ID: ${deckId}).`);
        return false;
    }
     // Find the specific question within the deck's questions array
     const questionInDeck = deck.questions.find(q => q.id === questionId);
    if (!questionInDeck) {
        console.error(`History Error: Question ID ${questionId} not found in Deck ${deckId}.`);
        return false;
    }

    // Ensure history array exists
    if (!Array.isArray(questionInDeck.history)) {
        questionInDeck.history = [];
        console.warn(`Initialized missing history array for QID ${questionId}`);
    }

    // Create new history entry
    const historyEntry = {
        ts: Date.now(),
        correct: isCorrect,
        evaluation: evaluation // Store 'difficult', 'normal', or 'easy'
    };

    // Add the new entry to the question's history
    questionInDeck.history.push(historyEntry);

    // Update the deck's last studied timestamp
    deck.lastStudied = Date.now();

    // V3: We don't update deck.totalCorrect/totalIncorrect here.
    // These are calculated dynamically in the dashboard if needed.

    // Save the entire updated decks object to LocalStorage
     if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
         // If saving fails, rollback the history addition
         questionInDeck.history.pop();
         // Also potentially rollback lastStudied? Maybe not critical.
         console.error(`History Save Failed for QID ${questionId}. Rolled back history entry.`);
         return false;
     }
    // console.log(`History recorded for Q:${questionId}, Result:${isCorrect}, Eval:${evaluation}`);
    return true;
}


/** 次の問題へ移動、または学習完了処理 */
function moveToNextQuestion() {
    appState.currentQuestionIndex++;
     if (appState.currentQuestionIndex < appState.studyList.length) {
         // If there are more questions, display the next one
         displayCurrentQuestion();
     } else {
         // If no more questions, show the completion screen
         showStudyCompletion();
     }
}

/** 学習セッション完了処理 */
function showStudyCompletion() {
     // Prevent multiple calls if already completed
     if (!dom.studyCompleteMessage || !appState.isStudyActive) return;

    console.log("Study session completed. Final Stats:", appState.studyStats);
    const studyWasActive = appState.isStudyActive; // Record if it was active before potentially saving history
     appState.isStudyActive = false; // Mark study as inactive *before* saving history

    // Save the session statistics (only if the study was actually active)
    if (studyWasActive) {
        saveSessionHistory();
    }

    // Hide study-related UI elements
     safeSetStyle(dom.studyCard, 'display', 'none');
     safeSetStyle(dom.evaluationControls, 'display', 'none');
     safeSetStyle(dom.quitStudyHeaderButton, 'display', 'none'); // Hide quit button
     safeSetStyle(dom.studyProgressContainer, 'visibility', 'hidden'); // Hide progress bar


    // Display completion message and results
     safeSetText(dom.sessionCorrectCount, appState.studyStats.currentSessionCorrect);
     safeSetText(dom.sessionIncorrectCount, appState.studyStats.currentSessionIncorrect);
     safeSetStyle(dom.studyCompleteMessage, 'display', 'block');
     setActiveClass(dom.studyCompleteMessage, true);
     // Focus the completion message panel for screen readers
     dom.studyCompleteMessage.setAttribute('tabindex', '-1');
     dom.studyCompleteMessage.focus();


    // Reset study list and index for the next session
     appState.studyList = [];
     appState.currentQuestionIndex = -1;
     // Statistics are reset within saveSessionHistory or were already reset

    // Update Home screen UI (e.g., last studied date, potentially accuracy if calculated there)
    updateHomeUI(true);
}

/** 現在のセッション履歴を保存 */
function saveSessionHistory() {
    const deckId = appState.currentDeckId;
    const deck = appState.allDecks[deckId];
    if (!deck) {
        console.error("Cannot save session history: Current deck not found.");
        // Reset stats even if save fails? Yes, session is over.
        appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
        return;
    }

    const { currentSessionCorrect: correct, currentSessionIncorrect: incorrect } = appState.studyStats;

    // Only save if there were any answers in the session
    if (correct > 0 || incorrect > 0) {
        if (!Array.isArray(deck.sessionHistory)) {
            deck.sessionHistory = [];
            console.warn(`Initialized missing sessionHistory array for Deck ${deckId}`);
        }
        const sessionEntry = {
            ts: Date.now(),
            correct: correct,
            incorrect: incorrect
        };
         deck.sessionHistory.push(sessionEntry);
         deck.lastStudied = Date.now(); // Ensure lastStudied is updated on session completion/quit

        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             // Attempt to rollback if save fails
             deck.sessionHistory.pop();
             // Should we also rollback lastStudied? Less critical maybe.
             console.error(`Failed to save session history for deck ${deck.id}. Rolled back entry.`);
             showNotification("今回の学習セッション履歴の保存に失敗しました。", "error");
         } else {
             console.log(`Session history saved for deck ${deck.id}: C=${correct}, I=${incorrect}`);
         }
    } else {
        console.log("Skipping session history save (no answers recorded).");
        // Still update lastStudied if the user started and quit without answering? Debatable.
        // Let's only update lastStudied if answers were given or history saved.
        // Decision: Update lastStudied here as well, indicating interaction.
        if (appState.currentDeckId) { // Check if a deck was selected
             deck.lastStudied = Date.now();
             if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                  console.error(`Failed to update lastStudied timestamp for deck ${deck.id} after empty session.`);
             }
        }
    }

    // Reset session stats regardless of save success, as the session is over.
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
}

/** 現在の問題を再挑戦する */
function retryCurrentQuestion() {
    if (!appState.isStudyActive || appState.currentQuestionIndex < 0 || !dom.answerArea || !dom.optionsButtonsContainer) {
        console.warn("Cannot retry question: Invalid state or missing elements.");
        return;
    }
     console.log(`Retrying question ${appState.currentQuestionIndex + 1}`);

    // --- Crucially, DO NOT change session stats here ---
    // The goal is to try again, the final answer will determine the stat update.

    // Reset UI to hide answer/evaluation and re-enable options
    resetQuestionUI(); // Hides answer, feedback, eval; clears highlights
    // Re-display the same question content and render options
     displayCurrentQuestion(); // This resets focus as well
     showNotification("もう一度挑戦してください。", "info", 2000);
}


/** 学習の中断を確認し、必要に応じて画面遷移 */
function confirmQuitStudy(showConfirmation = true, navigateTo = 'home-screen') {
    if (!appState.isStudyActive) {
        console.log("Study not active, no need to confirm quit.");
        // If trying to navigate away, just do it
        if(appState.activeScreen !== navigateTo) {
            navigateToScreen(navigateTo);
        }
        return true; // Indicate quit/navigation can proceed
    }

    let quitConfirmed = true; // Default to true if no confirmation needed

    if (showConfirmation) {
         quitConfirmed = confirm("学習セッションを中断しますか？\nここまでの解答履歴と今回のセッション統計は保存されます。");
    }

    if (quitConfirmed) {
        console.log(`Quitting study session. Navigating to: ${navigateTo}`);
        const studyWasActive = appState.isStudyActive; // Check before setting false
        appState.isStudyActive = false;

        // Save session history if study was active
        if (studyWasActive) {
             saveSessionHistory();
        }

        resetStudyScreenUI(); // Clear UI elements related to study
        navigateToScreen(navigateTo); // Navigate to the desired screen
        showNotification("学習を中断しました。", "info", 3000);
        updateHomeUI(true); // Refresh home screen stats potentially
        return true; // Indicate quit was successful
    } else {
        console.log("Study quit cancelled by user.");
        return false; // Indicate quit was cancelled
    }
}

/** 学習画面のUI要素を初期状態に戻す（学習終了/中断時） */
function resetStudyScreenUI() {
     console.log("Resetting study screen UI elements.");
     safeSetStyle(dom.studyCard, 'display', 'none');
     safeSetStyle(dom.evaluationControls, 'display', 'none');
     safeSetStyle(dom.studyCompleteMessage, 'display', 'none');
     setActiveClass(dom.studyCompleteMessage, false);
     safeSetStyle(dom.quitStudyHeaderButton, 'display', 'none'); // Hide quit button
     safeSetStyle(dom.studyProgressContainer, 'visibility', 'hidden'); // Hide progress
     // Clear content just in case
     safeSetText(dom.questionCounter, '');
     safeSetText(dom.questionText, '');
     if(dom.optionsButtonsContainer) dom.optionsButtonsContainer.innerHTML = '';
     if(dom.feedbackMessage) {
         const span = dom.feedbackMessage.querySelector('span');
         if (span) span.textContent = '';
     }
}


/** 学習状態を完全にリセット (アプリリセット時などに使用) */
function resetStudyState() {
     appState.isStudyActive = false;
     appState.studyList = [];
     appState.currentQuestionIndex = -1;
     appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
     resetStudyScreenUI(); // Ensure UI is also reset
     console.log("Full study state reset.");
}


// ====================================================================
// ダッシュボード関連処理 (Dashboard)
// ====================================================================

/** Populates the dashboard deck selection dropdown. */
function populateDashboardDeckSelect() {
    if (!dom.dashboardDeckSelect) {
        console.warn("Dashboard deck select element not found.");
        return;
    }

    // Clear existing options except the default placeholder
    dom.dashboardDeckSelect.innerHTML = '<option value="">-- 問題集を選択してください --</option>';

    const decks = Object.values(appState.allDecks);
    if (decks.length === 0) {
        // If no decks, keep only the placeholder
        safeSetStyle(dom.dashboardContent, 'display', 'none');
        safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'block');
        return;
    }

    // Sort decks alphabetically by name for the dropdown
    decks.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));

    const fragment = document.createDocumentFragment();
    decks.forEach(deck => {
        const option = document.createElement('option');
        option.value = deck.id;
        option.textContent = escapeHtml(deck.name || '名称未設定');
        fragment.appendChild(option);
    });

    dom.dashboardDeckSelect.appendChild(fragment);

    // Set the selected value to the current dashboard deck ID
    safeSetValue(dom.dashboardDeckSelect, appState.currentDashboardDeckId || '');

    // Show/hide content based on whether a deck is selected
    if (appState.currentDashboardDeckId && appState.allDecks[appState.currentDashboardDeckId]) {
        safeSetStyle(dom.dashboardContent, 'display', 'block');
        safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'none');
    } else {
        safeSetStyle(dom.dashboardContent, 'display', 'none');
        safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'block');
    }
}

/** Handles the change event for the dashboard deck selection dropdown. */
function handleDashboardDeckChange(event) {
    const selectedDeckId = event.target.value;
    selectDashboardDeck(selectedDeckId || null); // Pass null if placeholder selected
}

/** Selects a deck for the dashboard view. */
function selectDashboardDeck(deckId) {
    if (deckId === appState.currentDashboardDeckId) return; // No change

    appState.currentDashboardDeckId = deckId;
    console.log(`Dashboard deck selected: ${deckId}`);

    // Reset filters and pagination when deck changes
    resetDashboardFiltersAndState(false); // Don't reset deck selection itself

    // Re-render the entire dashboard for the new deck
    renderDashboard();
}

/** Toggles the visibility of dashboard filter/control panel on mobile */
function toggleDashboardControls() {
    if (dom.dashboardAnalysisControlsPanel && dom.dashboardControlsToggle) {
        const isCollapsed = dom.dashboardAnalysisControlsPanel.classList.toggle('collapsed');
        appState.isDashboardControlsCollapsed = isCollapsed;
        dom.dashboardControlsToggle.setAttribute('aria-expanded', String(!isCollapsed));
    }
}

/** Adjusts dashboard controls visibility based on window size */
function toggleDashboardControlsBasedOnSize() {
     const isMobile = window.innerWidth <= 768; // Example breakpoint
     safeSetStyle(dom.dashboardControlsToggle, 'display', isMobile ? 'flex' : 'none');
     if (dom.dashboardAnalysisControlsPanel && dom.dashboardControlsToggle) {
         if (!isMobile) {
             // Ensure panel is expanded on desktop
             dom.dashboardAnalysisControlsPanel.classList.remove('collapsed');
             dom.dashboardControlsToggle.setAttribute('aria-expanded', 'true');
             appState.isDashboardControlsCollapsed = false;
         } else {
              // Restore collapsed state based on appState for mobile
              const shouldBeCollapsed = appState.isDashboardControlsCollapsed;
              dom.dashboardAnalysisControlsPanel.classList.toggle('collapsed', shouldBeCollapsed);
              dom.dashboardControlsToggle.setAttribute('aria-expanded', String(!shouldBeCollapsed));
         }
     }
}

/** Handles changes in the dashboard accuracy filter dropdown */
function handleDashboardFilterChange(event) {
    appState.dashboardFilterAccuracy = event.target.value;
    appState.dashboardCurrentPage = 1; // Reset page
    renderDashboardQuestionAnalysis(); // Re-render analysis view
}

/** Handles input in the dashboard search field */
function handleDashboardSearchInput(event) {
    appState.dashboardSearchQuery = event.target.value;
    safeSetAttribute(dom.dashboardSearchButton, 'disabled', !appState.dashboardSearchQuery); // Enable button if query exists
    // Apply search immediately or wait for button click/Enter? Debounce implies immediate filtering
    appState.dashboardCurrentPage = 1; // Reset page
    renderDashboardQuestionAnalysis(); // Re-render analysis view
}

/** Applies the dashboard search query (e.g., on Enter or button click) */
function applyDashboardSearch() {
     appState.dashboardCurrentPage = 1; // Reset page
     renderDashboardQuestionAnalysis(); // Re-render with current query
}

/** Clears the dashboard search query and updates the view */
function clearDashboardSearch() {
    safeSetValue(dom.dashboardSearchQuery, '');
    appState.dashboardSearchQuery = '';
    safeSetAttribute(dom.dashboardSearchButton, 'disabled', true); // Disable search button
    appState.dashboardCurrentPage = 1; // Reset page
    renderDashboardQuestionAnalysis(); // Re-render analysis view
}

/** Handles changes in the dashboard sort order dropdown */
function handleDashboardSortChange(event) {
    appState.dashboardSortOrder = event.target.value;
    appState.dashboardCurrentPage = 1; // Reset page
    renderDashboardQuestionAnalysis(); // Re-render analysis view
}

/** Handles changes in the dashboard items per page dropdown */
function handleDashboardItemsPerPageChange(event) {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && [10, 20, 50, 100].includes(value)) {
         appState.dashboardQuestionsPerPage = value;
         appState.dashboardCurrentPage = 1; // Reset to page 1
         renderDashboardQuestionAnalysis(); // Re-render analysis view
         // If settings should also be updated immediately:
         // appState.settings.dashboardQuestionsPerPage = value;
         // saveSettings(); // Requires save function confirmation
    }
}

/** Sets the dashboard view mode (list or chart) */
function setDashboardViewMode(mode) {
     if (mode !== 'list' && mode !== 'chart') return;
     appState.dashboardViewMode = mode;

     // Update button states
     setActiveClass(dom.viewModeList, mode === 'list');
     setActiveClass(dom.viewModeChart, mode === 'chart');
     setAriaPressed(dom.viewModeList, mode === 'list');
     setAriaPressed(dom.viewModeChart, mode === 'chart');

     // Update view visibility
     setActiveClass(dom.questionListView, mode === 'list');
     setActiveClass(dom.questionChartView, mode === 'chart');

     // Re-render the appropriate view
     renderDashboardQuestionAnalysis();
 }

/** Resets dashboard filters and state variables */
function resetDashboardFiltersAndState(resetDeck = false) {
     if(resetDeck) appState.currentDashboardDeckId = null;
     appState.dashboardCurrentPage = 1;
     appState.dashboardFilterAccuracy = 'all';
     appState.dashboardSearchQuery = '';
     appState.dashboardSortOrder = 'accuracyAsc';
     appState.dashboardViewMode = 'list';
     appState.isDashboardControlsCollapsed = true;
     // Reset UI elements
     safeSetValue(dom.dashboardDeckSelect, '');
     safeSetValue(dom.dashboardFilterAccuracy, 'all');
     safeSetValue(dom.dashboardSearchQuery, '');
     safeSetValue(dom.dashboardSortOrder, 'accuracyAsc');
     safeSetValue(dom.dashboardItemsPerPage, appState.settings.dashboardQuestionsPerPage);
     setDashboardViewMode('list'); // Reset to list view
     toggleDashboardControlsBasedOnSize(); // Adjust controls visibility
}

/** Renders the entire dashboard content based on the selected deck */
async function renderDashboard() { // Keep async if using fetch later
    if (!dom.dashboardContent || !dom.dashboardNoDeckMessage) {
        console.error("Dashboard elements not found");
        return;
    }

    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck) {
        safeSetStyle(dom.dashboardContent, 'display', 'none');
        safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'block');
        // Clear existing charts if any
        destroyChart('studyTrends');
        destroyChart('questionAccuracy');
        return;
    }

    safeSetStyle(dom.dashboardContent, 'display', 'block');
    safeSetStyle(dom.dashboardNoDeckMessage, 'display', 'none');

    // Update deck name display
    safeSetText(dom.dashboardDeckName, escapeHtml(deck.name));

    // Render different sections
    renderDashboardOverview(deck);
    renderDashboardTrendsChart(deck); // Render trends chart
    renderDashboardQuestionAnalysis(); // Render question analysis (list or chart)

    console.log(`Dashboard rendered for deck: ${deck.name}`);
}


/** Renders the overview section of the dashboard */
function renderDashboardOverview(deck) {
    if (!dom.dashboardOverview) return;

    const stats = calculateOverallAccuracy(deck);

    safeSetText(dom.dashboardTotalQuestions, deck.questions?.length ?? 0);
    safeSetText(dom.dashboardTotalAnswered, stats.totalAnswered);
    safeSetText(dom.dashboardOverallAccuracy, stats.accuracyText);
    safeSetText(dom.dashboardLastStudied, formatDate(deck.lastStudied));

    console.log("Dashboard overview rendered");
}

/** Renders the study trends chart */
function renderDashboardTrendsChart(deck) {
    if (!dom.studyTrendsChart || !checkChartJSAvaible()) {
        console.warn("Chart.js not available or chart element missing for trends");
        safeSetStyle(dom.studyTrendsChartContainer, 'display', 'block'); // Show container
        safeSetStyle(dom.studyTrendsNoData, 'display', 'block'); // Show no data message
        safeSetStyle(dom.studyTrendsChart, 'display', 'none'); // Hide canvas
        destroyChart('studyTrends'); // Ensure chart is destroyed
        return;
    }

    // Destroy previous chart if exists
    destroyChart('studyTrends');

    // Prepare session history data
    const sessions = deck.sessionHistory || [];
    if (sessions.length < 1) { // Can show even for 1 session, just won't be a trend
        safeSetStyle(dom.studyTrendsChartContainer, 'display', 'block');
        safeSetStyle(dom.studyTrendsNoData, 'display', 'block');
        safeSetStyle(dom.studyTrendsChart, 'display', 'none');
        return;
    }

    // Limit to last N sessions (most recent first for display, but chart needs chronological)
    const recentSessions = sessions.slice(-DASHBOARD_TREND_SESSIONS); //.reverse();
    const labels = recentSessions.map((s, i) => {
        // Use date or just index? Index is simpler.
        return `セッション ${sessions.length - recentSessions.length + i + 1}`; // Label based on original position
    });

    const correctData = recentSessions.map(s => s.correct);
    const incorrectData = recentSessions.map(s => s.incorrect);
    const accuracyData = recentSessions.map(s =>
        (s.correct + s.incorrect > 0) ? Math.round((s.correct / (s.correct + s.incorrect)) * 100) : 0
    );

    const currentTheme = getCurrentAppliedTheme();
    const gridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = currentTheme === 'dark' ? '#e0e0e0' : '#333';
    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim();
    const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger-color').trim();
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();


    // Create chart
    const ctx = dom.studyTrendsChart.getContext('2d');
    appState.charts.studyTrends = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '正解',
                    data: correctData,
                    backgroundColor: successColor, // Use CSS var
                    // borderColor: 'hsl(var(--success-hue), 55%, 40%)',
                    borderWidth: 0,
                    order: 1
                },
                {
                    label: '不正解',
                    data: incorrectData,
                    backgroundColor: dangerColor, // Use CSS var
                    // borderColor: 'hsl(var(--danger-hue), 75%, 40%)',
                    borderWidth: 0,
                    order: 1
                },
                {
                    label: '正答率 (%)',
                    data: accuracyData,
                    type: 'line',
                    borderColor: primaryColor, // Use CSS var
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: primaryColor,
                    pointRadius: 3,
                    yAxisID: 'y1', // Ensure this matches the scale ID
                    order: 0,
                    tension: 0.1 // Slight curve to the line
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { // Left Y Axis (Counts)
                    beginAtZero: true,
                    stacked: true,
                    title: {
                        display: true,
                        text: '問題数',
                        color: textColor
                    },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y1: { // Right Y Axis (Accuracy %)
                    position: 'right',
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: '正答率 (%)',
                        color: textColor
                    },
                    grid: { drawOnChartArea: false }, // Don't draw grid lines for accuracy axis
                    ticks: { color: textColor }
                },
                x: { // X Axis (Sessions)
                    stacked: true,
                    title: {
                         display: false, // Title might be redundant
                         text: '学習セッション',
                         color: textColor
                    },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index', // Show tooltips for all datasets at the same index
                    intersect: false,
                    callbacks: { // Customize tooltip content
                        // title: function(tooltipItems) { return tooltipItems[0].label; }, // Default title is fine
                        label: function(context) {
                             let label = context.dataset.label || '';
                             if (label) label += ': ';
                             if (context.dataset.label === '正答率 (%)') {
                                 label += context.parsed.y + '%';
                             } else {
                                 label += context.parsed.y + '問';
                             }
                             return label;
                        }
                    }
                },
                 legend: {
                     labels: { color: textColor } // Set legend text color
                 }
            }
        }
    });

    safeSetStyle(dom.studyTrendsChartContainer, 'display', 'block');
    safeSetStyle(dom.studyTrendsNoData, 'display', 'none');
    safeSetStyle(dom.studyTrendsChart, 'display', 'block'); // Ensure canvas is visible
}

/** Renders the question analysis section (either list or chart) */
function renderDashboardQuestionAnalysis() {
    // Get the filtered and sorted data first
    const questionStats = getFilteredAndSortedQuestionStats();

    // Render the correct view based on the current mode
    if (appState.dashboardViewMode === 'list') {
        renderDashboardQuestionList(questionStats); // Pass the calculated stats
         setActiveClass(dom.questionListView, true);
         setActiveClass(dom.questionChartView, false);
    } else {
        renderDashboardQuestionAnalysisChart(questionStats); // Pass the calculated stats
         setActiveClass(dom.questionListView, false);
         setActiveClass(dom.questionChartView, true);
    }
}

/** Renders the question analysis list view */
function renderDashboardQuestionList(questionStats) {
    if (!dom.questionAccuracyList) return;
    dom.questionAccuracyList.innerHTML = ''; // Clear previous list

    if (questionStats.length === 0) {
        safeSetHTML(dom.questionAccuracyList, '<li class="status-message info-message">フィルター条件に該当する問題がありません。</li>');
        renderDashboardPagination(0); // Render empty pagination
        return;
    }

    // Pagination calculation
    const startIdx = (appState.dashboardCurrentPage - 1) * appState.dashboardQuestionsPerPage;
    const endIdx = Math.min(startIdx + appState.dashboardQuestionsPerPage, questionStats.length);
    const pageQuestions = questionStats.slice(startIdx, endIdx);

    // List item generation
    const fragment = document.createDocumentFragment();
    pageQuestions.forEach((q) => {
        const li = document.createElement('li');
        li.className = 'question-accuracy-item';
        li.setAttribute('data-question-id', q.id);
        li.setAttribute('tabindex', '0');
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', `問題詳細を表示: ${escapeHtml(q.questionText.substring(0,50))}... 正答率 ${q.accuracy}%`);

        const accuracyClass = q.totalCount === 0 ? 'unanswered' : getAccuracyClass(q.accuracy);
        const accuracyDisplay = q.totalCount === 0 ? '未解答' : `${q.accuracy}%`;
        const countsDisplay = q.totalCount === 0 ? '' : `(${q.correctCount}/${q.totalCount})`;

        li.innerHTML = `
            <div class="question-text-preview">${escapeHtml(q.questionText)}</div>
            <div class="score-container">
                <span class="accuracy ${accuracyClass}">${accuracyDisplay}</span>
                <span class="answer-counts">${countsDisplay}</span>
            </div>
        `;
        fragment.appendChild(li);
    });

    dom.questionAccuracyList.appendChild(fragment);
    renderDashboardPagination(questionStats.length); // Render pagination based on total filtered items
}


/**
 * Handles click events on question list items to show details.
 * @param {MouseEvent} event The click event.
 */
function handleQuestionItemClick(event) {
    const listItem = event.target.closest('.question-accuracy-item');
    if (!listItem) return;
    const questionId = listItem.dataset.questionId;
    if (questionId) {
        showDetailForListItem(questionId);
    }
}

/**
 * Handles keydown events on question list items for keyboard navigation and activation.
 * @param {KeyboardEvent} event The keydown event.
 */
function handleQuestionItemKeydown(event) {
    const currentItem = event.target.closest('.question-accuracy-item');
    if (!currentItem) return;

    switch (event.key) {
        case 'Enter':
        case ' ': // Activate on Enter or Space
            event.preventDefault();
            const questionId = currentItem.dataset.questionId;
            if (questionId) {
                showDetailForListItem(questionId);
            }
            break;
        case 'ArrowDown': // Move focus down
        case 'ArrowUp':   // Move focus up
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling';
            focusSiblingListItem(currentItem, direction); // Reuse utility
            break;
        case 'Home': // Move focus to first item
        case 'End':  // Move focus to last item
            event.preventDefault();
            const target = event.key === 'Home' ? 'firstElementChild' : 'lastElementChild';
            focusSiblingListItem(currentItem, target, currentItem.parentElement); // Reuse utility
            break;
    }
}

/**
 * Shows a modal with detailed information for a specific question.
 * @param {string} questionId - The ID of the question to show details for.
 */
function showDetailForListItem(questionId) {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    const question = deck?.questions.find(q => q.id === questionId);

    if (!question) {
        console.error(`Question with ID ${questionId} not found in current deck.`);
        showNotification("問題詳細が見つかりません。", "error");
        return;
    }

    // Create the content element for the modal
    const detailElement = createQuestionDetailElement(question);

    showModal({
        title: `問題詳細`, // Keep title generic or shorten it
        content: detailElement,
        buttons: [
            { id: 'close-question-detail', text: '閉じる', class: 'secondary', onClick: closeModal }
        ],
        size: 'lg' // Use large modal for details
    });
}

/**
 * Creates the DOM element containing detailed information for a question.
 * @param {QuestionData} questionData The question data.
 * @returns {HTMLElement} The created div element.
 */
function createQuestionDetailElement(questionData) {
    const div = document.createElement('div');
    div.id = `q-detail-${questionData.id}`; // Ensure unique ID
    div.className = 'question-detail-modal-content'; // Add a class for styling

    const stats = calculateQuestionAccuracy(questionData);
    const accuracyClass = stats.totalCount === 0 ? 'unanswered' : getAccuracyClass(stats.accuracy);
    const accuracyDisplay = stats.totalCount === 0 ? '未解答' : `${stats.accuracy}%`;
    const countsDisplay = stats.totalCount === 0 ? '' : `(${stats.correctCount}/${stats.totalCount})`;

    // Basic Question Info
    div.innerHTML = `
        <div id="question-detail-view" role="document"> <!-- Add role -->
            <h4>問題文</h4>
            <p>${escapeHtml(questionData.question)}</p>
            <h4>選択肢</h4>
            <ul>
                ${questionData.options.map((opt, index) => `<li ${opt === questionData.correctAnswer ? 'style="font-weight:bold; color:var(--success-color);"' : ''}>${index + 1}. ${escapeHtml(opt)} ${opt === questionData.correctAnswer ? '<i class="fas fa-check" style="margin-left: 5px;"></i>' : ''}</li>`).join('')}
            </ul>
            <h4>正解</h4>
            <p>${escapeHtml(questionData.correctAnswer)}</p>
            <h4>解説</h4>
            <p>${escapeHtml(questionData.explanation || '解説はありません。')}</p>
            <hr>
            <h4>統計</h4>
            <p>正答率: <strong class="${accuracyClass}">${accuracyDisplay}</strong> ${countsDisplay}</p>
            <h4>解答履歴 (最新 ${MAX_RECENT_HISTORY}件)</h4>
        </div>
    `;

    // Add History Details
    const historyList = document.createElement('ul');
    historyList.className = 'question-history-list';
    historyList.setAttribute('aria-label', '最新の解答履歴');

    if (!questionData.history || questionData.history.length === 0) {
        historyList.innerHTML = '<li>履歴がありません。</li>';
    } else {
        // Display recent history, most recent first
        const recentHistory = questionData.history.slice(-MAX_RECENT_HISTORY).reverse();
        recentHistory.forEach(h => {
            const li = document.createElement('li');
            const status = h.correct ? '正解' : '不正解';
            const statusClass = h.correct ? 'correct' : 'incorrect';
            const evalMap = {'difficult': '難', 'normal': '普', 'easy': '易'};
            const evaluation = h.evaluation ? ` <span class="eval">(${evalMap[h.evaluation] || h.evaluation})</span>` : ''; // Add class for styling eval
            li.innerHTML = `<span>${formatDate(h.ts)}:</span> <span class="history-status ${statusClass}">${status}</span>${evaluation}`;
            historyList.appendChild(li);
        });
         if (questionData.history.length > MAX_RECENT_HISTORY) {
             const moreInfo = document.createElement('li');
             moreInfo.textContent = `... 他 ${questionData.history.length - MAX_RECENT_HISTORY}件の履歴あり`;
             moreInfo.style.fontStyle = 'italic';
             historyList.appendChild(moreInfo);
         }
    }
    // Append history list to the correct container div
    div.querySelector('#question-detail-view').appendChild(historyList);

    return div;
}


/**
 * Renders the question analysis chart view in the dashboard.
 * @param {object[]} questionStats - Array of question statistics to display.
 */
function renderDashboardQuestionAnalysisChart(questionStats) {
    if (!dom.questionAccuracyChart || !checkChartJSAvaible()) {
        console.warn("Chart.js not available or chart element missing for analysis");
        safeSetStyle(dom.questionAccuracyChartContainer, 'display', 'block'); // Show container
        safeSetStyle(dom.questionAccuracyNoData, 'display', 'block'); // Show no data
        safeSetStyle(dom.questionAccuracyChart, 'display', 'none'); // Hide canvas
        destroyChart('questionAccuracy'); // Ensure chart is destroyed
        return;
    }

    // Destroy previous chart if exists
    destroyChart('questionAccuracy');

    // Filter out questions with no answers for the chart
    const answeredQuestions = questionStats.filter(q => q.totalCount > 0);

    if (answeredQuestions.length === 0) {
        safeSetStyle(dom.questionAccuracyChartContainer, 'display', 'block');
        safeSetStyle(dom.questionAccuracyNoData, 'display', 'block');
        safeSetStyle(dom.questionAccuracyChart, 'display', 'none');
        return;
    }

    // Group questions by accuracy range
    const accuracyRanges = {
        low: { label: `0-${DASHBOARD_ACCURACY_THRESHOLDS.LOW}%`, count: 0, questionIds: [] },
        medium: { label: `${DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1}-${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM}%`, count: 0, questionIds: [] },
        high: { label: `${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1}-100%`, count: 0, questionIds: [] },
    };

    answeredQuestions.forEach(q => {
        if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) {
            accuracyRanges.low.count++;
            accuracyRanges.low.questionIds.push(q.id);
        } else if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) {
            accuracyRanges.medium.count++;
            accuracyRanges.medium.questionIds.push(q.id);
        } else {
            accuracyRanges.high.count++;
            accuracyRanges.high.questionIds.push(q.id);
        }
    });

    const labels = Object.values(accuracyRanges).map(range => range.label);
    const data = Object.values(accuracyRanges).map(range => range.count);

    // Get colors dynamically based on theme
    const currentTheme = getCurrentAppliedTheme();
    const gridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = currentTheme === 'dark' ? '#e0e0e0' : '#333';
    const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger-color').trim();
    const warningColor = getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim();
    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim();

    const backgroundColors = [dangerColor, warningColor, successColor];
    const borderColors = backgroundColors; // Can make darker/lighter if needed

    const ctx = dom.questionAccuracyChart.getContext('2d');
    appState.charts.questionAccuracy = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '問題数',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Optional: Make it a horizontal bar chart? Maybe better for labels.
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { // Now the category axis
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: { // Now the value axis
                    beginAtZero: true,
                     title: {
                        display: true,
                        text: '問題数',
                        color: textColor
                    },
                    grid: { color: gridColor },
                    ticks: {
                         color: textColor,
                         stepSize: 1, // Ensure integer ticks
                         callback: function(value) { if (Number.isInteger(value)) return value; }
                     }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                             return ` ${context.parsed.x}問`; // Show count for horizontal bar
                        }
                    }
                }
            },
             onClick: (event, elements) => {
                 if (elements.length > 0) {
                     const firstElement = elements[0];
                     const index = firstElement.index;
                     const rangeKey = Object.keys(accuracyRanges)[index];
                     const questionIds = accuracyRanges[rangeKey].questionIds;

                     if (questionIds.length > 0) {
                         // Show modal with list of questions in this range
                         showQuestionListModal(rangeKey, questionIds);
                     } else {
                         showNotification("この範囲に該当する問題はありません。", "info", 2000);
                     }
                 }
             },
             onHover: (event, chartElement) => { // Change cursor on hover
                 event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
             }
        }
    });

    safeSetStyle(dom.questionAccuracyChartContainer, 'display', 'block');
    safeSetStyle(dom.questionAccuracyNoData, 'display', 'none');
    safeSetStyle(dom.questionAccuracyChart, 'display', 'block'); // Ensure canvas is visible
}

/**
 * Shows a modal listing questions within a specific accuracy range.
 * @param {string} rangeKey - The key of the accuracy range ('low', 'medium', 'high').
 * @param {string[]} questionIds - Array of question IDs in this range.
 */
function showQuestionListModal(rangeKey, questionIds) {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck || !Array.isArray(deck.questions) || questionIds.length === 0) {
        showNotification("問題リストを作成できませんでした。", "error");
        return;
    }

    const rangeLabels = {
        low: `正答率 0-${DASHBOARD_ACCURACY_THRESHOLDS.LOW}%`,
        medium: `正答率 ${DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1}-${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM}%`,
        high: `正答率 ${DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1}-100%`,
    };
    const title = `${rangeLabels[rangeKey] || '問題リスト'} (${questionIds.length}問)`;

    // Find the actual question objects for the IDs
    const questionsInList = questionIds
        .map(id => deck.questions.find(q => q.id === id))
        .filter(q => q !== undefined); // Remove any not found (shouldn't happen if IDs are correct)

    // Create a list element for the modal content
    const listElement = document.createElement('ul');
    listElement.className = 'modal-question-list'; // Use for styling
    listElement.setAttribute('role', 'list'); // ARIA role
    listElement.style.listStyle = 'none'; // Basic styling override
    listElement.style.padding = '0';
    listElement.style.maxHeight = '60vh'; // Limit height inside modal
    listElement.style.overflowY = 'auto';

    if (questionsInList.length === 0) {
        listElement.innerHTML = '<li>該当する問題がありません。</li>';
    } else {
         // Sort questions within the modal list for consistency? (e.g., by accuracy Asc)
         questionsInList.sort((a, b) => calculateQuestionAccuracy(a).accuracy - calculateQuestionAccuracy(b).accuracy);

        questionsInList.forEach(q => {
            const qStats = calculateQuestionAccuracy(q);
            const accuracyClass = qStats.totalCount === 0 ? 'unanswered' : getAccuracyClass(qStats.accuracy);
            const accuracyDisplay = qStats.totalCount === 0 ? '未解答' : `${qStats.accuracy}%`;
            const countsDisplay = qStats.totalCount === 0 ? '' : `(${qStats.correctCount}/${qStats.totalCount})`;

            const listItem = document.createElement('li');
            listItem.className = 'modal-question-list-item'; // Use for styling
            // Basic styling for list items
            listItem.style.display = 'flex';
            listItem.style.justifyContent = 'space-between';
            listItem.style.alignItems = 'center';
            listItem.style.padding = '10px';
            listItem.style.borderBottom = '1px solid var(--border-color)';
            listItem.style.cursor = 'pointer';

            listItem.innerHTML = `
                <div class="question-text-preview" style="flex-grow: 1; margin-right: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(q.question)}</div>
                <div class="question-stats" style="flex-shrink: 0; text-align: right;">
                    <span class="accuracy ${accuracyClass}" style="font-weight: bold; margin-right: 5px;">${accuracyDisplay}</span>
                    <span class="counts" style="font-size: 0.9em; color: var(--text-light);">${countsDisplay}</span>
                </div>
            `;
            // Make list items clickable to show full detail
            listItem.setAttribute('data-question-id', q.id);
            listItem.setAttribute('tabindex', '0');
            listItem.setAttribute('role', 'button');
            listItem.setAttribute('aria-label', `問題詳細を表示: ${escapeHtml(q.question.substring(0, 50))}... ${accuracyDisplay}`);
            listItem.addEventListener('click', () => {
                 closeModal(); // Close the list modal first
                 showDetailForListItem(q.id); // Show the detail modal
            });
             listItem.addEventListener('keydown', (event) => {
                 if (event.key === 'Enter' || event.key === ' ') {
                     event.preventDefault();
                     closeModal();
                     showDetailForListItem(q.id);
                 }
             });
             // Add hover effect
             listItem.addEventListener('mouseenter', () => listItem.style.backgroundColor = 'var(--bg-hover)');
             listItem.addEventListener('mouseleave', () => listItem.style.backgroundColor = '');

            listElement.appendChild(listItem);
        });
    }

    showModal({
        title: title,
        content: listElement,
        buttons: [
            { id: 'close-question-list-modal', text: '閉じる', class: 'secondary', onClick: closeModal }
        ],
        size: 'lg'
    });

     // Focus the first item in the list after modal opens
     setTimeout(() => listElement.querySelector('.modal-question-list-item')?.focus(), 100);
}


/** Renders the pagination controls for the dashboard question list */
function renderDashboardPagination(totalItems) {
    const itemsPerPage = appState.dashboardQuestionsPerPage || DEFAULT_SETTINGS.dashboardQuestionsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const currentPage = appState.dashboardCurrentPage;

    // Use the generic pagination renderer
    renderGenericPagination(
        dom.questionPagination,
        totalItems,
        totalPages,
        currentPage,
        'dashboard-page-nav' // Unique prefix for aria-label
    );
}

/** Handles click events on dashboard pagination buttons */
function handleDashboardPaginationClick(event) {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck) return;

    const totalItems = getFilteredAndSortedQuestionStats().length; // Get total items after filters/sort
    const itemsPerPage = appState.dashboardQuestionsPerPage || DEFAULT_SETTINGS.dashboardQuestionsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    const targetPage = getPageFromPaginationClick(event, 'dashboard-page-nav'); // Use specific prefix

    if (targetPage !== null && targetPage !== appState.dashboardCurrentPage && targetPage >= 1 && targetPage <= totalPages) {
        console.log(`Navigating dashboard list to page ${targetPage}`);
        appState.dashboardCurrentPage = targetPage;
        renderDashboardQuestionAnalysis(); // Re-render analysis list/chart for the new page
        // Optionally focus the list after pagination
        if (appState.dashboardViewMode === 'list') {
            dom.questionAccuracyList?.focus();
        }
    }
}

/** Gets filtered and sorted question stats for the dashboard */
function getFilteredAndSortedQuestionStats() {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
    if (!deck || !Array.isArray(deck.questions)) {
        return [];
    }

    // Calculate initial stats for all questions in the deck
    const questionStats = deck.questions.map((q, index) => { // Add index here
        const stats = calculateQuestionAccuracy(q);
        return {
            id: q.id,
            questionText: q.question,
            explanationText: q.explanation, // Include explanation for search
            optionsText: q.options.join(' '), // Include options for search
            accuracy: stats.accuracy,
            correctCount: stats.correctCount,
            incorrectCount: stats.incorrectCount,
            totalCount: stats.totalCount,
            lastAnswerCorrect: stats.lastAnswerCorrect,
            lastAnsweredTimestamp: q.history?.length > 0 ? q.history[q.history.length - 1].ts : 0, // Get timestamp of last answer
            originalIndex: index // Store original index for 'questionOrder' sort
        };
    });

    // Apply filters
    const filteredStats = applyDashboardFilters(questionStats);

    // Apply sorting
    const sortedStats = applyDashboardSorting(filteredStats);

    return sortedStats;
}

/** Apply dashboard filters to question stats */
function applyDashboardFilters(questionStats) {
    const filterAccuracy = appState.dashboardFilterAccuracy;
    const query = appState.dashboardSearchQuery.toLowerCase().trim();

    return questionStats.filter(q => {
        // Accuracy filter
        const accuracy = q.totalCount > 0 ? q.accuracy : -1; // Use -1 for unanswered
        if (filterAccuracy === 'low' && (accuracy === -1 || accuracy > DASHBOARD_ACCURACY_THRESHOLDS.LOW)) return false;
        if (filterAccuracy === 'medium' && (accuracy === -1 || accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW || accuracy > DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM)) return false;
        if (filterAccuracy === 'high' && (accuracy === -1 || accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM)) return false;
        if (filterAccuracy === 'unanswered' && accuracy !== -1) return false;

        // Search filter (check question, options, and explanation)
        if (query) {
            const searchableText = `${q.questionText} ${q.optionsText} ${q.explanationText}`.toLowerCase();
            if (!searchableText.includes(query)) return false;
        }

        return true;
    });
}

/** Apply dashboard sorting to question stats */
function applyDashboardSorting(questionStats) {
    const sortOrder = appState.dashboardSortOrder;
    // Create a copy before sorting to avoid modifying the filtered array directly if needed elsewhere
    return [...questionStats].sort((a, b) => {
        switch (sortOrder) {
            case 'accuracyAsc':
                // Sort unanswered (-1) first, then by accuracy ascending
                if(a.accuracy === -1 && b.accuracy !== -1) return -1;
                if(a.accuracy !== -1 && b.accuracy === -1) return 1;
                return (a.accuracy - b.accuracy) || (a.originalIndex - b.originalIndex); // Secondary sort by original order
            case 'accuracyDesc':
                // Sort by accuracy descending, unanswered (-1) last
                 if(a.accuracy === -1 && b.accuracy !== -1) return 1;
                 if(a.accuracy !== -1 && b.accuracy === -1) return -1;
                 return (b.accuracy - a.accuracy) || (a.originalIndex - b.originalIndex);
            case 'mostIncorrect':
                return (b.incorrectCount - a.incorrectCount) || (b.totalCount - a.totalCount) || (a.originalIndex - b.originalIndex);
            case 'lastAnswered':
                return (b.lastAnsweredTimestamp - a.lastAnsweredTimestamp) || (a.originalIndex - b.originalIndex); // Most recent first
            case 'questionOrder': default:
                return a.originalIndex - b.originalIndex; // Sort by original index in the deck
        }
    });
}


// ====================================================================
// 設定画面関連処理 (Settings)
// ====================================================================

/** 設定画面のUI要素に現在の設定値を読み込む */
function loadSettingsToUI() {
    safeSetChecked(dom.settingShuffleOptions, appState.settings.shuffleOptions);
    safeSetValue(dom.settingLowAccuracyThreshold, appState.settings.lowAccuracyThreshold);
    safeSetValue(dom.settingHomeItemsPerPage, appState.settings.homeDecksPerPage);
    safeSetValue(dom.settingDashboardItemsPerPage, appState.settings.dashboardQuestionsPerPage);
    safeSetValue(dom.settingTheme, appState.settings.theme);
    setSettingsUnsavedStatus(false); // Initially, settings are saved
}

/** 設定画面: 閾値入力のリアルタイム処理（バリデーション表示など） */
function handleSettingThresholdInput(event) {
    // Validate input as user types (optional, debounce helps)
    const value = parseInt(event.target.value, 10);
    if (isNaN(value) || value < 1 || value > 99) {
        // Maybe show visual feedback?
        event.target.style.borderColor = 'var(--danger-color)';
    } else {
        event.target.style.borderColor = ''; // Reset border
        setSettingsUnsavedStatus(true);
    }
}
/** 設定画面: 閾値変更時の最終バリデーションと値修正 */
function handleSettingThresholdChange(event) {
    // Final validation on change (e.g., leaving the field)
    let value = parseInt(event.target.value, 10);
    if (isNaN(value) || value < 1) {
        value = 1;
    } else if (value > 99) {
        value = 99;
    }
    event.target.value = value; // Correct the value in the input field
    event.target.style.borderColor = ''; // Ensure border is reset
    setSettingsUnsavedStatus(true);
}

/** 設定が変更されたが未保存の状態をUIに反映 */
function setSettingsUnsavedStatus(isUnsaved) {
    if (dom.saveSettingsButton) {
        dom.saveSettingsButton.disabled = !isUnsaved;
        setAriaDisabled(dom.saveSettingsButton, !isUnsaved);
    }
    if(dom.settingsSaveStatus) {
        if (isUnsaved) {
            updateStatusMessage(dom.settingsSaveStatus, "未保存の変更があります。", "warning");
        } else {
            // Clear status or show saved message briefly after save
             // updateStatusMessage(dom.settingsSaveStatus, "", "info"); // Clear immediately
        }
    }
}

/** 設定を保存する */
function saveSettings() {
    try {
         // Read values from UI elements
         const newSettings = {
             shuffleOptions: dom.settingShuffleOptions.checked,
             lowAccuracyThreshold: parseInt(dom.settingLowAccuracyThreshold.value, 10) || DEFAULT_SETTINGS.lowAccuracyThreshold,
             homeDecksPerPage: parseInt(dom.settingHomeItemsPerPage.value, 10) || DEFAULT_SETTINGS.homeDecksPerPage,
             dashboardQuestionsPerPage: parseInt(dom.settingDashboardItemsPerPage.value, 10) || DEFAULT_SETTINGS.dashboardQuestionsPerPage,
             theme: dom.settingTheme.value || DEFAULT_SETTINGS.theme,
         };

         // Validate values again before saving (especially numbers)
         if (newSettings.lowAccuracyThreshold < 1 || newSettings.lowAccuracyThreshold > 99) newSettings.lowAccuracyThreshold = DEFAULT_SETTINGS.lowAccuracyThreshold;
         if (![10, 20, 50].includes(newSettings.homeDecksPerPage)) newSettings.homeDecksPerPage = DEFAULT_SETTINGS.homeDecksPerPage;
         if (![10, 20, 50, 100].includes(newSettings.dashboardQuestionsPerPage)) newSettings.dashboardQuestionsPerPage = DEFAULT_SETTINGS.dashboardQuestionsPerPage;
         if (!['light', 'dark', 'system'].includes(newSettings.theme)) newSettings.theme = DEFAULT_SETTINGS.theme;

         // Update app state
         appState.settings = newSettings;
         // Sync related state if necessary (e.g., dashboard items per page)
         appState.dashboardQuestionsPerPage = newSettings.dashboardQuestionsPerPage;

         // Save to LocalStorage
         if (saveData(LS_KEYS.SETTINGS, appState.settings)) {
             setSettingsUnsavedStatus(false); // Mark as saved
             updateStatusMessage(dom.settingsSaveStatus, "設定を保存しました。", "success");
             showNotification("設定が保存されました。", "success");
             // Re-apply any settings that affect global UI immediately
             applyTheme(appState.settings.theme);
             applyInitialSettingsToUI(); // Re-apply potentially changed values like thresholds to other parts of UI
             updateHomeUI(true); // Refresh home UI potentially affected by page size
             renderDashboard(); // Refresh dashboard potentially affected by page size
         } else {
             // Save failed (likely quota error) - error shown by saveData
             updateStatusMessage(dom.settingsSaveStatus, "設定の保存に失敗しました。", "error");
         }
         clearStatusMessageAfterDelay(dom.settingsSaveStatus, 3000);

    } catch (error) {
        console.error("Error saving settings:", error);
        showNotification(`設定の保存中にエラーが発生しました: ${error.message}`, "error");
        updateStatusMessage(dom.settingsSaveStatus, "保存エラー。", "error");
    }
}


// ====================================================================
// AIプロンプトガイド関連処理 (Prompt Guide)
// ====================================================================

/** プロンプトテンプレート内のプレースホルダーを更新 */
function updatePromptPlaceholders() {
     const topic = dom.promptFieldTopic?.value || '[専門分野]';
     const count = dom.promptFieldCount?.value || '[問題数]';
     const level = dom.promptFieldLevel?.value || '[対象レベル]';

     if (dom.promptTextTemplate) {
          const placeholders = dom.promptTextTemplate.querySelectorAll('.prompt-placeholder');
          placeholders.forEach(ph => {
              const targetId = ph.dataset.target;
              let value = '[?]';
              if (targetId === 'prompt-field-topic') value = topic;
              else if (targetId === 'prompt-field-count') value = count;
              else if (targetId === 'prompt-field-level') value = level;
              ph.textContent = escapeHtml(value); // Update text content safely
          });
     }
}
/** カスタマイズされたプロンプトをクリップボードにコピー */
function copyPromptToClipboard() {
    const promptText = dom.promptTextTemplate?.textContent;
    if (promptText) {
         copyTextToClipboard(promptText) // Use utility
             .then(() => {
                 updateStatusMessage(dom.copyStatus, 'コピーしました！', 'success');
                 clearStatusMessageAfterDelay(dom.copyStatus, 2000);
             })
             .catch(err => {
                 console.error('Failed to copy prompt:', err);
                 updateStatusMessage(dom.copyStatus, 'コピー失敗', 'error');
                 showNotification("プロンプトのコピーに失敗しました。", "error");
                 clearStatusMessageAfterDelay(dom.copyStatus, 3000);
             });
    } else {
        updateStatusMessage(dom.copyStatus, 'コピー対象なし', 'warning');
        clearStatusMessageAfterDelay(dom.copyStatus, 3000);
    }
}
/** JSONチェックエリアの入力ハンドラ */
function handleJsonCheckInput() {
    // Clear status immediately on input
    updateStatusMessage(dom.jsonCheckStatus, '', 'info');
}
/** 入力されたJSON文字列の形式をチェック */
function checkJsonFormat() {
    const jsonString = dom.jsonCheckInput?.value;
    if (!jsonString || jsonString.trim() === '') {
        updateStatusMessage(dom.jsonCheckStatus, '入力が空です', 'warning');
        return;
    }
    try {
        const data = JSON.parse(jsonString);
        // Run validation for deck format
        const validation = validateDeckJsonData(data);
        if (!validation.isValid) {
           throw new Error(validation.message); // Use validation message
        }
        // If validation passes (including empty but valid array)
        const questionCount = validation.questions?.length ?? 0;
        updateStatusMessage(dom.jsonCheckStatus, `有効な問題JSON形式です (${questionCount}問)。`, 'success');
        clearStatusMessageAfterDelay(dom.jsonCheckStatus, 5000);
    } catch (error) {
        console.error("JSON Check Error:", error);
        updateStatusMessage(dom.jsonCheckStatus, `JSON形式エラー: ${error.message}`, 'error');
        // Do not auto-clear error messages
    }
}


// ====================================================================
// ヘルパー関数 (Utilities)
// ====================================================================

/**
 * Generate a simple UUID v4.
 * @param {string} [prefix=''] Optional prefix.
 * @returns {string} A generated UUID string.
 */
function generateUUID(prefix = '') {
    // Basic RFC4122 version 4 compliant UUID generation
    return (prefix ? prefix + '_' : '') + ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

/**
 * Shuffles array in place using Fisher-Yates algorithm.
 * @param {Array<any>} array Array to shuffle.
 * @returns {Array<any>} The shuffled array.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array;
}

/**
 * Formats a timestamp into a localized date/time string.
 * @param {number | null | undefined} timestamp The timestamp (Date.now()) or null/undefined.
 * @returns {string} Formatted date string or '-'.
 */
function formatDate(timestamp) {
    if (timestamp === null || timestamp === undefined || typeof timestamp !== 'number' || timestamp <= 0) {
        return '-';
    }
    try {
        return new Intl.DateTimeFormat('ja-JP', DATE_FORMAT_OPTIONS).format(new Date(timestamp));
    } catch (e) {
        console.error("Error formatting date:", e);
        // Fallback to basic format if Intl fails
        try {
            const d = new Date(timestamp);
            return d.toLocaleString('ja-JP');
        } catch (fallbackError) {
             return 'Invalid Date';
        }
    }
}

/** Safely set text content of an element */
function safeSetText(element, text) {
    if (element) {
        element.textContent = text ?? ''; // Use empty string for null/undefined
    }
}

/** Safely set innerHTML of an element */
function safeSetHTML(element, html) {
    if (element) {
        element.innerHTML = html ?? '';
    }
}


/** Safely set value of an input/select/textarea element */
function safeSetValue(element, value) {
    if (element) {
        element.value = value ?? '';
    }
}

/** Safely set checked state of a checkbox/radio element */
function safeSetChecked(element, isChecked) {
    if (element && typeof element.checked === 'boolean') {
        element.checked = !!isChecked; // Ensure boolean
    }
}

/** Safely set style property of an element */
function safeSetStyle(element, property, value) {
    if (element && element.style && property !== undefined && value !== undefined) {
        element.style[property] = value;
    }
}
/** Safely set or remove an attribute */
function safeSetAttribute(element, attribute, value) {
    if (element) {
        if (value === null || value === undefined || value === false) {
            element.removeAttribute(attribute);
        } else {
            element.setAttribute(attribute, String(value));
        }
    }
}

/** Escape HTML special characters */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe; // Return non-strings as is
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/** Toggle 'active' class on an element */
function setActiveClass(element, isActive) {
    if (element) {
        element.classList.toggle('active', !!isActive); // Ensure boolean
    }
}

/** Set aria-pressed attribute */
function setAriaPressed(element, isPressed) {
    if (element) {
        element.setAttribute('aria-pressed', String(!!isPressed));
    }
}

/** Set aria-disabled attribute and manage tabindex */
function setAriaDisabled(element, isDisabled) {
    if (element) {
        element.setAttribute('aria-disabled', String(!!isDisabled));
        // Also manage tabindex for keyboard accessibility
        if (isDisabled) {
            element.setAttribute('tabindex', '-1');
        } else {
            // Restore tabindex only if it was previously managed or if it's a natural focus element
            // A simple approach: just remove it to rely on default behavior or CSS.
            element.removeAttribute('tabindex');
        }
    }
}

/** Safely destroy a Chart.js instance */
function destroyChart(chartKey) {
    if (appState.charts[chartKey]) {
        try {
            appState.charts[chartKey].destroy();
        } catch (e) { console.error(`Error destroying chart '${chartKey}':`, e); }
        appState.charts[chartKey] = null;
        console.log(`Chart '${chartKey}' destroyed.`);
    }
}
/** Check if Chart.js library is loaded */
function checkChartJSAvaible() {
    const available = typeof Chart !== 'undefined';
    if (!available) console.warn("Chart.js library is not loaded.");
    return available;
}

/**
 * Renders generic pagination controls.
 * @param {HTMLElement | null} containerElement - The container element for pagination.
 * @param {number} totalItems - Total number of items being paginated.
 * @param {number} totalPages - Total number of pages.
 * @param {number} currentPage - The current active page (1-based).
 * @param {string} ariaLabelPrefix - Prefix for aria-label attributes.
 */
function renderGenericPagination(containerElement, totalItems, totalPages, currentPage, ariaLabelPrefix) {
    if (!containerElement) return;
    containerElement.innerHTML = ''; // Clear previous pagination

    if (totalPages <= 1) {
        containerElement.style.display = 'none'; // Hide pagination if only one page or less
        return;
    }
    containerElement.style.display = 'flex'; // Show pagination

    const fragment = document.createDocumentFragment();

    // Previous Button
    fragment.appendChild(createButton({
        text: '<i class="fas fa-chevron-left"></i>',
        class: 'small secondary icon-button page-nav-prev',
        ariaLabel: `${ariaLabelPrefix}: 前のページ`,
        disabled: currentPage === 1,
        data: { pageTarget: 'prev' }
    }));

    // Page Number Buttons
    const buttons = getPaginationButtons(totalPages, currentPage, PAGINATION_BUTTON_COUNT);
    buttons.forEach(page => {
        if (page === '...') {
            const span = document.createElement('span');
            span.textContent = '...';
            span.className = 'page-ellipsis';
            span.setAttribute('aria-hidden', 'true');
            fragment.appendChild(span);
        } else {
            fragment.appendChild(createButton({
                text: String(page),
                class: `small page-nav-number ${page === currentPage ? 'primary active' : 'secondary'}`,
                ariaLabel: `${ariaLabelPrefix}: ${page}ページ目に移動 ${page === currentPage ? '(現在地)' : ''}`,
                ariaCurrent: page === currentPage ? 'page' : undefined, // Use undefined instead of null for attributes
                data: { pageTarget: String(page) }
            }));
        }
    });

    // Next Button
    fragment.appendChild(createButton({
        text: '<i class="fas fa-chevron-right"></i>',
        class: 'small secondary icon-button page-nav-next',
        ariaLabel: `${ariaLabelPrefix}: 次のページ`,
        disabled: currentPage === totalPages,
        data: { pageTarget: 'next' }
    }));

    // Page Info (e.g., "1 / 10 ページ")
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `${currentPage} / ${totalPages} ページ (${totalItems}件)`;
    pageInfo.setAttribute('aria-live', 'polite');

    containerElement.appendChild(fragment); // Add buttons first
    containerElement.appendChild(pageInfo); // Add info last
}

/** Calculate which page numbers to display in pagination */
function getPaginationButtons(totalPages, currentPage, maxButtons = 5) {
    const buttons = [];
    const half = Math.floor((maxButtons - 1) / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, currentPage + half);

    // Adjust start/end if near the beginning or end
    if (currentPage - half < 1) {
        end = Math.min(totalPages, maxButtons);
    }
    if (currentPage + half > totalPages) {
        start = Math.max(1, totalPages - maxButtons + 1);
    }

    // Add first page and ellipsis if needed
    if (start > 1) {
        buttons.push(1);
        if (start > 2) {
            buttons.push('...');
        }
    }

    // Add page numbers in the calculated range
    for (let i = start; i <= end; i++) {
        buttons.push(i);
    }

    // Add last page and ellipsis if needed
    if (end < totalPages) {
        if (end < totalPages - 1) {
            buttons.push('...');
        }
        buttons.push(totalPages);
    }

    return buttons;
}

/** Get target page number from pagination click event */
function getPageFromPaginationClick(event, prefix) {
    const button = event.target.closest('button[data-page-target]');
    if (!button || button.disabled) return null;

    const target = button.dataset.pageTarget;
    let currentPageState = prefix === 'deck-page-nav' ? appState.homeDeckCurrentPage : appState.dashboardCurrentPage;
    let newPage = null;


    if (target === 'prev') {
        newPage = currentPageState - 1;
    } else if (target === 'next') {
        newPage = currentPageState + 1;
    } else if (!isNaN(parseInt(target, 10))) {
        newPage = parseInt(target, 10);
    }

    // Basic validation (caller should do more specific checks against totalPages)
    return (newPage !== null && newPage >= 1) ? newPage : null;
}

/** Calculate accuracy stats for a single question */
function calculateQuestionAccuracy(questionData) {
     if (!questionData || !Array.isArray(questionData.history)) {
         return { accuracy: 0, correctCount: 0, incorrectCount: 0, totalCount: 0, lastAnswerCorrect: null };
     }
     const history = questionData.history;
     const totalCount = history.length;
     if (totalCount === 0) {
         return { accuracy: 0, correctCount: 0, incorrectCount: 0, totalCount: 0, lastAnswerCorrect: null };
     }
     const correctCount = history.filter(h => h.correct).length;
     const incorrectCount = totalCount - correctCount;
     const accuracy = Math.round((correctCount / totalCount) * 100);
     const lastAnswerCorrect = history[history.length - 1]?.correct ?? null; // Use optional chaining and nullish coalescing
     return { accuracy, correctCount, incorrectCount, totalCount, lastAnswerCorrect };
}

/**
 * Calculates overall accuracy and stats for a deck.
 * @param {DeckData | null} deck The deck data.
 * @returns {{accuracy: number, totalAnswered: number, accuracyText: string, correctCount: number, incorrectCount: number}}
 */
function calculateOverallAccuracy(deck) {
    if (!deck || !Array.isArray(deck.questions) || deck.questions.length === 0) {
        return { accuracy: 0, totalAnswered: 0, accuracyText: '-', correctCount: 0, incorrectCount: 0 };
    }

    let totalCorrect = 0;
    let totalAnswered = 0;

    deck.questions.forEach(q => {
        const qStats = calculateQuestionAccuracy(q); // Ensure this helper function is defined
        totalAnswered += qStats.totalCount;
        totalCorrect += qStats.correctCount;
    });

    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    const accuracyText = totalAnswered > 0 ? `${accuracy}% (${totalCorrect}/${totalAnswered})` : '-';

    return {
        accuracy,
        totalAnswered,
        accuracyText,
        correctCount: totalCorrect,
        incorrectCount: totalAnswered - totalCorrect
    };
}


/** Get CSS class based on accuracy percentage */
function getAccuracyClass(accuracy) {
    if (accuracy === null || accuracy === undefined || isNaN(accuracy)) return 'unanswered'; // Handle NaN explicitly
    if (accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) return 'low';
    if (accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) return 'medium';
    return 'high';
}

/**
 * Creates a button element based on configuration.
 * @param {ModalButtonConfig | object} config Button configuration.
 * @returns {HTMLButtonElement} The created button element.
 */
function createButton(config) {
    const button = document.createElement('button');
    button.type = 'button';
    if (config.id) button.id = config.id;
    button.innerHTML = config.text || ''; // Allow HTML in text
    if (config.class) button.className = `button ${config.class}`; else button.className = 'button';
    if (config.onClick && typeof config.onClick === 'function') {
        button.addEventListener('click', config.onClick);
    }
    if (config.disabled) {
        button.disabled = true;
        setAriaDisabled(button, true);
    }
    if (config.ariaLabel) {
        button.setAttribute('aria-label', config.ariaLabel);
    }
     if (config.ariaCurrent) { // Handle aria-current specifically
         button.setAttribute('aria-current', config.ariaCurrent);
     }
    // Add data attributes if provided
    if (config.data && typeof config.data === 'object') {
        for (const key in config.data) {
            if (Object.hasOwnProperty.call(config.data, key)) {
                // Dataset automatically handles kebab-case conversion
                button.dataset[key] = config.data[key];
            }
        }
    }
    return button;
}

/** Basic validation for QuestionData object before use */
function isValidQuestion(questionData) {
    return Boolean(
        questionData &&
        typeof questionData === 'object' &&
        typeof questionData.id === 'string' && questionData.id &&
        typeof questionData.question === 'string' && questionData.question.trim() &&
        Array.isArray(questionData.options) && questionData.options.length >= 2 && // At least 2 options
        typeof questionData.correctAnswer === 'string' && questionData.correctAnswer.trim() &&
        questionData.options.includes(questionData.correctAnswer) && // Correct answer must be in options
        (typeof questionData.explanation === 'string' || questionData.explanation === null || questionData.explanation === undefined) && // Explanation can be empty/null/undefined
        Array.isArray(questionData.history) // History must be an array (can be empty)
    );
}

/** Copy text to clipboard utility */
async function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
      // Clipboard API not available (e.g., insecure context)
      // Fallback logic (less reliable)
      try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed"; // Prevent scrolling to bottom
          textArea.style.opacity = "0";
          textArea.style.left = "-9999px"; // Move off-screen
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          if (!successful) throw new Error('Fallback copy failed');
          console.log('Text copied using fallback.');
          return Promise.resolve();
      } catch (err) {
          console.error('Fallback copy error:', err);
          return Promise.reject(new Error('コピー機能を利用できません。'));
      }
    }
    // Use modern Clipboard API
    try {
        await navigator.clipboard.writeText(text);
        console.log('Text copied to clipboard successfully.');
        return Promise.resolve();
    } catch (err) {
        console.error('Failed to copy text: ', err);
        return Promise.reject(new Error('クリップボードへのコピーに失敗しました。'));
    }
}


// ====================================================================
// Polyfills & Compatibility (Optional)
// ====================================================================
// Element.prototype.matches polyfill (for older browsers like IE)
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}
// Element.prototype.closest polyfill (for older browsers like IE)
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        var el = this;
        do {
            if (Element.prototype.matches.call(el, s)) return el;
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}


// ====================================================================
// End of file: script.js V3.0 (Error Corrected x3)
// ====================================================================