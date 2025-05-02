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
const MIN_DEBOUNCE_DELAY = 100; // 短いデバウンス（例：プログレスバー更新）
const CRITICAL_ELEMENT_IDS = [
    'app-container', 'app-loading-overlay', 'global-notification', 'modal-overlay',
    'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen',
    'deck-list', 'options-buttons-container', 'question-text', 'dashboard-analysis-controls-panel'
];
const DATE_FORMAT_OPTIONS = { // date-fns互換は不要に
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
};
const PAGINATION_BUTTON_COUNT = 5; // ページネーションで表示する最大ボタン数

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
    updateLoadingOverlay(true, "初期化中..."); // すぐにローディング表示

    try {
        // 1. DOM要素のキャッシュと検証
        logInitStep("1. Caching DOM elements");
        if (!cacheDOMElements()) {
            throw new Error("致命的なUI要素が見つかりません。アプリを起動できません。");
        }
        logInitStep("1. DOM caching complete");

        // 2. LocalStorageからデータ読み込みと検証
        logInitStep("2. Loading data from LocalStorage");
        loadInitialData(); // 設定、デッキ、選択中デッキIDなどを読み込み・検証
        logInitStep("2. Initial data loaded");

        // 3. 初期設定をUIに適用（テーマ含む）
        logInitStep("3. Applying initial settings to UI");
        applyTheme(appState.settings.theme); // まずテーマを適用
        applyInitialSettingsToUI();        // その他の設定を適用
        logInitStep("3. Initial settings applied");

        // 4. イベントリスナー設定
        logInitStep("4. Setting up event listeners");
        setupGlobalEventListeners(); // グローバルリスナー（リサイズなど）
        setupScreenEventListeners(); // 各画面固有のリスナー
        logInitStep("4. Event listeners set up");

        // 5. 初期UI状態の更新
        logInitStep("5. Updating initial UI state");
        updateHomeUI();             // ホーム画面全体の更新
        populateDashboardDeckSelect(); // ダッシュボード選択肢更新
        logInitStep("5. Initial UI state updated");

        // 6. 最後に表示していた画面、またはホーム画面に遷移
        const lastScreen = loadData(LS_KEYS.LAST_SCREEN) || 'home-screen';
        logInitStep(`6. Navigating to initial screen: ${lastScreen}`);
        // 学習画面からは開始しないように
        const initialScreen = lastScreen === 'study-screen' ? 'home-screen' : lastScreen;
        navigateToScreen(initialScreen, true); // true: 初期化時のナビゲーション
        logInitStep("6. Navigation complete");

        // 7. ダッシュボードの初回レンダリング（必要なら）
        if (appState.activeScreen === 'dashboard-screen') {
            logInitStep("7. Initial dashboard rendering");
            await renderDashboard(); // エラーは renderDashboard 内で処理
        } else {
             logInitStep("7. Skipping initial dashboard rendering");
        }

        appState.isLoading = false; // 初期化完了フラグ
        const endTime = performance.now();
        console.log(`App initialization successful in ${(endTime - startTime).toFixed(2)} ms.`);

    } catch (error) {
        console.error("CRITICAL ERROR during app initialization:", error);
        handleInitializationError(error); // エラー処理関数
    } finally {
        // 遅延させてローディングオーバーレイを非表示（成功時・失敗時両方）
        setTimeout(() => {
            updateLoadingOverlay(false);
            console.log("Loading overlay hidden.");
        }, appState.isLoading ? 500 : 200); // 失敗時は少し長く表示
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
    const ids = [
        // Critical / General
        'app-container', 'app-loading-overlay', 'global-notification', 'notification-message',
        'notification-icon', 'notification-close-button', 'app-init-error', 'theme-toggle-button',
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
        'question-detail-view', /* Detail view elements will be dynamically added to modal */
        // Settings Screen
        'settings-container', 'setting-shuffle-options', 'setting-low-accuracy-threshold',
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
                criticalFound = false;
            }
            allFound = false;
        }
    });

    dom.navButtons = document.querySelectorAll('.nav-button');
    dom.screens = document.querySelectorAll('.screen');
    dom.evalButtons = document.querySelectorAll('.eval-button');
    dom.studyFilterRadios = document.querySelectorAll('input[name="study-filter"]');
    dom.appHeaderTitle = document.querySelector('.app-header h1.app-title');
    dom.appBody = document.body;

    // Query Selector checks (less critical but good to have)
    if (!dom.appHeaderTitle) console.warn("App header title element not found.");
    if (dom.navButtons.length === 0) { console.warn("No navigation buttons found."); }
    if (dom.screens.length === 0) { console.warn("No screen elements found."); criticalFound = false; } // Screens are critical

    console.log(`DOM caching: ${allFound ? 'All' : 'Some'} elements found. Critical elements ${criticalFound ? 'found' : 'MISSING'}.`);
    return criticalFound;
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
        return false; // Avoid potential race conditions? Maybe queue later?
    }
    appState.isSavingData = true; // Set saving flag

    try {
        const jsonData = JSON.stringify(data);
        localStorage.setItem(key, jsonData);
        // console.debug(`Data saved to LocalStorage: ${key}`);
        return true;
    } catch (e) {
        console.error(`Failed to save data to LocalStorage for key "${key}":`, e);
        let message = `データ (${key}) の保存中にエラーが発生しました。`;
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
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
             return (typeof parsedData === 'string' && parsedData) ? parsedData : defaultValue;
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
            if (typeof deck !== 'object' || deck === null || deck.id !== deckId || typeof deck.name !== 'string') {
                 console.warn(`Invalid deck structure removed for ID "${deckId}".`);
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
            };

            // Detailed Property Validation & Repair
            if (typeof repairedDeck.lastStudied !== 'number' && repairedDeck.lastStudied !== null) { repairedDeck.lastStudied = null; dataModified = true; }
            if (typeof repairedDeck.totalCorrect !== 'number' || !Number.isFinite(repairedDeck.totalCorrect) || repairedDeck.totalCorrect < 0) { repairedDeck.totalCorrect = 0; dataModified = true; }
            if (typeof repairedDeck.totalIncorrect !== 'number' || !Number.isFinite(repairedDeck.totalIncorrect) || repairedDeck.totalIncorrect < 0) { repairedDeck.totalIncorrect = 0; dataModified = true; }
            if (!Array.isArray(repairedDeck.sessionHistory)) { repairedDeck.sessionHistory = []; dataModified = true; }
            repairedDeck.sessionHistory = repairedDeck.sessionHistory.filter(isValidSessionHistory);
             if(repairedDeck.sessionHistory.length !== deck.sessionHistory?.length) dataModified = true;


            if (!Array.isArray(repairedDeck.questions)) { repairedDeck.questions = []; dataModified = true; }
            const validQuestions = [];
            const originalLength = repairedDeck.questions.length;
            repairedDeck.questions.forEach((q, index) => {
                const repairedQ = repairAndValidateQuestion(q, deckId, index);
                if (repairedQ) {
                    validQuestions.push(repairedQ);
                    if(JSON.stringify(q) !== JSON.stringify(repairedQ)) dataModified = true; // Check if question was modified
                } else {
                    dataModified = true; // Question removed
                }
            });
             repairedDeck.questions = validQuestions;
             if (repairedDeck.questions.length !== originalLength) dataModified = true;

             // Add deck to result only if it still has questions or is empty intentionally
             if(repairedDeck.questions.length > 0 || originalLength === 0) {
                 validDecks[deckId] = repairedDeck;
             } else {
                 console.warn(`Deck "${repairedDeck.name}" (${deckId}) removed because all questions were invalid.`);
                 dataModified = true;
             }
        }
    }

    if (dataModified) {
        console.warn("Deck data structure required repair/validation.");
        // Optionally save the repaired data back immediately
        // saveData(LS_KEYS.DECKS, validDecks);
    }
    return validDecks;
}

/** 個々の問題データの検証と修復 */
function repairAndValidateQuestion(q, deckId = 'unknown', index = -1) {
    if (typeof q !== 'object' || q === null) {
         console.warn(`Invalid question object removed (Deck: ${deckId}, Index: ${index}).`);
         return null;
    }
    const questionLogPrefix = `Question Validation (Deck: ${deckId}, Q: ${String(q.question).substring(0, 20)}...):`;

    const repairedQ = {
        id: '',
        question: '',
        options: [],
        correctAnswer: '',
        explanation: '',
        history: [],
        ...q
    };

    // Validate required fields
    if (typeof repairedQ.id !== 'string' || !repairedQ.id) {
         repairedQ.id = generateUUID(); // Generate new ID if missing/invalid
         console.warn(`${questionLogPrefix} Missing or invalid question ID, generated new ID: ${repairedQ.id}`);
    }
    if (typeof repairedQ.question !== 'string' || repairedQ.question.trim() === '') {
         console.warn(`${questionLogPrefix} Invalid or empty question text. Question skipped.`); return null;
    }
    repairedQ.question = repairedQ.question.trim();

    // Validate options
    if (!Array.isArray(repairedQ.options)) {
        console.warn(`${questionLogPrefix} 'options' is not an array. Question skipped.`); return null;
    }
    repairedQ.options = repairedQ.options
        .map(opt => String(opt ?? '').trim()) // Ensure string, trim
        .filter(opt => opt);                 // Remove empty strings
    if (repairedQ.options.length < 2) {
        console.warn(`${questionLogPrefix} Less than 2 valid options found after cleaning. Question skipped.`); return null;
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
    if (typeof repairedQ.explanation !== 'string') {
         repairedQ.explanation = String(repairedQ.explanation ?? '');
    }
    repairedQ.explanation = repairedQ.explanation.trim();


    // Validate history
    if (!Array.isArray(repairedQ.history)) {
        repairedQ.history = [];
    }
    repairedQ.history = repairedQ.history.filter(isValidQuestionHistory);

    return repairedQ;
}

/** 設定データの検証とデフォルト値による補完 */
function repairAndValidateSettings(loadedSettings) {
    if (typeof loadedSettings !== 'object' || loadedSettings === null) {
        return { ...DEFAULT_SETTINGS }; // Return defaults if loaded data is not an object
    }

    const repairedSettings = { ...DEFAULT_SETTINGS }; // Start with defaults
    let modified = false;

    for (const key in DEFAULT_SETTINGS) {
        if (Object.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
            const defaultValue = DEFAULT_SETTINGS[key];
            const loadedValue = loadedSettings[key];

            if (loadedValue === undefined || typeof loadedValue !== typeof defaultValue) {
                 if (loadedValue !== undefined) { // Log only if a value existed but was wrong type
                     console.warn(`Settings: Key "${key}" has invalid type (${typeof loadedValue}), expected (${typeof defaultValue}). Using default.`);
                     modified = true;
                 }
                 continue; // Use default value
            }

             // Type-specific validation
             let isValid = true;
             switch(key) {
                 case 'lowAccuracyThreshold':
                    isValid = Number.isInteger(loadedValue) && loadedValue >= 1 && loadedValue <= 99;
                    break;
                 case 'homeDecksPerPage':
                 case 'dashboardQuestionsPerPage':
                     isValid = Number.isInteger(loadedValue) && [10, 20, 50, 100].includes(loadedValue); // Allowed values
                     break;
                case 'theme':
                     isValid = ['light', 'dark', 'system'].includes(loadedValue);
                     break;
                 case 'shuffleOptions':
                    isValid = typeof loadedValue === 'boolean'; // Already checked by initial typeof
                    break;
                // Add other settings validations here
             }

             if(isValid) {
                repairedSettings[key] = loadedValue; // Use the valid loaded value
             } else {
                 console.warn(`Settings: Key "${key}" has invalid value (${loadedValue}). Using default.`);
                 modified = true;
             }
        }
    }

    // Check for unexpected keys (optional)
    for (const key in loadedSettings) {
         if (!DEFAULT_SETTINGS.hasOwnProperty(key)) {
             console.warn(`Settings: Found unexpected key "${key}" in loaded data. Ignoring.`);
             modified = true; // Consider it modified as we're removing a key implicitly
         }
    }

    if (modified) {
         console.warn("Settings data structure required repair/validation.");
    }

    return repairedSettings;
}

/** 個々の QuestionHistory entry の形式を検証 */
function isValidQuestionHistory(h) {
    return (
        h && typeof h === 'object' &&
        typeof h.ts === 'number' && Number.isFinite(h.ts) && h.ts > 0 &&
        typeof h.correct === 'boolean' &&
        ([null, 'difficult', 'normal', 'easy'].includes(h.evaluation) || h.evaluation === undefined)
    );
}

/** 個々の SessionHistory entry の形式を検証 */
function isValidSessionHistory(s) {
     return (
        s && typeof s === 'object' &&
        typeof s.ts === 'number' && Number.isFinite(s.ts) && s.ts > 0 &&
        typeof s.correct === 'number' && Number.isInteger(s.correct) && s.correct >= 0 &&
        typeof s.incorrect === 'number' && Number.isInteger(s.incorrect) && s.incorrect >= 0
    );
}

/** アプリ起動時にLocalStorageから初期データを読み込む */
function loadInitialData() {
    // Load and repair settings first
    appState.settings = loadData(LS_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
    // Sync UI state with loaded settings
    appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage;

    // Load and repair decks
    appState.allDecks = loadData(LS_KEYS.DECKS, {});

    // Load current deck ID and validate against loaded decks
    appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID, null);
    if (appState.currentDeckId && !appState.allDecks[appState.currentDeckId]) {
        console.warn(`Current deck ID "${appState.currentDeckId}" invalid or deck missing. Resetting.`);
        appState.currentDeckId = null;
        saveData(LS_KEYS.CURRENT_DECK_ID, null); // Persist reset
    }

    // Initialize dashboard deck ID based on current deck
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
     for (let i = 0; i < localStorage.length; i++) {
         const key = localStorage.key(i);
         const value = localStorage.getItem(key);
         if (key && value) {
             totalBytes += key.length + value.length;
         }
     }
     // 1文字=2バイトで計算、MB単位に変換
     const sizeMB = (totalBytes * 2 / (1024 * 1024)).toFixed(2);
     return sizeMB;
}

// ====================================================================
// UI制御関数 (UI Control Functions)
// ====================================================================

// --- Themes ---
/** テーマを適用し、状態とUIを更新 */
function applyTheme(theme) {
    const body = dom.appBody;
    const currentTheme = getCurrentAppliedTheme(); // Gets 'light' or 'dark'

    // Remove existing theme classes
    body.classList.remove('theme-light', 'theme-dark');

    let newTheme = theme;
    if (theme === 'system') {
         newTheme = systemThemeMediaQuery.matches ? 'dark' : 'light';
         console.log(`System theme detected: ${newTheme}`);
    }

    body.classList.add(`theme-${newTheme}`); // Apply 'theme-light' or 'theme-dark'
    appState.settings.theme = theme; // Store the *selected* setting ('light', 'dark', or 'system')

    // Update theme toggle button appearance
    updateThemeToggleButton(newTheme);

    // Inform Chart.js about theme change if charts exist
    if (appState.charts.studyTrends || appState.charts.questionAccuracy) {
        updateChartThemes();
    }
    console.log(`Theme applied: ${theme} (Resolved to: ${newTheme})`);
}

/** システムテーマ変更イベントのハンドラ */
function handleSystemThemeChange(event) {
    console.log("System theme change detected.");
    if (appState.settings.theme === 'system') { // Only re-apply if set to system
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
    // TODO: Chart.js doesn't easily allow *full* dynamic theme swaps including scales, grid lines etc.
    // The typical approach is to destroy and recreate the chart.
    // Alternatively, selectively update colors where possible.
    // For simplicity and robustness, we'll just re-render the relevant parts of the dashboard.
    if (appState.activeScreen === 'dashboard-screen' && appState.currentDashboardDeckId) {
        renderDashboardTrendsChart(appState.allDecks[appState.currentDashboardDeckId]); // Re-render trends
        renderDashboardQuestionAnalysis(); // Re-render analysis (list or chart)
    }
}

// --- Notifications ---
/** グローバル通知を表示 */
function showNotification(message, type = 'info', duration = NOTIFICATION_DURATION) {
    if (!dom.globalNotification || !dom.notificationMessage || !dom.notificationIcon) {
        console.warn("Notification elements not found, cannot display:", { message, type });
        // Fallback for critical errors during init?
        // if (type === 'error' && appState.isLoading) alert(`Error: ${message}`);
        return;
    }
    clearTimeout(appState.notificationTimeout);
    appState.notificationTimeout = null;

    dom.notificationMessage.textContent = message;
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
    dom.notificationIcon.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i>`;

    // Apply type class for styling
    dom.globalNotification.className = `notification ${type}`; // Reset and set type

    // Use aria-hidden for visibility toggle for better accessibility
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
    // Remove type class after transition for clean state? (optional)
    // dom.globalNotification.addEventListener('transitionend', () => {
    //     if (dom.globalNotification.getAttribute('aria-hidden') === 'true') {
    //          dom.globalNotification.className = 'notification';
    //     }
    // }, { once: true });
}

// --- Modals ---
/**
 * モーダルダイアログを表示する
 * @param {ModalOptions} options - モーダルの設定
 */
function showModal(options) {
    const { title, content, buttons = [], size = 'md', onClose } = options;
    if (!dom.modalOverlay || !dom.modalDialog || !dom.modalTitle || !dom.modalBody || !dom.modalFooter) {
        console.error("Modal elements not found.");
        return;
    }
    appState.lastFocusedElement = document.activeElement; // Store focus

    dom.modalTitle.textContent = title;
    dom.modalDialog.className = `modal-dialog modal-${size}`; // Set size class

    // Set content
    dom.modalBody.innerHTML = ''; // Clear previous content
    if (typeof content === 'string') {
        dom.modalBody.innerHTML = content; // Inject HTML string (use cautiously)
    } else if (content instanceof HTMLElement) {
        dom.modalBody.appendChild(content); // Append DOM element
    }

    // Set footer buttons
    dom.modalFooter.innerHTML = ''; // Clear previous buttons
    if (buttons.length > 0) {
        buttons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.id = btnConfig.id;
            button.type = 'button';
            button.innerHTML = btnConfig.text; // Allow HTML in button text
            button.className = `button ${btnConfig.class || 'secondary'}`;
            button.disabled = btnConfig.disabled || false;
            button.onclick = () => { // Use onclick for simplicity here
                if (btnConfig.onClick) btnConfig.onClick();
                // By default, close modal unless onClick explicitly prevents it?
                // For now, assume onClick handles closing if needed.
                // closeModal();
            };
            dom.modalFooter.appendChild(button);
        });
        dom.modalFooter.style.display = 'flex';
    } else {
        dom.modalFooter.style.display = 'none'; // Hide footer if no buttons
    }

    // Attach close handler
    dom.modalCloseButton.onclick = () => closeModal(onClose); // Header close button
    dom.modalOverlay.onclick = (event) => { // Overlay click
        if (event.target === dom.modalOverlay) { // Ensure click is on overlay itself
             closeModal(onClose);
        }
    };
    // ESC key handling (added in global listeners)

    dom.modalOverlay.style.display = 'flex'; // Trigger fade-in animation
    dom.modalDialog.setAttribute('aria-labelledby', 'modal-title'); // Set label
    dom.modalDialog.focus(); // Focus the dialog itself initially
    appState.isModalOpen = true;
}

/** モーダルダイアログを閉じる */
function closeModal(onCloseCallback) {
     if (!dom.modalOverlay) return;
     if (onCloseCallback && typeof onCloseCallback === 'function') {
         onCloseCallback(); // Execute callback before closing
     }
     dom.modalOverlay.style.display = 'none'; // Trigger fade-out animation
     appState.isModalOpen = false;
     // Return focus to the element that opened the modal
     if (appState.lastFocusedElement && typeof appState.lastFocusedElement.focus === 'function') {
         appState.lastFocusedElement.focus();
     }
     appState.lastFocusedElement = null;
}


// --- UI Updates (General) ---
/** 初期設定値をUIコントロールに反映 */
function applyInitialSettingsToUI() {
    loadSettingsToUI(); // Load current settings state to Settings screen

    // Update Dashboard Filter Threshold display spans
    if (dom.dashboardFilterThresholdLow) dom.dashboardFilterThresholdLow.textContent = DASHBOARD_ACCURACY_THRESHOLDS.LOW;
    if (dom.dashboardFilterThresholdMediumLow) dom.dashboardFilterThresholdMediumLow.textContent = DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1;
    if (dom.dashboardFilterThresholdMediumHigh) dom.dashboardFilterThresholdMediumHigh.textContent = DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM;
    if (dom.dashboardFilterThresholdHigh) dom.dashboardFilterThresholdHigh.textContent = DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1;

    // Update other display values based on constants
    if (dom.dashboardTrendsSessionsCount) dom.dashboardTrendsSessionsCount.textContent = DASHBOARD_TREND_SESSIONS;
    if (dom.detailHistoryCount) dom.detailHistoryCount.textContent = MAX_RECENT_HISTORY; // Now updated in JS for flexibility
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
        screenId = 'home-screen'; // Fallback to home
        if (!document.getElementById(screenId)) return; // Home also missing? Abort.
    }

    // Don't navigate if already on the target screen
    if (!isInitialLoad && screenId === appState.activeScreen) {
        console.log(`Already on screen: ${screenId}`);
        return;
    }

    console.log(`Navigating to screen: ${screenId}`);
    const previousScreen = appState.activeScreen;
    appState.activeScreen = screenId;
    saveData(LS_KEYS.LAST_SCREEN, screenId); // Remember last screen

    // --- Transition Logic ---
    dom.screens.forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');

    // --- Navigation Button Update ---
    dom.navButtons.forEach(button => {
        const isActive = button.dataset.target === screenId;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    // --- Screen Specific Actions ---
    switch (screenId) {
        case 'home-screen':
             updateHomeUI(); // Refresh home screen display
             // Focus relevant element on home (e.g., list or start button)
             setTimeout(() => dom.deckList?.focus(), 50);
            break;
        case 'dashboard-screen':
            populateDashboardDeckSelect();
            if (!appState.currentDashboardDeckId && Object.keys(appState.allDecks).length > 0) {
                 // Auto-select first deck if none is selected
                 const firstDeckId = Object.keys(appState.allDecks).sort((a,b) => (appState.allDecks[a].name||'').localeCompare(appState.allDecks[b].name||''))[0];
                 if (firstDeckId) {
                    console.log("Auto-selecting first deck for dashboard:", firstDeckId);
                     appState.currentDashboardDeckId = firstDeckId;
                     if(dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = firstDeckId;
                     resetDashboardFiltersAndState(false); // Don't reset deck ID
                 }
            }
            renderDashboard(); // Always re-render dashboard on navigate
            setTimeout(() => dom.dashboardDeckSelect?.focus(), 50);
            break;
        case 'settings-screen':
            loadSettingsToUI(); // Ensure settings UI reflects current state
             setTimeout(() => dom.settingShuffleOptions?.focus(), 50);
            break;
         case 'prompt-guide-screen':
            // Maybe update prompt placeholders based on current deck? (optional)
            updatePromptPlaceholders();
             setTimeout(() => dom.promptFieldTopic?.focus(), 50);
            break;
        case 'study-screen': // Navigation TO study screen only happens via startStudy()
            // Focus the first element (e.g., question text or first option)
            setTimeout(() => dom.optionsButtonsContainer?.querySelector('.option-button')?.focus(), 50);
            break;
    }

    // --- Cleanup based on leaving a screen ---
     if (previousScreen === 'dashboard-screen' && screenId !== 'dashboard-screen') {
         // No specific cleanup needed currently for dashboard exit
     }
     // Resetting study state is now handled by `confirmQuitStudy` or completion flow


    // Scroll to top (unless navigating within the same page potentially?)
    if (!isInitialLoad) {
         window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}


// ====================================================================
// イベントリスナー設定 (Event Listener Setup)
// ====================================================================

/** アプリケーション全体のグローバルイベントリスナーを設定 */
function setupGlobalEventListeners() {
     safeAddEventListener(window, 'resize', handleResize, { passive: true });
     safeAddEventListener(window, 'keydown', handleGlobalKeyDown);
     safeAddEventListener(systemThemeMediaQuery, 'change', handleSystemThemeChange);
     // Add listeners for FileReader if needed globally, or locally when used
}

/** アプリケーションの各画面要素に固有のイベントリスナーを設定 */
function setupScreenEventListeners() {
    // Header & Nav
    safeAddEventListener(dom.appHeaderTitle, 'click', () => navigateToHome());
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
     safeAddEventListener(dom.resetHistoryButton, 'click', handleResetHistoryClick); // Confirmation inside handler
    safeAddEventListener(dom.startStudyButton, 'click', startStudy);
    if (dom.studyFilterRadios) {
        dom.studyFilterRadios.forEach(radio => safeAddEventListener(radio, 'change', handleStudyFilterChange));
    }

    // --- Study Screen ---
     safeAddEventListener(dom.optionsButtonsContainer, 'click', handleOptionButtonClick);
    safeAddEventListener(dom.quitStudyHeaderButton, 'click', () => confirmQuitStudy(true)); // User initiated quit from header
    safeAddEventListener(dom.retryButton, 'click', retryCurrentQuestion);
    if (dom.evalButtons) {
        dom.evalButtons.forEach(button => safeAddEventListener(button, 'click', handleEvaluation));
    }
     safeAddEventListener(dom.backToHomeButton, 'click', navigateToHome); // From completion

    // --- Dashboard Screen ---
    safeAddEventListener(dom.dashboardDeckSelect, 'change', handleDashboardDeckChange);
     safeAddEventListener(dom.dashboardControlsToggle, 'click', toggleDashboardControls); // Mobile toggle
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
     // Modal related: Close button handled in showModal, ESC handled globally

    // --- Settings Screen ---
     safeAddEventListener(dom.settingTheme, 'change', handleThemeSettingChange);
     safeAddEventListener(dom.settingLowAccuracyThreshold, 'change', handleSettingThresholdChange); // Validate on change/blur
     safeAddEventListener(dom.settingShuffleOptions, 'change', handleSettingShuffleChange); // Update state immediately? No, wait for save.
     safeAddEventListener(dom.saveSettingsButton, 'click', saveSettings);
     safeAddEventListener(dom.exportDataButton, 'click', exportAllData);
     safeAddEventListener(dom.importDataInput, 'change', handleImportFileSelect);
     safeAddEventListener(dom.resetAllDataButton, 'click', handleResetAllDataClick); // Confirmation inside

    // --- AI Prompt Guide Screen ---
     // Listen to changes in customization fields to update placeholder previews? (optional)
     safeAddEventListener(dom.promptFieldTopic, 'input', updatePromptPlaceholders);
     safeAddEventListener(dom.promptFieldCount, 'input', updatePromptPlaceholders);
     safeAddEventListener(dom.promptFieldLevel, 'input', updatePromptPlaceholders);
     safeAddEventListener(dom.copyPromptButton, 'click', copyPromptToClipboard);
     safeAddEventListener(dom.jsonCheckInput, 'input', debounce(handleJsonCheckInput, DEBOUNCE_DELAY));
     safeAddEventListener(dom.jsonCheckButton, 'click', checkJsonFormat);


    console.log("Event listeners setup complete.");
}

/**
 * 安全にイベントリスナーを追加するヘルパー関数
 * @param {EventTarget} element - 対象要素
 * @param {string} event - イベント名
 * @param {Function} handler - ハンドラ関数
 * @param {boolean | AddEventListenerOptions} [options={}] - オプション
 */
function safeAddEventListener(element, event, handler, options = {}) {
    if (element && typeof element.addEventListener === 'function') {
        element.addEventListener(event, handler, options);
    } else {
        console.warn(`Failed to add event listener: Element not found or invalid for event "${event}".`);
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
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
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
         // Example: Adjust layout based on resize if CSS alone is not enough
         // Or: Recalculate elements positions/sizes if needed dynamically
         toggleDashboardControlsBasedOnSize(); // Ensure controls collapse state is correct
     }, MIN_DEBOUNCE_DELAY); // Use shorter delay for resize responsiveness
}

/** グローバルなキーダウンイベントハンドラ (ESCでモーダル閉じるなど) */
function handleGlobalKeyDown(event) {
    if (event.key === 'Escape') {
         if (appState.isModalOpen) {
             // Find the currently open modal (assuming only one for now)
             const modal = document.querySelector('.modal-overlay[style*="display: flex;"]');
             if (modal) {
                 const closeButton = modal.querySelector('.modal-close-button');
                 closeModal(closeButton?.onclick); // Attempt to use existing close logic/callback
             }
         }
        // else if (appState.isStudyActive) { // Option: ESC to trigger Quit confirmation
        //     confirmQuitStudy(true);
        // }
    }
     // Add other global shortcuts if needed
     // e.g., Ctrl+S for saving settings? (Need to prevent browser default)
}

// ====================================================================
// テーマ関連処理
// ====================================================================

/** テーマ切り替えボタンクリック時のハンドラ */
function toggleTheme() {
     const currentAppliedTheme = getCurrentAppliedTheme();
     const nextTheme = currentAppliedTheme === 'light' ? 'dark' : 'light';
     // When toggling manually, store the explicit choice, not 'system'
     applyTheme(nextTheme);
     saveSettings(); // Persist the manually selected theme
}

/** 設定画面のテーマ選択変更時のハンドラ */
function handleThemeSettingChange(event) {
     const selectedTheme = event.target.value;
     applyTheme(selectedTheme);
     // No need to call saveSettings() here, rely on main save button
     showNotification("テーマ設定を変更しました。右下の「設定を保存」を押してください。", "info", 3000);
     setSettingsUnsavedStatus(true);
}


// ====================================================================
// ナビゲーションと画面共通処理
// ====================================================================

/** ヘッダータイトルクリックやホームボタンでホームに戻る */
function navigateToHome() {
     if (appState.isStudyActive) {
         confirmQuitStudy(true, 'home-screen'); // Show confirm, navigate if ok
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
        confirmQuitStudy(true, targetScreenId); // Pass target screen
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
    handleFileUpload(fileInput, processNewDeckFile);
}

/** インポート用ファイル選択input変更時のハンドラ */
function handleImportFileSelect(event) {
     const fileInput = event.target;
     handleFileUpload(fileInput, processImportDataFile, dom.importStatus); // Pass status element
}

/** 共通ファイルアップロード処理 */
function handleFileUpload(fileInput, processFunction, statusElement = dom.loadStatus) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];

    updateStatusMessage(statusElement, "", "info"); // Clear previous status

    if (!file.type || (!file.type.includes('json') && !file.name.toLowerCase().endsWith('.json'))) {
        updateStatusMessage(statusElement, "JSONファイルを選択してください", "warning");
        showNotification('ファイル形式エラー: JSONファイル (.json) を選択してください。', 'warning');
        fileInput.value = ''; // Clear input
        return;
    }
     if (file.size > 5 * 1024 * 1024) { // Limit file size (e.g., 5MB)
        updateStatusMessage(statusElement, "ファイルサイズが大きすぎます (最大5MB)", "warning");
        showNotification('ファイルサイズエラー: ファイルが大きすぎます (最大5MB)。', 'warning');
        fileInput.value = '';
        return;
    }

    updateStatusMessage(statusElement, "読み込み中...", "info");
    updateLoadingOverlay(true, `ファイル (${file.name}) 読み込み中...`);

     // Reset file reader state (necessary?) and assign handlers
     appState.fileReader = new FileReader(); // Create new instance? Maybe ok to reuse.
    appState.fileReader.onload = (e) => {
         processFunction(e.target?.result, file.name, statusElement);
         fileInput.value = ''; // Clear after processing
         updateLoadingOverlay(false);
         clearStatusMessageAfterDelay(statusElement, 5000);
    };
    appState.fileReader.onerror = (e) => {
         console.error("File reading error:", appState.fileReader.error);
         updateStatusMessage(statusElement, "ファイル読み取りエラー", "error");
         showNotification(`ファイルの読み取り中にエラーが発生しました: ${appState.fileReader.error}`, "error");
         fileInput.value = '';
         updateLoadingOverlay(false);
    };
     appState.fileReader.onabort = () => {
         console.log("File reading aborted.");
         updateStatusMessage(statusElement, "読み込み中断", "info");
         updateLoadingOverlay(false);
     };

    appState.fileReader.readAsText(file);
}

/** 読み込んだ新規デッキJSONファイルを処理 */
function processNewDeckFile(content, fileName, statusElement) {
    let newDeckId = null;
    try {
        if (typeof content !== 'string' || content.trim() === '') {
             throw new Error("ファイル内容が空または不正です。");
        }
        let data;
        try {
             data = JSON.parse(content);
        } catch (parseError) { throw new Error(`JSON解析失敗: ${parseError.message}`); }

        const validationResult = validateDeckJsonData(data); // Use new validator
        if (!validationResult.isValid) {
            throw new Error(`JSON形式エラー: ${validationResult.message}`);
        }

        let baseName = fileName.replace(/\.json$/i, '');
        const newDeck = createNewDeck(baseName, validationResult.questions);
        newDeckId = newDeck.id;

        // Save (Important: Must happen after adding to state in createNewDeck)
        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
            delete appState.allDecks[newDeckId]; // Rollback state
            throw new Error("LocalStorageへの保存に失敗しました。");
        }

        console.log("New deck added successfully:", newDeck);
        updateStatusMessage(statusElement, `読み込み成功: ${newDeck.name} (${newDeck.questions.length}問)`, "success");
        showNotification(`問題集「${newDeck.name}」(${newDeck.questions.length}問) を追加しました。`, 'success');

        // Update UI
         updateHomeUI(true); // Update list, counts etc. Force update even if not on home screen.
        populateDashboardDeckSelect(); // Ensure dashboard dropdown is updated
         selectDeck(newDeckId); // Select the new deck automatically

    } catch (error) {
        console.error("Error processing new deck file:", error);
        updateStatusMessage(statusElement, `読込エラー: ${error.message}`, "error");
        showNotification(`ファイル処理エラー: ${error.message}`, 'error', 8000);
        // Ensure state consistency if error happened after creation but before save success
        if (newDeckId && !localStorage.getItem(LS_KEYS.DECKS)?.includes(newDeckId)) {
             delete appState.allDecks[newDeckId]; // Rollback if add succeeded but save failed
        }
    }
}

/**
 * JSONデータが期待されるデッキ形式か検証する (複数問題対応)
 * @param {any} data - JSON.parse() されたデータ
 * @returns {{isValid: boolean, message: string, questions: QuestionData[] | null}} 検証結果
 */
function validateDeckJsonData(data) {
    if (!Array.isArray(data)) {
        return { isValid: false, message: "データが配列形式ではありません。", questions: null };
    }
    if (data.length === 0) {
        return { isValid: false, message: "問題が1つも含まれていません。", questions: null };
    }

    const validatedQuestions = [];
    const questionIds = new Set(); // Keep track of IDs for uniqueness validation if needed

    for (let i = 0; i < data.length; i++) {
        const qData = data[i];
        // Validate individual question structure - Reuse repair/validate function
        const validatedQ = repairAndValidateQuestion(qData, 'import', i);

        if (!validatedQ) {
            // repairAndValidateQuestion logs the specific error, we just need to report overall failure
             return { isValid: false, message: `問題 ${i + 1}: データ構造が不正です。詳細ログを確認してください。`, questions: null };
        }

        // Optional: Validate uniqueness of IDs within the file if they are provided
        if (qData.id) { // If an ID was originally provided in the file
             if(questionIds.has(validatedQ.id)) {
                  console.warn(`Duplicate question ID "${validatedQ.id}" found in import file at index ${i}. App will use internally generated unique IDs.`);
                  // Don't stop the import, just warn. Will generate new unique ID anyway.
             }
             questionIds.add(validatedQ.id);
        }

        // We don't actually use the ID from the file directly, a new one is generated.
        // We just need the core question data.
        validatedQuestions.push({
            question: validatedQ.question,
            options: validatedQ.options,
            correctAnswer: validatedQ.correctAnswer,
            explanation: validatedQ.explanation,
             // Import history? Generally no, start fresh.
             history: []
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
        questions: questionsData.map((q, index) => ({
            id: generateUUID(`q_${deckId}`), // Ensure unique ID within the app
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            history: [] // Always start with empty history for new deck
        })),
        lastStudied: null,
        totalCorrect: 0,
        totalIncorrect: 0,
        sessionHistory: []
    };

    appState.allDecks[deckId] = newDeck; // Add to state immediately
    return newDeck; // Return the created deck object
}

/** デッキ名が衝突しないように調整 */
function generateUniqueDeckName(baseName) {
    let deckName = baseName.trim() || '無名の問題集'; // Fallback name
    if (!Object.values(appState.allDecks).some(d => d.name === deckName)) {
        return deckName; // Name is already unique
    }
    let counter = 2;
    while (Object.values(appState.allDecks).some(d => d.name === `${baseName} (${counter})`)) {
        counter++;
    }
    return `${baseName} (${counter})`;
}

/** 全データのエクスポート処理 */
function exportAllData() {
    try {
        showLoadingOverlay(true, "データエクスポート中...");
        const exportData = {
            appVersion: appState.appVersion,
            exportTimestamp: Date.now(),
            settings: appState.settings,
            allDecks: appState.allDecks,
            currentDeckId: appState.currentDeckId, // Include current selection state
            // Optionally include other non-persistent states if needed
        };

        const jsonData = JSON.stringify(exportData, null, 2); // Pretty print JSON
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        // Generate filename (e.g., study-app-data_YYYYMMDD_HHMM.json)
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        link.download = `ai-study-app-data_v${appState.appVersion}_${timestamp}.json`;
        link.href = url;

        link.style.display = 'none'; // Hide the link
        document.body.appendChild(link);
        link.click(); // Trigger download

        document.body.removeChild(link); // Clean up link
        URL.revokeObjectURL(url); // Release object URL

        showNotification("全データをエクスポートしました。", "success");
        console.log("Data exported successfully.");

    } catch (error) {
        console.error("Error exporting data:", error);
        showNotification(`データのエクスポート中にエラーが発生しました: ${error.message}`, "error");
    } finally {
         updateLoadingOverlay(false);
    }
}

/** インポートされたデータファイルを処理 */
function processImportDataFile(content, fileName, statusElement) {
    try {
        if (typeof content !== 'string' || content.trim() === '') {
            throw new Error("インポートファイルの内容が空または不正です。");
        }
        let data;
        try {
             data = JSON.parse(content);
        } catch (parseError) { throw new Error(`JSON解析失敗: ${parseError.message}`); }

        // Validate imported data structure (basic checks)
        if (typeof data !== 'object' || data === null || !data.allDecks || !data.settings) {
             throw new Error("インポートファイルの形式が不正です (必須キー allDecks, settings がありません)。");
        }

         // Ask user how to import (Replace / Merge)
         const importMode = prompt(
             `ファイル「${fileName}」のデータをインポートします。\n` +
             "インポートモードを選択してください:\n" +
             "1: 全置換 (現在のデータを削除し、ファイルの内容で置き換えます)\n" +
             "2: マージ (ファイル内のデッキを追加/上書きし、設定を更新します)",
             "2" // Default to Merge
         );

        if (importMode === '1') { // Replace
             // **Very destructive action - require strong confirmation**
             const confirmation = prompt(`警告！現在の全てのデッキ(${Object.keys(appState.allDecks).length}個)と設定を削除し、ファイルの内容で完全に置き換えます。この操作は元に戻せません。\n続行するには「REPLACE」と入力してください:`);
             if (confirmation !== "REPLACE") {
                 showNotification("インポートがキャンセルされました。", "info");
                 updateStatusMessage(statusElement, "置換キャンセル", "info");
                 return;
             }
            console.log("Performing Replace import...");
            replaceDataFromImport(data, statusElement);

        } else if (importMode === '2') { // Merge
             console.log("Performing Merge import...");
             mergeDataFromImport(data, statusElement);

        } else {
            showNotification("インポートがキャンセルされました。", "info");
            updateStatusMessage(statusElement, "モード未選択", "info");
            return;
        }

    } catch (error) {
        console.error("Error processing import file:", error);
        updateStatusMessage(statusElement, `インポートエラー: ${error.message}`, "error");
        showNotification(`インポート処理エラー: ${error.message}`, 'error', 8000);
    }
}

/** インポートデータで全置換 */
function replaceDataFromImport(importedData, statusElement) {
    try {
        // Validate and repair imported settings and decks BEFORE applying
        const repairedSettings = repairAndValidateSettings(importedData.settings);
        const repairedDecks = repairAndValidateAllDecks(importedData.allDecks);

        appState.settings = repairedSettings;
        appState.allDecks = repairedDecks;

        // Validate imported currentDeckId
        appState.currentDeckId = null; // Reset first
        if (importedData.currentDeckId && repairedDecks[importedData.currentDeckId]) {
             appState.currentDeckId = importedData.currentDeckId;
        } else if (Object.keys(repairedDecks).length > 0) {
             // Fallback to first deck if imported ID invalid
             appState.currentDeckId = Object.keys(repairedDecks)[0];
        }

        // Save the replaced data
        if (!saveData(LS_KEYS.SETTINGS, appState.settings) || !saveData(LS_KEYS.DECKS, appState.allDecks) || !saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId)) {
            // Attempt rollback on save failure? Very tricky. Best effort: reload app.
             showNotification("データの完全置換後の保存に失敗しました。アプリを再読み込みしてください。", "error", 10000);
            throw new Error("置換データの保存に失敗。状態が不安定な可能性があります。");
        }

        // Apply new settings to UI immediately
        applyTheme(appState.settings.theme);
        loadSettingsToUI(); // Update settings screen

        // Refresh UI fully
        updateHomeUI(true);
        populateDashboardDeckSelect();
        navigateToScreen('home-screen'); // Go to home after import

        updateStatusMessage(statusElement, `置換インポート成功 (${Object.keys(appState.allDecks).length}デッキ)`, "success");
        showNotification("データをファイルの内容で完全に置き換えました。", "success");

    } catch (error) {
        console.error("Error during replace import:", error);
         updateStatusMessage(statusElement, `置換エラー: ${error.message}`, "error");
        showNotification(`置換インポートエラー: ${error.message}`, 'error');
    }
}

/** インポートデータでマージ */
function mergeDataFromImport(importedData, statusElement) {
     let addedCount = 0;
     let updatedCount = 0;
     try {
        // Validate and repair imported decks individually BEFORE merging
        const validImportedDecks = repairAndValidateAllDecks(importedData.allDecks || {});

        if (Object.keys(validImportedDecks).length === 0) {
            showNotification("インポートファイルに有効な問題集データが含まれていませんでした。", "warning");
            updateStatusMessage(statusElement, "有効デッキなし", "warning");
            return;
        }

         // Merge decks (add new, overwrite existing by ID)
        for (const deckId in validImportedDecks) {
            if (appState.allDecks[deckId]) {
                updatedCount++;
                console.log(`Merging: Updating deck ID ${deckId}`);
            } else {
                 addedCount++;
                 console.log(`Merging: Adding new deck ID ${deckId}`);
            }
             appState.allDecks[deckId] = validImportedDecks[deckId]; // Add or overwrite
         }

        // Merge settings (overwrite current settings with imported *validated* settings)
         const mergedSettings = repairAndValidateSettings(importedData.settings);
         appState.settings = mergedSettings;

        // Handle current deck ID: keep current if valid, otherwise use imported or fallback
        if (!appState.currentDeckId || !appState.allDecks[appState.currentDeckId]) {
            if (importedData.currentDeckId && appState.allDecks[importedData.currentDeckId]) {
                 appState.currentDeckId = importedData.currentDeckId;
             } else if (Object.keys(appState.allDecks).length > 0){
                 // Fallback only if current selection becomes invalid AFTER merge
                 appState.currentDeckId = Object.keys(appState.allDecks).sort((a, b) => (appState.allDecks[a]?.name ?? '').localeCompare(appState.allDecks[b]?.name ?? ''))[0];
             }
        }


        // Save the merged data
         if (!saveData(LS_KEYS.SETTINGS, appState.settings) || !saveData(LS_KEYS.DECKS, appState.allDecks) || !saveData(LS_KEYS.CURRENT_DECK_ID, appState.currentDeckId)) {
            // Data might be partially merged if save fails midway. Tough situation.
             showNotification("データのマージ保存中にエラーが発生しました。データが不完全な可能性があります。", "error", 10000);
             throw new Error("マージデータの保存に失敗。");
        }

        // Apply theme and settings UI
         applyTheme(appState.settings.theme);
         loadSettingsToUI();

         // Refresh UI
         updateHomeUI(true);
         populateDashboardDeckSelect();
         // Don't navigate automatically on merge

         updateStatusMessage(statusElement, `マージ成功 (追加${addedCount}, 更新${updatedCount})`, "success");
        showNotification(`データをマージしました (追加 ${addedCount} 件, 更新 ${updatedCount} 件)。設定も更新されました。`, "success");

     } catch (error) {
         console.error("Error during merge import:", error);
         updateStatusMessage(statusElement, `マージエラー: ${error.message}`, "error");
         showNotification(`マージインポートエラー: ${error.message}`, 'error');
     }
}

/** アプリの全データを削除 */
function handleResetAllDataClick() {
    const confirm1 = prompt("警告！ この操作は元に戻せません。\n\n全ての学習データ（全問題集、全解答履歴、設定）が完全に削除されます。\n\n続行する場合は「DELETE ALL」と入力してください:");

    if (confirm1 !== "DELETE ALL") {
         showNotification("全データ削除はキャンセルされました。", "info");
         return;
    }

    const confirm2 = confirm("最終確認：本当にすべてのデータを削除しますか？");
    if (!confirm2) {
        showNotification("全データ削除はキャンセルされました。", "info");
        return;
    }

    console.warn("Initiating full data reset!");
    showLoadingOverlay(true, "全データを削除中...");

    try {
        // Clear LocalStorage entries managed by the app
        localStorage.removeItem(LS_KEYS.DECKS);
        localStorage.removeItem(LS_KEYS.SETTINGS);
        localStorage.removeItem(LS_KEYS.CURRENT_DECK_ID);
        localStorage.removeItem(LS_KEYS.LAST_SCREEN);
         // Clear other potential keys if added later

        // Reset appState to defaults
        appState.allDecks = {};
        appState.settings = { ...DEFAULT_SETTINGS }; // Reset to defaults
        appState.currentDeckId = null;
         appState.currentDashboardDeckId = null;
        // Reset UI states
         resetStudyState(); // Clear any ongoing study
         resetDashboardFiltersAndState(true); // Reset dashboard fully
         appState.homeDeckCurrentPage = 1;
         appState.homeDeckFilterQuery = '';
         appState.homeDeckSortOrder = 'lastStudiedDesc';
         appState.studyFilter = 'all';


        // Apply default theme & settings to UI
         applyTheme(appState.settings.theme); // Apply potentially reset theme
         applyInitialSettingsToUI(); // Apply other default settings

         // Refresh all major UI components
         updateHomeUI(true);
         populateDashboardDeckSelect();
         navigateToScreen('home-screen'); // Force navigation to home

        console.log("All application data has been reset.");
        showNotification("すべてのアプリデータが削除されました。", "success");

    } catch (error) {
        console.error("Error during full data reset:", error);
        showNotification(`データ削除中にエラーが発生しました: ${error.message}`, "error");
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
        element.setAttribute('aria-live', (type === 'error' || type === 'warning') ? 'assertive' : 'polite');
    }
}

/**
 * ステータスメッセージを一定時間後にクリアする
 * @param {HTMLElement | null} element - 対象要素
 * @param {number} delay - 遅延時間 (ms)
 */
function clearStatusMessageAfterDelay(element, delay = 5000) {
    setTimeout(() => {
        if (element && element.classList.contains('success') || element.classList.contains('info')) {
            updateStatusMessage(element, '', 'info'); // Clear only success/info
        }
    }, delay);
}


// ====================================================================
// ホーム画面関連処理 (Home Screen)
// ====================================================================

/** ホーム画面全体のUIを更新 */
function updateHomeUI(forceUpdate = false) {
     if (!forceUpdate && appState.activeScreen !== 'home-screen') return; // Don't update if not visible unless forced

     updateDeckListControlsVisibility(); // Show/hide search/sort controls
     updateFilteredDeckList(); // This triggers pagination and list render
     updateTopScreenDisplay(); // Update current deck info card
     updateAllFilterCounts(); // Update counts on filter radios
}

/** デッキリストのコントロール表示/非表示を切り替え */
function updateDeckListControlsVisibility() {
     const showControls = Object.keys(appState.allDecks).length > 0;
     if (dom.deckListControls) {
         dom.deckListControls.style.display = showControls ? 'flex' : 'none';
     }
}

/** デッキリストの検索入力ハンドラ */
function handleDeckSearchInput(event) {
     appState.homeDeckFilterQuery = event.target.value;
     appState.homeDeckCurrentPage = 1; // Reset page on search
     updateFilteredDeckList(); // Re-render list with new filter
}

/** デッキリストのソート順変更ハンドラ */
function handleDeckSortChange(event) {
    appState.homeDeckSortOrder = event.target.value;
    appState.homeDeckCurrentPage = 1; // Reset page on sort
    updateFilteredDeckList(); // Re-render list with new sort
}

/** フィルタリングとソートを適用したデッキリストを取得 */
function getFilteredAndSortedDecks() {
    let decks = Object.values(appState.allDecks);
    const query = appState.homeDeckFilterQuery.toLowerCase().trim();

    // Apply Search Filter
    if (query) {
        decks = decks.filter(deck => deck.name.toLowerCase().includes(query));
    }

    // Apply Sorting
    decks.sort((a, b) => {
        switch (appState.homeDeckSortOrder) {
            case 'nameAsc': return (a.name || '').localeCompare(b.name || '', 'ja');
            case 'nameDesc': return (b.name || '').localeCompare(a.name || '', 'ja');
            case 'questionCountAsc': return (a.questions?.length || 0) - (b.questions?.length || 0);
            case 'questionCountDesc': return (b.questions?.length || 0) - (a.questions?.length || 0);
            case 'lastStudiedDesc': // Default
            default:
                const tsA = a.lastStudied || 0;
                const tsB = b.lastStudied || 0;
                if (tsB !== tsA) return tsB - tsA; // Newest first
                return (a.name || '').localeCompare(b.name || '', 'ja'); // Secondary sort by name
        }
    });

    return decks;
}

/** ホーム画面のデッキリストとページネーションを更新 */
function updateFilteredDeckList() {
     const filteredDecks = getFilteredAndSortedDecks();
     const totalDecks = filteredDecks.length;
     const decksPerPage = appState.settings.homeDecksPerPage; // Use setting
     const totalPages = Math.ceil(totalDecks / decksPerPage) || 1;

     // Validate current page
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
     dom.deckList.innerHTML = ''; // Clear existing
     dom.deckList.scrollTop = 0; // Scroll to top on update

     if (decks.length === 0) {
         const message = appState.homeDeckFilterQuery ? `検索語「${appState.homeDeckFilterQuery}」に一致する問題集はありません。` : "利用可能な問題集がありません。";
         dom.deckList.innerHTML = `<li class="no-decks-message">${message}</li>`;
         return;
     }

     const fragment = document.createDocumentFragment();
     decks.forEach(deck => {
         const li = document.createElement('li');
         li.dataset.deckId = deck.id;
         li.tabIndex = 0; // Make focusable
         li.setAttribute('role', 'button'); // Behave like a button
         li.setAttribute('aria-label', `問題集 ${deck.name || '名称未設定'} を選択`);
         li.classList.toggle('active-deck', deck.id === appState.currentDeckId);
         li.setAttribute('aria-selected', String(deck.id === appState.currentDeckId));

         const infoDiv = document.createElement('div');
         infoDiv.className = 'deck-info';
         const nameSpan = document.createElement('span');
         nameSpan.className = 'deck-name';
         nameSpan.textContent = `${deck.name || '名称未設定'} (${deck.questions?.length || 0}問)`;
         const historySpan = document.createElement('span');
         historySpan.className = 'deck-history';
         const { accuracyText } = calculateOverallAccuracy(deck);
         historySpan.textContent = `${deck.lastStudied ? `最終学習: ${formatDate(deck.lastStudied)}` : '未学習'} / ${accuracyText}`;
         infoDiv.appendChild(nameSpan);
         infoDiv.appendChild(historySpan);

         const actionsDiv = document.createElement('div');
         actionsDiv.className = 'deck-actions no-print'; // Don't print buttons
         const selectBtn = createButton({
             text: '<i class="fas fa-check-circle"></i> 選択',
             class: 'small primary select-deck',
             ariaLabel: `問題集 ${deck.name || '名称未設定'} を選択`,
             data: { 'deck-id': deck.id },
             disabled: deck.id === appState.currentDeckId,
         });
         const deleteBtn = createButton({
             text: '<i class="fas fa-trash-alt"></i> 削除',
             class: 'small danger delete-deck',
             ariaLabel: `問題集 ${deck.name || '名称未設定'} を削除`,
             data: { 'deck-id': deck.id },
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
     renderGenericPagination(dom.deckListPagination, totalItems, totalPages, currentPage);
}

/** ホーム画面のデッキリストページ遷移ハンドラ */
function handleDeckPaginationClick(event) {
     const targetPage = getPageFromPaginationClick(event);
     if (targetPage !== null) {
         appState.homeDeckCurrentPage = targetPage;
         updateFilteredDeckList(); // Re-render list for the new page
         // Optionally focus the list after page change
         dom.deckList?.focus();
     }
}


/** ホーム画面の「現在の問題集」情報とフィルター関連を更新 */
function updateTopScreenDisplay() {
    const deckSelected = !!appState.currentDeckId && !!appState.allDecks[appState.currentDeckId];
    const currentDeck = deckSelected ? appState.allDecks[appState.currentDeckId] : null;

    safeSetText(dom.currentDeckName, currentDeck ? (currentDeck.name || '名称未設定') : '未選択');
    safeSetText(dom.totalQuestions, currentDeck ? (currentDeck.questions?.length ?? 0).toString() : '0');
    safeSetText(dom.currentDeckLastStudied, currentDeck?.lastStudied ? formatDate(currentDeck.lastStudied) : '-');

    if (dom.currentDeckAccuracy) {
         const { accuracyText } = calculateOverallAccuracy(currentDeck);
         dom.currentDeckAccuracy.textContent = accuracyText;
    }

    // Study Filter Options Visibility & Threshold Update
    if (dom.studyFilterOptions) dom.studyFilterOptions.style.display = deckSelected ? 'block' : 'none';
    if (dom.lowAccuracyThresholdDisplayFilter) {
        dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
    }

    // Update Start/Reset buttons based on deck selection and history
    updateHomeActionButtonsState(currentDeck);

    // Update filter counts (debounced to avoid lag)
     clearTimeout(filterCountDebounceTimer);
     filterCountDebounceTimer = setTimeout(updateAllFilterCounts, MIN_DEBOUNCE_DELAY);
}

/** ホーム画面のアクションボタン（開始、リセット）の状態を更新 */
function updateHomeActionButtonsState(currentDeck) {
     // Start Study Button (State handled by updateAllFilterCounts -> updateStudyButtonsState)

     // Reset History Button
     if (dom.resetHistoryButton) {
        let hasHistory = false;
         if (currentDeck) {
             hasHistory = (currentDeck.lastStudied !== null) ||
                          (currentDeck.totalCorrect > 0) ||
                          (currentDeck.totalIncorrect > 0) ||
                          (currentDeck.sessionHistory?.length > 0) ||
                          (currentDeck.questions?.some(q => q.history?.length > 0));
         }
         dom.resetHistoryButton.disabled = !hasHistory;
         dom.resetHistoryButton.setAttribute('aria-disabled', String(!hasHistory));
         dom.resetHistoryButton.title = hasHistory
             ? "選択中の問題集の全学習履歴をリセットします (要確認)"
             : (currentDeck ? "リセットする履歴がありません" : "問題集を選択してください");
     }
}


/** ホーム画面: フィルター選択ラジオ内の問題数カウントを更新 */
function updateAllFilterCounts() {
     if (!appState.currentDeckId || !appState.allDecks[appState.currentDeckId]) {
          // Clear all counts if no deck selected
          dom.studyFilterRadios.forEach(radio => {
               const countSpan = radio.nextElementSibling?.querySelector('.filter-count');
               if(countSpan) countSpan.textContent = `(0)`;
          });
          if(dom.filteredQuestionCountDisplay) dom.filteredQuestionCountDisplay.textContent = "対象問題数: 0問";
           updateStudyButtonsState(0); // Disable start button
          return;
     }

    const counts = {};
    let totalFiltered = 0;
     try {
          dom.studyFilterRadios.forEach(radio => {
              const filterValue = radio.value;
               const list = getFilteredStudyList(filterValue); // Pass the specific filter value
               counts[filterValue] = list.length;
               const countSpan = radio.nextElementSibling?.querySelector('.filter-count');
               if(countSpan) countSpan.textContent = `(${list.length})`;

               if(radio.checked) {
                   totalFiltered = list.length; // Get count for the currently selected filter
               }
          });
     } catch (error) {
         console.error("Error updating filter counts:", error);
     }

     // Update the main count display
    if(dom.filteredQuestionCountDisplay) {
        dom.filteredQuestionCountDisplay.textContent = `総対象問題数: ${totalFiltered}問`;
    }

     // Update Start Button State based on selected filter's count
    updateStudyButtonsState(totalFiltered);
}

/** ホーム画面: Start Study ボタンの有効/無効とツールチップを更新 */
function updateStudyButtonsState(filteredCount) {
    if (!dom.startStudyButton) return;
    const canStart = filteredCount > 0;
    dom.startStudyButton.disabled = !canStart;
    dom.startStudyButton.setAttribute('aria-disabled', String(!canStart));

    if (!appState.currentDeckId) {
         dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
     } else if (!canStart) {
         let filterLabel = "選択されたフィルター条件";
         const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
         if (selectedRadio) {
              const labelElement = document.querySelector(`label[for="${selectedRadio.id}"]`);
              if(labelElement) filterLabel = `「${labelElement.querySelector('.filter-text')?.textContent.trim() ?? '選択条件'}」`;
         }
         dom.startStudyButton.title = `${filterLabel} に該当する問題がありません。`;
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
         event.stopPropagation();
         selectDeck(deckId);
    } else if (deleteButton && !deleteButton.disabled) {
        event.stopPropagation();
        handleDeleteDeckClick(deckId); // Confirmation inside
    } else if (listItem.getAttribute('role') === 'button' && deckId !== appState.currentDeckId) {
        // Click on the list item itself (not buttons) to select
         selectDeck(deckId);
    }
}

/** デッキリストのキーダウンイベント処理（委任） */
function handleDeckListKeydown(event) {
     const currentItem = event.target;
     if (!currentItem.matches('li[data-deck-id]')) return; // Ignore if not on list item

    switch (event.key) {
        case 'Enter':
        case ' ':
             event.preventDefault();
             const deckId = currentItem.dataset.deckId;
             if (deckId && deckId !== appState.currentDeckId) {
                selectDeck(deckId);
            }
            break;
         case 'ArrowDown':
             event.preventDefault();
             focusSiblingListItem(currentItem, 'nextElementSibling');
             break;
         case 'ArrowUp':
             event.preventDefault();
             focusSiblingListItem(currentItem, 'previousElementSibling');
             break;
         case 'Home':
             event.preventDefault();
             focusSiblingListItem(currentItem, 'firstElementChild', currentItem.parentElement);
             break;
         case 'End':
             event.preventDefault();
             focusSiblingListItem(currentItem, 'lastElementChild', currentItem.parentElement);
             break;
         case 'Delete': // Add delete shortcut? Maybe too risky?
            // handleDeleteDeckClick(currentItem.dataset.deckId);
            break;
    }
}

/** フォーカス可能な兄弟リスト要素にフォーカスを移動 */
function focusSiblingListItem(currentItem, directionProperty, parent = currentItem.parentElement) {
     if (!parent) return;
     let sibling;
     if (directionProperty === 'firstElementChild' || directionProperty === 'lastElementChild') {
         sibling = parent[directionProperty];
     } else {
         sibling = currentItem[directionProperty];
     }
     // Find the next focusable sibling li
     while (sibling && (!sibling.matches('li[data-deck-id]') || sibling.offsetParent === null)) { // Check visible
        sibling = sibling[directionProperty];
     }
    if (sibling) {
        sibling.focus();
    }
}

/** 指定されたIDのデッキを選択状態にする */
function selectDeck(deckId) {
    if (!deckId || !appState.allDecks[deckId] || deckId === appState.currentDeckId) return;

    appState.currentDeckId = deckId;
    appState.currentDashboardDeckId = deckId; // Sync dashboard selection
    saveData(LS_KEYS.CURRENT_DECK_ID, deckId);

    console.log("Deck selected:", deckId);
    showNotification(`問題集「${appState.allDecks[deckId]?.name || '無名'}」を選択しました。`, 'success', 2500);

    // Reset study filter to 'all' on deck change
    appState.studyFilter = 'all';
    const allFilterRadio = document.getElementById('filter-all');
    if (allFilterRadio) allFilterRadio.checked = true;

    // Update UI that depends on current deck
     updateHomeUI(true); // Update list, counts etc. Force update.
    if(dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = deckId;

    // If on dashboard, refresh it for the new deck
    if (appState.activeScreen === 'dashboard-screen') {
        resetDashboardFiltersAndState(false); // Don't reset deck ID
        renderDashboard();
    }
}

/** デッキ削除ボタンクリック時の処理 */
function handleDeleteDeckClick(deckId) {
     const deck = appState.allDecks[deckId];
     if (!deck) return;

     showModal({
         title: `<i class="fas fa-exclamation-triangle" style="color:var(--danger-color);"></i> 問題集削除確認`,
         content: `<p>問題集「<strong>${escapeHtml(deck.name || '名称未設定')}</strong>」(${deck.questions?.length ?? 0}問) とその全ての学習履歴を完全に削除します。</p>
                   <p style="font-weight:bold; color:var(--danger-dark);">この操作は元に戻せません！</p>`,
         buttons: [
             { id: 'confirm-delete-btn', text: '削除する', class: 'danger', onClick: () => { deleteDeckConfirmed(deckId); closeModal(); } },
             { id: 'cancel-delete-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ]
     });
}

/** デッキ削除を最終確認後、実行 */
function deleteDeckConfirmed(deckId) {
    if (!deckId || !appState.allDecks[deckId]) {
        showNotification("削除対象の問題集が見つかりません。", "error");
        return;
    }
    const deckName = appState.allDecks[deckId].name || '無名';
    console.log(`Deleting deck: ${deckName} (ID: ${deckId})`);
    showLoadingOverlay(true, `「${deckName}」を削除中...`);

     const originalDecks = { ...appState.allDecks }; // Backup for rollback
     delete appState.allDecks[deckId];

     let selectionChanged = false;
     if (appState.currentDeckId === deckId) {
        appState.currentDeckId = null;
         selectionChanged = true;
     }
     if (appState.currentDashboardDeckId === deckId) {
         appState.currentDashboardDeckId = null;
          if(dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = "";
         selectionChanged = true;
     }

    // Save deletion
     if (saveData(LS_KEYS.DECKS, appState.allDecks)) {
         if (selectionChanged) saveData(LS_KEYS.CURRENT_DECK_ID, null);
         showNotification(`問題集「${deckName}」を削除しました。`, "success");
     } else {
         appState.allDecks = originalDecks; // Rollback state
         showNotification("問題集の削除中にエラーが発生しました。操作はキャンセルされました。", "error");
          updateLoadingOverlay(false);
         return; // Stop UI update
     }

    // Update UI after successful deletion
    updateHomeUI(true);
    populateDashboardDeckSelect(); // Update dropdown
    if (appState.activeScreen === 'dashboard-screen' && selectionChanged) {
         renderDashboard(); // Refresh dashboard if selection changed
    }
     updateLoadingOverlay(false);
}

/** 学習履歴リセットボタンクリック時の処理 */
function handleResetHistoryClick() {
     const deckId = appState.currentDeckId;
     if (!deckId || !appState.allDecks[deckId]) {
         showNotification("問題集が選択されていません。", "warning");
         return;
     }
     const deck = appState.allDecks[deckId];

     // Use custom modal for confirmation, requesting deck name input
     showModal({
         title: `<i class="fas fa-history" style="color:var(--warning-color);"></i> 学習履歴リセット確認`,
         content: `<p>問題集「<strong>${escapeHtml(deck.name)}</strong>」の全ての学習履歴（解答履歴、評価、統計、最終学習日）をリセットします。</p>
                    <p>問題自体は削除されません。<strong>この操作は元に戻せません！</strong></p>
                   <hr>
                    <label for="reset-confirm-input">確認のため、問題集名「${escapeHtml(deck.name)}」を入力してください:</label>
                    <input type="text" id="reset-confirm-input" class="confirm-input" style="width: 100%; margin-top: 5px;" placeholder="${escapeHtml(deck.name)}">
                   <p id="reset-confirm-error" class="status-message error" style="display:none; margin-top: 5px;"></p>`,
         buttons: [
             { id: 'confirm-reset-btn', text: '履歴リセット実行', class: 'danger', onClick: () => resetHistoryConfirmed(deckId) /* Confirmation inside */ },
             { id: 'cancel-reset-btn', text: 'キャンセル', class: 'secondary', onClick: closeModal }
         ]
     });
     // Initial focus on input field
     setTimeout(() => document.getElementById('reset-confirm-input')?.focus(), 100);
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

     // Name matched, proceed with reset
     closeModal(); // Close the confirmation modal
     console.log(`Resetting history for deck: ${deck.name} (ID: ${deckId})`);
    showLoadingOverlay(true, `「${deck.name}」の履歴をリセット中...`);

     const originalDeck = JSON.parse(JSON.stringify(deck)); // Backup

     try {
         deck.lastStudied = null;
         deck.totalCorrect = 0;
         deck.totalIncorrect = 0;
         deck.sessionHistory = [];
         if (Array.isArray(deck.questions)) {
             deck.questions.forEach(q => { q.history = []; });
         }

         // Save the change
         if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             appState.allDecks[deckId] = originalDeck; // Rollback
             throw new Error("履歴リセット後の保存に失敗しました。");
         }

         showNotification(`問題集「${deck.name}」の学習履歴をリセットしました。`, "success");

         // Update UI
         updateHomeUI(true);
         if (appState.currentDashboardDeckId === deckId && appState.activeScreen === 'dashboard-screen') {
             renderDashboard(); // Refresh dashboard if it was showing this deck
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
         // Update counts immediately (debounced internally)
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

    // console.log(`Filtering: ${questions.length} questions with filter "${filter}" (Threshold: ${lowThreshold}%)`);

    let filteredQuestions = [];
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
        case 'difficult':
        case 'normal':
        case 'easy':
             filteredQuestions = questions.filter(q => q.history?.length > 0 && q.history[q.history.length - 1].evaluation === filter);
            break;
        case 'all':
        default:
            filteredQuestions = [...questions]; // Return a copy
            break;
    }
    // console.log(`Filter result: ${filteredQuestions.length} questions`);
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
    const filteredList = getFilteredStudyList(); // Use current appState.studyFilter
    if (filteredList.length === 0) {
         const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
         let filterLabel = "選択されたフィルター";
         if (selectedRadio) filterLabel = `「${selectedRadio.nextElementSibling?.querySelector('.filter-text')?.textContent.trim() ?? '選択条件'}」`;
        showNotification(`${filterLabel} に該当する問題がありません。`, 'warning');
        return;
    }

    appState.studyList = [...filteredList]; // Copy
    // Shuffle question order (always shuffle study list?) - Keep original setting meaning choice shuffle
    // Decision: Let's *always* shuffle the *question order* in the study session for better learning.
     appState.studyList = shuffleArray(appState.studyList);
     console.log(`Study session started with ${appState.studyList.length} questions (shuffled order).`);


    // Reset session state
    appState.currentQuestionIndex = 0;
    appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
    appState.isStudyActive = true;

    // Update Study Screen Title & UI Reset
     if (dom.studyScreenTitle) dom.studyScreenTitle.querySelector('span').textContent = deck.name || '名称未設定';
     if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';
     if(dom.quitStudyHeaderButton) dom.quitStudyHeaderButton.style.display = 'inline-block'; // Show quit button in header
     if(dom.studyCard) dom.studyCard.style.display = 'block';
     if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
     if(dom.answerArea) dom.answerArea.style.display = 'none';
     if(dom.retryButton) dom.retryButton.style.display = 'none'; // Hide retry initially


    navigateToScreen('study-screen'); // Navigate AFTER setup
    displayCurrentQuestion();
     updateStudyProgress();
}

/** 現在の問題を画面に表示 */
function displayCurrentQuestion() {
    // Validate state before proceeding
     if (!appState.isStudyActive || !dom.questionText || !dom.optionsButtonsContainer || appState.currentQuestionIndex < 0 || appState.currentQuestionIndex >= appState.studyList.length) {
        console.warn("displayCurrentQuestion: Invalid state or elements. Ending study.", {
            isStudyActive: appState.isStudyActive,
             index: appState.currentQuestionIndex, listLength: appState.studyList.length });
         if (appState.isStudyActive) showStudyCompletion(); // End gracefully if was active
        return;
    }
    const questionData = appState.studyList[appState.currentQuestionIndex];
    if (!questionData || !isValidQuestion(questionData)) {
         console.error(`Skipping invalid question data at index ${appState.currentQuestionIndex}:`, questionData);
         showNotification(`問題 ${appState.currentQuestionIndex + 1} のデータ形式が不正なためスキップします。`, 'warning');
         moveToNextQuestion(); // Skip and move on
        return;
    }

    console.log(`Displaying question ${appState.currentQuestionIndex + 1}/${appState.studyList.length} (ID: ${questionData.id})`);

    // Reset UI state for the new question
     dom.optionsButtonsContainer.innerHTML = ''; // Clear options
    dom.optionsButtonsContainer.setAttribute('aria-busy', 'true');
     if(dom.answerArea) dom.answerArea.style.display = 'none';
     if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
     if(dom.feedbackMessage) dom.feedbackMessage.textContent = '';
     if(dom.feedbackContainer) dom.feedbackContainer.className = 'feedback-container';
     if(dom.studyCard) dom.studyCard.classList.remove('correct-answer', 'incorrect-answer');
     if(dom.retryButton) dom.retryButton.style.display = 'none';
    if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable eval buttons


     // Display Question Text & Counter
    safeSetText(dom.questionCounter, `${appState.currentQuestionIndex + 1} / ${appState.studyList.length}`);
    safeSetText(dom.questionText, questionData.question);


    // Prepare and Display Options (Shuffle if enabled)
    let options = [...questionData.options];
    if (appState.settings.shuffleOptions) {
        options = shuffleArray(options);
        console.log("Options shuffled.");
    }

    const fragment = document.createDocumentFragment();
    options.forEach((optionText, index) => {
        const button = createButton({
            text: escapeHtml(optionText), // Ensure text is escaped
             class: 'option-button',
             data: { 'option-value': optionText }, // Use original value for comparison
             ariaLabel: `選択肢 ${index + 1}: ${optionText}`
         });
         fragment.appendChild(button);
     });
     dom.optionsButtonsContainer.appendChild(fragment);
    dom.optionsButtonsContainer.removeAttribute('aria-busy');

    // Prepare Answer/Explanation (but keep hidden)
    safeSetText(dom.answerText, questionData.correctAnswer);
    safeSetText(dom.explanationText, questionData.explanation || '解説はありません。');

    // Focus the first option button for accessibility
    const firstOption = dom.optionsButtonsContainer.querySelector('.option-button');
     if (firstOption) {
         setTimeout(() => firstOption.focus(), 50); // Slight delay for render
     }
     // Ensure progress bar is updated
     updateStudyProgress();
}

/** 学習進捗バーとテキストを更新 */
function updateStudyProgress() {
    if (!dom.studyProgressBar || !dom.studyProgressText) return;
    const total = appState.studyList.length;
    const current = appState.currentQuestionIndex; // 0-based

    if (total > 0 && current >= 0) {
        const progressPercent = Math.round(((current + 1) / total) * 100);
         dom.studyProgressBar.value = current + 1; // Current question number
         dom.studyProgressBar.max = total;       // Total questions
        safeSetText(dom.studyProgressText, `${current + 1} / ${total} (${progressPercent}%)`);
        if (dom.studyProgressContainer) dom.studyProgressContainer.style.visibility = 'visible';
    } else {
        // Hide progress if study hasn't started or list is empty
         dom.studyProgressBar.value = 0;
         dom.studyProgressBar.max = 100;
         safeSetText(dom.studyProgressText, '');
        if (dom.studyProgressContainer) dom.studyProgressContainer.style.visibility = 'hidden';
    }
}

/** 選択肢ボタンクリック時のハンドラ */
function handleOptionButtonClick(event) {
    const clickedButton = event.target.closest('.option-button');
    if (!clickedButton || clickedButton.disabled) return;

    // Disable all options immediately
    const allOptions = dom.optionsButtonsContainer.querySelectorAll('.option-button');
    allOptions.forEach(btn => btn.disabled = true);

    const selectedOption = clickedButton.dataset.optionValue;
    const questionData = appState.studyList[appState.currentQuestionIndex];
     if (!questionData || !questionData.correctAnswer) {
         console.error("Answer handling error: Invalid question data.");
         showNotification("解答処理エラーが発生しました。", "error");
         // Re-enable buttons or end study?
         allOptions.forEach(btn => btn.disabled = false);
         return;
     }

    handleAnswerSubmission(selectedOption, questionData.correctAnswer);
}

/** 解答提出後の処理 */
function handleAnswerSubmission(selectedOption, correctAnswer) {
    const isCorrect = selectedOption === correctAnswer;
    const questionData = appState.studyList[appState.currentQuestionIndex];
     if (!questionData || !dom.studyCard || !dom.feedbackMessage || !dom.feedbackContainer || !dom.answerArea || !dom.evaluationControls || !dom.optionsButtonsContainer || !dom.retryButton) {
         console.error("Feedback display error: Missing elements or data.");
         return;
     }

    console.log(`Answer submitted: Selected="${selectedOption}", Correct="${correctAnswer}", Result=${isCorrect}`);

    // Update stats & UI feedback
    if (isCorrect) {
        appState.studyStats.currentSessionCorrect++;
        dom.studyCard.classList.add('correct-answer');
        dom.studyCard.classList.remove('incorrect-answer');
        safeSetText(dom.feedbackMessage.querySelector('span'), '正解！');
        dom.feedbackContainer.className = 'feedback-container correct'; // Use container class
        dom.feedbackIcon.className = 'feedback-icon fas fa-check-circle'; // Specific icon
         dom.retryButton.style.display = 'none';
    } else {
        appState.studyStats.currentSessionIncorrect++;
        dom.studyCard.classList.add('incorrect-answer');
        dom.studyCard.classList.remove('correct-answer');
        safeSetText(dom.feedbackMessage.querySelector('span'), '不正解...');
         dom.feedbackContainer.className = 'feedback-container incorrect'; // Use container class
         dom.feedbackIcon.className = 'feedback-icon fas fa-times-circle'; // Specific icon
         dom.retryButton.style.display = 'inline-block'; // Show retry
    }

    // Highlight correct/incorrect options visually
     dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
         const optionVal = button.dataset.optionValue;
         button.classList.remove('success', 'danger'); // Reset
         if (optionVal === correctAnswer) button.classList.add('success');
         else if (optionVal === selectedOption) button.classList.add('danger');
         else button.style.opacity = '0.5'; // Fade others
     });

    // Show answer and evaluation panel
     dom.answerArea.style.display = 'block';
     dom.evaluationControls.style.display = 'flex'; // Show eval panel

    // Scroll and focus
     dom.evaluationControls.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
     setTimeout(() => dom.evaluationControls.querySelector('.eval-button')?.focus(), 50);
}

/** 理解度評価ボタンクリックハンドラ */
function handleEvaluation(event) {
     const evalButton = event.target.closest('.eval-button');
     if (!evalButton || evalButton.disabled) return;

     const evaluation = evalButton.dataset.levelChange;
     if (!evaluation || !['difficult', 'normal', 'easy'].includes(evaluation)) return;

     // Disable all eval buttons
     if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = true);

     const questionIndexInStudyList = appState.currentQuestionIndex;
     const questionData = appState.studyList?.[questionIndexInStudyList];
     const isCorrect = dom.feedbackContainer?.classList.contains('correct') ?? false;

     if (!questionData || !questionData.id || !appState.currentDeckId) {
         console.error("Evaluation error: Missing context data.");
          if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable on error
         return;
     }

    // Update history in the main deck data
     const success = recordQuestionHistory(appState.currentDeckId, questionData.id, isCorrect, evaluation);

    if (success) {
        moveToNextQuestion();
    } else {
         // History recording failed (likely save error), keep eval buttons disabled? Re-enable?
         showNotification("学習履歴の保存に失敗しました。", "error");
          if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable on failure
     }
}

/** 問題の解答履歴を記録し、デッキデータを保存 */
function recordQuestionHistory(deckId, questionId, isCorrect, evaluation) {
    const deck = appState.allDecks[deckId];
     if (!deck) { console.error(`History Error: Deck ${deckId} not found.`); return false; }
    const questionInDeck = deck.questions?.find(q => q.id === questionId);
     if (!questionInDeck) { console.error(`History Error: Question ${questionId} not found in deck ${deckId}.`); return false; }

    if (!Array.isArray(questionInDeck.history)) questionInDeck.history = [];
    questionInDeck.history.push({
        ts: Date.now(),
        correct: isCorrect,
        evaluation: evaluation,
    });

    // Update deck-level stats immediately? No, these are cumulative, let dashboard calculate.
    // Update only last studied time.
    deck.lastStudied = Date.now();

     // Save the entire updated decks object
     if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
         // Attempt to rollback history add on save failure
         questionInDeck.history.pop();
         console.error("History Save Failed: Could not save updated deck data.");
         return false; // Indicate failure
     }

    console.log(`History recorded for Q:${questionId}, Correct:${isCorrect}, Eval:${evaluation}`);
    return true; // Indicate success
}


/** 次の問題へ移動、または学習完了処理を呼び出す */
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
     if (!dom.studyCompleteMessage || !dom.studyCard || !dom.evaluationControls || !dom.quitStudyHeaderButton || !dom.sessionCorrectCount || !dom.sessionIncorrectCount) {
         console.error("Completion display error: Missing elements.");
         resetStudyState();
         navigateToScreen('home-screen');
         return;
     }
    console.log("Study session completed. Stats:", appState.studyStats);
     appState.isStudyActive = false; // Mark study as inactive

    // Save session history
    saveSessionHistory();

    // Hide study elements, show completion message
    dom.studyCard.style.display = 'none';
    dom.evaluationControls.style.display = 'none';
    dom.quitStudyHeaderButton.style.display = 'none'; // Hide quit button
     if(dom.studyProgressContainer) dom.studyProgressContainer.style.visibility = 'hidden'; // Hide progress


    // Display results
     safeSetText(dom.sessionCorrectCount, appState.studyStats.currentSessionCorrect);
     safeSetText(dom.sessionIncorrectCount, appState.studyStats.currentSessionIncorrect);
     dom.studyCompleteMessage.style.display = 'block';
     dom.studyCompleteMessage.focus(); // Focus the message area


    // Reset list/index for next session (stats are kept until next session starts)
     appState.studyList = [];
     appState.currentQuestionIndex = -1;

    // Update home screen (may have new stats/last studied)
     updateHomeUI(true);
}

/** 現在のセッション履歴を保存 */
function saveSessionHistory() {
    const deckId = appState.currentDeckId;
    const deck = appState.allDecks[deckId];
    if (!deck) return; // No deck to save history for

    // Save only if questions were answered in this session
    const { currentSessionCorrect, currentSessionIncorrect } = appState.studyStats;
    if (currentSessionCorrect > 0 || currentSessionIncorrect > 0) {
        if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
         deck.sessionHistory.push({
             ts: Date.now(),
             correct: currentSessionCorrect,
             incorrect: currentSessionIncorrect
         });
         // lastStudied is updated on each answer record, no need here?
         // Maybe update it here *again* to ensure it's set on session end/quit?
         deck.lastStudied = Date.now();

        // Save updated deck data (session history included)
         if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
             console.error(`Failed to save session history for deck ${deckId}`);
             // Don't necessarily show user-facing error for session save failure
         } else {
             console.log(`Session history saved for deck ${deckId}.`);
         }
    } else {
        console.log("Skipping session history save (no questions answered).");
    }
     // Reset session stats for the next run (Important!)
     appState.studyStats = { currentSessionCorrect: 0, currentSessionIncorrect: 0 };
}

/** 現在の問題を再挑戦する */
function retryCurrentQuestion() {
    if (!appState.isStudyActive || appState.currentQuestionIndex < 0 || !dom.answerArea || !dom.evaluationControls || !dom.retryButton || !dom.optionsButtonsContainer || !dom.feedbackContainer) {
        console.warn("Cannot retry: Invalid state or missing elements.");
        return;
    }

    // Don't adjust session stats here - let the *next* submission determine outcome
     console.log(`Retrying question ${appState.currentQuestionIndex + 1}`);

    // Reset UI to pre-answer state
     dom.answerArea.style.display = 'none';
     dom.evaluationControls.style.display = 'none';
     dom.feedbackMessage.textContent = '';
     dom.feedbackContainer.className = 'feedback-container'; // Reset feedback style
     dom.studyCard.classList.remove('correct-answer', 'incorrect-answer');
     dom.retryButton.style.display = 'none';

     // Re-enable option buttons and remove styling
     dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
         button.disabled = false;
         button.classList.remove('success', 'danger');
         button.style.opacity = '1'; // Restore opacity
     });

    // Focus first option
     const firstOption = dom.optionsButtonsContainer.querySelector('.option-button');
     if(firstOption) setTimeout(() => firstOption.focus(), 50);
}


/** 学習の中断を確認し、必要に応じて画面遷移 */
function confirmQuitStudy(showConfirmation = true, navigateTo = 'home-screen') {
    let quitConfirmed = false;
    if (!appState.isStudyActive) return true; // Not studying, proceed

    if (showConfirmation) {
        const result = confirm(
             "学習セッションを中断しますか？\n\n" +
             "ここまでの解答履歴とセッション統計は保存され、学習推移に反映されます。\n\n" +
             "よろしいですか？"
        );
        quitConfirmed = result;
    } else {
        quitConfirmed = true; // Allow programmatic quit without prompt
    }

    if (quitConfirmed) {
        console.log(`Processing study quit. Will navigate to: ${navigateTo}`);
         appState.isStudyActive = false; // Mark as inactive *before* potential errors

         // Save session history *before* resetting state
         saveSessionHistory();

        // Reset Study State (List, Index cleared. Stats were handled by saveSessionHistory)
        appState.studyList = [];
        appState.currentQuestionIndex = -1;


        // Reset Study Screen UI to default/inactive state
         resetStudyScreenUI();

        // Navigate away
        navigateToScreen(navigateTo);
         showNotification("学習を中断しました。進行状況は保存されました。", "info", 3500);
        // Update home screen stats (already forced by navigateToScreen if going home)
         // updateHomeUI(true);

        return true; // Quit proceeded
    } else {
        console.log("Study quit cancelled.");
        return false; // User cancelled
    }
}

/** 学習画面のUI要素をデフォルト状態に戻す */
function resetStudyScreenUI() {
    // Hide elements specific to active study
     if(dom.quitStudyHeaderButton) dom.quitStudyHeaderButton.style.display = 'none';
     if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
     if(dom.answerArea) dom.answerArea.style.display = 'none';
     if(dom.studyProgressContainer) dom.studyProgressContainer.style.visibility = 'hidden';
     if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';

    // Clear dynamic content
    if(dom.studyScreenTitle) dom.studyScreenTitle.querySelector('span').textContent = '';
    if(dom.questionText) dom.questionText.textContent = '';
    if(dom.questionCounter) dom.questionCounter.textContent = '';
    if(dom.optionsButtonsContainer) dom.optionsButtonsContainer.innerHTML = '';
    if(dom.feedbackMessage) dom.feedbackMessage.textContent = '';
    if(dom.feedbackContainer) dom.feedbackContainer.className = 'feedback-container';

     // Ensure main card is visible for potential future content
    if(dom.studyCard) dom.studyCard.style.display = 'block';
}

/** 学習状態を完全にリセット（UI含む） */
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

/** ダッシュボードのデッキ選択ドロップダウンを更新 */
function populateDashboardDeckSelect() {
    if (!dom.dashboardDeckSelect) return;
    const select = dom.dashboardDeckSelect;
    const previouslySelected = appState.currentDashboardDeckId || select.value;

    select.innerHTML = '<option value="">-- 問題集を選択 --</option>'; // Placeholder

    const sortedDeckIds = Object.keys(appState.allDecks).sort((a, b) =>
        (appState.allDecks[a]?.name || '').localeCompare(appState.allDecks[b]?.name || '', 'ja')
    );

    const fragment = document.createDocumentFragment();
    sortedDeckIds.forEach(id => {
         const deck = appState.allDecks[id];
         if(deck) {
             const opt = document.createElement('option');
             opt.value = id;
             opt.textContent = `${deck.name || '名称未設定'} (${deck.questions?.length ?? 0}問)`;
             fragment.appendChild(opt);
         }
    });
    select.appendChild(fragment);

    // Restore selection if possible
     if (previouslySelected && appState.allDecks[previouslySelected]) {
         select.value = previouslySelected;
         appState.currentDashboardDeckId = previouslySelected; // Ensure state sync
     } else {
         select.value = "";
          appState.currentDashboardDeckId = null;
     }
     toggleDashboardControlsBasedOnSize(); // Adjust controls on load
}

/** ダッシュボード: デッキ選択変更ハンドラ */
function handleDashboardDeckChange(event) {
     const selectedId = event.target.value;
     if (selectedId !== appState.currentDashboardDeckId) {
        appState.currentDashboardDeckId = selectedId || null;
         console.log("Dashboard deck selection changed to:", appState.currentDashboardDeckId);
         resetDashboardFiltersAndState(false); // Reset filters but keep deck
         renderDashboard(); // Full re-render
     }
}

/** ダッシュボード: コントロールパネルの表示/非表示トグル */
function toggleDashboardControls() {
     if (!dom.dashboardControlsToggle || !dom.dashboardAnalysisControlsPanel) return;
     const isCollapsed = dom.dashboardAnalysisControlsPanel.classList.toggle('collapsed');
     dom.dashboardControlsToggle.setAttribute('aria-expanded', String(!isCollapsed));
     appState.isDashboardControlsCollapsed = isCollapsed; // Update state
     console.log(`Dashboard controls toggled: ${isCollapsed ? 'Collapsed' : 'Expanded'}`);
}

/** 画面サイズに基づいてコントロールパネルの表示状態を調整 */
function toggleDashboardControlsBasedOnSize() {
     if (!dom.dashboardControlsToggle || !dom.dashboardAnalysisControlsPanel) return;
     const isMobile = window.innerWidth <= 768; // Use mobile breakpoint
     dom.dashboardControlsToggle.style.display = isMobile ? 'flex' : 'none';

     if (isMobile) {
         // If mobile, respect the toggled state (appState.isDashboardControlsCollapsed)
         const shouldBeCollapsed = appState.isDashboardControlsCollapsed;
         dom.dashboardAnalysisControlsPanel.classList.toggle('collapsed', shouldBeCollapsed);
         dom.dashboardControlsToggle.setAttribute('aria-expanded', String(!shouldBeCollapsed));
     } else {
         // If not mobile, always ensure panel is expanded and toggle is hidden
         dom.dashboardAnalysisControlsPanel.classList.remove('collapsed');
         dom.dashboardControlsToggle.setAttribute('aria-expanded', 'true'); // Should be visible by default if button was shown
     }
}


/** ダッシュボード: 正答率フィルター変更ハンドラ */
function handleDashboardFilterChange(event) {
    appState.dashboardFilterAccuracy = event.target.value;
    appState.dashboardCurrentPage = 1; // Reset page
    console.log("Dashboard filter changed:", appState.dashboardFilterAccuracy);
    renderDashboardQuestionAnalysis(); // Only re-render analysis part
}

/** ダッシュボード: 検索入力ハンドラ (デバウンス済み) */
function handleDashboardSearchInput(event) {
    appState.dashboardSearchQuery = event.target.value.trim();
    // Don't reset page or render immediately - wait for button click or Enter
    if(dom.dashboardSearchButton) dom.dashboardSearchButton.disabled = !appState.dashboardSearchQuery;
}

/** ダッシュボード: 検索実行 */
function applyDashboardSearch() {
     console.log("Applying dashboard search:", appState.dashboardSearchQuery);
     appState.dashboardCurrentPage = 1; // Reset page
     renderDashboardQuestionAnalysis(); // Re-render with search
}

/** ダッシュボード: 検索クリア */
function clearDashboardSearch() {
     if (dom.dashboardSearchQuery) dom.dashboardSearchQuery.value = '';
     if (dom.dashboardSearchButton) dom.dashboardSearchButton.disabled = true;
     if (appState.dashboardSearchQuery !== '') {
         appState.dashboardSearchQuery = '';
         appState.dashboardCurrentPage = 1;
         console.log("Dashboard search cleared.");
         renderDashboardQuestionAnalysis(); // Re-render without search
     }
}

/** ダッシュボード: ソート順変更ハンドラ */
function handleDashboardSortChange(event) {
    appState.dashboardSortOrder = event.target.value;
    appState.dashboardCurrentPage = 1;
    console.log("Dashboard sort order changed:", appState.dashboardSortOrder);
    renderDashboardQuestionAnalysis();
}

/** ダッシュボード: 表示件数変更ハンドラ */
function handleDashboardItemsPerPageChange(event) {
    const newCount = parseInt(event.target.value, 10);
     if ([10, 20, 50, 100].includes(newCount)) {
        appState.dashboardQuestionsPerPage = newCount;
        // Persist this part of settings immediately? Or wait for Settings save?
         appState.settings.dashboardQuestionsPerPage = newCount; // Update settings state
         saveData(LS_KEYS.SETTINGS, appState.settings); // Save immediately
        appState.dashboardCurrentPage = 1;
        console.log("Dashboard items per page changed:", newCount);
        renderDashboardQuestionAnalysis();
    }
}


/** ダッシュボード: 表示モード（リスト/グラフ）設定 */
function setDashboardViewMode(mode) {
     if (mode !== 'list' && mode !== 'chart') return;
     if (mode === appState.dashboardViewMode) return;

     appState.dashboardViewMode = mode;
     console.log("Dashboard view mode set to:", mode);

     // Update button states
     setActiveClass(dom.viewModeList, mode === 'list');
     setAriaPressed(dom.viewModeList, mode === 'list');
     setActiveClass(dom.viewModeChart, mode === 'chart');
     setAriaPressed(dom.viewModeChart, mode === 'chart');

     // Update view container visibility
     setActiveClass(dom.questionListView, mode === 'list');
     setActiveClass(dom.questionChartView, mode === 'chart');

     // Re-render the analysis section to populate the selected view
     renderDashboardQuestionAnalysis();
}

/** ダッシュボードのフィルター、ソート、ページ状態等をリセット */
function resetDashboardFiltersAndState(resetDeckId = true) {
    // Reset State
     if (resetDeckId) appState.currentDashboardDeckId = null;
     appState.dashboardFilterAccuracy = 'all';
     appState.dashboardSearchQuery = '';
     appState.dashboardSortOrder = 'accuracyAsc';
     appState.dashboardCurrentPage = 1;
     appState.dashboardViewMode = 'list'; // Default to list view
     appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage; // Reset to saved setting
     appState.isDashboardControlsCollapsed = true; // Default collapsed on mobile

    // Reset UI Elements
     if (resetDeckId && dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = '';
     if (dom.dashboardFilterAccuracy) dom.dashboardFilterAccuracy.value = 'all';
     if (dom.dashboardSearchQuery) dom.dashboardSearchQuery.value = '';
     if (dom.dashboardSearchButton) dom.dashboardSearchButton.disabled = true;
     if (dom.dashboardSortOrder) dom.dashboardSortOrder.value = 'accuracyAsc';
     if (dom.dashboardItemsPerPage) dom.dashboardItemsPerPage.value = appState.dashboardQuestionsPerPage.toString();
     // Reset view mode buttons
     setActiveClass(dom.viewModeList, true);
     setAriaPressed(dom.viewModeList, true);
     setActiveClass(dom.viewModeChart, false);
     setAriaPressed(dom.viewModeChart, false);
     // Reset view visibility
     setActiveClass(dom.questionListView, true);
     setActiveClass(dom.questionChartView, false);
     // Reset collapse state based on current window size
     toggleDashboardControlsBasedOnSize();


     // No need to close detail modal here as renderDashboard handles it implicitly.
    console.log("Dashboard filters and display state reset.");
}


/** ダッシュボード画面全体をレンダリング */
async function renderDashboard() {
     const deckId = appState.currentDashboardDeckId;
     console.log(`Rendering dashboard for deck: ${deckId || 'None'}`);

    // Show loading overlay during dashboard rendering
     updateLoadingOverlay(true, `ダッシュボード (${deckId ? appState.allDecks[deckId]?.name : '未選択'}) 読み込み中...`);

    if (!dom.dashboardContent || !dom.dashboardNoDeckMessage) {
         console.error("Dashboard elements missing!");
         updateLoadingOverlay(false);
         return;
    }

     // Handle "No Deck Selected" case
     if (!deckId || !appState.allDecks[deckId]) {
         dom.dashboardContent.style.display = 'none';
         dom.dashboardNoDeckMessage.style.display = 'flex';
         if (appState.charts.studyTrends) { appState.charts.studyTrends.destroy(); appState.charts.studyTrends = null; }
         if (appState.charts.questionAccuracy) { appState.charts.questionAccuracy.destroy(); appState.charts.questionAccuracy = null; }
          updateLoadingOverlay(false);
         console.log("No deck selected for dashboard.");
         return;
     }

     // Deck selected, prepare UI
     dom.dashboardContent.style.display = 'block';
     dom.dashboardNoDeckMessage.style.display = 'none';
     const deck = appState.allDecks[deckId];
     if (!deck) { /* Should not happen if deckId is valid, but check anyway */
          console.error("Dashboard render error: Deck data inconsistency.");
         dom.dashboardContent.style.display = 'none';
         dom.dashboardNoDeckMessage.style.display = 'flex';
          showNotification("デッキデータの読み込みエラー。", "error");
           updateLoadingOverlay(false);
         return;
     }

    try {
        // Render sections sequentially
        renderDashboardOverview(deck);
        await renderDashboardTrendsChart(deck); // Ensure async finishes if needed
        await renderDashboardQuestionAnalysis(); // Renders list or chart based on state
        console.log("Dashboard rendered successfully.");
    } catch (error) {
         console.error("Error during dashboard rendering:", error);
         showNotification(`ダッシュボード描画エラー: ${error.message}`, "error");
         dom.dashboardContent.style.display = 'none';
         dom.dashboardNoDeckMessage.style.display = 'flex';
     } finally {
         updateLoadingOverlay(false); // Ensure overlay hidden
     }
}


/** ダッシュボード: 概要セクションのレンダリング */
function renderDashboardOverview(deck) {
     safeSetText(dom.dashboardDeckName, deck.name || '名称未設定');
     safeSetText(dom.dashboardTotalQuestions, deck.questions?.length ?? 0);

     const { totalCorrect, totalIncorrect, accuracyText, totalAnswered } = calculateOverallAccuracy(deck);
     safeSetText(dom.dashboardTotalAnswered, totalAnswered);
     safeSetText(dom.dashboardOverallAccuracy, accuracyText);
     safeSetText(dom.dashboardLastStudied, deck.lastStudied ? formatDate(deck.lastStudied) : '未学習');
}

/** デッキの累計正答率と関連テキストを計算 */
function calculateOverallAccuracy(deck) {
     if (!deck) return { totalCorrect: 0, totalIncorrect: 0, accuracyText: '-', totalAnswered: 0 };
     const totalCorrect = deck.totalCorrect || 0;
     const totalIncorrect = deck.totalIncorrect || 0;
     const totalAnswered = totalCorrect + totalIncorrect;
     const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : -1;
     const accuracyText = accuracy >= 0 ? `${accuracy}% (${totalCorrect}/${totalAnswered})` : 'データなし';
     return { totalCorrect, totalIncorrect, accuracyText, totalAnswered };
}

/** ダッシュボード: 学習推移グラフ (積み上げ + 折れ線) レンダリング */
async function renderDashboardTrendsChart(deck) {
     if (!checkChartJSAvaible() || !dom.studyTrendsChart || !dom.studyTrendsNoData || !dom.studyTrendsChartContainer) {
        if(dom.studyTrendsChartContainer) dom.studyTrendsChartContainer.style.display = 'none'; // Hide container if canvas/lib missing
        if(dom.studyTrendsNoData) {
             dom.studyTrendsNoData.textContent = typeof Chart === 'undefined' ? "グラフ描画不可 (ライブラリ未読込)" : "グラフ要素未検出";
             dom.studyTrendsNoData.style.display = 'block';
        }
         return;
     }
    const canvas = dom.studyTrendsChart;
    const noDataMsg = dom.studyTrendsNoData;
    const container = dom.studyTrendsChartContainer;
    let ctx;
     try { ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Canvas Context"); } catch (e) {
        console.error("Trends chart context error:", e);
        container.style.display = 'none'; noDataMsg.textContent = "グラフ描画エラー (Context)"; noDataMsg.style.display = 'block';
        return;
    }

     destroyChart('studyTrends'); // Destroy previous instance

    const sessionHistory = (deck.sessionHistory || []).slice(-DASHBOARD_TREND_SESSIONS);
    if (sessionHistory.length === 0) {
        container.style.display = 'block'; canvas.style.display = 'none';
         noDataMsg.textContent = "学習セッション履歴がありません。"; noDataMsg.style.display = 'block';
         console.log("No session history for trends chart.");
        return;
    }

     container.style.display = 'block'; canvas.style.display = 'block'; noDataMsg.style.display = 'none';

    // Data Prep
     const totalSessionsInDeck = deck.sessionHistory?.length ?? 0;
     const startSessionIndex = Math.max(0, totalSessionsInDeck - sessionHistory.length);
     const labels = sessionHistory.map((_, i) => `S${startSessionIndex + i + 1}`); // Shorter label "S1", "S2"...
     const timestamps = sessionHistory.map(h => h.ts);
     const correctData = sessionHistory.map(h => h.correct || 0);
     const incorrectData = sessionHistory.map(h => h.incorrect || 0);
     const accuracyData = sessionHistory.map(h => calculateAccuracy(h.correct, h.incorrect));

     // Use computed styles for colors
     const computedStyle = getComputedStyle(document.body);
     const primaryColor = computedStyle.getPropertyValue('--primary-color').trim();
     const successColor = computedStyle.getPropertyValue('--success-color').trim();
     const dangerColor = computedStyle.getPropertyValue('--danger-color').trim();
     const gridColor = computedStyle.getPropertyValue('--border-color').trim();
     const textColor = computedStyle.getPropertyValue('--text-light').trim();
     const titleColor = computedStyle.getPropertyValue('--text-dark').trim();


     // Chart Config
    const chartConfig = {
         type: 'bar',
         data: {
             labels: labels,
             datasets: [
                { label: '正解', data: correctData, backgroundColor: hsla(getHue(successColor), 55%, 55%, 0.7), stack: 'a', yAxisID: 'yCounts', order: 2 },
                { label: '不正解', data: incorrectData, backgroundColor: hsla(getHue(dangerColor), 75%, 60%, 0.7), stack: 'a', yAxisID: 'yCounts', order: 3 },
                 { label: '正答率 (%)', data: accuracyData, borderColor: primaryColor, type: 'line', yAxisID: 'yAccuracy', tension: 0.3, fill: false, pointRadius: 3, pointHoverRadius: 5, order: 1 }
             ]
         },
         options: getBaseChartOptions({ // Use shared options
            interactionMode: 'index',
            stacked: true, // Indicate bars are stacked
             titleText: null, //'学習セッション推移', // Optional Title
             tooltipCallbacks: {
                 title: items => `セッション ${startSessionIndex + items[0]?.dataIndex + 1}`,
                 label: ctx => {
                     let label = ctx.dataset.label || '';
                     if(label) label += ': ';
                     if(ctx.parsed.y !== null) label += `${ctx.parsed.y}${ctx.dataset.yAxisID === 'yAccuracy' ? '%' : ' 問'}`;
                     return label;
                 },
                  footer: items => `日時: ${formatDate(timestamps[items[0]?.dataIndex])}`
             },
             scales: {
                x: { title: { text: 'セッション番号' }, grid: { display: false }, ticks:{ color: textColor } },
                 yCounts: { type: 'linear', position: 'left', stacked: true, beginAtZero: true, title: { text: '問題数' }, grid:{ color: gridColor }, ticks:{ color: textColor, precision: 0 }},
                 yAccuracy: { type: 'linear', position: 'right', min: 0, max: 100, title: { text: '正答率(%)' }, grid:{ drawOnChartArea: false }, ticks:{ color: textColor, stepSize: 20 } }
             }
         })
    };

     // Render
     renderChart('studyTrends', canvas, chartConfig);
}


/** ダッシュボード: 問題別分析セクションレンダリング */
async function renderDashboardQuestionAnalysis() {
    if (!dom.questionAnalysisView || !dom.dashboardAnalysisControlsPanel) return;

     const allFilteredStats = getFilteredAndSortedQuestionStats();
     const totalItems = allFilteredStats.length;
     const questionsPerPage = appState.dashboardQuestionsPerPage; // Already sync'd
     const totalPages = Math.ceil(totalItems / questionsPerPage) || 1;
     appState.dashboardCurrentPage = Math.max(1, Math.min(appState.dashboardCurrentPage, totalPages)); // Validate page

     const startIndex = (appState.dashboardCurrentPage - 1) * questionsPerPage;
     const endIndex = startIndex + questionsPerPage;
     const statsForCurrentPage = allFilteredStats.slice(startIndex, endIndex);

    try {
        // Clear previous dynamic content & destroy chart if switching view
         if (appState.dashboardViewMode === 'list') destroyChart('questionAccuracy');
         else if(dom.questionAccuracyList) dom.questionAccuracyList.innerHTML = '';

         // Hide pagination before potentially re-rendering
          if(dom.questionPagination) dom.questionPagination.innerHTML = '';


         if (appState.dashboardViewMode === 'list') {
             console.log(`Rendering question list - Page ${appState.dashboardCurrentPage}/${totalPages}`);
             renderDashboardQuestionList(statsForCurrentPage, startIndex);
             renderDashboardPagination(totalItems, totalPages, appState.dashboardCurrentPage);
         } else {
            console.log("Rendering question analysis chart");
            await renderDashboardQuestionAnalysisChart(allFilteredStats); // Pass all filtered stats
         }
    } catch (error) {
         console.error("Error rendering question analysis content:", error);
         showNotification("問題分析データの表示中にエラーが発生しました。", "error");
         // Show error in list area as fallback
         if (dom.questionAccuracyList) dom.questionAccuracyList.innerHTML = '<li class="status-message error" style="padding: 15px; text-align: center;">表示エラー</li>';
     }
}

/** ダッシュボード: 問題リストレンダリング */
function renderDashboardQuestionList(stats, startIndex) {
     if (!dom.questionAccuracyList) return;
     dom.questionAccuracyList.innerHTML = ''; // Clear
     dom.questionAccuracyList.scrollTop = 0;

     if (stats.length === 0) {
        const message = (appState.dashboardSearchQuery || appState.dashboardFilterAccuracy !== 'all')
                          ? '該当する問題がありません。フィルターや検索条件を確認してください。'
                          : '問題データがありません。';
         dom.questionAccuracyList.innerHTML = `<li class="status-message" style="padding: 15px; text-align: center;">${message}</li>`;
        return;
     }

    const fragment = document.createDocumentFragment();
    stats.forEach((q, index) => {
        const itemIndex = startIndex + index;
         const li = document.createElement('li');
         li.className = 'question-accuracy-item';
         li.dataset.questionId = q.id;
         li.dataset.index = itemIndex; // Store overall index for detail view context
         li.tabIndex = 0;
         li.role = 'button';
         li.setAttribute('aria-label', `問題 ${itemIndex + 1} 詳細表示`);

         const previewDiv = document.createElement('div');
         previewDiv.className = 'question-text-preview';
         previewDiv.textContent = `${itemIndex + 1}. ${q.question || '問題文なし'}`;
         li.appendChild(previewDiv);

        const scoreContainer = document.createElement('div');
        scoreContainer.className = 'score-container';

         const accSpan = document.createElement('span');
         accSpan.className = 'accuracy-score';
         const acc = q.accuracy;
         if (acc === -1) {
             accSpan.textContent = '未解答';
             accSpan.classList.add('unanswered');
         } else {
             accSpan.textContent = `${acc}%`;
             if (acc <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) accSpan.classList.add('low');
             else if (acc <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) accSpan.classList.add('medium');
             else accSpan.classList.add('high');
         }
        scoreContainer.appendChild(accSpan);

        const countsSpan = document.createElement('span');
        countsSpan.className = 'answer-counts';
         countsSpan.textContent = q.totalCount > 0 ? `(${q.correctCount} / ${q.totalCount})` : '-';
         scoreContainer.appendChild(countsSpan);

         li.appendChild(scoreContainer);
         fragment.appendChild(li);
    });
    dom.questionAccuracyList.appendChild(fragment);
}

/** ダッシュボード: 問題リストアイテムクリックハンドラ */
function handleQuestionItemClick(event) {
     const targetItem = event.target.closest('.question-accuracy-item');
     if (targetItem) {
         showDetailForListItem(targetItem);
     }
}

/** ダッシュボード: 問題リストアイテムキーダウンハンドラ */
function handleQuestionItemKeydown(event) {
     const currentItem = event.target.closest('.question-accuracy-item');
     if (!currentItem) return;

     if (event.key === 'Enter' || event.key === ' ') {
         event.preventDefault();
         showDetailForListItem(currentItem);
     }
     else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          focusSiblingListItem(currentItem, event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling');
     }
      else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          focusSiblingListItem(currentItem, event.key === 'Home' ? 'firstElementChild' : 'lastElementChild', currentItem.parentElement);
      }
}

/** ダッシュボード: リストアイテムに対応する詳細をモーダルで表示 */
function showDetailForListItem(listItem) {
     const questionId = listItem.dataset.questionId;
     const indexStr = listItem.dataset.index; // Get overall index
     const deckId = appState.currentDashboardDeckId;

     if (!questionId || !deckId || !appState.allDecks[deckId] || indexStr === undefined) {
         console.error("Cannot show detail: Missing data context.", { questionId, deckId, indexStr });
         return;
     }
     const allStats = getFilteredAndSortedQuestionStats(); // Re-fetch *filtered/sorted* list
     const questionStat = allStats.find(qs => qs.id === questionId);

     if (questionStat) {
         const displayIndex = parseInt(indexStr, 10); // Use index from clicked item
         const detailContent = createQuestionDetailElement(questionStat, displayIndex);
         showModal({
             title: `問題 ${displayIndex + 1} 詳細`,
             content: detailContent, // Pass the created element
             size: 'lg', // Use a larger modal for detail
             buttons: [ // Only a close button needed
                 { id: 'modal-close-detail', text: '閉じる', class: 'secondary', onClick: closeModal }
             ],
             onClose: () => { // Return focus to list item on close
                  listItem?.focus(); // Focus the item that opened the modal
             }
         });
         // Attach ID for potential specific styling
          dom.modalDialog.id = 'dashboard-question-detail-modal';
     } else {
         showNotification("問題データの取得に失敗しました。", "error");
     }
}

/** 問題詳細表示用のHTML要素を生成 */
function createQuestionDetailElement(qStat, displayIndex) {
     // Reuse existing detail view container if it's already in the DOM but hidden
     let detailView = dom.questionDetailView;
     if (!detailView) { // Create if doesn't exist (e.g., first time)
         detailView = document.createElement('div');
         detailView.id = 'question-detail-view'; // Assign ID for styling
     }
     detailView.innerHTML = ''; // Clear previous content

     // Title (not using h4 anymore as it's in modal title)

     // Question Text & Correct Answer
     const qTextP = document.createElement('p');
     qTextP.innerHTML = `<strong>問題文:</strong> ${escapeHtml(qStat.question)}`;
     detailView.appendChild(qTextP);
     const ansP = document.createElement('p');
     ansP.innerHTML = `<strong>正解:</strong> ${escapeHtml(qStat.correctAnswer)}`;
     detailView.appendChild(ansP);
     // Explanation
     if (qStat.explanation) {
          const expP = document.createElement('p');
          expP.innerHTML = `<strong>解説:</strong> ${escapeHtml(qStat.explanation)}`;
          detailView.appendChild(expP);
     }

    // Stats
     const statsP = document.createElement('p');
     const accText = qStat.accuracy === -1 ? '未解答' : `${qStat.accuracy}%`;
     statsP.innerHTML = `<strong>あなたの正答率:</strong> <strong class="accuracy-score ${getAccuracyClass(qStat.accuracy)}">${accText}</strong> (${qStat.correctCount ?? 0} / ${qStat.totalCount ?? 0})`;
     detailView.appendChild(statsP);

     // History
     const historyHeader = document.createElement('p');
     historyHeader.innerHTML = `<strong>直近の解答履歴 (最大${MAX_RECENT_HISTORY}件):</strong>`;
     detailView.appendChild(historyHeader);

     const historyUl = document.createElement('ul');
     const recentHistory = (qStat.history || []).slice(-MAX_RECENT_HISTORY).reverse();
     if (recentHistory.length === 0) {
         historyUl.innerHTML = '<li>解答履歴はありません。</li>';
     } else {
         recentHistory.forEach(h => {
            const li = document.createElement('li');
            const tsSpan = document.createElement('span');
             tsSpan.textContent = formatDate(h.ts);
            const resultSpan = document.createElement('span');
            const resultClass = h.correct ? 'correct' : 'incorrect';
            const resultText = h.correct ? '正解' : '不正解';
             let evalText = '';
             if (h.evaluation) {
                 const evalMap = { difficult: '難', normal: '普', easy: '易' };
                 evalText = ` (<span class="eval" title="${h.evaluation}">${evalMap[h.evaluation] || h.evaluation}</span>)`;
             } else {
                 evalText = ' (<span class="eval" title="評価なし">-</span>)';
             }
             resultSpan.innerHTML = `<span class="${resultClass}">${resultText}</span>${evalText}`;
             li.appendChild(tsSpan);
             li.appendChild(resultSpan);
             historyUl.appendChild(li);
        });
     }
     detailView.appendChild(historyUl);

    return detailView; // Return the populated element
}

/** ダッシュボード: 問題精度グラフ表示 */
async function renderDashboardQuestionAnalysisChart(stats) {
     if (!checkChartJSAvaible() || !dom.questionAccuracyChart || !dom.questionAccuracyNoData || !dom.questionAccuracyChartContainer) {
          if(dom.questionAccuracyChartContainer) dom.questionAccuracyChartContainer.style.display = 'none';
         if(dom.questionAccuracyNoData) {
              dom.questionAccuracyNoData.textContent = typeof Chart === 'undefined' ? "グラフ描画不可 (ライブラリ未読込)" : "グラフ要素未検出";
              dom.questionAccuracyNoData.style.display = 'block';
         }
        return;
    }
    const canvas = dom.questionAccuracyChart;
    const noDataMsg = dom.questionAccuracyNoData;
    const container = dom.questionAccuracyChartContainer;
    let ctx;
     try { ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Canvas Context"); } catch (e) {
        console.error("Accuracy chart context error:", e);
        container.style.display = 'none'; noDataMsg.textContent = "グラフ描画エラー (Context)"; noDataMsg.style.display = 'block';
        return;
    }

     destroyChart('questionAccuracy'); // Destroy previous

    const answeredStats = stats.filter(q => q.accuracy !== -1);
    if (answeredStats.length === 0) {
        container.style.display = 'block'; canvas.style.display = 'none';
        noDataMsg.textContent = "解答済みの問題データがありません。"; noDataMsg.style.display = 'block';
         console.log("No answered questions for accuracy chart.");
        return;
    }

    container.style.display = 'block'; canvas.style.display = 'block'; noDataMsg.style.display = 'none';

    // Data Aggregation (Binning)
     const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
     const labels = bins.slice(0, -1).map((bin, i) => `${bin + (i > 0 ? 1 : 0)}-${bins[i+1]}%`);
     const dataCounts = Array(labels.length).fill(0);

    answeredStats.forEach(q => {
        const acc = q.accuracy;
         let binIndex = bins.findIndex((bin, i) => (i === 0 ? (acc >= bin && acc <= bins[i+1]) : (acc > bin && acc <= bins[i+1])));
        if (binIndex === -1 && acc === 0) binIndex = 0; // Catch 0% if missed
        if (binIndex >= 0) dataCounts[binIndex]++;
        else console.warn(`Could not bin accuracy: ${acc}`);
    });

     // Colors
     const computedStyle = getComputedStyle(document.body);
     const lowColor = hsla(getHue(computedStyle.getPropertyValue('--danger-color').trim()), 75%, 60%, 0.7);
     const medColor = hsla(getHue(computedStyle.getPropertyValue('--warning-color').trim()), 80%, 60%, 0.7);
     const highColor = hsla(getHue(computedStyle.getPropertyValue('--success-color').trim()), 55%, 55%, 0.7);
     const textColor = computedStyle.getPropertyValue('--text-light').trim();
     const titleColor = computedStyle.getPropertyValue('--text-dark').trim();

    const backgroundColors = labels.map(label => {
         const upperBoundary = parseInt(label.split('-')[1], 10);
         if (upperBoundary <= DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1) return lowColor;
         if (upperBoundary <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1) return medColor;
         return highColor;
    });

    // Chart Config
    const chartConfig = {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: '問題数', data: dataCounts, backgroundColor: backgroundColors, borderWidth: 0 }] // No borders
        },
        options: getBaseChartOptions({ // Use shared options
            titleText: '正答率分布 (解答済み問題)',
             indexAxis: 'x',
             tooltipCallbacks: {
                 title: items => `正答率 ${items[0].label}`,
                 label: ctx => `問題数: ${ctx.parsed.y} 問`
             },
            scales: {
                y: { beginAtZero: true, title: { text: '問題数' }, ticks: { precision: 0, color: textColor } },
                 x: { title: { text: '正答率範囲 (%)' }, grid: { display: false }, ticks:{ color: textColor } }
            },
            onClick: (event, elements) => { // Chart click handler
                if (elements.length > 0) {
                    const clickedIndex = elements[0].index;
                     const filterMap = ['low', 'low', 'low', 'low', 'low', 'medium', 'medium', 'medium', 'high', 'high']; // Map index to filter category
                    const filterValue = filterMap[clickedIndex] ?? 'all'; // Determine filter
                    console.log(`Accuracy chart clicked: Index=${clickedIndex}, Filter=${filterValue}`);

                    // Apply filter & switch view
                     appState.dashboardFilterAccuracy = filterValue;
                     if (dom.dashboardFilterAccuracy) dom.dashboardFilterAccuracy.value = filterValue;
                     appState.dashboardCurrentPage = 1;
                     setDashboardViewMode('list'); // Switches view and re-renders analysis
                }
            },
             onHover: (event, chartElement) => {
                 event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
             }
         })
     };

     renderChart('questionAccuracy', canvas, chartConfig);
}


/** ダッシュボード: ページネーションレンダリング */
function renderDashboardPagination(totalItems, totalPages, currentPage) {
     renderGenericPagination(dom.questionPagination, totalItems, totalPages, currentPage, 'dashboard-page-nav');
}

/** ダッシュボード: ページ遷移ハンドラ */
function handleDashboardPaginationClick(event) {
    const targetPage = getPageFromPaginationClick(event, 'dashboard-page-nav');
     if (targetPage !== null) {
         appState.dashboardCurrentPage = targetPage;
         renderDashboardQuestionAnalysis(); // Re-render analysis for new page
          // Focus the list container after page change
         if (dom.questionAccuracyList) setTimeout(() => dom.questionAccuracyList.focus(), 100);
     }
}

/** フィルター/ソートされた問題統計情報リストを取得 */
function getFilteredAndSortedQuestionStats() {
    const deck = appState.allDecks[appState.currentDashboardDeckId];
     if (!deck || !Array.isArray(deck.questions)) return [];

     // 1. Calculate Stats for each question
     let questionStats = deck.questions.map((q, index) => ({
        ...q,
         originalIndex: index,
         ...calculateQuestionAccuracy(q) // Returns { correctCount, totalCount, accuracy, lastAnswered, incorrectCount }
    }));

    // 2. Apply Accuracy Filter
     const filterAccuracy = appState.dashboardFilterAccuracy;
     if (filterAccuracy !== 'all') {
        questionStats = questionStats.filter(q => {
            const acc = q.accuracy;
            switch (filterAccuracy) {
                case 'low': return acc !== -1 && acc <= DASHBOARD_ACCURACY_THRESHOLDS.LOW;
                case 'medium': return acc > DASHBOARD_ACCURACY_THRESHOLDS.LOW && acc <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM;
                case 'high': return acc > DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM;
                case 'unanswered': return acc === -1;
                default: return true;
            }
        });
    }

    // 3. Apply Search Filter
    const query = appState.dashboardSearchQuery.toLowerCase().trim();
    if (query) {
         try {
             // More robust search with potential regex special character escaping? Or simple includes is ok?
             const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape basic regex chars
             const regex = new RegExp(escapedQuery, 'i'); // Case-insensitive search
             questionStats = questionStats.filter(q =>
                regex.test(q.question || '') ||
                (q.options || []).some(opt => regex.test(opt)) ||
                 regex.test(q.correctAnswer || '') ||
                regex.test(q.explanation || '')
            );
         } catch(e) { console.error("Search regex error:", e); /* Fallback to simple includes */
              questionStats = questionStats.filter(q =>
                 (q.question || '').toLowerCase().includes(query) ||
                 (q.options || []).some(opt => (opt||'').toLowerCase().includes(query)) ||
                  (q.correctAnswer || '').toLowerCase().includes(query) ||
                 (q.explanation || '').toLowerCase().includes(query)
            );
         }
    }

     // 4. Apply Sorting
     questionStats.sort((a, b) => {
         const sortOrder = appState.dashboardSortOrder;
         switch (sortOrder) {
             case 'accuracyAsc': return (a.accuracy === -1 ? -Infinity : a.accuracy) - (b.accuracy === -1 ? -Infinity : b.accuracy) || a.originalIndex - b.originalIndex;
             case 'accuracyDesc': return (b.accuracy === -1 ? -Infinity : b.accuracy) - (a.accuracy === -1 ? -Infinity : a.accuracy) || a.originalIndex - b.originalIndex;
             case 'mostIncorrect': return b.incorrectCount - a.incorrectCount || a.originalIndex - b.originalIndex;
             case 'lastAnswered': return b.lastAnswered - a.lastAnswered || a.originalIndex - b.originalIndex;
             case 'questionOrder': default: return a.originalIndex - b.originalIndex;
         }
     });

     return questionStats;
}


// ====================================================================
// 設定画面関連処理 (Settings)
// ====================================================================

/** 現在の設定をUIに反映 */
function loadSettingsToUI() {
     // Learning Settings
     safeSetChecked(dom.settingShuffleOptions, appState.settings.shuffleOptions);
     safeSetValue(dom.settingLowAccuracyThreshold, appState.settings.lowAccuracyThreshold);
     // Appearance Settings
     safeSetValue(dom.settingTheme, appState.settings.theme);
     // Reflect items per page (used by Home and Dashboard)
     if (dom.dashboardItemsPerPage) dom.dashboardItemsPerPage.value = appState.settings.dashboardQuestionsPerPage.toString();
     // Potentially add setting for homeDecksPerPage if UI exists

     // Reset save status
    if (dom.settingsSaveStatus) {
        updateStatusMessage(dom.settingsSaveStatus, '', 'info');
         setSettingsUnsavedStatus(false); // Mark as saved initially
    }
     // Update threshold display on home screen filter if available
    if(dom.lowAccuracyThresholdDisplayFilter) safeSetText(dom.lowAccuracyThresholdDisplayFilter, appState.settings.lowAccuracyThreshold);
}

/** 設定画面の閾値input変更時のハンドラ (バリデーションのみ) */
function handleSettingThresholdChange() {
    if (!dom.settingLowAccuracyThreshold) return;
     const value = parseInt(dom.settingLowAccuracyThreshold.value, 10);
    if (isNaN(value) || value < 1 || value > 99) {
        showNotification("閾値は1～99の整数で入力してください。", "warning", 3000);
         // Revert to current setting value temporarily for UX, actual save requires button
         dom.settingLowAccuracyThreshold.value = appState.settings.lowAccuracyThreshold;
    } else {
         // Valid input, mark settings as changed
          setSettingsUnsavedStatus(true);
    }
     // Also update the display on home screen filter label immediately
     if(dom.lowAccuracyThresholdDisplayFilter) safeSetText(dom.lowAccuracyThresholdDisplayFilter, dom.settingLowAccuracyThreshold.value);

}
/** 設定画面: シャッフルチェックボックス変更ハンドラ */
function handleSettingShuffleChange() {
     setSettingsUnsavedStatus(true);
}

/** 設定変更の保存ボタンの状態を変更 */
function setSettingsUnsavedStatus(hasUnsavedChanges) {
    if(dom.saveSettingsButton) {
         // Maybe add a visual cue, like changing button text or adding a '*'
         // dom.saveSettingsButton.textContent = hasUnsavedChanges ? '設定を保存*' : '設定を保存';
    }
     // Show/hide unsaved changes message?
     // updateStatusMessage(dom.settingsSaveStatus, hasUnsavedChanges ? '未保存の変更があります' : '', 'info');
}


/** 設定を保存 */
function saveSettings() {
     const statusEl = dom.settingsSaveStatus;
     updateStatusMessage(statusEl, '保存中...', 'info');
     setSettingsUnsavedStatus(false); // Clear unsaved status

    try {
         const newSettings = { ...appState.settings }; // Copy current state

        // Read values from UI elements
         if(dom.settingShuffleOptions) newSettings.shuffleOptions = dom.settingShuffleOptions.checked;
         if(dom.settingLowAccuracyThreshold) {
             const threshold = parseInt(dom.settingLowAccuracyThreshold.value, 10);
             if (!isNaN(threshold) && threshold >= 1 && threshold <= 99) {
                 newSettings.lowAccuracyThreshold = threshold;
             } else {
                  throw new Error("「苦手な問題」の閾値が無効です。"); // Should be validated already
             }
         }
         if(dom.settingTheme) newSettings.theme = dom.settingTheme.value;
         // Read other settings like items per page if they have UI inputs

         // Validate entire settings object again before saving (optional)
         const validatedSettings = repairAndValidateSettings(newSettings);

        // Compare with current state *before* validation for change detection? No, save validated.
        // Only save if validated settings are different from current state
        if (JSON.stringify(validatedSettings) !== JSON.stringify(appState.settings)) {
             appState.settings = validatedSettings; // Update state with validated values

            if (saveData(LS_KEYS.SETTINGS, appState.settings)) {
                 console.log("Settings saved:", appState.settings);
                 updateStatusMessage(statusEl, '設定を保存しました。', 'success');
                 showNotification('設定が保存されました。', 'success');
                 // Re-apply settings to UI/App state immediately if needed
                 applyTheme(appState.settings.theme); // Apply theme choice
                  // Update per-page counts in state if changed via settings (might be redundant if sync'd)
                  appState.dashboardQuestionsPerPage = appState.settings.dashboardQuestionsPerPage;
                  // Update dependent displays like filter threshold labels
                  if(dom.lowAccuracyThresholdDisplayFilter) dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
                  if (appState.activeScreen === 'home-screen') updateAllFilterCounts(); // Refresh counts if needed
                  if (appState.activeScreen === 'dashboard-screen') renderDashboardQuestionAnalysis(); // Refresh dashboard view if per-page changed etc.

             } else {
                 // Save failed (likely storage issue) - saveData shows notification
                 updateStatusMessage(statusEl, '保存エラー', 'error');
                  // Maybe try to revert state? Risky. Best to reload or retry save.
                  setSettingsUnsavedStatus(true); // Mark as unsaved again
             }
         } else {
             console.log("No setting changes detected.");
             updateStatusMessage(statusEl, '変更はありませんでした。', 'info');
         }
    } catch (error) {
         console.error("Error saving settings:", error);
         updateStatusMessage(statusEl, `保存エラー: ${error.message}`, 'error');
         showNotification(`設定の保存エラー: ${error.message}`, 'error');
          setSettingsUnsavedStatus(true);
    } finally {
         clearStatusMessageAfterDelay(statusEl, 3000);
    }
}


// ====================================================================
// AIプロンプトガイド関連処理 (Prompt Guide)
// ====================================================================

/** ガイド画面: プロンプト内のプレースホルダーを更新 */
function updatePromptPlaceholders() {
    if (!dom.promptTextTemplate || appState.activeScreen !== 'prompt-guide-screen') return;

    const topic = dom.promptFieldTopic?.value || '[専門分野]';
    const count = dom.promptFieldCount?.value || '[問題数]';
    const level = dom.promptFieldLevel?.value || '[対象レベル]';

     // Update visible placeholders in the template display
     const placeholders = dom.promptTextTemplate.querySelectorAll('.prompt-placeholder');
     placeholders.forEach(el => {
         const targetId = el.dataset.target;
         let value = '[未設定]';
         if (targetId === 'prompt-field-topic') value = topic;
         else if (targetId === 'prompt-field-count') value = count;
         else if (targetId === 'prompt-field-level') value = level;
         el.textContent = value;
     });
}

/** ガイド画面: カスタマイズされたプロンプトをコピー */
function copyPromptToClipboard() {
     if (!dom.promptTextTemplate) return;
     const statusEl = dom.copyStatus;
     updateStatusMessage(statusEl, '', 'info'); // Clear status

     // Get values from input fields
     const topic = dom.promptFieldTopic?.value || '[専門分野]';
     const count = dom.promptFieldCount?.value || '[問題数]';
     const level = dom.promptFieldLevel?.value || '[対象レベル]';

    // Get template text, clone node to avoid modifying original structure
     const templateNode = dom.promptTextTemplate.cloneNode(true);
     const placeholders = templateNode.querySelectorAll('.prompt-placeholder');

     // Replace placeholders in the cloned node's text content extraction
     let promptText = '';
     if (templateNode.querySelector('code')) { // Get text from code tag
          placeholders.forEach(el => {
             const targetId = el.dataset.target;
             let value = '';
             if (targetId === 'prompt-field-topic') value = topic;
             else if (targetId === 'prompt-field-count') value = count;
             else if (targetId === 'prompt-field-level') value = level;
             el.replaceWith(document.createTextNode(value)); // Replace strong tag with text
         });
          promptText = templateNode.querySelector('code').textContent;
     } else {
         console.warn("Could not find <code> tag within prompt template.");
         promptText = templateNode.textContent; // Fallback
     }

     if (!promptText.trim()) {
         updateStatusMessage(statusEl, 'プロンプト内容が空です', 'warning');
         return;
     }

    copyTextToClipboard(promptText)
         .then(() => {
             updateStatusMessage(statusEl, 'コピーしました！', 'success');
             showNotification('プロンプトをクリップボードにコピーしました。', 'success', 2500);
             clearStatusMessageAfterDelay(statusEl);
         })
         .catch(err => {
             console.error("Failed to copy prompt:", err);
             updateStatusMessage(statusEl, 'コピー失敗', 'error');
              showNotification('クリップボードへのコピーに失敗しました。', 'error');
         });
}


/** ガイド画面: JSONチェックinputハンドラ (デバウンス) */
function handleJsonCheckInput() {
     checkJsonFormat(); // Check automatically on input change (debounced)
}

/** ガイド画面: 入力されたJSON文字列の形式を簡易チェック */
function checkJsonFormat() {
     const inputEl = dom.jsonCheckInput;
     const statusEl = dom.jsonCheckStatus;
     if (!inputEl || !statusEl) return;

     const jsonString = inputEl.value.trim();
     if (!jsonString) {
         updateStatusMessage(statusEl, '', 'info'); // Clear if empty
         return;
     }

    try {
         const parsedData = JSON.parse(jsonString);
        // Basic validation (is array? has items?)
        if (!Array.isArray(parsedData)) {
            throw new Error("形式エラー: 全体が配列 [...] ではありません。");
        }
         if (parsedData.length === 0) {
             updateStatusMessage(statusEl, '形式OK (ただし問題が含まれていません)', 'warning');
         } else {
             // Optionally run deeper validation on first question?
             const firstQValidation = repairAndValidateQuestion(parsedData[0], 'check', 0);
             if (firstQValidation) {
                  updateStatusMessage(statusEl, '形式OK (基本的な構造は正しいようです)', 'success');
             } else {
                  updateStatusMessage(statusEl, '警告: 配列形式ですが、最初の問題の構造に問題がある可能性があります。', 'warning');
             }
         }
     } catch (e) {
         updateStatusMessage(statusEl, `形式エラー: ${e.message}`, 'error');
     }
}

// ====================================================================
// ヘルパー関数 (Utilities)
// ====================================================================

/** UUID (簡易版) を生成 */
function generateUUID(prefix = 'id') {
     return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/** 配列をシャッフルして新しい配列を返す (Fisher-Yates) */
function shuffleArray(array) {
    if (!Array.isArray(array)) return [];
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/** タイムスタンプを "YYYY/MM/DD HH:mm" 形式にフォーマット */
function formatDate(timestamp) {
    if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) return '-';
     try {
         // Use Intl.DateTimeFormat for locale-aware formatting (if available & desired)
         return new Intl.DateTimeFormat('ja-JP', DATE_FORMAT_OPTIONS).format(new Date(timestamp));
         // Fallback to manual formatting if needed
         // const d = new Date(timestamp);
         // ... manual formatting ...
     } catch (e) {
        console.error("Date formatting error:", e);
        return '日付エラー';
    }
}

/** テキストを指定要素に安全に設定 */
function safeSetText(element, text) {
     if (element) {
         element.textContent = text !== null && text !== undefined ? String(text) : '';
     }
}

/** valueを指定要素に安全に設定 */
function safeSetValue(element, value) {
     if (element) {
         element.value = value !== null && value !== undefined ? String(value) : '';
     }
}

/** checkedを指定要素に安全に設定 */
function safeSetChecked(element, isChecked) {
     if (element && typeof element.checked === 'boolean') {
         element.checked = !!isChecked;
     }
}

/** HTML特殊文字をエスケープ */
function escapeHtml(unsafe) {
     if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/** 特定のクラスを持つ要素に 'active' クラスを設定/解除 */
function setActiveClass(element, isActive) {
    element?.classList.toggle('active', isActive);
}
/** 要素のaria-pressed属性を設定 */
function setAriaPressed(element, isPressed) {
     element?.setAttribute('aria-pressed', String(isPressed));
}
/** 要素のaria-disabled属性を設定 */
function setAriaDisabled(element, isDisabled) {
     element?.setAttribute('aria-disabled', String(isDisabled));
}

/** 指定されたIDのチャートインスタンスを破棄 */
function destroyChart(chartKey) {
     if (appState.charts[chartKey] instanceof Chart) {
         try { appState.charts[chartKey].destroy(); console.log(`Chart '${chartKey}' destroyed.`); } catch (e) { console.error(`Error destroying chart '${chartKey}':`, e); }
         appState.charts[chartKey] = null;
     }
}
/** Chart.jsが利用可能かチェック */
function checkChartJSAvaible() {
     if (typeof Chart === 'undefined') {
        console.error("Chart.js is not available.");
        return false;
    }
    return true;
}
/** Chart.jsで共通的に使うオプションを生成 */
function getBaseChartOptions(customOptions = {}) {
     // Get theme-aware colors
     const computedStyle = getComputedStyle(document.body);
     const gridColor = computedStyle.getPropertyValue('--border-color').trim();
     const textColor = computedStyle.getPropertyValue('--text-light').trim();
     const titleColor = computedStyle.getPropertyValue('--text-dark').trim();
     const tooltipBg = hsla(getHue(computedStyle.getPropertyValue('--bg-card-dark').trim()), 10%, 20%, 0.85); // Use a dark tooltip bg generally

     return deepMerge({ // Deep merge base and custom options
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 }, // Subtle animation
         layout: { padding: { top: 10, bottom: 0, left: 0, right: 10 } }, // Add padding
        plugins: {
            legend: {
                position: 'bottom',
                labels: { padding: 20, usePointStyle: true, color: textColor }
            },
             tooltip: {
                 enabled: true,
                 backgroundColor: tooltipBg,
                 titleColor: computedStyle.getPropertyValue('--text-dark-dark').trim(), // Light title for dark bg
                 bodyColor: computedStyle.getPropertyValue('--text-dark-dark').trim(), // Light body for dark bg
                 titleFont: { weight: 'bold' },
                 bodySpacing: 5,
                 padding: 10,
                 borderColor: gridColor,
                 borderWidth: 1,
                 usePointStyle: true,
                 callbacks: customOptions.tooltipCallbacks || {} // Allow custom callbacks
             },
             title: {
                 display: !!customOptions.titleText,
                 text: customOptions.titleText || '',
                 padding: { top: 10, bottom: 15 },
                 font: { size: 14, weight: 'bold' }, // Relative font size?
                 color: titleColor
             }
         },
         interaction: { // Sensible defaults for interaction
             mode: customOptions.interactionMode || 'nearest',
             intersect: false,
             axis: 'x' // Hover triggers on x-axis primarily
         },
         scales: customOptions.scales || { // Default scale options
             x: { ticks: { color: textColor }, grid: { color: gridColor } },
             y: { ticks: { color: textColor }, grid: { color: gridColor } }
         },
         onHover: customOptions.onHover || null, // Allow custom hover
         onClick: customOptions.onClick || null // Allow custom click
     }, customOptions); // Merge custom options over defaults
}
/** オブジェクトをディープマージする */
function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] });
        else output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}
/** 変数がオブジェクトかどうかチェック */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}
/** HSL文字列からHue値を取得（失敗時は0）*/
function getHue(hslString) {
     try { return parseInt(hslString.match(/hsl\(\s*(\d+)/)?.[1] ?? '0', 10); } catch { return 0; }
}

/** 新しいチャートを生成し、Stateに保存 */
function renderChart(chartKey, canvas, config) {
     destroyChart(chartKey); // Ensure old one is gone
     try {
        // Check canvas again right before creation
         if (document.body.contains(canvas)) {
             appState.charts[chartKey] = new Chart(canvas.getContext('2d'), config);
             console.log(`Chart '${chartKey}' rendered successfully.`);
         } else {
             console.warn(`Canvas for chart '${chartKey}' was removed before rendering.`);
         }
     } catch (e) {
         console.error(`Error creating chart '${chartKey}':`, e);
          // Show error in UI if possible (e.g., replacing canvas with text)
          const container = canvas.closest('.chart-container');
          if(container) {
               const noDataEl = container.querySelector('.chart-no-data');
              if(noDataEl) {
                  noDataEl.textContent = "グラフ描画エラー";
                  noDataEl.style.display = 'block';
                  canvas.style.display = 'none';
              }
          }
     }
}

/** 汎用ページネーションUIレンダリング */
function renderGenericPagination(container, totalItems, totalPages, currentPage, buttonClassPrefix = 'page-nav') {
    if (!container) return;
    container.innerHTML = ''; // Clear
    container.style.display = 'none'; // Hide initially

    if (totalPages <= 1) { // Hide if only one page or no items
         // Optionally show item count if needed even on one page
         if (totalItems > 0) {
              const pageInfo = document.createElement('span');
              pageInfo.className = 'page-info';
              pageInfo.textContent = `${totalItems}件`;
              container.appendChild(pageInfo);
              container.style.display = 'flex'; // Show if just displaying count
         }
        return;
    }

    container.style.display = 'flex'; // Show container

    const createPageButton = (page, text = null, isActive = false, isDisabled = false, ariaLabel = '') => {
         const button = document.createElement('button');
         button.type = 'button';
         button.className = `button small ${buttonClassPrefix} ${isActive ? 'primary' : 'secondary'}`;
         button.dataset.page = page;
         button.textContent = text !== null ? text : page;
         button.disabled = isDisabled;
         button.setAttribute('aria-label', ariaLabel || `ページ ${page}`);
         if (isActive) button.setAttribute('aria-current', 'page');
          if (isDisabled) button.setAttribute('aria-disabled', 'true');
         return button;
    };

    // Previous Button
    container.appendChild(createPageButton(currentPage - 1, '<i class="fas fa-chevron-left"></i>', false, currentPage === 1, '前のページへ'));

     // Page Number Buttons (with ellipsis logic)
     const buttonsToShow = getPaginationButtons(totalPages, currentPage, PAGINATION_BUTTON_COUNT);
     buttonsToShow.forEach(pageNumber => {
         if (pageNumber === '...') {
             const ellipsis = document.createElement('span');
             ellipsis.className = 'page-info ellipsis';
             ellipsis.textContent = '...';
              ellipsis.setAttribute('aria-hidden', 'true');
             container.appendChild(ellipsis);
         } else {
             container.appendChild(createPageButton(pageNumber, null, pageNumber === currentPage, false));
         }
     });


    // Next Button
    container.appendChild(createPageButton(currentPage + 1, '<i class="fas fa-chevron-right"></i>', false, currentPage === totalPages, '次のページへ'));

    // Total count info (optional)
     const pageInfo = document.createElement('span');
     pageInfo.className = 'page-info total-info'; // Different class for total count
     pageInfo.textContent = `全 ${totalItems}件`;
     container.appendChild(pageInfo); // Add at the end

}

/** ページネーションで表示するボタンの番号リストを生成 */
function getPaginationButtons(totalPages, currentPage, maxButtons) {
    if (totalPages <= maxButtons) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const buttons = [];
    const half = Math.floor((maxButtons - 3) / 2); // Subtract 3 for first, last, and ellipsis/current
    let start = currentPage - half;
    let end = currentPage + half;

    // Add first page and potential ellipsis
    buttons.push(1);
    if (start > 2) buttons.push('...');

    // Adjust start/end if close to beginning or end
    if (currentPage <= half + 2) { // Close to beginning
        start = 2;
        end = maxButtons - 2; // Account for 1 and last page/ellipsis
    } else if (currentPage >= totalPages - half - 1) { // Close to end
        start = totalPages - maxButtons + 3; // Account for 1/ellipsis and last page
        end = totalPages - 1;
    }

    // Add middle page numbers
    for (let i = start; i <= end; i++) {
        if (i > 1 && i < totalPages) {
            buttons.push(i);
        }
    }

    // Add potential ellipsis and last page
    if (end < totalPages - 1) buttons.push('...');
    buttons.push(totalPages);

    return buttons;
}


/** ページネーションボタンクリックからページ番号を取得 */
function getPageFromPaginationClick(event, buttonClassPrefix = 'page-nav') {
     const targetButton = event.target.closest(`.${buttonClassPrefix}`);
     if (targetButton && !targetButton.disabled && targetButton.dataset.page) {
        const page = parseInt(targetButton.dataset.page, 10);
        return !isNaN(page) && page >= 1 ? page : null;
    }
    return null;
}

/** 個々の質問の正答率、カウント、最終解答日などを計算 */
function calculateQuestionAccuracy(q) {
    const history = q?.history || [];
    const totalCount = history.length;
    const correctCount = history.filter(h => h.correct).length;
    const incorrectCount = totalCount - correctCount;
    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : -1; // -1 for unanswered
    const lastAnswered = totalCount > 0 ? history[totalCount - 1].ts : 0;
    return { correctCount, totalCount, accuracy, lastAnswered, incorrectCount };
}

/** 正答率に応じたCSSクラス名を返す */
function getAccuracyClass(accuracy) {
    if (accuracy === -1) return 'unanswered';
    if (accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) return 'low';
    if (accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) return 'medium';
    return 'high';
}

/** ボタン要素を生成 */
function createButton(config) {
     const btn = document.createElement('button');
     btn.type = 'button';
     btn.id = config.id || '';
     btn.className = `button ${config.class || 'secondary'}`;
     btn.innerHTML = config.text; // Allow HTML like icons
     if (config.ariaLabel) btn.setAttribute('aria-label', config.ariaLabel);
     if (config.title) btn.title = config.title;
     btn.disabled = config.disabled || false;
     if (config.disabled) btn.setAttribute('aria-disabled', 'true');
     if (config.data) {
         Object.entries(config.data).forEach(([key, value]) => {
             btn.dataset[key] = value;
         });
     }
     if (config.onClick && typeof config.onClick === 'function') {
         btn.addEventListener('click', config.onClick);
     }
     return btn;
}
/** 問題データが有効か簡易チェック */
function isValidQuestion(questionData) {
     return questionData &&
            typeof questionData.question === 'string' && questionData.question &&
            Array.isArray(questionData.options) && questionData.options.length >= 2 &&
            typeof questionData.correctAnswer === 'string' && questionData.correctAnswer;
}


// ====================================================================
// Polyfills & Compatibility (Optional, if needed)
// ====================================================================
// Add polyfills here if supporting older browsers, e.g., for 'closest', 'fetch', 'Promise', etc.
// Example: Basic 'closest' polyfill
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
// End of file: script.js
// ====================================================================
