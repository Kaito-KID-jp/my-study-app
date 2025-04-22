// ====================================================================
// AI問題生成学習アプリ - アプリケーションロジック V2.1 (変更反映版)
// ====================================================================

"use strict";

// ====================================================================
// アプリケーション状態 (State)
// ====================================================================
const appState = {
    allDecks: {}, // { deckId: DeckData, ... }
    currentDeckId: null, // ホーム画面で選択中のデッキID
    currentDashboardDeckId: null, // ダッシュボード画面で表示中のデッキID
    studyList: [], // 現在の学習セッションの問題リスト (QuestionData[])
    currentQuestionIndex: -1, // studyList 内の現在の問題インデックス
    settings: { // ユーザー設定 (デフォルト値)
        shuffleOptions: true, // 学習時の選択肢シャッフル
        lowAccuracyThreshold: 50 // 「苦手な問題」フィルターの閾値 (%)
    },
    activeScreen: 'home-screen', // 現在表示中の画面ID
    stats: { // 現在の学習セッション中の統計 (セッション開始時にリセットされる)
        currentSessionCorrect: 0,
        currentSessionIncorrect: 0
    },
    // ダッシュボード関連の表示状態
    dashboardQuestionsPerPage: 10, // 問題リストの1ページあたりの表示件数
    dashboardCurrentPage: 1,       // 問題リストの現在のページ番号
    dashboardFilterAccuracy: 'all', // 問題リストの正答率フィルター ('all', 'low', 'medium', 'high', 'unanswered')
    dashboardSearchQuery: '',      // 問題リストの検索クエリ
    dashboardSortOrder: 'accuracyAsc', // 問題リストのソート順 ('accuracyAsc', 'accuracyDesc', 'mostIncorrect', 'questionOrder', 'lastAnswered')
    dashboardViewMode: 'list',     // 問題分析の表示モード ('list', 'chart')
    // 学習フィルター (ホーム画面)
    studyFilter: 'all', // 現在選択中の学習フィルター ('all', 'lowAccuracy', 'incorrect', 'unanswered', 'difficult', 'normal', 'easy')
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
 * @property {string} [explanation] - 解説文 (任意)
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

// ====================================================================
// 定数
// ====================================================================
const LS_KEYS = { // LocalStorage のキー
    DECKS: 'studyAppDecks_v2',
    CURRENT_DECK_ID: 'studyAppCurrentDeckId_v2',
    SETTINGS: 'studyAppSettings_v2'
};
const DASHBOARD_TREND_SESSIONS = 30; // 学習推移グラフに表示する最大セッション数
const DASHBOARD_ACCURACY_THRESHOLDS = { LOW: 49, MEDIUM: 79 }; // ダッシュボード用フィルター閾値（この値以下）
const MAX_RECENT_HISTORY = 5; // ダッシュボード詳細表示の履歴件数
const NOTIFICATION_DURATION = 4000; // 通知のデフォルト表示時間(ms)
const CRITICAL_ELEMENT_IDS = [ // アプリ起動に必須のDOM要素IDリスト
    'app-container', 'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen',
    'options-buttons-container', // ★ HTML側のID修正に合わせて確認済み
    'question-text', 'deck-list', 'global-notification',
    'dashboard-analysis-controls' // ★ HTML側のID追加に合わせて確認済み
];

// ====================================================================
// DOM要素参照 & Chartインスタンス & グローバル変数
// ====================================================================
const dom = {}; // DOM要素をキャッシュするオブジェクト
let notificationTimeout = null; // 通知表示用のタイマーID
let studyTrendsChart = null; // 学習推移グラフのChart.jsインスタンス
let questionAccuracyChart = null; // 問題正答率グラフのChart.jsインスタンス
let isInitializing = true; // アプリ初期化中フラグ

// ====================================================================
// 初期化 (Initialization)
// ====================================================================
document.addEventListener('DOMContentLoaded', initializeApp);

/** アプリケーション全体の初期化処理 */
async function initializeApp() {
    console.log("Initializing app V2.1..."); // バージョン更新
    const loadingOverlay = document.getElementById('app-loading-overlay');
    const initErrorDisplay = document.getElementById('app-init-error');

    try {
        // 0. Show loading overlay immediately
        if (loadingOverlay) loadingOverlay.classList.add('active');

        // 1. Cache essential DOM elements and check availability
        console.log("Step 1: Caching DOM elements...");
        const domReady = cacheDOMElements();
        if (!domReady) {
            throw new Error("必要なUI要素が見つかりません。HTMLファイルが破損しているか、読み込みに失敗した可能性があります。");
        }
        console.log("Step 1: DOM elements cached successfully.");

        // 2. Load data from LocalStorage (Decks, Settings, Current Deck)
        console.log("Step 2: Loading initial data from LocalStorage...");
        loadInitialData();
        console.log("Step 2: Initial data loaded.");

        // 3. Apply initial settings to UI elements
        console.log("Step 3: Applying initial settings to UI...");
        applyInitialSettings(); // 設定をUIに反映
        console.log("Step 3: Initial settings applied to UI.");

        // 4. Set up event listeners for the entire application
        console.log("Step 4: Setting up event listeners...");
        setupEventListeners(); // イベントリスナー設定

        // ★ ヘッダータイトルクリックでホームに戻る機能を追加
        const appHeaderTitle = document.querySelector('.app-header h1');
        if (appHeaderTitle) {
            appHeaderTitle.style.cursor = 'pointer'; // クリック可能を示すカーソル
            appHeaderTitle.addEventListener('click', () => {
                if (appState.activeScreen !== 'study-screen' || confirmQuitStudy(false)) { // 学習中は中断確認
                   navigateToScreen('home-screen');
                }
            });
            console.log("Header title click listener added.");
        } else {
            console.warn("App header title element not found for click listener.");
        }

        console.log("Step 4: Event listeners set up.");

        // 5. Update UI based on loaded data (Deck List, Top Screen Info)
        console.log("Step 5: Updating initial UI state...");
        updateDeckListUI();
        updateTopScreenDisplay(); // currentDeckIdを考慮して表示
        populateDashboardDeckSelect(); // ダッシュボードの選択肢も更新
        console.log("Step 5: Initial UI state updated.");

        // 6. Navigate to the initial or last active screen
        console.log("Step 6: Navigating to initial screen:", appState.activeScreen);
        navigateToScreen(appState.activeScreen);
        console.log("Step 6: Navigation complete.");

        // 7. Render dashboard if it's the active screen and a deck is selected
        if (appState.activeScreen === 'dashboard-screen' && appState.currentDashboardDeckId) {
            console.log("Step 7: Rendering initial dashboard for deck:", appState.currentDashboardDeckId);
            try {
                await renderDashboard();
            } catch(dashboardError) {
                 console.error("Error rendering dashboard on init:", dashboardError);
                 showNotification("ダッシュボードの初期表示中にエラーが発生しました。", "error", 6000);
            }
            console.log("Step 7: Initial dashboard rendering attempted.");
        } else if (appState.activeScreen === 'dashboard-screen') {
             if (dom.dashboardContent) dom.dashboardContent.style.display = 'none';
             if (dom.dashboardNoDeckMessage) dom.dashboardNoDeckMessage.style.display = 'block';
        } else {
            console.log("Step 7: Skipping initial dashboard rendering.");
        }

        console.log("App initialization successful.");
        isInitializing = false; // 初期化完了

    } catch (error) {
        console.error("CRITICAL ERROR during app initialization:", error);
        if (dom.appContainer) {
            dom.appContainer.innerHTML = ''; // Clear potentially broken content
        }
        if(initErrorDisplay) {
            initErrorDisplay.textContent = `アプリの起動に失敗しました: ${error.message} ページを再読み込みするか、開発者にご連絡ください。`;
            initErrorDisplay.style.display = 'block';
        }
        showNotification(`アプリ起動エラー: ${error.message}`, "error", 15000);

    } finally {
        // Ensure overlay hides even if there was an error, maybe after a slightly longer delay
        const hideDelay = isInitializing ? 500 : 200; // Longer delay if init failed?
        setTimeout(() => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            console.log("Loading overlay hidden after initialization process.");
        }, hideDelay);
    }
}


/**
 * アプリケーションで利用するDOM要素への参照をキャッシュし、必須要素の存在を確認する
 * @returns {boolean} 必須要素が全て見つかった場合は true, そうでない場合は false
 */
function cacheDOMElements() {
    console.log("Caching DOM elements...");
    const ids = [
        // Critical / General
        'app-container', 'app-loading-overlay', 'global-notification', 'notification-message',
        'notification-icon', 'notification-close-button', 'app-init-error',
        // Screens
        'home-screen', 'study-screen', 'dashboard-screen', 'settings-screen', 'prompt-guide-screen',
        // Home Screen
        'json-file-input', 'load-status', 'deck-list', 'current-deck-name', 'total-questions',
        'current-deck-last-studied', 'current-deck-accuracy', 'reset-history-button', 'start-study-button',
        'study-filter-options', 'filtered-question-count', 'low-accuracy-threshold-display-filter',
        // Study Screen
        'study-screen-title', 'study-card', 'question-counter', 'question-text',
        'options-buttons-container', // ★ HTMLに合わせて確認済み
        'answer-area', 'feedback-message', 'answer-text', 'explanation-text', 'retry-button',
        'evaluation-controls', 'study-complete-message', 'session-correct-count', 'session-incorrect-count',
        'back-to-top-button', 'quit-study-button',
        // Dashboard Screen
        'dashboard-deck-select', 'dashboard-content', 'dashboard-no-deck-message',
        'dashboard-overview', 'dashboard-deck-name', 'dashboard-total-questions', 'dashboard-total-answered',
        'dashboard-overall-accuracy', 'dashboard-last-studied',
        'dashboard-trends', 'study-trends-chart-container', 'study-trends-chart', 'study-trends-no-data',
        'dashboard-trends-sessions-count',
        'dashboard-question-analysis', 'dashboard-analysis-controls', // ★ HTMLに合わせて確認済み
        'dashboard-filter-accuracy',
        'dashboard-filter-threshold-low', 'dashboard-filter-threshold-medium-low',
        'dashboard-filter-threshold-medium-high', 'dashboard-filter-threshold-high',
        'dashboard-search-query', 'dashboard-search-button', 'dashboard-search-clear', 'dashboard-sort-order',
        'view-mode-list', 'view-mode-chart', // ボタン本体
        'question-analysis-view', 'question-list-view', 'question-chart-view', // 表示エリア
        'question-accuracy-list', 'question-pagination', 'question-accuracy-chart-container',
        'question-accuracy-chart', 'question-accuracy-no-data',
        'question-detail-view', 'detail-question-number', 'detail-question-text', 'detail-correct-answer',
        'detail-accuracy', 'detail-correct-count', 'detail-total-count', 'detail-recent-history',
        'close-detail-view', 'detail-history-count',
        // Settings Screen
        'settings-container', 'setting-shuffle-options', 'setting-low-accuracy-threshold',
        'save-settings-button', 'settings-save-status',
        // Prompt Guide Screen
        'copy-prompt-button', 'copy-status', 'prompt-text',
    ];

    let allFound = true;
    let criticalFound = true;

    ids.forEach(id => {
        const camelCaseId = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        const element = document.getElementById(id);
        dom[camelCaseId] = element;

        if (!element) {
            const isCritical = CRITICAL_ELEMENT_IDS.includes(id);
            // エラーログは警告レベルに留める
            console.warn(`DOM element${isCritical ? ' [CRITICAL]' : ''} not found: #${id}`);
            if (isCritical) {
                criticalFound = false;
            }
            allFound = false;
        }
    });

    dom.navButtons = document.querySelectorAll('.nav-button');
    dom.screens = document.querySelectorAll('.screen');
    dom.evalButtons = document.querySelectorAll('.eval-button'); // 取得方法は変更なし
    dom.studyFilterRadios = document.querySelectorAll('input[name="study-filter"]');

    if (dom.navButtons.length === 0) { console.warn("No navigation buttons found."); allFound = false; }
    if (dom.screens.length === 0) { console.warn("No screen elements found."); criticalFound = false; allFound = false; }
    // 評価ボタンやフィルターラジオは必須ではない場合がある
    if (dom.evalButtons.length === 0) { console.warn("No evaluation buttons found."); }
    if (dom.studyFilterRadios.length === 0) { console.warn("No study filter radio buttons found."); }


    console.log(`DOM caching complete. All elements found: ${allFound}. All critical elements found: ${criticalFound}.`);
    return criticalFound;
}


/** 初期設定値をUIに反映させる */
function applyInitialSettings() {
    loadSettingsToUI();

    if (dom.dashboardFilterThresholdLow) dom.dashboardFilterThresholdLow.textContent = DASHBOARD_ACCURACY_THRESHOLDS.LOW;
    if (dom.dashboardFilterThresholdMediumLow) dom.dashboardFilterThresholdMediumLow.textContent = DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1;
    if (dom.dashboardFilterThresholdMediumHigh) dom.dashboardFilterThresholdMediumHigh.textContent = DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM;
    if (dom.dashboardFilterThresholdHigh) dom.dashboardFilterThresholdHigh.textContent = DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1;

    if (dom.dashboardTrendsSessionsCount) {
        dom.dashboardTrendsSessionsCount.textContent = DASHBOARD_TREND_SESSIONS;
    }
    if (dom.detailHistoryCount) {
        dom.detailHistoryCount.textContent = MAX_RECENT_HISTORY;
    }
    if (dom.lowAccuracyThresholdDisplayFilter) {
        dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
    }
}

// ====================================================================
// イベントリスナー設定 (Event Listener Setup)
// ====================================================================
/** アプリケーション全体のイベントリスナーを設定する */
function setupEventListeners() {
    const safeAddEventListener = (element, event, handler, options = {}) => {
        if (element) {
            element.addEventListener(event, handler, options);
        } else {
             // ★ ログ追加：どの要素でリスナー設定が失敗したかわかりやすく
             console.warn(`Event listener setup failed: Element not found for ${event} handler.`);
        }
    };

    // === Navigation ===
    if (dom.navButtons) {
        dom.navButtons.forEach(button => safeAddEventListener(button, 'click', handleNavClick));
    }

    // === Global Notification Close ===
    safeAddEventListener(dom.notificationCloseButton, 'click', hideNotification);

    // === Home Screen ===
    safeAddEventListener(dom.jsonFileInput, 'change', handleFileSelect);
    safeAddEventListener(dom.deckList, 'click', handleDeckListClick);
    safeAddEventListener(dom.deckList, 'keydown', handleDeckListKeydown);
    safeAddEventListener(dom.startStudyButton, 'click', startStudy);
    safeAddEventListener(dom.resetHistoryButton, 'click', resetCurrentDeckHistory);
    if (dom.studyFilterRadios) {
        dom.studyFilterRadios.forEach(radio => safeAddEventListener(radio, 'change', handleStudyFilterChange));
    }

    // === Study Screen ===
    safeAddEventListener(dom.optionsButtonsContainer, 'click', handleOptionButtonClick);
    safeAddEventListener(dom.quitStudyButton, 'click', () => confirmQuitStudy(true)); // ★ ユーザー起因の中断
    safeAddEventListener(dom.backToTopButton, 'click', handleBackToTop);
    safeAddEventListener(dom.retryButton, 'click', retryCurrentQuestion);
    if (dom.evalButtons) { // ★ 評価ボタンのリスナー設定は変更なし
        dom.evalButtons.forEach(button => safeAddEventListener(button, 'click', handleEvaluation));
    }

    // === Dashboard Screen ===
    safeAddEventListener(dom.dashboardDeckSelect, 'change', handleDashboardDeckChange);
    safeAddEventListener(dom.dashboardFilterAccuracy, 'change', handleDashboardFilterChange);
    safeAddEventListener(dom.dashboardSearchQuery, 'input', handleDashboardSearchInput);
    safeAddEventListener(dom.dashboardSearchQuery, 'keydown', (e) => { if (e.key === 'Enter') applyDashboardSearch(); });
    safeAddEventListener(dom.dashboardSearchButton, 'click', applyDashboardSearch);
    safeAddEventListener(dom.dashboardSearchClear, 'click', clearDashboardSearch);
    safeAddEventListener(dom.dashboardSortOrder, 'change', handleDashboardSortChange);
    safeAddEventListener(dom.viewModeList, 'click', () => setDashboardViewMode('list'));
    safeAddEventListener(dom.viewModeChart, 'click', () => setDashboardViewMode('chart'));
    safeAddEventListener(dom.questionAccuracyList, 'click', handleQuestionItemClick);
    safeAddEventListener(dom.questionAccuracyList, 'keydown', handleQuestionItemKeydown);
    safeAddEventListener(dom.questionPagination, 'click', handlePaginationClick);
    safeAddEventListener(dom.closeDetailView, 'click', closeQuestionDetailView);

    // === Settings Screen ===
    safeAddEventListener(dom.saveSettingsButton, 'click', saveSettings);
    safeAddEventListener(dom.settingLowAccuracyThreshold, 'input', () => {
        if(dom.settingLowAccuracyThreshold && dom.lowAccuracyThresholdDisplayFilter) {
             const value = dom.settingLowAccuracyThreshold.value;
             const numValue = parseInt(value, 10);
             if (!isNaN(numValue) && numValue >= 1 && numValue <= 99) {
                dom.lowAccuracyThresholdDisplayFilter.textContent = numValue;
             } else {
                // 必要であれば、不正な値の時の表示をデフォルトに戻すなどの処理を追加
                dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
             }
        }
    });

    // === AI Prompt Guide Screen ===
    safeAddEventListener(dom.copyPromptButton, 'click', copyPromptToClipboard);

    console.log("Event listeners setup complete.");
}


// ====================================================================
// データ永続化 (LocalStorage Persistence)
// ====================================================================

/**
 * 指定されたキーでデータをLocalStorageに安全に保存する
 * @param {string} key 保存キー
 * @param {any} data 保存するデータ (JSONシリアライズ可能なもの)
 * @returns {boolean} 保存に成功した場合は true, 失敗した場合は false
 */
function saveData(key, data) {
    try {
        if (data === undefined || data === null) {
            localStorage.removeItem(key);
            console.log(`Data removed from LocalStorage for key "${key}"`);
        } else {
            const jsonData = JSON.stringify(data);
            localStorage.setItem(key, jsonData);
        }
        return true; // 保存成功
    } catch (e) {
        console.error(`Failed to save data to LocalStorage for key "${key}":`, e);
        let message = `データ (${key}) の保存中にエラーが発生しました。`;
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || e.message.toLowerCase().includes('quota'))) {
             const deckDataSize = (localStorage.getItem(LS_KEYS.DECKS)?.length || 0);
             const sizeMB = (deckDataSize / 1024 / 1024).toFixed(2);
             message = `データの保存に失敗しました。ブラウザの保存容量 (現在約 ${sizeMB} MB) が上限に達している可能性があります。不要な問題集を削除してください。`;
        }
        showNotification(message, 'error', 8000);
        return false; // 保存失敗
    }
}

/**
 * 指定されたキーでLocalStorageからデータを安全に読み込み、検証・修復する
 * @param {string} key 読み込みキー
 * @returns {any | null} 読み込んだデータ、またはエラー/データなしの場合は null
 */
function loadData(key) {
    try {
        const data = localStorage.getItem(key);
        if (data === null) {
            console.log(`No data found in LocalStorage for key "${key}".`);
            return null;
        }

        const parsedData = JSON.parse(data);

        if (key === LS_KEYS.DECKS && typeof parsedData === 'object' && parsedData !== null) {
            return repairAndValidateDeckData(parsedData);
        } else if (key === LS_KEYS.SETTINGS && typeof parsedData === 'object' && parsedData !== null) {
            return repairAndValidateSettings(parsedData);
        } else if (key === LS_KEYS.CURRENT_DECK_ID && typeof parsedData !== 'string' && parsedData !== null) {
             console.warn(`Invalid data type for ${key} in LocalStorage. Expected string or null, got ${typeof parsedData}. Resetting to null.`);
             saveData(key, null);
             return null;
        }

        return parsedData;

    } catch (e) {
        console.error(`Failed to load or parse data from LocalStorage for key "${key}":`, e);
        showNotification(`データ (Key: ${key}) の読み込みまたは解析に失敗しました。データが破損している可能性があります。破損したデータを削除します。`, 'error', 6000);
        try { localStorage.removeItem(key); } catch (removeError) { console.error(`Failed to remove corrupted data for key "${key}":`, removeError); }
        return null;
    }
}

/**
 * デッキデータの構造を検証し、不足しているプロパティを初期化する
 * @param {object} decksData - LocalStorageから読み込んだ allDecks データ
 * @returns {object} 修復されたデッキデータ
 */
function repairAndValidateDeckData(decksData) {
    let dataModified = false;
    const validDecks = {};

    for (const deckId in decksData) {
        if (Object.hasOwnProperty.call(decksData, deckId)) {
            const deck = decksData[deckId];
            if (typeof deck === 'object' && deck !== null && deck.id === deckId && typeof deck.name === 'string' && Array.isArray(deck.questions)) {
                const repairedDeck = { ...deck };

                if (typeof repairedDeck.lastStudied !== 'number' && repairedDeck.lastStudied !== null) { repairedDeck.lastStudied = null; dataModified = true; }
                if (typeof repairedDeck.totalCorrect !== 'number' || isNaN(repairedDeck.totalCorrect) || repairedDeck.totalCorrect < 0) { repairedDeck.totalCorrect = 0; dataModified = true; }
                if (typeof repairedDeck.totalIncorrect !== 'number' || isNaN(repairedDeck.totalIncorrect) || repairedDeck.totalIncorrect < 0) { repairedDeck.totalIncorrect = 0; dataModified = true; }
                if (!Array.isArray(repairedDeck.sessionHistory)) { repairedDeck.sessionHistory = []; dataModified = true; }
                else {
                    const originalLength = repairedDeck.sessionHistory.length;
                    repairedDeck.sessionHistory = repairedDeck.sessionHistory.filter(s =>
                        s && typeof s === 'object' && typeof s.ts === 'number' && typeof s.correct === 'number' && s.correct >= 0 && typeof s.incorrect === 'number' && s.incorrect >= 0
                    );
                    if (repairedDeck.sessionHistory.length !== originalLength) {
                        dataModified = true;
                    }
                }

                const validQuestions = [];
                const originalQuestionLength = repairedDeck.questions.length;
                repairedDeck.questions.forEach((q, index) => {
                    if (q && typeof q === 'object' && typeof q.id === 'string' && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 && typeof q.correctAnswer === 'string') {
                        const repairedQuestion = { ...q };

                        // オプションと正解の検証を強化
                        const originalOptionsLength = repairedQuestion.options.length;
                        repairedQuestion.options = repairedQuestion.options
                            .map(opt => (typeof opt === 'string' ? opt : String(opt)).trim()) // 文字列化とtrim
                            .filter(opt => opt !== ''); // 空を除去
                        repairedQuestion.correctAnswer = String(repairedQuestion.correctAnswer).trim();

                        if (repairedQuestion.options.length < 2) {
                             console.warn(`Invalid options (less than 2 valid) removed at index ${index} in deck "${repairedDeck.name}" (ID: ${deckId}). Question: "${q.question.substring(0, 20)}..."`);
                             dataModified = true;
                             return; // Skip this question
                        }
                        if (!repairedQuestion.options.includes(repairedQuestion.correctAnswer)) {
                             console.warn(`Correct answer "${repairedQuestion.correctAnswer}" not found in valid options [${repairedQuestion.options.join(', ')}] at index ${index} in deck "${repairedDeck.name}" (ID: ${deckId}). Question: "${q.question.substring(0, 20)}..."`);
                             dataModified = true;
                             return; // Skip this question
                        }
                        if (repairedQuestion.options.length !== originalOptionsLength) {
                            dataModified = true; // Options were cleaned
                        }

                        if (!Array.isArray(repairedQuestion.history)) { repairedQuestion.history = []; dataModified = true; }
                        const originalHistoryLength = repairedQuestion.history.length;
                        repairedQuestion.history = repairedQuestion.history.filter(h => h && typeof h === 'object' && typeof h.ts === 'number' && typeof h.correct === 'boolean');
                        if (repairedQuestion.history.length !== originalHistoryLength) {
                             dataModified = true;
                        }

                        repairedQuestion.history.forEach(h => {
                            if (![null, 'difficult', 'normal', 'easy', undefined].includes(h.evaluation)) { // undefinedも許容
                                h.evaluation = null;
                                dataModified = true;
                            }
                        });

                        if (typeof repairedQuestion.explanation !== 'string' && repairedQuestion.explanation !== undefined && repairedQuestion.explanation !== null) {
                            repairedQuestion.explanation = String(repairedQuestion.explanation); // 文字列に変換
                            dataModified = true;
                        } else if (repairedQuestion.explanation === undefined || repairedQuestion.explanation === null) {
                             repairedQuestion.explanation = ''; // 未定義なら空文字に
                             dataModified = true;
                        }

                        validQuestions.push(repairedQuestion);
                    } else {
                        console.warn(`Invalid question structure removed at index ${index} in deck "${repairedDeck.name}" (ID: ${deckId}). Question: "${q?.question?.substring(0, 20)}..."`);
                        dataModified = true;
                    }
                });
                if (repairedDeck.questions.length !== originalQuestionLength) {
                    dataModified = true; // Questions were removed
                }
                repairedDeck.questions = validQuestions;

                validDecks[deckId] = repairedDeck;
            } else {
                console.warn(`Invalid deck structure removed for ID "${deckId}".`);
                dataModified = true;
            }
        }
    }

    if (dataModified) {
        console.log("Deck data structure was repaired. Resaving to LocalStorage.");
        if (!saveData(LS_KEYS.DECKS, validDecks)) {
             // 保存失敗した場合、メモリ上のデータも元に戻す（あるいはエラーをスローする）
             console.error("Failed to save repaired deck data. Data in memory might be inconsistent with LocalStorage.");
             // return decksData; // Optionally return original data if save fails
        }
    }
    return validDecks;
}

/**
 * 設定データの構造を検証し、不足または無効な値をデフォルトで補完する
 * @param {object} loadedSettings - LocalStorageから読み込んだ設定データ
 * @returns {object} 修復された設定データ
 */
function repairAndValidateSettings(loadedSettings) {
     const defaultSettings = { shuffleOptions: true, lowAccuracyThreshold: 50 };
     let repairedSettings = { ...defaultSettings };
     let modified = false;

     if (typeof loadedSettings.shuffleOptions === 'boolean') {
         repairedSettings.shuffleOptions = loadedSettings.shuffleOptions;
     } else if (loadedSettings.shuffleOptions !== undefined) {
         modified = true;
         console.warn(`Settings: shuffleOptions was invalid type (${typeof loadedSettings.shuffleOptions}), reset to default.`);
     }

     if (typeof loadedSettings.lowAccuracyThreshold === 'number' &&
         !isNaN(loadedSettings.lowAccuracyThreshold) &&
         loadedSettings.lowAccuracyThreshold >= 1 &&
         loadedSettings.lowAccuracyThreshold <= 99) {
         repairedSettings.lowAccuracyThreshold = Math.round(loadedSettings.lowAccuracyThreshold); // 整数に丸める
     } else if (loadedSettings.lowAccuracyThreshold !== undefined) {
        modified = true;
        console.warn(`Settings: lowAccuracyThreshold was invalid (${loadedSettings.lowAccuracyThreshold}), reset to default.`);
     }

     // Check for unexpected keys (optional, might be useful for future cleanup)
     const allowedKeys = Object.keys(defaultSettings);
     for (const key in loadedSettings) {
         if (!allowedKeys.includes(key)) {
             console.warn(`Settings: Found unexpected key "${key}" in loaded settings.`);
             // delete repairedSettings[key]; // Optionally remove unknown keys
         }
     }


     if (modified) {
         console.warn("Settings data was repaired. Resaving repaired settings.");
         if (!saveData(LS_KEYS.SETTINGS, repairedSettings)) {
              console.error("Failed to save repaired settings data.");
              // return defaultSettings; // Return defaults if save fails?
         }
     }
     return repairedSettings;
}


/** アプリ起動時にLocalStorageから初期データを読み込む */
function loadInitialData() {
    const loadedSettings = loadData(LS_KEYS.SETTINGS);
    // ★ repairAndValidateSettings が常にオブジェクトを返すようになったので、直接代入
    appState.settings = repairAndValidateSettings(loadedSettings || {});

    appState.allDecks = loadData(LS_KEYS.DECKS) || {};

    appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID) || null;

    if (appState.currentDeckId && !appState.allDecks[appState.currentDeckId]) {
        console.warn(`Current deck ID "${appState.currentDeckId}" not found in loaded decks. Resetting current deck selection.`);
        appState.currentDeckId = null;
        saveData(LS_KEYS.CURRENT_DECK_ID, null);
    }

    // ダッシュボードの初期デッキIDは、ホームと同じにする
    appState.currentDashboardDeckId = appState.currentDeckId;

    console.log("Initial data loaded:", {
        settings: appState.settings,
        deckCount: Object.keys(appState.allDecks).length,
        currentDeckId: appState.currentDeckId
    });
}

// ====================================================================
// UI制御関数 (UI Control Functions)
// ====================================================================

/**
 * ローディングオーバーレイの表示/非表示を切り替える
 * @param {boolean} show - 表示する場合は true, 非表示の場合は false
 */
function showLoadingOverlay(show) {
    if (isInitializing && show) return; // 初期化中はinitializeAppが制御
    if (!dom.appLoadingOverlay) return;
    requestAnimationFrame(() => {
        if (dom.appLoadingOverlay) { // ★ 再度チェック（非同期のため）
            dom.appLoadingOverlay.classList.toggle('active', show);
        }
    });
}

/**
 * グローバル通知を表示する
 * @param {string} message - 表示するメッセージ
 * @param {'info'|'success'|'warning'|'error'} type - 通知タイプ (色が変わる)
 * @param {number} [duration=NOTIFICATION_DURATION] - 表示時間 (ミリ秒)
 */
function showNotification(message, type = 'info', duration = NOTIFICATION_DURATION) {
    if (!dom.globalNotification || !dom.notificationMessage || !dom.notificationIcon) {
        console.warn(`Notification elements not found, cannot display message: ${message} (Type: ${type})`);
        if (type === 'error' && isInitializing) {
            alert(`エラー: ${message}`); // 初期化中の致命的エラーはalertも出す
        }
        return;
    }
    clearTimeout(notificationTimeout);
    notificationTimeout = null;

    dom.notificationMessage.textContent = message;
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
    // Use innerHTML carefully, but here it's safe as we control the content
    dom.notificationIcon.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i>`;
    dom.globalNotification.className = 'notification'; // Reset classes first

    // Force reflow before adding classes to ensure transition works
    void dom.globalNotification.offsetWidth;

    requestAnimationFrame(() => {
         if (dom.globalNotification) { // ★ 再度チェック
             dom.globalNotification.classList.add(type);
             dom.globalNotification.classList.add('show');
         }
    });

    if (duration > 0) {
        notificationTimeout = setTimeout(() => {
            hideNotification();
        }, duration);
    }
}

/** グローバル通知を非表示にする */
function hideNotification() {
    if (!dom.globalNotification) return;
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
    dom.globalNotification.classList.remove('show');
    // Optional: Remove type class after transition
    // dom.globalNotification.addEventListener('transitionend', () => {
    //     dom.globalNotification.className = 'notification';
    // }, { once: true });
}

/**
 * ホーム画面のデッキリストUIを更新する
 */
function updateDeckListUI() {
    if (!dom.deckList) {
        console.warn("updateDeckListUI: Deck list element not found.");
        return;
    }
    const deckList = dom.deckList;
    deckList.innerHTML = '';
    const deckIds = Object.keys(appState.allDecks);

    if (deckIds.length === 0) {
        deckList.innerHTML = '<li class="no-decks-message">問題集がありません。<br>「新規問題集(JSON)を読み込む」からファイルを追加してください。</li>';
        return;
    }

    // Sort decks by lastStudied (descending), then by name (ascending)
    deckIds.sort((a, b) => {
        const deckA = appState.allDecks[a];
        const deckB = appState.allDecks[b];
        const lastStudiedA = deckA?.lastStudied || 0;
        const lastStudiedB = deckB?.lastStudied || 0;
        if (lastStudiedA !== lastStudiedB) {
            return lastStudiedB - lastStudiedA; // Newer first
        }
        // Use localeCompare for proper Japanese sorting
        return (deckA?.name || '').localeCompare(deckB?.name || '', 'ja');
    });

    const fragment = document.createDocumentFragment();
    deckIds.forEach(deckId => {
        const deck = appState.allDecks[deckId];
        if (!deck) return; // Should not happen if repair works

        const li = document.createElement('li');
        li.dataset.deckId = deckId;
        li.classList.toggle('active-deck', deckId === appState.currentDeckId);
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0'); // Make focusable
        li.setAttribute('aria-label', `問題集 ${deck.name || '名称未設定'} を選択または操作`);
        li.setAttribute('aria-selected', deckId === appState.currentDeckId); // Indicate selection state

        // Info Div (Grows)
        const infoDiv = document.createElement('div');
        infoDiv.classList.add('deck-info'); // Added class for potential styling

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('deck-name'); // Added class
        nameSpan.textContent = `${deck.name || '名称未設定'} (${deck.questions?.length || 0}問)`;

        const historySpan = document.createElement('span');
        historySpan.classList.add('deck-history'); // Added class
        const lastStudiedText = deck.lastStudied ? `最終学習: ${formatDate(deck.lastStudied)}` : '未学習';
        const totalAnswered = (deck.totalCorrect || 0) + (deck.totalIncorrect || 0);
        const accuracy = totalAnswered > 0 ? Math.round(((deck.totalCorrect || 0) / totalAnswered) * 100) : -1;
        const accuracyText = accuracy >= 0 ? `正答率: ${accuracy}%` : 'データなし';
        historySpan.textContent = `${lastStudiedText} / ${accuracyText}`;

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(historySpan);

        // Actions Div (Shrinks)
        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('deck-actions');

        const selectButton = document.createElement('button');
        selectButton.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i> 選択';
        selectButton.type = 'button';
        selectButton.classList.add('button', 'small', 'primary', 'select-deck');
        selectButton.dataset.deckId = deckId;
        selectButton.disabled = (deckId === appState.currentDeckId);
        selectButton.setAttribute('aria-label', `問題集 ${deck.name || '名称未設定'} を選択`);
        if (deckId === appState.currentDeckId) {
            selectButton.setAttribute('aria-pressed', 'true');
        }

        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i> 削除';
        deleteButton.type = 'button';
        deleteButton.classList.add('button', 'small', 'danger', 'delete-deck');
        deleteButton.dataset.deckId = deckId;
        deleteButton.setAttribute('aria-label', `問題集 ${deck.name || '名称未設定'} を削除`);

        actionsDiv.appendChild(selectButton);
        actionsDiv.appendChild(deleteButton);

        li.appendChild(infoDiv);
        li.appendChild(actionsDiv);
        fragment.appendChild(li);
    });

    deckList.appendChild(fragment);
}

/**
 * ホーム画面上部の「現在の問題集」情報とフィルターオプション表示を更新する
 */
function updateTopScreenDisplay() {
    const deckSelected = !!appState.currentDeckId && !!appState.allDecks[appState.currentDeckId];
    const currentDeck = deckSelected ? appState.allDecks[appState.currentDeckId] : null;

    // Update Text Content Safely
    const updateText = (element, text) => { if (element) element.textContent = text; };

    updateText(dom.currentDeckName, deckSelected ? (currentDeck.name || '名称未設定') : '未選択');
    updateText(dom.totalQuestions, deckSelected ? (currentDeck.questions?.length ?? 0) : '0');
    updateText(dom.currentDeckLastStudied, deckSelected && currentDeck.lastStudied ? formatDate(currentDeck.lastStudied) : '-');

    if (dom.currentDeckAccuracy) {
        let accuracyText = '-';
        if (deckSelected) {
            const totalCorrect = currentDeck.totalCorrect || 0;
            const totalIncorrect = currentDeck.totalIncorrect || 0;
            const totalAnswered = totalCorrect + totalIncorrect;
            if (totalAnswered > 0) {
                const accuracy = Math.round((totalCorrect / totalAnswered) * 100);
                accuracyText = `${accuracy}% (${totalCorrect}/${totalAnswered})`;
            } else {
                accuracyText = 'データなし';
            }
        }
        dom.currentDeckAccuracy.textContent = accuracyText;
    }

    // Toggle Filter Options Display
    if (dom.studyFilterOptions) {
        dom.studyFilterOptions.style.display = deckSelected ? 'block' : 'none';
        // Ensure related elements are also handled if needed (e.g., aria-expanded)
    }

    // Update Threshold Display
    if (dom.lowAccuracyThresholdDisplayFilter) {
         dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
    }

    // Update Filtered Count and Button States
    if (deckSelected) {
        updateFilteredQuestionCount(); // This will also call updateStudyButtonsState
    } else {
        updateText(dom.filteredQuestionCount, ''); // Clear count if no deck
        updateStudyButtonsState(); // Update button state directly
    }

    // Update Reset History Button State
    if (dom.resetHistoryButton) {
        let hasHistory = false;
        if (deckSelected) {
            hasHistory = !!currentDeck.lastStudied ||
                         (currentDeck.totalCorrect ?? 0) > 0 ||
                         (currentDeck.totalIncorrect ?? 0) > 0 ||
                         (currentDeck.sessionHistory?.length ?? 0) > 0 ||
                         (currentDeck.questions?.some(q => q.history?.length > 0) ?? false);
        }
        dom.resetHistoryButton.disabled = !hasHistory;
        dom.resetHistoryButton.title = hasHistory
            ? "選択中の問題集の全学習履歴（解答履歴、評価、累計、セッション）をリセットします"
            : (deckSelected ? "リセットする履歴がありません" : "問題集を選択してください");
        // Consider adding aria-disabled based on the 'disabled' state
        dom.resetHistoryButton.setAttribute('aria-disabled', String(!hasHistory));
    }
}

/**
 * ホーム画面の「学習開始」ボタンの有効/無効状態とツールチップを更新する
 */
function updateStudyButtonsState() {
    if (!dom.startStudyButton) return;

    const deckSelected = !!appState.currentDeckId && !!appState.allDecks[appState.currentDeckId];
    let hasQuestionsToStudy = false;
    let filteredCount = 0;
    let filterLabel = ""; // Initialize filterLabel

    if (deckSelected) {
        try {
            const filteredList = getFilteredStudyList();
            filteredCount = filteredList.length;
            hasQuestionsToStudy = filteredCount > 0;

            // Get filter label for tooltip
            const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
            if (selectedRadio) {
                 const labelElement = document.querySelector(`label[for="${selectedRadio.id}"]`);
                 if(labelElement) {
                     // Extract text, removing icon if present
                     const labelText = labelElement.querySelector('span')?.textContent || labelElement.textContent;
                     filterLabel = `「${labelText.trim()}」フィルター`;
                 } else {
                     filterLabel = "選択されたフィルター条件";
                 }
            } else {
                filterLabel = "全問"; // Default if somehow no radio is checked
            }

        } catch (error) {
            console.error("Error getting filtered study list count:", error);
            hasQuestionsToStudy = false;
        }
    }

    dom.startStudyButton.disabled = !hasQuestionsToStudy;
    dom.startStudyButton.setAttribute('aria-disabled', String(!hasQuestionsToStudy));

    // Update Tooltip
    if (!deckSelected) {
        dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
    } else if (!hasQuestionsToStudy) {
        dom.startStudyButton.title = `${filterLabel}に該当する問題がありません。`;
    } else {
        dom.startStudyButton.title = `${filterLabel} (${filteredCount}問) で学習を開始します`;
    }
}


// ====================================================================
// ナビゲーション制御 (Navigation Control)
// ====================================================================

/**
 * ナビゲーションボタンクリック時のハンドラ
 * @param {MouseEvent} event - クリックイベント
 */
function handleNavClick(event) {
    const targetButton = event.target.closest('.nav-button');
    if (!targetButton || targetButton.disabled) return; // Ignore disabled buttons

    const targetScreenId = targetButton.dataset.target;
    if (targetScreenId) {
         // ★ 学習画面からの遷移時は確認
        if (appState.activeScreen === 'study-screen' && targetScreenId !== 'study-screen') {
            if (!confirmQuitStudy(false)) { // confirmQuitStudy returns true if quit proceeds
                return; // User cancelled quit
            }
            // If quit proceeds, navigateToScreen will be called after cleanup
        } else {
            navigateToScreen(targetScreenId);
        }
    } else {
        console.warn("Navigation button clicked, but data-target attribute is missing:", targetButton);
    }
}

/**
 * 指定されたIDの画面に遷移する
 * @param {string} screenId - 遷移先の画面要素のID
 */
function navigateToScreen(screenId) {
    if (!dom.screens || !dom.navButtons) {
        console.error("Cannot navigate: Screen elements or navigation buttons not found in DOM cache.");
        showNotification("画面遷移に必要な要素が見つかりません。", "error");
        return;
    }

    // Hide all screens first
    dom.screens.forEach(screen => screen.classList.remove('active'));

    const targetScreenElement = document.getElementById(screenId);
    if (targetScreenElement && targetScreenElement.classList.contains('screen')) {
        // Activate target screen
        targetScreenElement.classList.add('active');
        appState.activeScreen = screenId;
        console.log(`Navigated to screen: ${screenId}`);

        // Update navigation button states
        dom.navButtons.forEach(button => {
            const isActive = button.dataset.target === screenId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-current', isActive ? 'page' : 'false'); // Use 'false' instead of removing
        });

        // Screen-specific actions on navigation
        switch (screenId) {
            case 'dashboard-screen':
                populateDashboardDeckSelect(); // Ensure select is up-to-date
                if (appState.currentDashboardDeckId) {
                    renderDashboard(); // Render if a deck is selected
                } else {
                    // Show "no deck selected" message if needed
                    if (dom.dashboardContent) dom.dashboardContent.style.display = 'none';
                    if (dom.dashboardNoDeckMessage) dom.dashboardNoDeckMessage.style.display = 'block';
                }
                break;
            case 'settings-screen':
                loadSettingsToUI(); // Load current settings into UI
                break;
            case 'home-screen':
                 // Ensure home screen UI is up-to-date
                 updateDeckListUI();
                 updateTopScreenDisplay();
                 break;
            // No specific action needed for study-screen or prompt-guide on navigation TO them
        }

        // Clean up state if leaving certain screens
        if (screenId !== 'dashboard-screen') {
            closeQuestionDetailView(); // Close detail view if leaving dashboard
        }
        // ★ Moved study state reset logic into confirmQuitStudy
        // if (screenId !== 'study-screen' && appState.currentQuestionIndex !== -1) {
        //     console.warn("Navigated away from active study screen without explicit quit. Resetting study list/index.");
        //     // resetStudyState is handled by confirmQuitStudy or completion
        //      // Reset UI elements related to study state
        //      if(dom.studyCard) dom.studyCard.style.display = 'block'; // Show card
        //      if(dom.evaluationControls) dom.evaluationControls.style.display = 'none'; // Hide eval
        //      if(dom.answerArea) dom.answerArea.style.display = 'none'; // Hide answer
        //      if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none'; // Hide completion
        //      if(dom.quitStudyButton) dom.quitStudyButton.style.display = 'none'; // Hide quit button
        // }

        window.scrollTo({ top: 0, behavior: 'smooth' });

    } else {
        console.error(`Navigation failed: Screen with ID "${screenId}" not found or is not a valid screen element.`);
        showNotification(`画面 "${screenId}" が見つかりません。ホーム画面を表示します。`, "error");
        if (screenId !== 'home-screen') { // Avoid infinite loop if home is missing
            navigateToScreen('home-screen');
        }
    }
}

// ====================================================================
// ファイル操作 (File Handling)
// ====================================================================

/**
 * ファイル選択インプットが変更されたときのハンドラ
 * @param {Event} event - input要素のchangeイベント
 */
function handleFileSelect(event) {
    const fileInput = event.target;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        console.log("No file selected.");
        return; // No file selected or input missing
    }
    const file = fileInput.files[0];
    const statusElement = dom.loadStatus;

    // Reset status message
    if (statusElement) {
         statusElement.textContent = "";
         statusElement.className = 'status-message';
    }

    // Basic file type check
    if (!file.type || (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json'))) {
        showNotification('JSONファイル (.json) を選択してください。', 'warning');
        if(statusElement) {
            statusElement.textContent = "JSONファイルを選択してください";
            statusElement.className = 'status-message error';
        }
        fileInput.value = ''; // Clear the input
        return;
    }

    // Show loading state
    if(statusElement) {
        statusElement.textContent = "読み込み中...";
        statusElement.className = 'status-message info';
    }
    showLoadingOverlay(true);

    const reader = new FileReader();

    reader.onload = (e) => {
        let newDeckId = null; // Track added deck ID for potential rollback
        try {
            const content = e.target?.result;
            if (typeof content !== 'string') {
                 throw new Error("ファイルの内容を文字列として読み取れませんでした。");
            }
            if (content.trim() === '') {
                 throw new Error("ファイルが空です。");
            }

            let data;
            try {
                 data = JSON.parse(content);
            } catch (parseError) {
                console.error("JSON parsing error:", parseError);
                throw new Error(`JSONの解析に失敗しました。形式を確認してください。 詳細: ${parseError.message}`);
            }

            const validationResult = validateJsonData(data);
            if (!validationResult.isValid) {
                throw new Error(`JSONデータの形式が不正です: ${validationResult.message}`);
            }

            // Generate unique deck name if collision occurs
            let deckName = file.name.replace(/\.json$/i, '');
            let originalDeckName = deckName;
            let counter = 1;
            while (Object.values(appState.allDecks).some(d => d.name === deckName)) {
                counter++;
                deckName = `${originalDeckName} (${counter})`;
            }

            // Create unique deck ID
            const deckId = `deck_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            newDeckId = deckId; // Store ID for potential rollback

            const newDeck = {
                id: deckId,
                name: deckName,
                questions: validationResult.questions.map((q, index) => ({
                    // Generate unique question ID including deck ID and random element
                    id: `q_${deckId}_${index}_${Date.now().toString(36).slice(-4)}_${Math.random().toString(36).substring(2, 7)}`,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    explanation: q.explanation || '', // Ensure explanation is string
                    history: [] // Initialize empty history
                })),
                lastStudied: null,
                totalCorrect: 0,
                totalIncorrect: 0,
                sessionHistory: []
            };

            // Add to state *before* saving
            appState.allDecks[deckId] = newDeck;

            // Attempt to save the updated decks object
            if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                // Rollback if save fails
                delete appState.allDecks[deckId];
                throw new Error("LocalStorageへの保存に失敗したため、問題集の追加をキャンセルしました。");
            }

            // Success
            console.log("New deck added:", newDeck);
            if(statusElement) {
                statusElement.textContent = `読み込み成功: ${deckName} (${newDeck.questions.length}問)`;
                statusElement.className = 'status-message success';
            }
            showNotification(`問題集「${deckName}」(${newDeck.questions.length}問) を正常に読み込みました。`, 'success');

            // Update UI and select the new deck
            updateDeckListUI();
            populateDashboardDeckSelect();
            selectDeck(deckId); // Select the newly added deck

        } catch (error) {
            console.error("Error processing JSON file:", error);
            if(statusElement) {
                statusElement.textContent = `読み込みエラー: ${error.message}`;
                statusElement.className = 'status-message error';
            }
            showNotification(`ファイル読み込みエラー: ${error.message}`, 'error', 8000);
            // Ensure rollback if error occurred after adding to state but before saving (handled in save check)
            // If error occurred before adding to state, no rollback needed here.
            if (newDeckId && !saveData(LS_KEYS.DECKS, appState.allDecks)) { // Double check save didn't happen on error
                delete appState.allDecks[newDeckId]; // Rollback if state was modified
            }
        } finally {
            showLoadingOverlay(false);
            fileInput.value = ''; // Always clear file input
            // Clear status message after a delay, unless it's an error
            setTimeout(() => {
                if(statusElement && !statusElement.classList.contains('error')) {
                    statusElement.textContent = "";
                    statusElement.className = 'status-message';
                }
            }, 5000);
        }
    };

    reader.onerror = (e) => {
        console.error("Error reading file:", reader.error);
        if(statusElement) {
            statusElement.textContent = "ファイル読み取りエラー";
            statusElement.className = 'status-message error';
        }
        showNotification("ファイルの読み取り中にエラーが発生しました。", "error");
        fileInput.value = ''; // Clear the input
        showLoadingOverlay(false);
    };

    reader.readAsText(file);
}

/**
 * 読み込んだJSONデータが期待される形式か検証する
 * @param {any} data - JSON.parse() でパースされたデータ
 * @returns {{isValid: boolean, message: string, questions: Array<{question: string, options: string[], correctAnswer: string, explanation: string}> | null}} 検証結果オブジェクト
 */
function validateJsonData(data) {
    if (!Array.isArray(data)) {
        return { isValid: false, message: "データが配列形式ではありません。", questions: null };
    }
    if (data.length === 0) {
        return { isValid: false, message: "問題が1つも含まれていません。", questions: null };
    }

    const validatedQuestions = [];
    for (let i = 0; i < data.length; i++) {
        const q = data[i];
        const questionNum = i + 1;

        // Basic Structure Check
        if (typeof q !== 'object' || q === null) {
            return { isValid: false, message: `問題 ${questionNum}: データ形式がオブジェクトではありません。`, questions: null };
        }

        // Question Text Validation
        if (typeof q.question !== 'string' || q.question.trim() === '') {
            return { isValid: false, message: `問題 ${questionNum}: 'question' (問題文) が存在しないか空です。`, questions: null };
        }
        const questionText = q.question.trim();

        // Options Validation
        if (!Array.isArray(q.options)) {
             return { isValid: false, message: `問題 ${questionNum}: 'options' (選択肢) が配列ではありません。`, questions: null };
        }
        const trimmedOptions = q.options
            .map(opt => (typeof opt === 'string' ? opt : String(opt)).trim()) // Ensure string and trim
            .filter(opt => opt !== ''); // Remove empty options
        if (trimmedOptions.length < 2) {
             return { isValid: false, message: `問題 ${questionNum}: 有効な選択肢 ('options') が2つ未満です（空の選択肢は除外されます）。`, questions: null };
        }

        // Correct Answer Validation
        if (typeof q.correctAnswer !== 'string' || q.correctAnswer.trim() === '') {
            return { isValid: false, message: `問題 ${questionNum}: 'correctAnswer' (正解) が存在しないか空です。`, questions: null };
        }
        const trimmedCorrectAnswer = q.correctAnswer.trim();

        // Check if Correct Answer is in Trimmed Options
        if (!trimmedOptions.includes(trimmedCorrectAnswer)) {
            const optionsString = trimmedOptions.map(opt => `"${opt}"`).join(', ');
            return { isValid: false, message: `問題 ${questionNum}: 'correctAnswer' ("${trimmedCorrectAnswer}") が有効な 'options' [${optionsString}] 内に見つかりません。完全に一致する必要があります。`, questions: null };
        }

        // Explanation Validation (Optional)
        let explanation = '';
        if (q.explanation !== undefined && q.explanation !== null) {
             if (typeof q.explanation !== 'string') {
                  // Try to convert non-string explanation, but log a warning
                  explanation = String(q.explanation).trim();
                  console.warn(`問題 ${questionNum}: 'explanation' は文字列であるべきですが、型 ${typeof q.explanation} が検出されました。文字列に変換しました: "${explanation.substring(0,50)}..."`);
             } else {
                 explanation = q.explanation.trim();
             }
        }

        validatedQuestions.push({
            question: questionText,
            options: trimmedOptions, // Use the cleaned options
            correctAnswer: trimmedCorrectAnswer, // Use the cleaned answer
            explanation: explanation
        });
    }

    // All questions are valid
    return { isValid: true, message: "データは有効です。", questions: validatedQuestions };
}


// ====================================================================
// 問題集操作 (Deck Management)
// ====================================================================

/**
 * デッキリスト内のクリックイベントを処理する (イベント委任)
 * @param {MouseEvent} event - クリックイベント
 */
function handleDeckListClick(event) {
    const target = event.target;
    // Find the closest list item with a deck ID
    const listItem = target.closest('li[data-deck-id]');
    if (!listItem) return; // Clicked outside a list item

    const deckId = listItem.dataset.deckId;
    if (!deckId) return; // List item doesn't have a deck ID

    const selectButton = target.closest('.select-deck');
    const deleteButton = target.closest('.delete-deck');

    if (selectButton && !selectButton.disabled) {
        event.stopPropagation(); // Prevent list item click if button clicked
        selectDeck(deckId);
    } else if (deleteButton && !deleteButton.disabled) {
        event.stopPropagation();
        deleteDeck(deckId);
    } else if (listItem.getAttribute('role') === 'button' && deckId !== appState.currentDeckId) {
        // If the list item itself (not buttons) is clicked and it's not the active one
        selectDeck(deckId);
    }
}

/**
 * デッキリスト内のキーダウンイベント（Enter/Space）を処理する (アクセシビリティ)
 * @param {KeyboardEvent} event - キーダウンイベント
 */
function handleDeckListKeydown(event) {
     // Handle Enter or Space key press on list items
     if (event.key === 'Enter' || event.key === ' ') {
         const target = event.target;
         // Ensure the target is the focusable list item itself
         if (target.matches('li[data-deck-id][role="button"]')) {
             event.preventDefault(); // Prevent default space scroll / enter form submit
             const deckId = target.dataset.deckId;
             if (deckId && deckId !== appState.currentDeckId) {
                 selectDeck(deckId);
             }
             // If Enter/Space is pressed on a button inside, let handleDeckListClick manage it
         }
     }
     // Optional: Add ArrowUp/ArrowDown navigation between list items if needed
}


/**
 * 指定されたIDのデッキを選択状態にする
 * @param {string} deckId - 選択するデッキのID
 */
function selectDeck(deckId) {
    if (!deckId || !appState.allDecks[deckId]) {
        console.error("Cannot select deck: Invalid deck ID or deck not found.", deckId);
        showNotification("問題集の選択に失敗しました。", "error");
        return;
    }
    if (deckId === appState.currentDeckId) {
        console.log("Deck already selected:", deckId);
        return; // Already selected
    }

    appState.currentDeckId = deckId;
    if (!saveData(LS_KEYS.CURRENT_DECK_ID, deckId)) {
        // If saving fails, should we revert the state? Or just warn?
        console.error("Failed to save current deck ID to LocalStorage.");
        showNotification("選択した問題集の保存に失敗しました。", "warning");
        // Optionally revert: appState.currentDeckId = previousDeckId; (need to store previous)
    }

    console.log("Deck selected:", deckId);
    const deckName = appState.allDecks[deckId]?.name || '無名';
    showNotification(`問題集「${deckName}」を選択しました。`, "success", 2500);

    // Reset study filter to 'all' when changing decks
    appState.studyFilter = 'all';
    if (dom.studyFilterRadios) {
        const allFilterRadio = document.getElementById('filter-all');
        if (allFilterRadio) allFilterRadio.checked = true;
    }

    // Update UI elements that depend on the current deck
    updateDeckListUI(); // Reflects the new selection visually
    updateTopScreenDisplay(); // Updates info card and filter counts/button states

    // Sync dashboard selection if dashboard is active or becomes active
    appState.currentDashboardDeckId = deckId;
    if (dom.dashboardDeckSelect) {
         dom.dashboardDeckSelect.value = deckId; // Update dropdown selection
    }
    if (appState.activeScreen === 'dashboard-screen') {
        // If already on dashboard, reset filters and render for the new deck
        resetDashboardFiltersAndState();
        renderDashboard();
    }
}

/**
 * 指定されたIDのデッキを削除する
 * @param {string} deckId - 削除するデッキのID
 */
function deleteDeck(deckId) {
    if (!deckId || !appState.allDecks[deckId]) {
        console.error("Cannot delete deck: Invalid deck ID or deck not found.", deckId);
        showNotification("問題集の削除に失敗しました。", "error");
        return;
    }

    const deck = appState.allDecks[deckId];
    const deckName = deck.name || '無名の問題集';
    // More explicit confirmation message
    if (confirm(`問題集「${deckName}」とその全ての学習履歴（${deck.questions?.length ?? 0}問分）を完全に削除します。\n\nこの操作は元に戻せません！\n\nよろしいですか？`)) {
        try {
            // Store backup in case save fails
            const originalDecks = { ...appState.allDecks };
            const deletedDeckData = appState.allDecks[deckId]; // For logging/potential recovery

            // Remove from state
            delete appState.allDecks[deckId];

            let deckSelectionChanged = false;
            // If the deleted deck was selected, deselect it
            if (appState.currentDeckId === deckId) {
                appState.currentDeckId = null;
                saveData(LS_KEYS.CURRENT_DECK_ID, null); // Persist deselection
                deckSelectionChanged = true;
            }
            // If the deleted deck was selected on the dashboard, deselect it
            if (appState.currentDashboardDeckId === deckId) {
                appState.currentDashboardDeckId = null;
                if (dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = ""; // Reset dropdown
                deckSelectionChanged = true;
            }

            // Attempt to save the change
            if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                 // Rollback state if save fails
                 appState.allDecks = originalDecks;
                 // Re-select if it was deselected during the failed attempt
                 if (appState.currentDeckId === null && originalDecks[deckId]) appState.currentDeckId = deckId;
                 if (appState.currentDashboardDeckId === null && originalDecks[deckId]) appState.currentDashboardDeckId = deckId;

                 console.error("Failed to save deck deletion to LocalStorage. Operation rolled back in memory.");
                 showNotification("問題集データの保存に失敗しました。削除はキャンセルされました。", "error", 6000);
                 return; // Stop execution
            }

            // Success
            console.log("Deck deleted:", deckId, deletedDeckData);
            showNotification(`問題集「${deckName}」を削除しました。`, "success");

            // Update UI reflecting the deletion and potential deselection
            updateDeckListUI();
            updateTopScreenDisplay();
            populateDashboardDeckSelect(); // Update dashboard dropdown

            // If on dashboard and the selected deck was deleted, refresh dashboard (will show no-deck message)
            if (appState.activeScreen === 'dashboard-screen' && deckSelectionChanged && appState.currentDashboardDeckId === null) {
                 renderDashboard();
            }

        } catch (error) {
            console.error("Error deleting deck:", error);
            showNotification("問題集の削除中に予期せぬエラーが発生しました。", "error");
            // Potentially inconsistent state here, maybe reload?
        }
    }
}

/** 現在選択中のデッキの学習履歴をリセットする */
function resetCurrentDeckHistory() {
    const deckId = appState.currentDeckId;
    if (!deckId || !appState.allDecks[deckId]) {
        showNotification("履歴をリセットする問題集が選択されていません。", "warning");
        return;
    }

    const deck = appState.allDecks[deckId];
    const deckName = deck.name || '無名の問題集';

    // Clearer confirmation message
    if (confirm(`問題集「${deckName}」の全ての学習履歴（各問題の解答履歴、評価、累計正答率、最終学習日、セッション履歴）をリセットします。\n\n問題自体は削除されません。\nこの操作は元に戻せません！\n\nよろしいですか？`)) {
        try {
            // Backup original deck data for potential rollback
            const originalDeck = JSON.parse(JSON.stringify(deck)); // Deep copy

            // Reset deck-level stats
            deck.lastStudied = null;
            deck.totalCorrect = 0;
            deck.totalIncorrect = 0;
            deck.sessionHistory = [];

            // Reset history for each question
            if (Array.isArray(deck.questions)) {
                deck.questions.forEach(q => {
                    if (q && typeof q === 'object') {
                        q.history = []; // Clear history array
                    }
                });
            }

            // Attempt to save the changes
            if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                 // Rollback if save fails
                 appState.allDecks[deckId] = originalDeck;
                 console.error("Failed to save history reset to LocalStorage. Operation rolled back in memory.");
                 showNotification("学習履歴の保存に失敗しました。リセットはキャンセルされました。", "error", 6000);
                 return; // Stop execution
            }

            // Success
            console.log("History reset for deck:", deckId);
            showNotification(`問題集「${deckName}」の学習履歴をリセットしました。`, "success");

            // Update relevant UI elements
            updateTopScreenDisplay(); // Reflects reset stats
            updateDeckListUI(); // Reflects reset stats in list view
            updateFilteredQuestionCount(); // Recalculate filter count
            // updateStudyButtonsState(); // Called by updateFilteredQuestionCount

            // If on dashboard viewing this deck, re-render it
            if (appState.currentDashboardDeckId === deckId && appState.activeScreen === 'dashboard-screen') {
                 renderDashboard();
            }

        } catch (error) {
            console.error("Error resetting history for deck:", deckId, error);
            showNotification(`学習履歴のリセット中に予期せぬエラーが発生しました: ${error.message}`, "error");
        }
    }
}


// ====================================================================
// 学習フロー (Study Flow)
// ====================================================================

/** 学習セッションを開始する */
function startStudy() {
    if (!appState.currentDeckId || !appState.allDecks[appState.currentDeckId]) {
        showNotification('学習を開始する問題集を選択してください。', 'warning');
        return;
    }
    const currentDeck = appState.allDecks[appState.currentDeckId];
    let filteredList;
    try {
        filteredList = getFilteredStudyList(); // Get questions based on filter
        console.log(`startStudy: Filter '${appState.studyFilter}' generated ${filteredList.length} questions for deck '${currentDeck.name}'`);
    } catch (error) {
        console.error("startStudy: Error getting filtered list:", error);
        showNotification("学習リストの生成中にエラーが発生しました。", "error");
        return;
    }

    // Validate the filtered list
    if (!Array.isArray(filteredList)) {
         console.error("startStudy: Filtered list is not an array after generation!", filteredList);
         showNotification("学習リストの形式が不正です。", "error");
         return;
    }
    if (filteredList.length === 0) {
        // Get filter label for the notification
        let filterLabel = "選択されたフィルター条件";
        const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
        if (selectedRadio) {
             const labelElement = document.querySelector(`label[for="${selectedRadio.id}"]`);
             if(labelElement) {
                 const labelText = labelElement.querySelector('span')?.textContent || labelElement.textContent;
                 filterLabel = `「${labelText.trim()}」フィルター`;
             }
        }
        showNotification(`${filterLabel}に該当する問題がありません。`, 'warning');
        return;
    }

    // Prepare the study list (copy and shuffle if needed)
    appState.studyList = [...filteredList]; // Create a new array instance
    if (appState.settings.shuffleOptions) { // ★ Mistake in V2: was shuffling options, should shuffle question order
        appState.studyList = shuffleArray(appState.studyList);
        console.log("startStudy: Study question list shuffled.");
    }

    // Reset session state for the new session
    appState.currentQuestionIndex = 0;
    appState.stats.currentSessionCorrect = 0;
    appState.stats.currentSessionIncorrect = 0;
    console.log("Session stats reset for new study session.");


    // Update UI for study screen
    if (dom.studyScreenTitle) {
        dom.studyScreenTitle.textContent = `学習中: ${currentDeck.name || '名称未設定'}`;
    }
    // Ensure correct initial UI state for study screen elements
    if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';
    if(dom.quitStudyButton) dom.quitStudyButton.style.display = 'inline-block'; // Show quit button
    if(dom.studyCard) dom.studyCard.style.display = 'block'; // Show question card
    if(dom.evaluationControls) dom.evaluationControls.style.display = 'none'; // Hide eval initially
    if(dom.answerArea) dom.answerArea.style.display = 'none'; // Hide answer initially

    // Navigate and display first question
    navigateToScreen('study-screen');
    console.log(`startStudy: Starting session with ${appState.studyList.length} questions.`);
    displayCurrentQuestion();
}

/** 現在のインデックスの問題を画面に表示する */
function displayCurrentQuestion() {
    console.log(`displayCurrentQuestion - Index: ${appState.currentQuestionIndex}, List length: ${appState.studyList?.length}`);

    // Check for necessary DOM elements
    const requiredElements = ['questionCounter', 'questionText', 'optionsButtonsContainer', 'answerArea', 'evaluationControls', 'studyCard', 'feedbackMessage', 'retryButton'];
    const missingElements = requiredElements.filter(key => !dom[key] || !document.body.contains(dom[key]));
    if (missingElements.length > 0) {
        console.error(`displayCurrentQuestion: Critical UI elements missing: ${missingElements.join(', ')}`);
        showNotification("学習画面の表示に必要な要素が見つかりません。ホーム画面に戻ります。", "error", 8000);
        resetStudyState(); // Clean up study state
        navigateToScreen('home-screen'); // Navigate away
        return;
    }

    // Check if the study list and index are valid
    if (!Array.isArray(appState.studyList) || appState.studyList.length === 0 || appState.currentQuestionIndex < 0 || appState.currentQuestionIndex >= appState.studyList.length) {
        console.warn("displayCurrentQuestion: Invalid studyList or index. Ending study session.", appState.studyList, appState.currentQuestionIndex);
        showStudyCompletion(); // Show completion screen as there are no more valid questions
        return;
    }

    const questionData = appState.studyList[appState.currentQuestionIndex];

    // Validate the current question data structure
    if (!questionData || typeof questionData !== 'object' || !questionData.question || !Array.isArray(questionData.options) || questionData.options.length < 2 || !questionData.correctAnswer) {
        console.error(`displayCurrentQuestion: Invalid or incomplete question data at index ${appState.currentQuestionIndex}. Skipping.`, questionData);
        showNotification(`問題 ${appState.currentQuestionIndex + 1} のデータが不正なためスキップします。`, "warning", 5000);
        appState.currentQuestionIndex++; // Move to the next index
        // Immediately try to display the next question
        // Use setTimeout to avoid potential call stack issues if many questions are invalid
        setTimeout(displayCurrentQuestion, 0);
        return;
    }

    console.log("displayCurrentQuestion: Displaying question:", questionData.id);

    try {
        // Reset UI state for the new question
        dom.answerArea.style.display = 'none';
        dom.evaluationControls.style.display = 'none';
        dom.feedbackMessage.textContent = '';
        dom.feedbackMessage.className = 'feedback-message'; // Reset feedback style
        dom.studyCard.classList.remove('correct-answer', 'incorrect-answer'); // Reset card style
        dom.retryButton.style.display = 'none'; // Hide retry button
        if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable eval buttons

        // Update question counter and text
        dom.questionCounter.textContent = `${appState.currentQuestionIndex + 1} / ${appState.studyList.length}`;
        dom.questionText.textContent = questionData.question;

        // Clear and populate options
        dom.optionsButtonsContainer.innerHTML = ''; // Clear previous options
        dom.optionsButtonsContainer.setAttribute('aria-busy', 'true'); // Indicate loading

        // ★ Shuffle options if setting is enabled (correct implementation)
        const optionsSource = questionData.options;
        const optionsToDisplay = appState.settings.shuffleOptions
            ? shuffleArray([...optionsSource]) // Shuffle a copy
            : [...optionsSource]; // Use original order (still copy)


        if (!Array.isArray(optionsToDisplay)) {
             console.error("displayCurrentQuestion: Options became invalid after shuffle/copy.", optionsToDisplay);
             throw new Error("選択肢の準備に失敗しました。");
        }

        const fragment = document.createDocumentFragment();
        optionsToDisplay.forEach((optionText) => {
            const button = document.createElement('button');
            button.textContent = optionText;
            button.type = 'button';
            button.classList.add('button', 'option-button');
            button.dataset.optionValue = optionText; // Store original value for checking answer
            fragment.appendChild(button);
        });
        dom.optionsButtonsContainer.appendChild(fragment);
        dom.optionsButtonsContainer.removeAttribute('aria-busy'); // Done loading

        // Prepare answer and explanation text (but keep them hidden initially)
        dom.answerText.textContent = questionData.correctAnswer || '正解情報なし';
        dom.explanationText.textContent = questionData.explanation || '解説はありません。';

        // Focus the first option button for accessibility
        const firstOptionButton = dom.optionsButtonsContainer.querySelector('.option-button');
        if (firstOptionButton) {
             // Use setTimeout to ensure focus works after rendering
             setTimeout(() => firstOptionButton.focus(), 0);
        }

    } catch (uiError) {
         console.error("Error updating study UI:", uiError);
         showNotification(`問題の表示中にエラーが発生しました: ${uiError.message}`, "error");
         resetStudyState();
         navigateToScreen('home-screen');
         return;
    }
    console.log(`displayCurrentQuestion END - UI updated for question ${appState.currentQuestionIndex + 1}`);
}

/**
 * 選択肢ボタンがクリックされたときの処理 (イベント委任)
 * @param {MouseEvent} event
 */
function handleOptionButtonClick(event) {
    const clickedButton = event.target.closest('button.option-button');
    if (!clickedButton || clickedButton.disabled) {
        return; // Ignore clicks on disabled buttons or outside buttons
    }

    // Disable all option buttons immediately to prevent multiple clicks
    const allOptionButtons = dom.optionsButtonsContainer.querySelectorAll('.option-button');
    allOptionButtons.forEach(btn => btn.disabled = true);

    const selectedOption = clickedButton.dataset.optionValue;
    const questionData = appState.studyList?.[appState.currentQuestionIndex];

    // Ensure we have valid question data
    if (!questionData || !questionData.correctAnswer) {
        console.error("handleOptionSelect: Cannot get current question data or correct answer.");
        showNotification("解答処理中にエラーが発生しました。", "error");
        // Re-enable buttons? Or navigate away? Re-enabling might be confusing.
        allOptionButtons.forEach(btn => btn.disabled = false); // Re-enable for now
        return;
    }
    const correctAnswer = questionData.correctAnswer;

    // Process the submission
    handleAnswerSubmission(selectedOption, correctAnswer);
}

/**
 * 解答提出後の処理（正誤判定、UI更新、履歴記録準備）
 * @param {string} selectedOption ユーザーが選択した選択肢
 * @param {string} correctAnswer 正解の選択肢
 */
function handleAnswerSubmission(selectedOption, correctAnswer) {
     // Ensure required UI elements exist
     if (!dom.studyCard || !dom.feedbackMessage || !dom.answerArea || !dom.retryButton || !dom.evaluationControls || !dom.optionsButtonsContainer) {
        console.error("handleAnswerSubmission: Required UI elements for feedback are missing.");
        return; // Cannot proceed
    }
    const questionData = appState.studyList?.[appState.currentQuestionIndex];
    if (!questionData) {
        console.error("handleAnswerSubmission: Question data is missing for current index.");
        return; // Cannot proceed
    }

    const isCorrect = selectedOption === correctAnswer;

    // Update session stats (these are used for completion message AND session history)
    if (isCorrect) {
        appState.stats.currentSessionCorrect++;
        dom.studyCard.classList.remove('incorrect-answer'); // Ensure incorrect is removed
        dom.studyCard.classList.add('correct-answer');
        dom.feedbackMessage.textContent = '✨ 正解！ ✨';
        dom.feedbackMessage.className = 'feedback-message correct';
        dom.retryButton.style.display = 'none'; // Hide retry on correct
    } else {
        appState.stats.currentSessionIncorrect++;
        dom.studyCard.classList.remove('correct-answer'); // Ensure correct is removed
        dom.studyCard.classList.add('incorrect-answer');
        dom.feedbackMessage.textContent = '🤔 不正解... 正解は下に表示されています。';
        dom.feedbackMessage.className = 'feedback-message incorrect';
        dom.retryButton.style.display = 'inline-block'; // Show retry on incorrect
    }

    // Highlight correct/incorrect options visually
    dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
        const buttonOption = button.dataset.optionValue;
        button.classList.remove('success', 'danger'); // Reset first
        button.style.opacity = '1'; // Reset opacity

        if (buttonOption === correctAnswer) {
            button.classList.add('success'); // Mark correct green
        } else if (buttonOption === selectedOption) {
            button.classList.add('danger'); // Mark selected incorrect red
        } else {
            // Optionally fade out other incorrect options
            button.style.opacity = '0.6';
        }
    });

    // Show answer and explanation
    dom.answerText.textContent = correctAnswer || '正解情報なし';
    dom.explanationText.textContent = questionData.explanation || '解説はありません。';
    dom.answerArea.style.display = 'block';
    // Scroll to the answer smoothly
    dom.answerArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Show evaluation controls and focus the first one
    dom.evaluationControls.style.display = 'block'; // Use block instead of flex if it's just buttons
    const firstEvalButton = dom.evaluationControls.querySelector('.eval-button');
    if(firstEvalButton) {
         setTimeout(() => firstEvalButton.focus(), 0); // Timeout for focus
    }
}


/**
 * 理解度評価ボタンがクリックされたときの処理
 * @param {MouseEvent} event - クリックイベント
 */
function handleEvaluation(event) {
    const evalButton = event.target.closest('.eval-button');
    if (!evalButton || evalButton.disabled) return;

    const evaluation = evalButton.dataset.levelChange;
    // Validate evaluation value
    if (!evaluation || !['difficult', 'normal', 'easy'].includes(evaluation)) {
        console.warn("Invalid evaluation level on button:", evalButton);
        return;
    }

    // Disable all evaluation buttons to prevent multiple submissions
    if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = true);

    const deckId = appState.currentDeckId;
    const questionIndexInStudyList = appState.currentQuestionIndex;

    // --- Data Validation ---
    if (!deckId || !appState.allDecks[deckId]) {
        console.error("handleEvaluation: Current deck ID or deck data is invalid.");
        if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable on error
        return;
    }
    if (!Array.isArray(appState.studyList) || questionIndexInStudyList < 0 || questionIndexInStudyList >= appState.studyList.length) {
        console.error("handleEvaluation: Invalid studyList or index.", appState.studyList, questionIndexInStudyList);
        if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }
    const questionDataFromStudyList = appState.studyList[questionIndexInStudyList];
    const questionId = questionDataFromStudyList?.id;
    if (!questionId) {
        console.error("handleEvaluation: Question ID not found in the current study list item:", questionDataFromStudyList);
        if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }

    // Determine if the answer was correct (based on feedback message style)
    const isCorrect = dom.feedbackMessage?.classList.contains('correct') ?? false;

    // Find the corresponding question in the main deck data
    const deck = appState.allDecks[deckId];
    const questionInDeck = deck.questions.find(q => q.id === questionId);

    if (questionInDeck) {
        // Ensure history array exists
        if (!Array.isArray(questionInDeck.history)) {
            questionInDeck.history = [];
        }
        // Add new history entry
        questionInDeck.history.push({
            ts: Date.now(),
            correct: isCorrect,
            evaluation: evaluation // Store the selected evaluation
        });
        console.log(`History added for question ${questionId}: correct=${isCorrect}, evaluation=${evaluation}`);

        // Update cumulative stats (only if this evaluation corresponds to a new answer)
        // This logic was complex in V2. Let's simplify: Assume evaluation *always* follows an answer.
        // The stats (correct/incorrect) are updated in handleAnswerSubmission.
        // Here, we mainly update lastStudied.
        deck.lastStudied = Date.now();

        // Save the updated deck data
        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
            console.error("Failed to save history update to LocalStorage.");
            showNotification("学習履歴の保存に失敗しました。", "error");
            // Optionally rollback the history push?
            // questionInDeck.history.pop();
            if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false); // Re-enable on save failure
            return;
        }
    } else {
        // This should ideally not happen if data is consistent
        console.error(`handleEvaluation: Question with ID ${questionId} not found in deck ${deckId}. History not saved.`);
        showNotification("問題データの不整合が発生しました。履歴が保存できません。", "error");
        if (dom.evalButtons) dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }

    // Move to the next question or finish session
    appState.currentQuestionIndex++;
    if (appState.currentQuestionIndex < appState.studyList.length) {
        displayCurrentQuestion(); // Display the next question
    } else {
        showStudyCompletion(); // Show completion screen
    }
}


/** 学習セッション完了時の処理 */
function showStudyCompletion() {
    console.log("showStudyCompletion called. Session results:", appState.stats);

    // Ensure required UI elements exist
    const requiredElements = ['studyCompleteMessage', 'sessionCorrectCount', 'sessionIncorrectCount', 'studyCard', 'evaluationControls', 'quitStudyButton', 'backToTopButton'];
    const missingElements = requiredElements.filter(key => !dom[key] || !document.body.contains(dom[key]));
    if (missingElements.length > 0) {
        console.error(`showStudyCompletion: Required UI elements missing: ${missingElements.join(', ')}`);
        showNotification("学習完了画面の表示に必要な要素が見つかりません。", "error");
        resetStudyState(); // Clean up state
        navigateToScreen('home-screen'); // Navigate away
        return;
    }

    const deckId = appState.currentDeckId;
    // Save session history if the deck exists and questions were answered
    if (deckId && appState.allDecks[deckId]) {
         const deck = appState.allDecks[deckId];
         if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
         // Record session result only if questions were actually answered in this session
         if (appState.stats.currentSessionCorrect > 0 || appState.stats.currentSessionIncorrect > 0) {
             deck.sessionHistory.push({
                 ts: Date.now(), // Timestamp of completion
                 correct: appState.stats.currentSessionCorrect,
                 incorrect: appState.stats.currentSessionIncorrect
             });
             // Attempt to save the updated deck data with the new session history
             if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                  console.error("Failed to save session history to LocalStorage on completion.");
                  // Don't necessarily need to notify user about session history save failure
                  // showNotification("セッション履歴の保存に失敗しました。", "warning");
             } else {
                  console.log("Session history saved on completion for deck:", deckId);
             }
         } else {
            console.log("Skipping session history save on completion as no questions were answered in this session.");
         }
    } else {
        console.warn("showStudyCompletion: Could not save session history, current deck not found or invalid:", deckId);
    }

    // Hide study elements, show completion message
    dom.studyCard.style.display = 'none';
    dom.evaluationControls.style.display = 'none';
    dom.quitStudyButton.style.display = 'none'; // Hide quit button on completion

    // Display session results
    dom.sessionCorrectCount.textContent = appState.stats.currentSessionCorrect;
    dom.sessionIncorrectCount.textContent = appState.stats.currentSessionIncorrect;
    dom.studyCompleteMessage.style.display = 'block'; // Show completion message
    // Focus the completion message container or button for accessibility
    dom.studyCompleteMessage.focus();

    // Important: Reset the study list and index *after* saving session, preparing for next study
    resetStudyState();

    // Update home screen display as stats might have changed
    updateTopScreenDisplay();
    updateDeckListUI();
}

/** 現在の問題にもう一度挑戦する */
function retryCurrentQuestion() {
    // Ensure required UI elements exist
    if (!dom.answerArea || !dom.evaluationControls || !dom.feedbackMessage || !dom.studyCard || !dom.optionsButtonsContainer || !dom.retryButton) {
         console.error("retryCurrentQuestion: Missing required UI elements.");
         return;
    }
    // Check if there is a valid question to retry
    if (appState.currentQuestionIndex >= 0 && appState.currentQuestionIndex < appState.studyList?.length) {
        console.log("Retrying question:", appState.currentQuestionIndex + 1);

        // Adjust session stats (decrease incorrect count for this *attempt*)
        // This makes the completion message reflect only the *final* outcome of the question in the session.
        // Cumulative stats (totalCorrect/totalIncorrect) are handled by the *next* answer submission.
        if (!dom.feedbackMessage.classList.contains('correct')) { // Only decrement if it was marked incorrect
            appState.stats.currentSessionIncorrect = Math.max(0, appState.stats.currentSessionIncorrect - 1);
            console.log("Session stats adjusted for retry (incorrect decremented):", appState.stats);
        }

        // Reset UI to the state before answering
        dom.answerArea.style.display = 'none';
        dom.evaluationControls.style.display = 'none';
        dom.feedbackMessage.textContent = '';
        dom.feedbackMessage.className = 'feedback-message'; // Reset feedback style
        dom.studyCard.classList.remove('correct-answer', 'incorrect-answer'); // Reset card style
        dom.retryButton.style.display = 'none'; // Hide retry button itself

        // Re-enable and reset option buttons
        dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
            button.disabled = false;
            button.classList.remove('success', 'danger'); // Remove result highlighting
            button.style.opacity = '1'; // Restore full opacity
        });

        // Focus the first option button again
        const firstOptionButton = dom.optionsButtonsContainer.querySelector('.option-button');
        if (firstOptionButton) {
             setTimeout(() => firstOptionButton.focus(), 0);
        }
    } else {
        console.warn("Cannot retry: Invalid question index or study list.");
    }
}

/**
 * 学習の中断を確認し、必要に応じて履歴とセッション統計を保存してホーム画面に戻る
 * @param {boolean} showConfirmation - confirmダイアログを表示するかどうか (ナビゲーションやヘッダークリックからの呼び出しではfalse)
 * @returns {boolean} 中断処理が進行した(または確認不要だった)場合はtrue, ユーザーがキャンセルした場合はfalse
 */
function confirmQuitStudy(showConfirmation = true) {
    let quitConfirmed = false;

    if (showConfirmation) {
        // ★ 確認メッセージを更新: セッション統計も保存されることを明記
        quitConfirmed = confirm("現在の学習セッションを中断してホーム画面に戻りますか？\n\nここまでの解答履歴とセッション統計（正解/不正解数）は保存され、学習推移グラフに反映されます。\n\nよろしいですか？");
    } else {
        // 確認不要の場合（ナビゲーションなど）は常に中断処理を進める
        quitConfirmed = true;
    }


    if (quitConfirmed) {
        console.log("Processing study quit/interruption...");

        const deckId = appState.currentDeckId;
        // V2.2: Save session stats on interrupt
        let deckDataChanged = false; // Flag to track if deck data needs saving

        // --- Session History Saving Logic ---
        const sessionCorrect = appState.stats.currentSessionCorrect;
        const sessionIncorrect = appState.stats.currentSessionIncorrect;

        // Save session history if the deck exists and questions were answered
        if ((sessionCorrect > 0 || sessionIncorrect > 0) && deckId && appState.allDecks[deckId]) {
             const deck = appState.allDecks[deckId];
             if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
             deck.sessionHistory.push({
                 ts: Date.now(), // Timestamp of interruption
                 correct: sessionCorrect,
                 incorrect: sessionIncorrect
             });
             deck.lastStudied = Date.now(); // Update last studied on interrupt too
             console.log(`Session history added on quit for deck ${deckId}: Correct=${sessionCorrect}, Incorrect=${sessionIncorrect}`);
             deckDataChanged = true; // Mark data as changed for saving
        } else {
             console.log("Skipping session history save on quit: No questions answered or deck not found/invalid.");
        }

        // --- Save Deck Data (if changed) ---
        if (deckDataChanged) {
             if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                  console.error("Failed to save deck data (session history) on quit.");
                  showNotification("中断時のセッション統計の保存に失敗しました。", "error");
                  // Proceed with quit even if save fails, state might be inconsistent
             } else {
                  console.log("Deck data saved successfully on quit.");
             }
        }

        // --- Reset Study State and UI ---
        resetStudyState(); // Resets list and index

        // Reset Study Screen UI elements to their default state
        if(dom.studyCard) dom.studyCard.style.display = 'block'; // Show card area (though empty)
        if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
        if(dom.answerArea) dom.answerArea.style.display = 'none';
        if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';
        if(dom.quitStudyButton) dom.quitStudyButton.style.display = 'none'; // Hide quit button
        if(dom.questionText) dom.questionText.textContent = ''; // Clear question text
        if(dom.questionCounter) dom.questionCounter.textContent = ''; // Clear counter
        if(dom.optionsButtonsContainer) dom.optionsButtonsContainer.innerHTML = ''; // Clear options

        // Navigate to Home Screen if confirmation was shown (otherwise handled by caller)
        if (showConfirmation) {
            navigateToScreen('home-screen');
            showNotification("学習を中断しました。ここまでの統計は保存されました。", "info", 3500);
        }

        // Update potentially changed home screen info
        updateTopScreenDisplay();
        updateDeckListUI();

        return true; // Quit processed
    } else {
        console.log("Study quit cancelled by user.");
        return false; // User cancelled
    }
}


/** 学習完了画面からホーム画面に戻る */
function handleBackToTop() {
    console.log("Returning to home screen from completion screen.");
    navigateToScreen('home-screen');
}

/** 学習セッションの状態(リストとインデックス)をリセットする */
function resetStudyState() {
    appState.studyList = [];
    appState.currentQuestionIndex = -1;
    // Session stats (currentSessionCorrect/Incorrect) are NOT reset here.
    // They are reset at the *start* of the next session in startStudy()
    // or cleared when saving session history on completion/quit.
    console.log("Study state reset (list and index cleared). Session stats remain until next use.");
}


// ====================================================================
// 学習フィルター関連処理 (Study Filter Handling)
// ====================================================================

/** ホーム画面の学習フィルターラジオボタンが変更されたときのハンドラ */
function handleStudyFilterChange(event) {
    // Ensure the event target is a checked radio button within the filter group
    if (event.target.checked && event.target.name === 'study-filter') {
        appState.studyFilter = event.target.value;
        console.log("Study filter changed to:", appState.studyFilter);
        updateFilteredQuestionCount(); // Update count and button state
    }
}

/**
 * 現在選択されているデッキとフィルターに基づいて、学習対象の問題リストを取得する
 * @returns {QuestionData[]} フィルターされた問題データの配列 (常に配列を返す)
 */
function getFilteredStudyList() {
    const deckId = appState.currentDeckId;
    // Validate deck existence and questions array
    if (!deckId || !appState.allDecks[deckId] || !Array.isArray(appState.allDecks[deckId].questions)) {
        console.warn("getFilteredStudyList: Current deck or questions not available, returning empty array.");
        return [];
    }

    const questions = appState.allDecks[deckId].questions;
    const filter = appState.studyFilter;
    const lowThreshold = appState.settings.lowAccuracyThreshold; // Use setting value

    console.log(`getFilteredStudyList: Applying filter "${filter}" with threshold <= ${lowThreshold}% to ${questions.length} questions.`);

    try {
        let filteredQuestions;
        switch (filter) {
            case 'lowAccuracy':
                filteredQuestions = questions.filter(q => {
                    const history = q.history || [];
                    if (history.length === 0) return false; // Needs history to calculate accuracy
                    const correctCount = history.filter(h => h.correct).length;
                    const accuracy = Math.round((correctCount / history.length) * 100);
                    return accuracy <= lowThreshold; // Use threshold from settings
                });
                break;
            case 'incorrect':
                filteredQuestions = questions.filter(q => {
                    const history = q.history || [];
                    // Check the very last entry in history
                    return history.length > 0 && history[history.length - 1].correct === false;
                });
                break;
            case 'unanswered':
                filteredQuestions = questions.filter(q => !q.history || q.history.length === 0);
                break;
            case 'difficult':
            case 'normal':
            case 'easy':
                 filteredQuestions = questions.filter(q => {
                     const history = q.history || [];
                     // Check the evaluation of the very last entry
                     return history.length > 0 && history[history.length - 1].evaluation === filter;
                 });
                break;
            case 'all':
            default: // Default to 'all' if filter value is unknown
                filteredQuestions = [...questions]; // Return a copy of all questions
                break;
        }

        // Ensure the result is always an array
        if (!Array.isArray(filteredQuestions)) {
            console.error(`getFilteredStudyList: Filtering result was not an array for filter "${filter}". Falling back to an empty array.`);
            return [];
        }

        console.log(`getFilteredStudyList (Filter: ${filter}): Returning ${filteredQuestions.length} questions.`);
        return filteredQuestions;

    } catch (error) {
        // Catch potential errors during filtering (e.g., unexpected data in history)
        console.error(`Error in getFilteredStudyList with filter "${filter}":`, error);
        showNotification("フィルター処理中にエラーが発生しました。", "error");
        return []; // Return empty array on error
    }
}

/** ホーム画面の「対象問題数」表示を更新し、学習開始ボタンの状態も更新する */
function updateFilteredQuestionCount() {
    // Check if the necessary elements exist
    if (!dom.filteredQuestionCount || !dom.studyFilterOptions) {
        // Even if count display is missing, update button state
        updateStudyButtonsState();
        return;
    }

    // If filter options are hidden (no deck selected), clear count and update button
    if (dom.studyFilterOptions.style.display === 'none') {
         dom.filteredQuestionCount.textContent = '';
         updateStudyButtonsState();
         return;
    }

    // Get the filtered list and update the display
    try {
        const filteredList = getFilteredStudyList();
        dom.filteredQuestionCount.textContent = `対象問題数: ${filteredList.length}問`;
    } catch (error) {
        console.error("Error updating filtered question count:", error);
        dom.filteredQuestionCount.textContent = "対象問題数: エラー";
    } finally {
        // Always update the button state after attempting to get the count
        updateStudyButtonsState();
    }
}


// ====================================================================
// 設定関連処理 (Settings Handling)
// ====================================================================

/** 現在のアプリ設定を設定画面のUIに反映させる */
function loadSettingsToUI() {
    if (!dom.settingsContainer) return; // Exit if settings screen elements aren't cached
    try {
        // Shuffle Options Checkbox
        if (dom.settingShuffleOptions) {
            dom.settingShuffleOptions.checked = appState.settings.shuffleOptions;
        } else {
             console.warn("Shuffle options checkbox not found in DOM.");
        }

        // Low Accuracy Threshold Input
        if (dom.settingLowAccuracyThreshold) {
            dom.settingLowAccuracyThreshold.value = appState.settings.lowAccuracyThreshold;
        } else {
             console.warn("Low accuracy threshold input not found in DOM.");
        }

        // Also update the threshold display on the home screen filter label
        if (dom.lowAccuracyThresholdDisplayFilter) {
             dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
        }

    } catch (error) {
        console.error("Error loading settings to UI:", error);
        showNotification("設定のUIへの反映中にエラーが発生しました。", "error");
    }
}

/** 設定画面での変更内容をアプリ状態とLocalStorageに保存する */
function saveSettings() {
    if (!dom.settingsContainer) return;
    const statusElement = dom.settingsSaveStatus;
    // Reset status message
    if (statusElement) {
        statusElement.textContent = '';
        statusElement.className = 'status-message';
    }

    try {
        let settingsChanged = false;
        const originalSettings = { ...appState.settings }; // Backup original
        const newSettings = { ...appState.settings }; // Create copy to modify

        // 1. Read Shuffle Options
        if (dom.settingShuffleOptions) {
            newSettings.shuffleOptions = dom.settingShuffleOptions.checked;
        }

        // 2. Read and Validate Low Accuracy Threshold
        let thresholdValid = true;
        if (dom.settingLowAccuracyThreshold) {
            const thresholdInput = dom.settingLowAccuracyThreshold.value;
            const threshold = parseInt(thresholdInput, 10);

            if (isNaN(threshold) || threshold < 1 || threshold > 99) {
                thresholdValid = false;
                // Revert input to current setting value on validation failure
                dom.settingLowAccuracyThreshold.value = appState.settings.lowAccuracyThreshold;
                showNotification('「苦手な問題」の閾値は1から99の間の整数で設定してください。元の値に戻しました。', 'warning', 5000);
            } else {
                 newSettings.lowAccuracyThreshold = threshold; // Use validated integer
            }
        } else {
             console.warn("Low accuracy threshold input not found for saving.");
             thresholdValid = false; // Cannot save if input missing
        }

        // 3. Check if settings actually changed (only if threshold was valid)
        if (thresholdValid && JSON.stringify(newSettings) !== JSON.stringify(appState.settings)) {
             settingsChanged = true;
             appState.settings = newSettings; // Update app state
        }

        // 4. Save to LocalStorage if changed
        if (settingsChanged) {
            if (saveData(LS_KEYS.SETTINGS, appState.settings)) {
                console.log("Settings saved:", appState.settings);
                // Update UI elements affected by settings change
                loadSettingsToUI(); // Re-apply to settings screen
                updateFilteredQuestionCount(); // Update home screen filter count/button
                // Update dashboard threshold displays if dashboard is visible? (Might be overkill)

                if (statusElement) {
                    statusElement.textContent = '設定を保存しました。';
                    statusElement.className = 'status-message success';
                }
                showNotification('設定を保存しました。', 'success');
            } else {
                 // Save failed, revert app state
                 appState.settings = originalSettings;
                 loadSettingsToUI(); // Revert UI
                 if (statusElement) {
                    statusElement.textContent = '設定の保存に失敗しました。';
                    statusElement.className = 'status-message error';
                 }
                 // Notification about failure is shown by saveData
            }
        } else if (thresholdValid) {
            // No changes detected (and threshold was valid)
            console.log("Settings not saved, no changes detected.");
            if (statusElement) {
                 statusElement.textContent = '変更はありませんでした。';
                 statusElement.className = 'status-message info';
            }
            showNotification('設定に変更はありませんでした。', 'info', 2500);
        }
        // If threshold was invalid, a notification was already shown.

        // Clear status message after a delay
        setTimeout(() => {
            if (statusElement) {
                statusElement.textContent = '';
                statusElement.className = 'status-message';
            }
        }, 3500);

    } catch (error) {
        console.error("Error saving settings:", error);
        if (statusElement) {
            statusElement.textContent = '設定の保存中にエラーが発生しました。';
            statusElement.className = 'status-message error';
        }
        showNotification('設定の保存中に予期せぬエラーが発生しました。', 'error');
    }
}

// ====================================================================
// AIプロンプトコピー機能 (AI Prompt Copy)
// ====================================================================
/** AI問題生成ガイド画面のプロンプトテキストをクリップボードにコピーする */
function copyPromptToClipboard() {
    const statusElement = dom.copyStatus;
    const button = dom.copyPromptButton;
    if (statusElement) statusElement.textContent = ''; // Clear previous status

    // Check for Clipboard API support
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showNotification('お使いのブラウザはクリップボード機能に対応していません。手動でコピーしてください。', 'warning', 5000);
        if (statusElement) {
            statusElement.textContent = 'ブラウザ未対応';
            statusElement.className = 'status-message warning';
        }
        return;
    }

    // Check if prompt text element exists
    if (!dom.promptText) {
         showNotification('コピー対象のプロンプト要素が見つかりません。', 'error');
         if (statusElement) {
            statusElement.textContent = 'コピー対象なし';
            statusElement.className = 'status-message error';
         }
         return;
    }

    const prompt = dom.promptText.textContent || '';
    if (!prompt.trim()) {
         showNotification('コピーするプロンプト内容が空です。', 'warning');
         if (statusElement) {
            statusElement.textContent = '内容が空です';
            statusElement.className = 'status-message warning';
         }
         return;
    }

    // Disable button temporarily
    if (button) button.disabled = true;

    navigator.clipboard.writeText(prompt)
        .then(() => {
            // Success
            if (statusElement) {
                statusElement.textContent = 'コピーしました！';
                statusElement.className = 'status-message success';
                // Clear message after delay
                setTimeout(() => { if(dom.copyStatus) { dom.copyStatus.textContent = ''; dom.copyStatus.className = 'status-message'; } }, 2500);
            }
            showNotification('プロンプトをクリップボードにコピーしました。', 'success', 2500);
        })
        .catch(err => {
            // Error
            console.error('Failed to copy prompt to clipboard: ', err);
            if (statusElement) {
                statusElement.textContent = 'コピー失敗';
                statusElement.className = 'status-message error';
            }
            showNotification('プロンプトのコピーに失敗しました。手動でコピーしてください。', 'error', 5000);
        })
        .finally(() => {
             // Re-enable button regardless of outcome
             if (button) button.disabled = false;
        });
}


// ====================================================================
// ダッシュボード関連処理 (Dashboard Handling)
// ====================================================================

/** ダッシュボード画面のデッキ選択ドロップダウンを生成・更新する */
function populateDashboardDeckSelect() {
    if (!dom.dashboardDeckSelect) return;
    const select = dom.dashboardDeckSelect;
    // Store the currently selected value (in state or from dropdown)
    const previouslySelectedValue = appState.currentDashboardDeckId || select.value;

    // Clear existing options except the placeholder
    select.innerHTML = '<option value="">-- 問題集を選択してください --</option>';

    const deckIds = Object.keys(appState.allDecks);

    // Sort deck IDs alphabetically by name for the dropdown
    deckIds.sort((a, b) => {
        const nameA = appState.allDecks[a]?.name || '';
        const nameB = appState.allDecks[b]?.name || '';
        return nameA.localeCompare(nameB, 'ja'); // Use localeCompare for proper sorting
    });

    const fragment = document.createDocumentFragment();
    deckIds.forEach(deckId => {
        const deck = appState.allDecks[deckId];
        if (deck) { // Check if deck data actually exists
            const option = document.createElement('option');
            option.value = deckId;
            option.textContent = `${deck.name || '名称未設定'} (${deck.questions?.length || 0}問)`;
            fragment.appendChild(option);
        }
    });
    select.appendChild(fragment);

    // Restore previous selection if possible
    if (previouslySelectedValue && appState.allDecks[previouslySelectedValue]) {
         select.value = previouslySelectedValue;
         // Ensure state matches the restored value
         appState.currentDashboardDeckId = previouslySelectedValue;
    } else {
         // If previous selection is invalid or none, reset state
         select.value = "";
         appState.currentDashboardDeckId = null;
    }
}

/** ダッシュボードのデッキ選択が変更されたときのハンドラ */
function handleDashboardDeckChange() {
    if (!dom.dashboardDeckSelect) return;
    const selectedDeckId = dom.dashboardDeckSelect.value;
    // Update state only if the selection actually changed
    if (selectedDeckId !== appState.currentDashboardDeckId) {
        appState.currentDashboardDeckId = selectedDeckId || null;
        console.log("Dashboard deck selection changed to:", appState.currentDashboardDeckId);

        // Reset filters and render the dashboard for the new deck
        resetDashboardFiltersAndState();
        renderDashboard(); // Re-render the entire dashboard content
    }
}

/** ダッシュボードの正答率フィルターが変更されたときのハンドラ */
function handleDashboardFilterChange() {
    if (!dom.dashboardFilterAccuracy) return;
    const newFilter = dom.dashboardFilterAccuracy.value;
    if (newFilter !== appState.dashboardFilterAccuracy) {
        appState.dashboardFilterAccuracy = newFilter;
        appState.dashboardCurrentPage = 1; // Reset to page 1 on filter change
        console.log("Dashboard filter changed to:", appState.dashboardFilterAccuracy);
        renderDashboardQuestionAnalysis(); // Re-render only the analysis section
    }
}

/** ダッシュボードの検索入力が変更されたときのハンドラ (Input event) */
function handleDashboardSearchInput() {
    if (!dom.dashboardSearchQuery || !dom.dashboardSearchButton) return;
    // Update state immediately as user types
    const query = dom.dashboardSearchQuery.value.trim();
    // Only update state if value actually changed (prevents unnecessary updates)
    if (query !== appState.dashboardSearchQuery) {
        appState.dashboardSearchQuery = query;
        // Enable/disable search button based on query presence
        dom.dashboardSearchButton.disabled = appState.dashboardSearchQuery === '';
        // Optionally trigger search on input clearing if needed, but typically explicit search is better
        // if (query === '' && appState.dashboardSearchQuery !== '') {
        //     clearDashboardSearch();
        // }
    }
}

/** ダッシュボードの検索ボタンがクリックされたときのハンドラ */
function applyDashboardSearch() {
    console.log("Applying dashboard search query:", appState.dashboardSearchQuery);
    // Check if button exists and is enabled (redundant if input handler works, but safe)
    if (!dom.dashboardSearchButton || dom.dashboardSearchButton.disabled) {
        return;
    }
    // Reset to page 1 and re-render analysis
    appState.dashboardCurrentPage = 1;
    renderDashboardQuestionAnalysis();
}

/** ダッシュボードの検索クリアボタンがクリックされたときのハンドラ */
function clearDashboardSearch() {
    // Clear input field
    if (dom.dashboardSearchQuery) {
        dom.dashboardSearchQuery.value = '';
    }
    // Disable search button
    if (dom.dashboardSearchButton) {
        dom.dashboardSearchButton.disabled = true;
    }
    // If the query was actually cleared, update state and re-render
    if (appState.dashboardSearchQuery !== '') {
         appState.dashboardSearchQuery = '';
         appState.dashboardCurrentPage = 1; // Reset page
         console.log("Dashboard search cleared.");
         renderDashboardQuestionAnalysis(); // Re-render analysis
    }
}

/** ダッシュボードのソート順が変更されたときのハンドラ */
function handleDashboardSortChange() {
    if (!dom.dashboardSortOrder) return;
    const newSortOrder = dom.dashboardSortOrder.value;
    if (newSortOrder !== appState.dashboardSortOrder) {
        appState.dashboardSortOrder = newSortOrder;
        appState.dashboardCurrentPage = 1; // Reset page on sort change
        console.log("Dashboard sort order changed to:", appState.dashboardSortOrder);
        renderDashboardQuestionAnalysis(); // Re-render analysis
    }
}

/**
 * ダッシュボードの問題分析表示モード（リスト/グラフ）を切り替える
 * @param {'list'|'chart'} mode - 設定するモード
 */
function setDashboardViewMode(mode) {
    if (mode !== 'list' && mode !== 'chart') return; // Invalid mode
    if (mode === appState.dashboardViewMode) return; // Already in this mode

    appState.dashboardViewMode = mode;
    console.log("Dashboard view mode set to:", mode);

    const isListMode = mode === 'list';

    // Update button appearance and aria states
    if (dom.viewModeList) {
        dom.viewModeList.classList.toggle('active', isListMode);
        dom.viewModeList.setAttribute('aria-pressed', String(isListMode));
    }
    if (dom.viewModeChart) {
        dom.viewModeChart.classList.toggle('active', !isListMode);
        dom.viewModeChart.setAttribute('aria-pressed', String(!isListMode));
    }

    // Toggle visibility of the view containers
    if (dom.questionListView) dom.questionListView.classList.toggle('active', isListMode);
    if (dom.questionChartView) dom.questionChartView.classList.toggle('active', !isListMode);

    // Re-render the analysis section to show the correct view
    renderDashboardQuestionAnalysis();
}

/** ダッシュボードのフィルター、ソート、ページング、表示モード等の状態をリセットする */
function resetDashboardFiltersAndState() {
    // Reset State Variables
    appState.dashboardFilterAccuracy = 'all';
    appState.dashboardSearchQuery = '';
    appState.dashboardSortOrder = 'accuracyAsc';
    appState.dashboardCurrentPage = 1;
    appState.dashboardViewMode = 'list'; // Default to list view

    // Reset UI Elements
    if (dom.dashboardFilterAccuracy) dom.dashboardFilterAccuracy.value = 'all';
    if (dom.dashboardSearchQuery) dom.dashboardSearchQuery.value = '';
    if (dom.dashboardSearchButton) dom.dashboardSearchButton.disabled = true;
    if (dom.dashboardSortOrder) dom.dashboardSortOrder.value = 'accuracyAsc';

    // Reset View Mode Buttons and Containers
    if (dom.viewModeList) {
        dom.viewModeList.classList.add('active');
        dom.viewModeList.setAttribute('aria-pressed', 'true');
    }
    if (dom.viewModeChart) {
        dom.viewModeChart.classList.remove('active');
        dom.viewModeChart.setAttribute('aria-pressed', 'false');
    }
    if (dom.questionListView) dom.questionListView.classList.add('active');
    if (dom.questionChartView) dom.questionChartView.classList.remove('active');

    // Close detail view if open
    closeQuestionDetailView();
    console.log("Dashboard filters and state reset to defaults.");
}

/**
 * ダッシュボード画面全体をレンダリングする
 */
async function renderDashboard() {
    const deckId = appState.currentDashboardDeckId;
    console.log("renderDashboard called for deck:", deckId);

    // Check for essential dashboard containers
    if (!dom.dashboardContent || !dom.dashboardNoDeckMessage) {
        console.error("renderDashboard: Dashboard container elements not found in DOM.");
        return;
    }

    // Handle case where no deck is selected or deck data is missing
    if (!deckId || !appState.allDecks[deckId]) {
        dom.dashboardContent.style.display = 'none';
        dom.dashboardNoDeckMessage.style.display = 'flex'; // Use flex for centered message
        console.log("renderDashboard: No deck selected or deck data not found.");
        // Destroy existing charts if any
        if (studyTrendsChart) { studyTrendsChart.destroy(); studyTrendsChart = null; }
        if (questionAccuracyChart) { questionAccuracyChart.destroy(); questionAccuracyChart = null; }
        return;
    }

    // Show content, hide "no deck" message
    dom.dashboardContent.style.display = 'block';
    dom.dashboardNoDeckMessage.style.display = 'none';
    const deck = appState.allDecks[deckId];

    // Double-check deck data consistency (should be handled by repair, but good practice)
    if (!deck) {
         console.error("renderDashboard: Deck data inconsistency. Deck object not found for ID:", deckId);
         dom.dashboardContent.style.display = 'none';
         dom.dashboardNoDeckMessage.style.display = 'flex';
         const messageSpan = dom.dashboardNoDeckMessage.querySelector('span'); // Assuming message is in a span
         if (messageSpan) messageSpan.textContent = "選択された問題集データの読み込みエラー";
         showNotification("選択された問題集データの読み込み中に予期せぬエラーが発生しました。", "error");
         return;
    }

    showLoadingOverlay(true); // Show loading indicator for rendering process
    try {
        // Render sections sequentially
        console.log("Rendering Dashboard Overview...");
        renderDashboardOverview(deck);

        console.log("Rendering Dashboard Trends Chart...");
        // Use await for async chart rendering if needed (though Chart.js is mostly sync)
        await renderDashboardTrendsChart(deck);

        console.log("Rendering Dashboard Question Analysis...");
        await renderDashboardQuestionAnalysis(); // This handles list/chart view internally

        console.log("Dashboard rendering process completed successfully for deck:", deckId);
    } catch (error) {
        console.error("Error during dashboard rendering process:", error);
        showNotification(`ダッシュボードの描画中にエラーが発生しました: ${error.message}`, "error", 7000);
        // Hide content and show error message on failure
        dom.dashboardContent.style.display = 'none';
        dom.dashboardNoDeckMessage.style.display = 'flex';
        const messageSpan = dom.dashboardNoDeckMessage.querySelector('span');
        if (messageSpan) messageSpan.textContent = "ダッシュボード表示エラー";

    } finally {
        showLoadingOverlay(false); // Hide loading indicator when done or on error
    }
}


/**
 * ダッシュボードの「概要」セクションをレンダリングする
 * @param {DeckData} deck - 表示対象のデッキデータ
 */
function renderDashboardOverview(deck) {
    const requiredKeys = ['dashboardDeckName', 'dashboardTotalQuestions', 'dashboardTotalAnswered', 'dashboardOverallAccuracy', 'dashboardLastStudied'];
    // Check if all required DOM elements for overview exist
    if (requiredKeys.some(key => !dom[key])) {
        console.warn("renderDashboardOverview: One or more overview DOM elements are missing.");
        // Optionally clear existing content or return
        // requiredKeys.forEach(key => { if (dom[key]) dom[key].textContent = '-'; });
        return;
    }

    try {
        // Safely access deck properties with defaults
        dom.dashboardDeckName.textContent = deck.name || '名称未設定';
        dom.dashboardTotalQuestions.textContent = deck.questions?.length ?? 0;

        const totalCorrect = deck.totalCorrect || 0;
        const totalIncorrect = deck.totalIncorrect || 0;
        const totalAnswered = totalCorrect + totalIncorrect;
        dom.dashboardTotalAnswered.textContent = totalAnswered;

        // Calculate and format overall accuracy
        const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : -1; // -1 indicates no data
        dom.dashboardOverallAccuracy.textContent = overallAccuracy >= 0
            ? `${overallAccuracy}% (${totalCorrect}/${totalAnswered})`
            : 'データなし';

        // Format last studied date
        dom.dashboardLastStudied.textContent = deck.lastStudied ? formatDate(deck.lastStudied) : '未学習';

    } catch (error) {
        console.error("Error rendering dashboard overview:", error);
        // Display error indicators in the UI if rendering fails
        if (dom.dashboardDeckName) dom.dashboardDeckName.textContent = "表示エラー";
        if (dom.dashboardOverallAccuracy) dom.dashboardOverallAccuracy.textContent = "エラー";
        // Clear other fields or show '-'
        if (dom.dashboardTotalQuestions) dom.dashboardTotalQuestions.textContent = '-';
        if (dom.dashboardTotalAnswered) dom.dashboardTotalAnswered.textContent = '-';
        if (dom.dashboardLastStudied) dom.dashboardLastStudied.textContent = '-';
    }
}

/**
 * ダッシュボードの「学習推移」グラフをレンダリングする (V2.1 積み上げ棒グラフ + セッション番号軸)
 * @param {DeckData} deck - 表示対象のデッキデータ
 */
async function renderDashboardTrendsChart(deck) {
    // Ensure Chart.js library is loaded (optional check)
    if (typeof Chart === 'undefined') {
        console.error("Chart.js library is not loaded.");
        showNotification("グラフ描画ライブラリが見つかりません。", "error");
        if(dom.studyTrendsNoData) {
             dom.studyTrendsNoData.textContent = "グラフ描画不可";
             dom.studyTrendsNoData.style.display = 'block';
        }
        if(dom.studyTrendsChartContainer) dom.studyTrendsChartContainer.style.display = 'none';
        return;
    }

    // Check for essential DOM elements
    if (!dom.studyTrendsChart || !dom.studyTrendsNoData || !dom.studyTrendsChartContainer) {
        console.warn("renderDashboardTrendsChart: Chart canvas, container, or no-data element missing.");
        return;
    }
    const canvas = dom.studyTrendsChart;
    const noDataMessage = dom.studyTrendsNoData;
    const container = dom.studyTrendsChartContainer;

    let ctx;
    try {
         ctx = canvas.getContext('2d');
         if (!ctx) throw new Error("Canvas 2D context is null.");
    } catch (e) {
        console.error("renderDashboardTrendsChart: Failed to get 2D context for trends chart canvas.", e);
        container.style.display = 'none'; // Hide container on context error
        noDataMessage.textContent = "グラフ描画エラー (Context取得失敗)";
        noDataMessage.style.display = 'block';
        return;
    }

    // Destroy previous chart instance if it exists
    if (studyTrendsChart instanceof Chart) { // Check if it's a Chart instance
        try {
             studyTrendsChart.destroy();
             studyTrendsChart = null;
             console.log("Previous study trends chart instance destroyed.");
        } catch(destroyError) {
            console.error("Error destroying previous trends chart:", destroyError);
            // Continue even if destroy fails, might leak memory
        }
    }

    // Get session history, limited to the most recent ones
    const sessionHistory = (Array.isArray(deck.sessionHistory) ? deck.sessionHistory : [])
                           .slice(-DASHBOARD_TREND_SESSIONS);

    // Handle case with no data
    if (sessionHistory.length === 0) {
        container.style.display = 'block'; // Show container
        canvas.style.display = 'none';    // Hide canvas
        noDataMessage.textContent = "学習セッション履歴がありません。";
        noDataMessage.style.display = 'block'; // Show message
        console.log("renderDashboardTrendsChart: No session history data available.");
        return;
    }

    // Prepare UI for chart display
    container.style.display = 'block'; // Show container
    canvas.style.display = 'block';    // Show canvas
    noDataMessage.style.display = 'none'; // Hide no-data message

    // --- Data Preparation ---
    const totalSessions = deck.sessionHistory?.length || 0; // Total sessions in the deck
    const startSessionIndex = Math.max(0, totalSessions - sessionHistory.length); // Starting index for labels
    const labels = sessionHistory.map((h, index) => `セッション ${startSessionIndex + index + 1}`); // X-axis labels (Session number)
    const timestamps = sessionHistory.map(h => h.ts); // Tooltip timestamps
    const correctData = sessionHistory.map(h => h.correct || 0);
    const incorrectData = sessionHistory.map(h => h.incorrect || 0);
    const accuracyData = sessionHistory.map(h => {
        const total = (h.correct || 0) + (h.incorrect || 0);
        return total > 0 ? Math.round(((h.correct || 0) / total) * 100) : 0;
    });

    // --- Chart Configuration ---
    const chartConfig = {
        type: 'bar', // Base type is bar chart
        data: {
            labels: labels,
            datasets: [
                {
                    label: '正解数',
                    data: correctData,
                    backgroundColor: 'rgba(46, 204, 113, 0.7)', // Success Green
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1,
                    stack: 'counts', // Group for stacking bars
                    yAxisID: 'yCounts', // Use left Y-axis
                    order: 2 // Render after accuracy line
                },
                {
                    label: '不正解数',
                    data: incorrectData,
                    backgroundColor: 'rgba(231, 76, 60, 0.7)', // Danger Red
                    borderColor: 'rgba(231, 76, 60, 1)',
                    borderWidth: 1,
                    stack: 'counts', // Group for stacking bars
                    yAxisID: 'yCounts', // Use left Y-axis
                    order: 3 // Render last
                },
                {
                    label: '正答率 (%)',
                    data: accuracyData,
                    borderColor: 'rgba(52, 152, 219, 1)', // Primary Blue
                    backgroundColor: 'rgba(52, 152, 219, 0.1)', // Light blue fill
                    yAxisID: 'yAccuracy', // Use right Y-axis
                    type: 'line', // Override type for this dataset
                    tension: 0.2, // Slight curve
                    fill: false, // Don't fill area under line by default
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    order: 1 // Render first (on top)
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index', // Show tooltips for all datasets at the same index
                intersect: false // Show tooltips even if not directly hovering over point/bar
            },
            plugins: {
                tooltip: {
                    mode: 'index', // Ensure tooltip mode matches interaction mode
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { weight: 'bold' },
                    bodySpacing: 5,
                    padding: 10,
                    callbacks: {
                        // Tooltip Title (e.g., "セッション 5")
                        title: function(tooltipItems) {
                            return tooltipItems[0]?.label || '';
                        },
                        // Tooltip Body Lines (one per dataset)
                        label: function(context) {
                             let label = context.dataset.label || '';
                             if (label) {
                                 label += ': ';
                             }
                             if (context.parsed.y !== null) {
                                 // Add unit based on axis ID
                                 if (context.dataset.yAxisID === 'yAccuracy') {
                                     label += `${context.parsed.y}%`;
                                 } else {
                                     label += `${context.parsed.y} 問`;
                                 }
                             }
                             return label;
                        },
                         // Tooltip Footer (display timestamp)
                         footer: function(tooltipItems) {
                             const index = tooltipItems[0]?.dataIndex;
                             if (index !== undefined && timestamps[index]) {
                                 return `日時: ${formatDate(timestamps[index])}`;
                             }
                             return '';
                         }
                    }
                },
                legend: {
                    position: 'bottom', // Place legend at the bottom
                    labels: {
                         padding: 20,
                         usePointStyle: true // Use point style markers for legend items
                    }
                },
                 title: { // Optional chart title
                     display: false, // Set to true to show title
                     // text: '学習セッションの推移'
                 }
            },
            scales: {
                x: {
                    stacked: true, // Enable stacking on X-axis for bars
                    title: {
                        display: true,
                        text: '学習セッション' // X-axis title
                    },
                    grid: {
                        display: false // Hide vertical grid lines
                    }
                },
                yCounts: { // Left Y-axis (Counts)
                    type: 'linear',
                    position: 'left',
                    stacked: true, // Enable stacking on Y-axis
                    beginAtZero: true, // Start axis at 0
                    title: {
                        display: true,
                        text: '問題数' // Y-axis title
                    },
                    grid: {
                        color: '#e0e0e0' // Color for horizontal grid lines
                    },
                    ticks: { // Ensure integer ticks
                         precision: 0,
                         // suggest a max slightly above the max stacked value
                         // suggestedMax: Math.max(...correctData.map((c, i) => c + incorrectData[i])) + 5,
                         stepSize: 1 // Or dynamic step size
                    }
                },
                yAccuracy: { // Right Y-axis (Accuracy %)
                    type: 'linear',
                    position: 'right',
                    min: 0, // Min accuracy is 0%
                    max: 100, // Max accuracy is 100%
                    title: {
                        display: true,
                        text: '正答率 (%)' // Y-axis title
                    },
                    grid: {
                        drawOnChartArea: false // Don't draw grid lines for this axis over the chart
                    },
                    ticks: {
                        stepSize: 20 // Ticks every 20%
                    }
                }
            }
        }
    };

    // --- Render Chart ---
    try {
        // Use requestAnimationFrame to ensure rendering happens smoothly
        requestAnimationFrame(() => {
             // Double-check canvas exists before creating chart (might be removed by navigation)
             if (document.getElementById(canvas.id)) {
                studyTrendsChart = new Chart(ctx, chartConfig);
                console.log("Study trends chart rendered successfully (stacked bar + line).");
             } else {
                console.warn("Study trends chart canvas removed before chart creation.");
             }
        });
    } catch (chartError) {
         console.error("Error creating study trends chart:", chartError);
         showNotification("学習推移グラフの描画中にエラーが発生しました。", "error");
         // Hide canvas and show error message if chart creation fails
         canvas.style.display = 'none';
         noDataMessage.textContent = "グラフ描画エラー";
         noDataMessage.style.display = 'block';
    }
}


/**
 * フィルターとソートを適用した後の問題統計情報のリストを取得する
 * @returns {Array<Object>} 各問題のデータに統計情報を追加した配列 (常に配列を返す)
 */
function getFilteredAndSortedQuestionStats() {
    const deckId = appState.currentDashboardDeckId;
    if (!deckId || !appState.allDecks[deckId] || !Array.isArray(appState.allDecks[deckId].questions)) {
        return []; // Return empty if no deck or questions
    }

    const questions = appState.allDecks[deckId].questions;
    const filterAccuracy = appState.dashboardFilterAccuracy;
    const searchQuery = appState.dashboardSearchQuery.toLowerCase(); // Lowercase for case-insensitive search
    const sortOrder = appState.dashboardSortOrder;

    // 1. Map questions to include calculated stats
    let questionStats = questions.map((q, index) => {
        const history = q.history || [];
        const totalCount = history.length;
        const correctCount = history.filter(h => h.correct).length;
        // Calculate accuracy: -1 for unanswered, 0-100 otherwise
        const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : -1;
        // Get timestamp of the last answer, 0 if unanswered
        const lastAnswered = totalCount > 0 ? history[history.length - 1].ts : 0;
        const incorrectCount = totalCount - correctCount;

        return {
            ...q, // Spread original question data (id, question, options, etc.)
            originalIndex: index, // Store original order index
            correctCount,
            totalCount,
            incorrectCount,
            accuracy,
            lastAnswered,
        };
    });

    // 2. Apply Accuracy Filter
    if (filterAccuracy !== 'all') {
        questionStats = questionStats.filter(q => {
            const acc = q.accuracy;
            switch (filterAccuracy) {
                case 'low': return acc !== -1 && acc <= DASHBOARD_ACCURACY_THRESHOLDS.LOW;
                case 'medium': return acc > DASHBOARD_ACCURACY_THRESHOLDS.LOW && acc <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM;
                case 'high': return acc > DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM;
                case 'unanswered': return acc === -1;
                default: return true; // Should not happen if filterAccuracy is validated
            }
        });
    }

    // 3. Apply Search Filter
    if (searchQuery !== '') {
        questionStats = questionStats.filter(q =>
            // Check question, options, answer, and explanation (if they exist)
            (q.question && q.question.toLowerCase().includes(searchQuery)) ||
            (Array.isArray(q.options) && q.options.some(opt => opt.toLowerCase().includes(searchQuery))) ||
            (q.correctAnswer && q.correctAnswer.toLowerCase().includes(searchQuery)) ||
            (q.explanation && q.explanation.toLowerCase().includes(searchQuery))
        );
    }

    // 4. Apply Sorting
    questionStats.sort((a, b) => {
        switch (sortOrder) {
            case 'accuracyAsc':
                // Unanswered (-1) first, then by accuracy, then by original order
                if (a.accuracy === -1 && b.accuracy !== -1) return -1;
                if (a.accuracy !== -1 && b.accuracy === -1) return 1;
                if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
                return a.originalIndex - b.originalIndex;
            case 'accuracyDesc':
                // Answered first, by accuracy descending, then unanswered (-1), then by original order
                if (a.accuracy === -1 && b.accuracy !== -1) return 1;
                if (a.accuracy !== -1 && b.accuracy === -1) return -1;
                if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
                return a.originalIndex - b.originalIndex;
            case 'mostIncorrect':
                // Sort by incorrect count descending, then by original order
                if (a.incorrectCount !== b.incorrectCount) return b.incorrectCount - a.incorrectCount;
                return a.originalIndex - b.originalIndex;
            case 'lastAnswered':
                 // Sort by last answered timestamp descending (newer first), unanswered (0) last
                if (a.lastAnswered !== b.lastAnswered) return b.lastAnswered - a.lastAnswered;
                return a.originalIndex - b.originalIndex;
            case 'questionOrder':
            default:
                // Sort by original index
                return a.originalIndex - b.originalIndex;
        }
    });

    return questionStats;
}

/** ダッシュボードの「問題別分析」セクション（リストまたはグラフ）をレンダリングする */
async function renderDashboardQuestionAnalysis() {
    // Ensure analysis view container and controls exist
    if (!dom.questionAnalysisView || !dom.dashboardAnalysisControls) {
        console.warn("renderDashboardQuestionAnalysis: Analysis view container or controls element not found.");
        return;
    }

    // Close detail view if open before re-rendering
    closeQuestionDetailView();

    // Get the full list of filtered and sorted questions
    const allFilteredStats = getFilteredAndSortedQuestionStats();
    const totalItems = allFilteredStats.length;

    // Calculate pagination details
    const totalPages = Math.ceil(totalItems / appState.dashboardQuestionsPerPage) || 1;
    // Ensure current page is valid
    appState.dashboardCurrentPage = Math.max(1, Math.min(appState.dashboardCurrentPage, totalPages));
    const startIndex = (appState.dashboardCurrentPage - 1) * appState.dashboardQuestionsPerPage;
    const endIndex = startIndex + appState.dashboardQuestionsPerPage;
    // Get stats for the current page (only relevant for list view)
    const statsForCurrentPage = allFilteredStats.slice(startIndex, endIndex);

    try {
        // Clear previous content before rendering new view
        if (dom.questionAccuracyList) dom.questionAccuracyList.innerHTML = '';
        if (dom.questionPagination) dom.questionPagination.innerHTML = '';
        // Reset chart view elements
        if (dom.questionAccuracyChartContainer && dom.questionAccuracyChart) {
             // Destroy existing chart instance cleanly
             if (questionAccuracyChart instanceof Chart) {
                 try { questionAccuracyChart.destroy(); } catch(e){ console.error("Error destroying chart:", e); }
                 questionAccuracyChart = null;
             }
             dom.questionAccuracyChart.style.display = 'none'; // Hide canvas
             dom.questionAccuracyChartContainer.style.display = 'none'; // Hide container
        }
        if(dom.questionAccuracyNoData) dom.questionAccuracyNoData.style.display = 'none'; // Hide no-data message

        // Render based on current view mode
        if (appState.dashboardViewMode === 'list') {
            console.log(`Rendering question list view - Page ${appState.dashboardCurrentPage}/${totalPages} (${totalItems} items)`);
            renderDashboardQuestionList(statsForCurrentPage, startIndex);
            renderPaginationControls(totalItems, totalPages); // Render pagination for list view
        } else if (appState.dashboardViewMode === 'chart') {
            console.log("Rendering question analysis chart view...");
             if (dom.questionAccuracyChartContainer) {
                dom.questionAccuracyChartContainer.style.display = 'block'; // Show chart container
            }
            // Render chart using *all* filtered stats
            await renderDashboardQuestionAnalysisChart(allFilteredStats);
            // No pagination needed for chart view
        }
    } catch (error) {
         console.error("Error rendering dashboard question analysis content:", error);
         showNotification("問題分析データの表示中にエラーが発生しました。", "error");
         // Show error message in the list area as fallback
         if (dom.questionAccuracyList) dom.questionAccuracyList.innerHTML = '<li class="status-message error" style="padding: 15px; text-align: center;">表示エラーが発生しました。</li>';
         if (dom.questionPagination) dom.questionPagination.innerHTML = ''; // Clear pagination on error
    }
}

/**
 * ダッシュボードの問題リストビューをレンダリングする
 * @param {Array<Object>} stats - 現在のページに表示する問題統計データの配列
 * @param {number} startIndex - リストの最初の問題の全体インデックス (0始まり、連番表示用)
 */
function renderDashboardQuestionList(stats, startIndex) {
    if (!dom.questionAccuracyList) return;
    const list = dom.questionAccuracyList;
    list.innerHTML = ''; // Clear previous list items

    if (!Array.isArray(stats) || stats.length === 0) {
        // Display message if no questions match the criteria
        list.innerHTML = '<li class="status-message" style="padding: 15px; text-align: center;">該当する問題がありません。フィルター条件を確認してください。</li>';
        return;
    }

    const fragment = document.createDocumentFragment();
    stats.forEach((q, index) => {
        const itemIndex = startIndex + index; // Overall index for numbering
        const li = document.createElement('li');
        li.classList.add('question-accuracy-item');
        li.dataset.questionId = q.id; // Store question ID
        li.dataset.index = itemIndex; // Store overall index
        li.setAttribute('role', 'button'); // Make it behave like a button
        li.setAttribute('tabindex', '0'); // Make focusable
        // Provide a descriptive label for screen readers
        li.setAttribute('aria-label', `問題 ${itemIndex + 1} 詳細表示: ${q.question?.substring(0, 50) ?? '問題文なし'}...`);

        // Question Preview Div
        const questionPreview = document.createElement('div');
        questionPreview.classList.add('question-text-preview');
        // Use textContent for safety
        questionPreview.textContent = `${itemIndex + 1}. ${q.question || '問題文なし'}`;
        li.appendChild(questionPreview);

        // Score Container Div
        const scoreContainer = document.createElement('div');
        scoreContainer.classList.add('score-container');

        // Accuracy Span
        const accuracySpan = document.createElement('span');
        accuracySpan.classList.add('accuracy-score');
        if (q.accuracy === -1) { // Unanswered
            accuracySpan.textContent = '未解答';
            accuracySpan.style.color = 'var(--light-text)'; // Use light text color
        } else {
            accuracySpan.textContent = `${q.accuracy}%`;
            // Apply color classes based on thresholds
            if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) accuracySpan.classList.add('low');
            else if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) accuracySpan.classList.add('medium');
            else accuracySpan.classList.add('high');
        }
        scoreContainer.appendChild(accuracySpan);

        // Counts Span (Correct/Total)
        const countsSpan = document.createElement('span');
        countsSpan.classList.add('answer-counts');
        // Display counts only if answered
        countsSpan.textContent = q.totalCount > 0 ? `(${q.correctCount} / ${q.totalCount})` : '';
        scoreContainer.appendChild(countsSpan);

        li.appendChild(scoreContainer);
        fragment.appendChild(li);
    });

    list.appendChild(fragment);
}


/**
 * 問題リストアイテムに対するキーダウンイベント処理 (アクセシビリティ)
 * @param {KeyboardEvent} event
 */
function handleQuestionItemKeydown(event) {
    const currentItem = event.target.closest('.question-accuracy-item');
    if (!currentItem) return; // Event didn't originate from a list item

    if (event.key === 'Enter' || event.key === ' ') {
        // Activate the item like a click
        event.preventDefault(); // Prevent space scroll
        showDetailForListItem(currentItem);
    }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
         // Navigate between list items
         event.preventDefault(); // Prevent page scroll
         const sibling = event.key === 'ArrowDown'
             ? currentItem.nextElementSibling
             : currentItem.previousElementSibling;
         // Move focus if a valid sibling item exists
         if (sibling && sibling.matches('.question-accuracy-item')) {
             sibling.focus();
         }
    }
    // Add Home/End key support? (Optional)
    else if (event.key === 'Home') {
        event.preventDefault();
        const firstItem = currentItem.parentElement?.querySelector('.question-accuracy-item:first-child');
        if (firstItem) firstItem.focus();
    } else if (event.key === 'End') {
        event.preventDefault();
        const lastItem = currentItem.parentElement?.querySelector('.question-accuracy-item:last-child');
        if (lastItem) lastItem.focus();
    }
}

/**
 * 問題リストアイテムがクリックされたときのハンドラ (イベント委任)
 * @param {MouseEvent} event - クリックイベント
 */
function handleQuestionItemClick(event) {
    const targetItem = event.target.closest('.question-accuracy-item');
    if (targetItem) {
        showDetailForListItem(targetItem); // Show details for the clicked item
    }
}

/**
 * 指定されたリストアイテムに対応する問題詳細を表示する
 * @param {HTMLElement} listItem - クリックまたはキー操作された<li>要素
 */
function showDetailForListItem(listItem) {
    const questionId = listItem.dataset.questionId;
    const indexStr = listItem.dataset.index; // Get the overall index from data attribute
    const deckId = appState.currentDashboardDeckId;

    // Validate necessary data
    if (!questionId || !deckId || !appState.allDecks[deckId] || indexStr === undefined) {
        console.error("Missing data required to show question detail:", { questionId, deckId, indexStr });
        showNotification("問題詳細の表示に必要な情報が見つかりません。", "error");
        return;
    }

    // Re-fetch the *currently filtered and sorted* list to find the correct data object
    // This ensures the displayed detail matches the list context
    const allStats = getFilteredAndSortedQuestionStats();
    const questionStat = allStats.find(qs => qs.id === questionId);

    if (questionStat) {
        const displayIndex = parseInt(indexStr, 10); // Use the stored overall index
        showQuestionDetail(questionStat, displayIndex); // Pass data and index to display function
    } else {
         // This might happen if the underlying data changed between list render and click
         console.warn("Could not find stats data for clicked/selected question:", questionId);
         showNotification("クリックされた問題データの取得に失敗しました。", "error");
    }
}


/**
 * ダッシュボードの問題分析グラフビューをレンダリングする
 * @param {Array<Object>} stats - フィルター・ソートされた全問題統計データの配列
 */
async function renderDashboardQuestionAnalysisChart(stats) {
     // Ensure Chart.js is loaded
     if (typeof Chart === 'undefined') {
        console.error("Chart.js library is not loaded.");
        showNotification("グラフ描画ライブラリが見つかりません。", "error");
        if(dom.questionAccuracyNoData) {
             dom.questionAccuracyNoData.textContent = "グラフ描画不可";
             dom.questionAccuracyNoData.style.display = 'block';
        }
        if(dom.questionAccuracyChartContainer) dom.questionAccuracyChartContainer.style.display = 'none';
        return;
    }
     // Check for essential DOM elements
     if (!dom.questionAccuracyChart || !dom.questionAccuracyNoData || !dom.questionAccuracyChartContainer) {
        console.warn("renderDashboardQuestionAnalysisChart: Chart elements missing.");
        return;
    }
    const canvas = dom.questionAccuracyChart;
    const noDataMessage = dom.questionAccuracyNoData;
    const container = dom.questionAccuracyChartContainer;

    let ctx;
    try {
         ctx = canvas.getContext('2d');
         if (!ctx) throw new Error("Canvas 2D context is null.");
    } catch (e) {
        console.error("renderDashboardQuestionAnalysisChart: Failed to get 2D context.", e);
        container.style.display = 'none'; // Hide container
        noDataMessage.textContent = "グラフ描画エラー (Context取得失敗)";
        noDataMessage.style.display = 'block';
        return;
    }

    // Destroy previous chart instance
    if (questionAccuracyChart instanceof Chart) {
        try { questionAccuracyChart.destroy(); } catch(e){}
        questionAccuracyChart = null;
    }

    // Filter out unanswered questions for the distribution chart
    const answeredStats = stats.filter(q => q.accuracy !== -1);

    // Handle case with no answered questions
    if (answeredStats.length === 0) {
        container.style.display = 'block'; // Show container
        canvas.style.display = 'none'; // Hide canvas
        noDataMessage.textContent = "解答済みの問題データがありません。";
        noDataMessage.style.display = 'block'; // Show message
        console.log("renderDashboardQuestionAnalysisChart: No answered questions data.");
        return;
    }

    // Prepare UI for chart
    container.style.display = 'block';
    canvas.style.display = 'block';
    noDataMessage.style.display = 'none';

    // --- Data Aggregation (Binning) ---
    // Define accuracy bins (e.g., 0-10, 11-20, ..., 91-100)
    const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    // Create labels for the bins
    const labels = bins.slice(0, -1).map((bin, i) => {
        const nextBin = bins[i+1];
        if (i === 0) return `0-${nextBin}%`; // First bin label
        return `${bin + 1}-${nextBin}%`; // Subsequent bin labels
    });
    // Initialize counts for each bin
    const dataCounts = Array(labels.length).fill(0);

    // Count questions falling into each accuracy bin
    answeredStats.forEach(q => {
        const acc = q.accuracy;
        // Find the correct bin index for the accuracy
        let binIndex = bins.findIndex((bin, i) => {
            if (i === 0) return acc >= bin && acc <= bins[i+1];
            return acc > bin && acc <= bins[i+1];
        });
        // Handle edge case for 0% exactly if needed differently (covered by >= 0)
        // if (acc === 0) binIndex = 0;

        if (binIndex >= 0 && binIndex < dataCounts.length) {
            dataCounts[binIndex]++;
        } else if (acc === 0 && binIndex === -1) { // Explicitly handle 0 if findIndex misses it
             dataCounts[0]++;
        } else {
            console.warn(`Could not determine bin for accuracy: ${acc}`);
        }
    });

    // Determine bar colors based on accuracy thresholds
    const backgroundColors = labels.map(label => {
         // Extract the upper boundary of the bin label (e.g., "81-90%" -> 90)
         const upperBoundary = parseInt(label.split('-')[1].replace('%',''), 10);
         if (isNaN(upperBoundary)) return 'var(--secondary-color)'; // Fallback color

         // Assign color based on the upper boundary relative to thresholds
         if (upperBoundary <= DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1) return 'rgba(231, 76, 60, 0.7)'; // Low (Red)
         if (upperBoundary <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1) return 'rgba(230, 126, 34, 0.7)'; // Medium (Orange/Yellow)
         return 'rgba(46, 204, 113, 0.7)'; // High (Green)
    });

    // --- Chart Configuration ---
    const chartConfig = {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '問題数',
                data: dataCounts,
                backgroundColor: backgroundColors,
                borderColor: 'rgba(44, 62, 80, 0.8)', // Dark border
                borderWidth: 1,
                barPercentage: 0.9, // Adjust bar width
                categoryPercentage: 0.8 // Adjust space between bars
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'x', // Bars are vertical
            plugins: {
                legend: { display: false }, // Hide legend as colors are self-explanatory
                tooltip: { // Customize tooltips
                    callbacks: {
                        title: (items) => `正答率 ${items[0].label}`, // Tooltip title shows range
                        label: (ctx) => `問題数: ${ctx.parsed.y} 問` // Tooltip body shows count
                    }
                },
                title: { // Chart title
                    display: true,
                    text: '正答率分布 (解答済み問題)',
                    padding: { top: 10, bottom: 15 } // Add padding
                }
            },
            scales: {
                y: { // Vertical axis (Count)
                    beginAtZero: true,
                    title: { display: true, text: '問題数' },
                    // Adjust ticks for better readability
                    ticks: {
                         stepSize: Math.max(1, Math.ceil(Math.max(...dataCounts) / 8)), // Dynamic step size, at least 1
                         precision: 0 // Integer ticks
                        }
                },
                x: { // Horizontal axis (Accuracy Range)
                    title: { display: true, text: '正答率範囲 (%)' },
                    grid: { display: false } // Hide vertical grid lines
                }
            },
            // ★ Add onClick handler to switch to list view with filter
            onClick: (event, elements) => {
                if (elements.length > 0) { // If a bar was clicked
                    const clickedIndex = elements[0].index;
                    const clickedLabel = labels[clickedIndex];
                    console.log(`Chart bar clicked: Index=${clickedIndex}, Label=${clickedLabel}`);

                    // Determine the corresponding accuracy filter value
                    let filterValue = 'all'; // Default
                    const maxAcc = parseInt(clickedLabel.split('-')[1].replace('%',''), 10);
                    if (!isNaN(maxAcc)) {
                        if (maxAcc <= DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1) filterValue = 'low';
                        else if (maxAcc <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1) filterValue = 'medium';
                        else filterValue = 'high';
                    }

                    // Apply the filter and switch to list view
                    appState.dashboardFilterAccuracy = filterValue;
                    if (dom.dashboardFilterAccuracy) dom.dashboardFilterAccuracy.value = filterValue; // Update dropdown
                    appState.dashboardCurrentPage = 1; // Reset page
                    setDashboardViewMode('list'); // Switch view and trigger re-render
                }
            },
            // Improve hover style for clickable bars
             onHover: (event, chartElement) => {
               event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
            }
        }
    };

    // --- Render Chart ---
    try {
        requestAnimationFrame(() => {
             if (document.getElementById(canvas.id)) { // Check canvas exists
                 questionAccuracyChart = new Chart(ctx, chartConfig);
                 console.log("Question accuracy distribution chart rendered.");
             } else {
                 console.warn("Question accuracy chart canvas removed before chart creation.");
             }
        });
    } catch (chartError) {
        console.error("Error creating question accuracy chart:", chartError);
        showNotification("問題正答率グラフの描画中にエラーが発生しました。", "error");
        // Show error in UI
        canvas.style.display = 'none';
        noDataMessage.textContent = "グラフ描画エラー";
        noDataMessage.style.display = 'block';
    }
}

/**
 * 問題リストのページネーションコントロールをレンダリングする
 * @param {number} totalItems - フィルター後の総問題数
 * @param {number} totalPages - 総ページ数
 */
function renderPaginationControls(totalItems, totalPages) {
    if (!dom.questionPagination) return;
    const pagination = dom.questionPagination;
    pagination.innerHTML = ''; // Clear previous controls

    // Don't show pagination if only one page or no items
    if (totalPages <= 1 && totalItems > 0) {
         // Optionally show just the item count if > 0 and only one page
         const pageInfo = document.createElement('span');
         pageInfo.classList.add('page-info');
         pageInfo.textContent = `${totalItems}件`;
         pagination.appendChild(pageInfo);
         return;
    } else if (totalPages <= 1) {
         return; // Hide pagination completely if 0 items or 1 page
    }

    const currentPage = appState.dashboardCurrentPage;

    // Previous Button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left" aria-hidden="true"></i> 前へ';
    prevButton.classList.add('button', 'small', 'secondary', 'page-nav');
    prevButton.type = 'button';
    prevButton.dataset.page = currentPage - 1;
    prevButton.disabled = currentPage === 1;
    prevButton.setAttribute('aria-label', '前のページへ');
    if (prevButton.disabled) prevButton.setAttribute('aria-disabled', 'true');
    pagination.appendChild(prevButton);

    // Page Info Span
    const pageInfo = document.createElement('span');
    pageInfo.classList.add('page-info');
    pageInfo.textContent = `${currentPage} / ${totalPages} ページ (${totalItems}件)`;
    pageInfo.setAttribute('aria-live', 'polite'); // Announce page changes
    pageInfo.setAttribute('role', 'status');
    pagination.appendChild(pageInfo);

    // Next Button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = '次へ <i class="fas fa-chevron-right" aria-hidden="true"></i>';
    nextButton.classList.add('button', 'small', 'secondary', 'page-nav');
    nextButton.type = 'button';
    nextButton.dataset.page = currentPage + 1;
    nextButton.disabled = currentPage === totalPages;
    nextButton.setAttribute('aria-label', '次のページへ');
     if (nextButton.disabled) nextButton.setAttribute('aria-disabled', 'true');
    pagination.appendChild(nextButton);
}

/**
 * ページネーションコントロール内のボタンクリックを処理する (イベント委任)
 * @param {MouseEvent} event - クリックイベント
 */
function handlePaginationClick(event) {
    const targetButton = event.target.closest('.page-nav');
    // Ensure button exists and is not disabled
    if (targetButton && !targetButton.disabled) {
        const page = parseInt(targetButton.dataset.page, 10);
        // Validate page number
        if (!isNaN(page) && page >= 1) {
            appState.dashboardCurrentPage = page;
            renderDashboardQuestionAnalysis(); // Re-render the list section

            // Focus the list after pagination for better keyboard navigation flow
            const listElement = dom.questionAccuracyList;
            if (listElement) {
                 // Scroll list to top smoothly
                 listElement.scrollTo({ top: 0, behavior: 'smooth' });
                 // Set focus to the list container itself after a short delay
                 setTimeout(() => listElement.focus(), 100);
            }
        }
    }
}


/**
 * 指定された問題の詳細情報を表示する
 * @param {Object} questionStat - 表示する問題のデータ (統計情報含む)
 * @param {number} displayIndex - リスト上での表示インデックス (0始まり)
 */
function showQuestionDetail(questionStat, displayIndex) {
     // Check if all required detail view elements are present
     const requiredKeys = ['questionDetailView', 'detailQuestionNumber', 'detailQuestionText', 'detailCorrectAnswer', 'detailAccuracy', 'detailCorrectCount', 'detailTotalCount', 'detailRecentHistory', 'closeDetailView'];
     if (requiredKeys.some(key => !dom[key])) {
        console.error("showQuestionDetail: One or more detail view DOM elements are missing.");
        showNotification("問題詳細の表示に必要な要素が見つかりません。", "error");
        return;
    }

    // Populate detail fields using textContent for security
    dom.detailQuestionNumber.textContent = displayIndex + 1; // Display 1-based index
    dom.detailQuestionText.textContent = questionStat.question || '問題文なし';
    dom.detailCorrectAnswer.textContent = questionStat.correctAnswer || '正解情報なし';

    // Display Accuracy and Counts
    const { accuracy, correctCount, totalCount } = questionStat;
    if (accuracy !== undefined && accuracy >= -1) { // Check if accuracy is valid
        if (accuracy === -1) { // Unanswered case
            dom.detailAccuracy.textContent = '未解答';
            dom.detailCorrectCount.textContent = '0';
            dom.detailTotalCount.textContent = '0';
        } else { // Answered case
            dom.detailAccuracy.textContent = `${accuracy}%`;
            dom.detailCorrectCount.textContent = correctCount ?? '0';
            dom.detailTotalCount.textContent = totalCount ?? '0';
        }
    } else { // Fallback if accuracy data is missing/invalid
        dom.detailAccuracy.textContent = '-';
        dom.detailCorrectCount.textContent = '-';
        dom.detailTotalCount.textContent = '-';
    }

    // Display Recent History
    const historyList = dom.detailRecentHistory;
    historyList.innerHTML = ''; // Clear previous history
    // Get the last N history entries, reversed to show most recent first
    const recentHistory = (Array.isArray(questionStat.history) ? questionStat.history : [])
                            .slice(-MAX_RECENT_HISTORY).reverse();

    if (recentHistory.length === 0) {
        historyList.innerHTML = '<li>解答履歴はありません。</li>';
    } else {
        const fragment = document.createDocumentFragment();
        recentHistory.forEach(h => {
            const li = document.createElement('li');

            // Timestamp Span
            const tsSpan = document.createElement('span');
            tsSpan.textContent = formatDate(h.ts); // Format the timestamp

            // Result + Evaluation Span
            const resultSpan = document.createElement('span');
            const resultClass = h.correct ? 'correct' : 'incorrect';
            const resultText = h.correct ? '正解' : '不正解';
            let evalText = '';
            if (h.evaluation) {
                const evalMap = { difficult: '難しい', normal: '普通', easy: '簡単' };
                evalText = ` (<span class="eval" title="${h.evaluation}">${evalMap[h.evaluation] || h.evaluation}</span>)`;
            } else {
                 // Indicate if no evaluation was given
                 evalText = ' (<span class="eval" title="評価なし">-</span>)';
            }
            // Use innerHTML carefully for structured text
            resultSpan.innerHTML = `<span class="${resultClass}">${resultText}</span>${evalText}`;

            li.appendChild(tsSpan);
            li.appendChild(resultSpan);
            fragment.appendChild(li);
        });
        historyList.appendChild(fragment);
    }

    // Show the detail view and manage focus/scroll
    dom.questionDetailView.style.display = 'block';
    // Use setTimeout to ensure the element is visible before scrolling/focusing
    setTimeout(() => {
        // Check again if view is still supposed to be visible
        if(dom.questionDetailView && dom.questionDetailView.style.display === 'block') {
            // Scroll the detail view into the viewport smoothly
            dom.questionDetailView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // Focus the close button for accessibility
            dom.closeDetailView?.focus();
        }
    }, 50); // Short delay
}

/** 問題詳細表示エリアを閉じる */
function closeQuestionDetailView() {
    if (dom.questionDetailView && dom.questionDetailView.style.display !== 'none') {
        dom.questionDetailView.style.display = 'none';
        console.log("Question detail view closed.");
        // Return focus to the list (or a suitable element) after closing
        // Focusing the list allows users to continue navigating with arrows
        const listElement = dom.questionAccuracyList;
         if (listElement && appState.dashboardViewMode === 'list') {
            listElement.focus();
        } else {
             // Fallback focus if list isn't appropriate (e.g., chart view)
             dom.dashboardFilterAccuracy?.focus(); // Focus filter dropdown as a fallback
        }
    }
}

// ====================================================================
// ヘルパー関数 (Utility Functions)
// ====================================================================

/**
 * 配列の要素をシャッフルする (Fisher-Yates algorithm) - 不変性を保つ
 * @template T
 * @param {T[]} array - シャッフルしたい配列
 * @returns {T[]} シャッフルされた新しい配列。入力が配列でない場合は空配列を返す。
 */
function shuffleArray(array) {
    if (!Array.isArray(array)) {
        console.warn("shuffleArray: Input is not an array! Returning empty array.", array);
        return [];
    }
    // Create a shallow copy to avoid modifying the original array
    const shuffled = [...array];
    // Fisher-Yates shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
        // Pick a random index from 0 to i
        const j = Math.floor(Math.random() * (i + 1));
        // Swap elements shuffled[i] and shuffled[j]
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Unixタイムスタンプ (ミリ秒) を "YYYY/MM/DD HH:mm" 形式の日時文字列に変換する
 * @param {number | null | undefined} timestamp - Unixタイムスタンプ (ミリ秒)
 * @returns {string} フォーマットされた日時文字列。"----/--/-- --:--" または "日付エラー"
 */
function formatDate(timestamp) {
    const placeholder = "----/--/-- --:--"; // Placeholder for invalid/missing dates
    // Check if timestamp is a valid positive number
    if (typeof timestamp !== 'number' || !timestamp || timestamp <= 0 || isNaN(timestamp)) {
         // console.warn("formatDate: Invalid or missing timestamp:", timestamp);
         return placeholder;
    }
    try {
        const date = new Date(timestamp);
        // Check if the created Date object is valid
        if (isNaN(date.getTime())) {
             console.warn("formatDate: Invalid Date object created from timestamp:", timestamp);
             return placeholder;
        }
        // Extract date and time components
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        // Format the string
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
        // Catch any unexpected errors during date processing
        console.error("Error formatting date for timestamp:", timestamp, e);
        return "日付エラー"; // Return error string
    }
}

// ====================================================================
// End of file: script.js
// ====================================================================