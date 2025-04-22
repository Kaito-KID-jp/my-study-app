// ====================================================================
// AI問題生成学習アプリ - アプリケーションロジック V2
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
    'options-buttons-container',
    'question-text', 'deck-list', 'global-notification',
    'dashboard-analysis-controls' // ★ IDが追加されたことを確認
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
    console.log("Initializing app V2...");
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
        setupEventListeners();
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
        setTimeout(() => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            console.log("Loading overlay hidden after initialization process.");
        }, 200);
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
        'options-buttons-container',
        'answer-area', 'feedback-message', 'answer-text', 'explanation-text', 'retry-button',
        'evaluation-controls', 'study-complete-message', 'session-correct-count', 'session-incorrect-count',
        'back-to-top-button', 'quit-study-button',
        // Dashboard Screen
        'dashboard-deck-select', 'dashboard-content', 'dashboard-no-deck-message',
        'dashboard-overview', 'dashboard-deck-name', 'dashboard-total-questions', 'dashboard-total-answered',
        'dashboard-overall-accuracy', 'dashboard-last-studied',
        'dashboard-trends', 'study-trends-chart-container', 'study-trends-chart', 'study-trends-no-data',
        'dashboard-trends-sessions-count',
        'dashboard-question-analysis', 'dashboard-analysis-controls', // ★ ID追加
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
    dom.evalButtons = document.querySelectorAll('.eval-button');
    dom.studyFilterRadios = document.querySelectorAll('input[name="study-filter"]');

    if (dom.navButtons.length === 0) { console.warn("No navigation buttons found."); allFound = false; }
    if (dom.screens.length === 0) { console.warn("No screen elements found."); criticalFound = false; allFound = false; }
    if (dom.evalButtons.length === 0) { console.warn("No evaluation buttons found."); } // Not critical
    if (dom.studyFilterRadios.length === 0) { console.warn("No study filter radio buttons found."); } // Not critical


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
    safeAddEventListener(dom.quitStudyButton, 'click', confirmQuitStudy);
    safeAddEventListener(dom.backToTopButton, 'click', handleBackToTop);
    safeAddEventListener(dom.retryButton, 'click', retryCurrentQuestion);
    if (dom.evalButtons) {
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
                if (typeof repairedDeck.totalCorrect !== 'number' || isNaN(repairedDeck.totalCorrect)) { repairedDeck.totalCorrect = 0; dataModified = true; }
                if (typeof repairedDeck.totalIncorrect !== 'number' || isNaN(repairedDeck.totalIncorrect)) { repairedDeck.totalIncorrect = 0; dataModified = true; }
                if (!Array.isArray(repairedDeck.sessionHistory)) { repairedDeck.sessionHistory = []; dataModified = true; }
                else {
                    repairedDeck.sessionHistory = repairedDeck.sessionHistory.filter(s =>
                        s && typeof s === 'object' && typeof s.ts === 'number' && typeof s.correct === 'number' && typeof s.incorrect === 'number'
                    );
                    if (repairedDeck.sessionHistory.length !== deck.sessionHistory.length) {
                        dataModified = true;
                    }
                }

                const validQuestions = [];
                repairedDeck.questions.forEach((q, index) => {
                    if (q && typeof q === 'object' && typeof q.id === 'string' && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 && typeof q.correctAnswer === 'string') {
                        const repairedQuestion = { ...q };

                        repairedQuestion.options = repairedQuestion.options.map(opt => String(opt).trim()).filter(opt => opt !== '');
                        repairedQuestion.correctAnswer = String(repairedQuestion.correctAnswer).trim();
                        if (repairedQuestion.options.length < 2 || !repairedQuestion.options.includes(repairedQuestion.correctAnswer)) {
                             console.warn(`Invalid options/correctAnswer removed at index ${index} in deck "${repairedDeck.name}" (ID: ${deckId}).`);
                             dataModified = true;
                             return;
                        }

                        if (!Array.isArray(repairedQuestion.history)) { repairedQuestion.history = []; dataModified = true; }
                        repairedQuestion.history = repairedQuestion.history.filter(h => h && typeof h === 'object' && typeof h.ts === 'number' && typeof h.correct === 'boolean');
                        repairedQuestion.history.forEach(h => {
                            if (![null, 'difficult', 'normal', 'easy'].includes(h.evaluation)) {
                                h.evaluation = null;
                                dataModified = true;
                            }
                        });

                        if (typeof repairedQuestion.explanation !== 'string') {
                            repairedQuestion.explanation = '';
                            dataModified = true;
                        }

                        validQuestions.push(repairedQuestion);
                    } else {
                        console.warn(`Invalid question structure removed at index ${index} in deck "${repairedDeck.name}" (ID: ${deckId}).`);
                        dataModified = true;
                    }
                });
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
        saveData(LS_KEYS.DECKS, validDecks);
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
     }

     if (typeof loadedSettings.lowAccuracyThreshold === 'number' &&
         !isNaN(loadedSettings.lowAccuracyThreshold) &&
         loadedSettings.lowAccuracyThreshold >= 1 &&
         loadedSettings.lowAccuracyThreshold <= 99) {
         repairedSettings.lowAccuracyThreshold = loadedSettings.lowAccuracyThreshold;
     } else if (loadedSettings.lowAccuracyThreshold !== undefined) {
        modified = true;
     }

     if (modified) {
         console.warn("Settings data was repaired to default values for some keys.");
         saveData(LS_KEYS.SETTINGS, repairedSettings);
     }
     return repairedSettings;
}


/** アプリ起動時にLocalStorageから初期データを読み込む */
function loadInitialData() {
    const loadedSettings = loadData(LS_KEYS.SETTINGS);
    appState.settings = loadedSettings || { shuffleOptions: true, lowAccuracyThreshold: 50 };

    appState.allDecks = loadData(LS_KEYS.DECKS) || {};

    appState.currentDeckId = loadData(LS_KEYS.CURRENT_DECK_ID) || null;

    if (appState.currentDeckId && !appState.allDecks[appState.currentDeckId]) {
        console.warn(`Current deck ID "${appState.currentDeckId}" not found in loaded decks. Resetting current deck selection.`);
        appState.currentDeckId = null;
        saveData(LS_KEYS.CURRENT_DECK_ID, null);
    }

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
    if (isInitializing && show) return;
    if (!dom.appLoadingOverlay) return;
    requestAnimationFrame(() => {
        dom.appLoadingOverlay.classList.toggle('active', show);
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
            alert(`エラー: ${message}`);
        }
        return;
    }
    clearTimeout(notificationTimeout);
    notificationTimeout = null;

    dom.notificationMessage.textContent = message;
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
    dom.notificationIcon.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i>`;
    dom.globalNotification.className = 'notification';
    requestAnimationFrame(() => {
         if (dom.globalNotification) {
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

    deckIds.sort((a, b) => {
        const deckA = appState.allDecks[a];
        const deckB = appState.allDecks[b];
        const lastStudiedA = deckA?.lastStudied || 0;
        const lastStudiedB = deckB?.lastStudied || 0;
        if (lastStudiedA !== lastStudiedB) {
            return lastStudiedB - lastStudiedA;
        }
        return (deckA?.name || '').localeCompare(deckB?.name || '', 'ja');
    });

    const fragment = document.createDocumentFragment();
    deckIds.forEach(deckId => {
        const deck = appState.allDecks[deckId];
        if (!deck) return;

        const li = document.createElement('li');
        li.dataset.deckId = deckId;
        li.classList.toggle('active-deck', deckId === appState.currentDeckId);
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `問題集 ${deck.name || '名称未設定'} を選択または操作`);

        const infoDiv = document.createElement('div');
        infoDiv.style.flexGrow = '1';
        infoDiv.style.marginRight = '10px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${deck.name || '名称未設定'} (${deck.questions?.length || 0}問)`;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.display = 'block';
        nameSpan.style.marginBottom = '4px';

        const historySpan = document.createElement('span');
        historySpan.style.fontSize = '0.85em';
        historySpan.style.color = 'var(--light-text)';
        const lastStudiedText = deck.lastStudied ? `最終学習: ${formatDate(deck.lastStudied)}` : '未学習';
        const totalAnswered = (deck.totalCorrect || 0) + (deck.totalIncorrect || 0);
        const accuracy = totalAnswered > 0 ? Math.round(((deck.totalCorrect || 0) / totalAnswered) * 100) : -1;
        const accuracyText = accuracy >= 0 ? `正答率: ${accuracy}%` : 'データなし';
        historySpan.textContent = `${lastStudiedText} / ${accuracyText}`;

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(historySpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('deck-actions');
        actionsDiv.style.flexShrink = '0';

        const selectButton = document.createElement('button');
        selectButton.innerHTML = '<i class="fas fa-check-circle"></i> 選択';
        selectButton.type = 'button';
        selectButton.classList.add('button', 'small', 'primary', 'select-deck');
        selectButton.dataset.deckId = deckId;
        selectButton.disabled = (deckId === appState.currentDeckId);
        selectButton.setAttribute('aria-label', `問題集 ${deck.name || '名称未設定'} を選択`);

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

    if (dom.currentDeckName) dom.currentDeckName.textContent = deckSelected ? (currentDeck.name || '名称未設定') : '未選択';
    if (dom.totalQuestions) dom.totalQuestions.textContent = deckSelected ? (currentDeck.questions?.length ?? 0) : '0';
    if (dom.currentDeckLastStudied) {
        dom.currentDeckLastStudied.textContent = deckSelected && currentDeck.lastStudied ? formatDate(currentDeck.lastStudied) : '-';
    }
    if (dom.currentDeckAccuracy) {
        let accuracyText = '-';
        if (deckSelected) {
            const totalAnswered = (currentDeck.totalCorrect || 0) + (currentDeck.totalIncorrect || 0);
            if (totalAnswered > 0) {
                const accuracy = Math.round(((currentDeck.totalCorrect || 0) / totalAnswered) * 100);
                accuracyText = `${accuracy}% (${currentDeck.totalCorrect || 0}/${totalAnswered})`;
            } else {
                accuracyText = 'データなし';
            }
        }
        dom.currentDeckAccuracy.textContent = accuracyText;
    }

    if (dom.studyFilterOptions) {
        dom.studyFilterOptions.style.display = deckSelected ? 'block' : 'none';
    }
    if (dom.lowAccuracyThresholdDisplayFilter) {
         dom.lowAccuracyThresholdDisplayFilter.textContent = appState.settings.lowAccuracyThreshold;
    }

    if (deckSelected) {
        updateFilteredQuestionCount();
    } else {
        if (dom.filteredQuestionCount) dom.filteredQuestionCount.textContent = '';
        updateStudyButtonsState();
    }

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
            ? "選択中の問題集の全学習履歴（解答履歴、累計、セッション）をリセットします"
            : (deckSelected ? "リセットする履歴がありません" : "問題集を選択してください");
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

    if (deckSelected) {
        try {
            const filteredList = getFilteredStudyList();
            filteredCount = filteredList.length;
            hasQuestionsToStudy = filteredCount > 0;
        } catch (error) {
            console.error("Error getting filtered study list count:", error);
            hasQuestionsToStudy = false;
        }
    }

    dom.startStudyButton.disabled = !hasQuestionsToStudy;

    if (!deckSelected) {
        dom.startStudyButton.title = "学習を開始する問題集を選択してください。";
    } else if (!hasQuestionsToStudy) {
        let filterLabel = "選択されたフィルター条件";
        const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
        if (selectedRadio) {
             const labelElement = document.querySelector(`label[for="${selectedRadio.id}"]`);
             if(labelElement) filterLabel = `「${labelElement.textContent.trim()}」フィルター`;
        }
        dom.startStudyButton.title = `${filterLabel}に該当する問題がありません。`;
    } else {
        dom.startStudyButton.title = `選択した条件 (${filteredCount}問) で学習を開始します`;
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
    if (!targetButton) return;

    const targetScreenId = targetButton.dataset.target;
    if (targetScreenId) {
        navigateToScreen(targetScreenId);
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

    dom.screens.forEach(screen => screen.classList.remove('active'));

    const targetScreenElement = document.getElementById(screenId);
    if (targetScreenElement && targetScreenElement.classList.contains('screen')) {
        targetScreenElement.classList.add('active');
        appState.activeScreen = screenId;
        console.log(`Navigated to screen: ${screenId}`);

        dom.navButtons.forEach(button => {
            const isActive = button.dataset.target === screenId;
            button.classList.toggle('active', isActive);
            if (isActive) {
                button.setAttribute('aria-current', 'page');
            } else {
                button.removeAttribute('aria-current');
            }
        });

        switch (screenId) {
            case 'dashboard-screen':
                populateDashboardDeckSelect();
                if (appState.currentDashboardDeckId) {
                    renderDashboard();
                } else {
                    if (dom.dashboardContent) dom.dashboardContent.style.display = 'none';
                    if (dom.dashboardNoDeckMessage) dom.dashboardNoDeckMessage.style.display = 'block';
                }
                break;
            case 'settings-screen':
                loadSettingsToUI();
                break;
            case 'home-screen':
                 updateDeckListUI();
                 updateTopScreenDisplay();
                 break;
        }

        if (screenId !== 'dashboard-screen') {
            closeQuestionDetailView();
        }
        if (screenId !== 'study-screen' && appState.currentQuestionIndex !== -1) {
            console.warn("Navigated away from active study screen without explicit quit. Resetting study list/index.");
            resetStudyState(); // Only reset list and index, stats might be saved by quit handler
             if(dom.studyCard) dom.studyCard.style.display = 'block';
             if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
             if(dom.answerArea) dom.answerArea.style.display = 'none';
             if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';
             if(dom.quitStudyButton) dom.quitStudyButton.style.display = 'none';
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

    } else {
        console.error(`Navigation failed: Screen with ID "${screenId}" not found or is not a valid screen element.`);
        showNotification(`画面 "${screenId}" が見つかりません。ホーム画面を表示します。`, "error");
        if (screenId !== 'home-screen') {
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
    const file = fileInput.files?.[0];
    const statusElement = dom.loadStatus;

    if (statusElement) {
         statusElement.textContent = "";
         statusElement.className = 'status-message';
    }

    if (!file) return;

    if (!file.type || (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json'))) {
        showNotification('JSONファイル (.json) を選択してください。', 'warning');
        if(statusElement) {
            statusElement.textContent = "JSONファイルを選択してください";
            statusElement.className = 'status-message error';
        }
        fileInput.value = '';
        return;
    }

    if(statusElement) {
        statusElement.textContent = "読み込み中...";
        statusElement.className = 'status-message info';
    }
    showLoadingOverlay(true);

    const reader = new FileReader();

    reader.onload = (e) => {
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

            let deckName = file.name.replace(/\.json$/i, '');
            let originalDeckName = deckName;
            let counter = 1;
            while (Object.values(appState.allDecks).some(d => d.name === deckName)) {
                counter++;
                deckName = `${originalDeckName} (${counter})`;
            }

            const deckId = `deck_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const newDeck = {
                id: deckId,
                name: deckName,
                questions: validationResult.questions.map((q, index) => ({
                    id: `q_${deckId}_${index}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    explanation: q.explanation || '',
                    history: []
                })),
                lastStudied: null,
                totalCorrect: 0,
                totalIncorrect: 0,
                sessionHistory: []
            };

            appState.allDecks[deckId] = newDeck;

            if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                delete appState.allDecks[deckId];
                throw new Error("LocalStorageへの保存に失敗したため、問題集の追加をキャンセルしました。");
            }

            console.log("New deck added:", newDeck);
            if(statusElement) {
                statusElement.textContent = `読み込み成功: ${deckName} (${newDeck.questions.length}問)`;
                statusElement.className = 'status-message success';
            }
            showNotification(`問題集「${deckName}」(${newDeck.questions.length}問) を正常に読み込みました。`, 'success');

            updateDeckListUI();
            populateDashboardDeckSelect();
            selectDeck(deckId);

        } catch (error) {
            console.error("Error processing JSON file:", error);
            if(statusElement) {
                statusElement.textContent = `読み込みエラー: ${error.message}`;
                statusElement.className = 'status-message error';
            }
            showNotification(`ファイル読み込みエラー: ${error.message}`, 'error', 8000);
        } finally {
            showLoadingOverlay(false);
            fileInput.value = '';
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
        fileInput.value = '';
        showLoadingOverlay(false);
    };

    reader.readAsText(file);
}

/**
 * 読み込んだJSONデータが期待される形式か検証する
 * @param {any} data - JSON.parse() でパースされたデータ
 * @returns {{isValid: boolean, message: string, questions: QuestionData[] | null}} 検証結果オブジェクト
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

        if (typeof q !== 'object' || q === null) {
            return { isValid: false, message: `問題 ${questionNum}: データ形式がオブジェクトではありません。`, questions: null };
        }

        if (typeof q.question !== 'string' || q.question.trim() === '') {
            return { isValid: false, message: `問題 ${questionNum}: 'question' (問題文) が存在しないか空です。`, questions: null };
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
            return { isValid: false, message: `問題 ${questionNum}: 'options' (選択肢) が配列でないか、選択肢が2つ未満です。`, questions: null };
        }
        const trimmedOptions = q.options.map(opt => String(opt).trim()).filter(opt => opt !== '');
        if (trimmedOptions.length !== q.options.length || trimmedOptions.length < 2) {
             return { isValid: false, message: `問題 ${questionNum}: 'options' 内に空の選択肢があるか、有効な選択肢が2つ未満です。`, questions: null };
        }
        if (typeof q.correctAnswer !== 'string' || q.correctAnswer.trim() === '') {
            return { isValid: false, message: `問題 ${questionNum}: 'correctAnswer' (正解) が存在しないか空です。`, questions: null };
        }
        const trimmedCorrectAnswer = q.correctAnswer.trim();

        if (!trimmedOptions.includes(trimmedCorrectAnswer)) {
            const optionsString = trimmedOptions.map(opt => `"${opt}"`).join(', ');
            return { isValid: false, message: `問題 ${questionNum}: 'correctAnswer' ("${trimmedCorrectAnswer}") が 'options' [${optionsString}] 内に見つかりません。完全に一致する必要があります。`, questions: null };
        }

        let explanation = '';
        if (q.explanation !== undefined && q.explanation !== null) {
             if (typeof q.explanation !== 'string') {
                 return { isValid: false, message: `問題 ${questionNum}: 'explanation' (解説) が文字列ではありません。`, questions: null };
             }
             explanation = q.explanation.trim();
        }

        validatedQuestions.push({
            question: q.question.trim(),
            options: trimmedOptions,
            correctAnswer: trimmedCorrectAnswer,
            explanation: explanation
        });
    }

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
    const listItem = target.closest('li[data-deck-id]');

    if (!listItem) return;

    const deckId = listItem.dataset.deckId;
    if (!deckId) return;

    const selectButton = target.closest('.select-deck');
    const deleteButton = target.closest('.delete-deck');

    if (selectButton) {
        event.stopPropagation();
        if (deckId !== appState.currentDeckId) {
            selectDeck(deckId);
        }
    } else if (deleteButton) {
        event.stopPropagation();
        deleteDeck(deckId);
    } else if (listItem.getAttribute('role') === 'button') {
        if (deckId !== appState.currentDeckId) {
            selectDeck(deckId);
        }
    }
}

/**
 * デッキリスト内のキーダウンイベント（Enter/Space）を処理する (アクセシビリティ)
 * @param {KeyboardEvent} event - キーダウンイベント
 */
function handleDeckListKeydown(event) {
     if (event.key === 'Enter' || event.key === ' ') {
         const target = event.target;
         if (target.matches('li[data-deck-id][role="button"]')) {
             event.preventDefault();
             const deckId = target.dataset.deckId;
             if (deckId && deckId !== appState.currentDeckId) {
                 selectDeck(deckId);
             }
         }
     }
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
        return;
    }

    appState.currentDeckId = deckId;
    saveData(LS_KEYS.CURRENT_DECK_ID, deckId);

    console.log("Deck selected:", deckId);
    const deckName = appState.allDecks[deckId]?.name || '無名';
    showNotification(`問題集「${deckName}」を選択しました。`, "success", 2500);

    appState.studyFilter = 'all';
    if (dom.studyFilterRadios) {
        const allFilterRadio = document.getElementById('filter-all');
        if (allFilterRadio) allFilterRadio.checked = true;
    }

    updateDeckListUI();
    updateTopScreenDisplay();

    appState.currentDashboardDeckId = deckId;
    if (dom.dashboardDeckSelect) {
         dom.dashboardDeckSelect.value = deckId;
    }
    if (appState.activeScreen === 'dashboard-screen') {
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

    const deckName = appState.allDecks[deckId].name || '無名の問題集';
    if (confirm(`問題集「${deckName}」とその全ての学習履歴を完全に削除します。\n\nこの操作は元に戻せません！\n\nよろしいですか？`)) {
        try {
            const deletedDeckData = { ...appState.allDecks[deckId] };
            delete appState.allDecks[deckId];

            let deckSelectionChanged = false;
            if (appState.currentDeckId === deckId) {
                appState.currentDeckId = null;
                saveData(LS_KEYS.CURRENT_DECK_ID, null);
                deckSelectionChanged = true;
            }
            if (appState.currentDashboardDeckId === deckId) {
                appState.currentDashboardDeckId = null;
                if (dom.dashboardDeckSelect) dom.dashboardDeckSelect.value = "";
                deckSelectionChanged = true;
            }

            if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                 appState.allDecks[deckId] = deletedDeckData;
                 console.error("Failed to save deck deletion to LocalStorage. Operation rolled back in memory.");
                 showNotification("問題集データの保存に失敗しました。削除はキャンセルされました。", "error", 6000);
                 return;
            }

            console.log("Deck deleted:", deckId);
            showNotification(`問題集「${deckName}」を削除しました。`, "success");

            updateDeckListUI();
            updateTopScreenDisplay();
            populateDashboardDeckSelect();

            if (appState.activeScreen === 'dashboard-screen' && appState.currentDashboardDeckId === null && deckSelectionChanged) {
                 renderDashboard();
            }

        } catch (error) {
            console.error("Error deleting deck:", error);
            showNotification("問題集の削除中に予期せぬエラーが発生しました。", "error");
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

    if (confirm(`問題集「${deckName}」の全ての学習履歴（各問題の解答履歴、評価、累計正答率、最終学習日、セッション履歴）をリセットします。\n\n問題自体は削除されません。\nこの操作は元に戻せません！\n\nよろしいですか？`)) {
        try {
            const originalDeck = JSON.parse(JSON.stringify(deck));

            deck.lastStudied = null;
            deck.totalCorrect = 0;
            deck.totalIncorrect = 0;
            deck.sessionHistory = [];

            if (Array.isArray(deck.questions)) {
                deck.questions.forEach(q => {
                    if (q && typeof q === 'object') {
                        q.history = [];
                    }
                });
            }

            if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                 appState.allDecks[deckId] = originalDeck;
                 console.error("Failed to save history reset to LocalStorage. Operation rolled back in memory.");
                 showNotification("学習履歴の保存に失敗しました。リセットはキャンセルされました。", "error", 6000);
                 return;
            }

            console.log("History reset for deck:", deckId);
            showNotification(`問題集「${deckName}」の学習履歴をリセットしました。`, "success");

            updateTopScreenDisplay();
            updateDeckListUI();
            updateFilteredQuestionCount();
            updateStudyButtonsState();

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
        filteredList = getFilteredStudyList();
        console.log(`startStudy: Filter '${appState.studyFilter}' generated ${filteredList.length} questions for deck '${currentDeck.name}'`);
    } catch (error) {
        console.error("startStudy: Error getting filtered list:", error);
        showNotification("学習リストの生成中にエラーが発生しました。", "error");
        return;
    }

    if (!Array.isArray(filteredList)) {
         console.error("startStudy: Filtered list is not an array after generation!", filteredList);
         showNotification("学習リストの形式が不正です。", "error");
         return;
    }
    if (filteredList.length === 0) {
        let filterLabel = "選択されたフィルター条件";
        const selectedRadio = document.querySelector('input[name="study-filter"]:checked');
        if (selectedRadio) {
             const labelElement = document.querySelector(`label[for="${selectedRadio.id}"]`);
             if(labelElement) filterLabel = `「${labelElement.textContent.trim()}」フィルター`;
        }
        showNotification(`${filterLabel}に該当する問題がありません。`, 'warning');
        return;
    }

    appState.studyList = [...filteredList];
    if (appState.settings.shuffleOptions) {
        appState.studyList = shuffleArray(appState.studyList);
        console.log("startStudy: Study list shuffled.");
    }

    // Reset session state for the new session
    appState.currentQuestionIndex = 0;
    appState.stats.currentSessionCorrect = 0;
    appState.stats.currentSessionIncorrect = 0;
    console.log("Session stats reset for new study session.");


    if (dom.studyScreenTitle) {
        dom.studyScreenTitle.textContent = `学習中: ${currentDeck.name || '名称未設定'}`;
    }
    if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';
    if(dom.quitStudyButton) dom.quitStudyButton.style.display = 'inline-block';
    if(dom.studyCard) dom.studyCard.style.display = 'block';
    if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
    if(dom.answerArea) dom.answerArea.style.display = 'none';

    navigateToScreen('study-screen');
    console.log(`startStudy: Starting session with ${appState.studyList.length} questions.`);
    displayCurrentQuestion();
}

/** 現在のインデックスの問題を画面に表示する */
function displayCurrentQuestion() {
    console.log(`displayCurrentQuestion - Index: ${appState.currentQuestionIndex}, List length: ${appState.studyList?.length}`);

    const requiredElements = ['questionCounter', 'questionText', 'optionsButtonsContainer', 'answerArea', 'evaluationControls', 'studyCard', 'feedbackMessage', 'retryButton'];
    const missingElements = requiredElements.filter(key => !dom[key] || !document.body.contains(dom[key]));
    if (missingElements.length > 0) {
        console.error(`displayCurrentQuestion: Critical UI elements missing: ${missingElements.join(', ')}`);
        showNotification("学習画面の表示に必要な要素が見つかりません。ホーム画面に戻ります。", "error", 8000);
        resetStudyState();
        navigateToScreen('home-screen');
        return;
    }
    if (!Array.isArray(appState.studyList) || appState.studyList.length === 0 || appState.currentQuestionIndex < 0 || appState.currentQuestionIndex >= appState.studyList.length) {
        console.warn("displayCurrentQuestion: Invalid studyList or index. Ending study session.", appState.studyList, appState.currentQuestionIndex);
        showStudyCompletion();
        return;
    }

    const questionData = appState.studyList[appState.currentQuestionIndex];

    if (!questionData || typeof questionData !== 'object' || !questionData.question || !Array.isArray(questionData.options) || questionData.options.length < 2 || !questionData.correctAnswer) {
        console.error(`displayCurrentQuestion: Invalid or incomplete question data at index ${appState.currentQuestionIndex}. Skipping.`, questionData);
        showNotification(`問題 ${appState.currentQuestionIndex + 1} のデータが不正なためスキップします。`, "warning", 5000);
        appState.currentQuestionIndex++;
        setTimeout(displayCurrentQuestion, 0);
        return;
    }

    console.log("displayCurrentQuestion: Displaying question:", questionData.id);

    try {
        dom.answerArea.style.display = 'none';
        dom.evaluationControls.style.display = 'none';
        dom.feedbackMessage.textContent = '';
        dom.feedbackMessage.className = 'feedback-message';
        dom.studyCard.classList.remove('correct-answer', 'incorrect-answer');
        dom.retryButton.style.display = 'none';
        dom.evalButtons.forEach(btn => btn.disabled = false);

        dom.questionCounter.textContent = `${appState.currentQuestionIndex + 1} / ${appState.studyList.length}`;
        dom.questionText.textContent = questionData.question;

        dom.optionsButtonsContainer.innerHTML = '';
        dom.optionsButtonsContainer.setAttribute('aria-busy', 'true');

        const optionsSource = questionData.options;
        const optionsToDisplay = appState.settings.shuffleOptions ? shuffleArray([...optionsSource]) : [...optionsSource];

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
            button.dataset.optionValue = optionText;
            fragment.appendChild(button);
        });
        dom.optionsButtonsContainer.appendChild(fragment);
        dom.optionsButtonsContainer.removeAttribute('aria-busy');

        dom.answerText.textContent = questionData.correctAnswer || '正解情報なし';
        dom.explanationText.textContent = questionData.explanation || '解説はありません。';

        const firstOptionButton = dom.optionsButtonsContainer.querySelector('.option-button');
        if (firstOptionButton) {
             firstOptionButton.focus();
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
        return;
    }

    const allOptionButtons = dom.optionsButtonsContainer.querySelectorAll('.option-button');
    allOptionButtons.forEach(btn => btn.disabled = true);

    const selectedOption = clickedButton.dataset.optionValue;
    const questionData = appState.studyList?.[appState.currentQuestionIndex];

    if (!questionData || !questionData.correctAnswer) {
        console.error("handleOptionSelect: Cannot get current question data or correct answer.");
        showNotification("解答処理中にエラーが発生しました。", "error");
        return;
    }
    const correctAnswer = questionData.correctAnswer;

    handleAnswerSubmission(selectedOption, correctAnswer);
}

/**
 * 解答提出後の処理（正誤判定、UI更新、履歴記録準備）
 * @param {string} selectedOption ユーザーが選択した選択肢
 * @param {string} correctAnswer 正解の選択肢
 */
function handleAnswerSubmission(selectedOption, correctAnswer) {
     if (!dom.studyCard || !dom.feedbackMessage || !dom.answerArea || !dom.retryButton || !dom.evaluationControls || !dom.optionsButtonsContainer) {
        console.error("handleAnswerSubmission: Required UI elements for feedback are missing.");
        return;
    }
    const questionData = appState.studyList?.[appState.currentQuestionIndex];
    if (!questionData) {
        console.error("handleAnswerSubmission: Question data is missing.");
        return;
    }

    const isCorrect = selectedOption === correctAnswer;

    // Update session stats (these are used for completion message AND session history)
    if (isCorrect) {
        appState.stats.currentSessionCorrect++;
        dom.studyCard.classList.add('correct-answer');
        dom.feedbackMessage.textContent = '✨ 正解！ ✨';
        dom.feedbackMessage.className = 'feedback-message correct';
        dom.retryButton.style.display = 'none';
    } else {
        appState.stats.currentSessionIncorrect++;
        dom.studyCard.classList.add('incorrect-answer');
        dom.feedbackMessage.textContent = '🤔 不正解... 正解は下に表示されています。';
        dom.feedbackMessage.className = 'feedback-message incorrect';
        dom.retryButton.style.display = 'inline-block';
    }

    // Highlight correct/incorrect options visually
    dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
        const buttonOption = button.dataset.optionValue;
        button.classList.remove('success', 'danger');

        if (buttonOption === correctAnswer) {
            button.classList.add('success');
        } else if (buttonOption === selectedOption) {
            button.classList.add('danger');
        } else {
            button.style.opacity = '0.6';
        }
    });

    dom.answerText.textContent = correctAnswer || '正解情報なし';
    dom.explanationText.textContent = questionData.explanation || '解説はありません。';
    dom.answerArea.style.display = 'block';
    dom.answerArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    dom.evaluationControls.style.display = 'block';
    const firstEvalButton = dom.evaluationControls.querySelector('.eval-button');
    if(firstEvalButton) {
         firstEvalButton.focus();
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
    if (!evaluation || !['difficult', 'normal', 'easy'].includes(evaluation)) {
        console.warn("Invalid evaluation level on button:", evalButton);
        return;
    }

    dom.evalButtons.forEach(btn => btn.disabled = true);

    const deckId = appState.currentDeckId;
    const questionIndexInStudyList = appState.currentQuestionIndex;

    if (!deckId || !appState.allDecks[deckId]) {
        console.error("handleEvaluation: Current deck ID or deck data is invalid.");
        dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }
    if (!Array.isArray(appState.studyList) || questionIndexInStudyList < 0 || questionIndexInStudyList >= appState.studyList.length) {
        console.error("handleEvaluation: Invalid studyList or index.", appState.studyList, questionIndexInStudyList);
        dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }
    const questionDataFromStudyList = appState.studyList[questionIndexInStudyList];
    const questionId = questionDataFromStudyList?.id;
    if (!questionId) {
        console.error("handleEvaluation: Question ID not found in the current study list item:", questionDataFromStudyList);
        dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }

    const isCorrect = dom.feedbackMessage?.classList.contains('correct') ?? false;

    const deck = appState.allDecks[deckId];
    const questionInDeck = deck.questions.find(q => q.id === questionId);

    if (questionInDeck) {
        if (!Array.isArray(questionInDeck.history)) {
            questionInDeck.history = [];
        }
        questionInDeck.history.push({
            ts: Date.now(),
            correct: isCorrect,
            evaluation: evaluation
        });
        console.log(`History added for question ${questionId}: correct=${isCorrect}, evaluation=${evaluation}`);

        // Update cumulative stats
        if (isCorrect) {
            deck.totalCorrect = (deck.totalCorrect || 0) + 1;
        } else {
            deck.totalIncorrect = (deck.totalIncorrect || 0) + 1;
        }
        deck.lastStudied = Date.now();

        if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
            console.error("Failed to save history update to LocalStorage.");
            showNotification("学習履歴の保存に失敗しました。", "error");
            dom.evalButtons.forEach(btn => btn.disabled = false);
            return;
        }
    } else {
        console.error(`handleEvaluation: Question with ID ${questionId} not found in deck ${deckId}. History not saved.`);
        showNotification("問題データの不整合が発生しました。履歴が保存できません。", "error");
        dom.evalButtons.forEach(btn => btn.disabled = false);
        return;
    }

    appState.currentQuestionIndex++;
    if (appState.currentQuestionIndex < appState.studyList.length) {
        displayCurrentQuestion();
    } else {
        showStudyCompletion();
    }
}


/** 学習セッション完了時の処理 */
function showStudyCompletion() {
    console.log("showStudyCompletion called. Session results:", appState.stats);

    const requiredElements = ['studyCompleteMessage', 'sessionCorrectCount', 'sessionIncorrectCount', 'studyCard', 'evaluationControls', 'quitStudyButton', 'backToTopButton'];
    const missingElements = requiredElements.filter(key => !dom[key] || !document.body.contains(dom[key]));
    if (missingElements.length > 0) {
        console.error(`showStudyCompletion: Required UI elements missing: ${missingElements.join(', ')}`);
        showNotification("学習完了画面の表示に必要な要素が見つかりません。", "error");
        resetStudyState();
        navigateToScreen('home-screen');
        return;
    }

    const deckId = appState.currentDeckId;
    if (deckId && appState.allDecks[deckId]) {
         const deck = appState.allDecks[deckId];
         if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
         // Record session result if questions were answered
         if (appState.stats.currentSessionCorrect > 0 || appState.stats.currentSessionIncorrect > 0) {
             deck.sessionHistory.push({
                 ts: Date.now(), // Timestamp of completion
                 correct: appState.stats.currentSessionCorrect,
                 incorrect: appState.stats.currentSessionIncorrect
             });
             if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                  console.error("Failed to save session history to LocalStorage on completion.");
                  // showNotification("セッション履歴の保存に失敗しました。", "warning"); // Optional notification
             } else {
                  console.log("Session history saved on completion for deck:", deckId);
             }
         } else {
            console.log("Skipping session history save on completion as no questions were answered.");
         }
    } else {
        console.warn("showStudyCompletion: Could not save session history, current deck not found:", deckId);
    }

    dom.studyCard.style.display = 'none';
    dom.evaluationControls.style.display = 'none';
    dom.quitStudyButton.style.display = 'none';

    dom.sessionCorrectCount.textContent = appState.stats.currentSessionCorrect;
    dom.sessionIncorrectCount.textContent = appState.stats.currentSessionIncorrect;
    dom.studyCompleteMessage.style.display = 'block';
    dom.studyCompleteMessage.focus();

    resetStudyState(); // Reset list/index for next session

    updateTopScreenDisplay();
    updateDeckListUI();
}

/** 現在の問題にもう一度挑戦する */
function retryCurrentQuestion() {
    if (!dom.answerArea || !dom.evaluationControls || !dom.feedbackMessage || !dom.studyCard || !dom.optionsButtonsContainer || !dom.retryButton) {
         console.error("retryCurrentQuestion: Missing required UI elements.");
         return;
    }
    if (appState.currentQuestionIndex >= 0 && appState.currentQuestionIndex < appState.studyList?.length) {
        console.log("Retrying question:", appState.currentQuestionIndex + 1);

        // Adjust session stats (decrease incorrect count for this attempt)
        // Note: This only affects the session completion message, not cumulative stats.
        appState.stats.currentSessionIncorrect = Math.max(0, appState.stats.currentSessionIncorrect - 1);
        console.log("Session stats adjusted for retry:", appState.stats);


        // Reset UI to before answering
        dom.answerArea.style.display = 'none';
        dom.evaluationControls.style.display = 'none';
        dom.feedbackMessage.textContent = '';
        dom.feedbackMessage.className = 'feedback-message';
        dom.studyCard.classList.remove('correct-answer', 'incorrect-answer');
        dom.retryButton.style.display = 'none';

        // Re-enable and reset option buttons
        dom.optionsButtonsContainer.querySelectorAll('.option-button').forEach(button => {
            button.disabled = false;
            button.classList.remove('success', 'danger');
            button.style.opacity = '1';
        });

        const firstOptionButton = dom.optionsButtonsContainer.querySelector('.option-button');
        if (firstOptionButton) {
             firstOptionButton.focus();
        }
    } else {
        console.warn("Cannot retry: Invalid question index or study list.");
    }
}

/**
 * 学習の中断を確認し、履歴とセッション統計を保存してホーム画面に戻る
 * @mod V2.2: 中断時にもセッション統計を保存するように変更
 */
function confirmQuitStudy() {
    // 1. 確認メッセージ更新
    if (confirm("現在の学習セッションを中断してホーム画面に戻りますか？\n\nここまでの解答履歴とセッション統計（正解/不正解数）は保存され、学習推移グラフに反映されます。\n\nよろしいですか？")) {
        console.log("Study session interrupted by user. Saving history and session stats.");

        const deckId = appState.currentDeckId;
        const lastAnsweredQuestionIndex = appState.currentQuestionIndex; // Index of the question being displayed/just answered
        const answerAreaVisible = dom.answerArea?.style.display === 'block';
        const evalControlsVisible = dom.evaluationControls?.style.display === 'block';
        let deckDataChanged = false; // Flag to track if deck data needs saving

        // 2. 最後に解答済み・未評価の問題があれば履歴を保存
        if (answerAreaVisible && evalControlsVisible && deckId && appState.allDecks[deckId] && lastAnsweredQuestionIndex >= 0 && lastAnsweredQuestionIndex < appState.studyList?.length) {
            const questionDataFromStudyList = appState.studyList[lastAnsweredQuestionIndex];
            const questionId = questionDataFromStudyList?.id;
            const deck = appState.allDecks[deckId];
            const questionInDeck = deck?.questions.find(q => q.id === questionId);

            if (questionInDeck) {
                const isCorrect = dom.feedbackMessage?.classList.contains('correct') ?? false;
                console.log(`Saving history for last unanswered question (index ${lastAnsweredQuestionIndex}, ID ${questionId}) before quitting.`);
                if (!Array.isArray(questionInDeck.history)) { questionInDeck.history = []; }
                questionInDeck.history.push({
                    ts: Date.now(),
                    correct: isCorrect,
                    evaluation: null // Evaluation not submitted
                });
                // Update cumulative stats as well
                if (isCorrect) { deck.totalCorrect = (deck.totalCorrect || 0) + 1; }
                else { deck.totalIncorrect = (deck.totalIncorrect || 0) + 1; }
                deck.lastStudied = Date.now();
                deckDataChanged = true;
            } else {
                console.warn(`Could not find question ${questionId} in deck ${deckId} to save history on quit.`);
            }
        } else {
            console.log("No pending individual history to save on quit.");
        }

        // 3. ★ セッション履歴の保存を追加
        const sessionCorrect = appState.stats.currentSessionCorrect;
        const sessionIncorrect = appState.stats.currentSessionIncorrect;

        // 解答が1つ以上あればセッション履歴を記録
        if ((sessionCorrect > 0 || sessionIncorrect > 0) && deckId && appState.allDecks[deckId]) {
             const deck = appState.allDecks[deckId];
             if (!Array.isArray(deck.sessionHistory)) deck.sessionHistory = [];
             deck.sessionHistory.push({
                 ts: Date.now(), // Timestamp of interruption
                 correct: sessionCorrect,
                 incorrect: sessionIncorrect
             });
             console.log(`Session history added on quit for deck ${deckId}: Correct=${sessionCorrect}, Incorrect=${sessionIncorrect}`);
             deckDataChanged = true; // Mark data as changed for saving
        } else {
             console.log("Skipping session history save on quit: No questions answered or deck not found.");
        }

        // 4. デッキデータを保存（変更があった場合のみ）
        if (deckDataChanged) {
             if (!saveData(LS_KEYS.DECKS, appState.allDecks)) {
                  console.error("Failed to save deck data on quit.");
                  showNotification("中断時の履歴またはセッション統計の保存に失敗しました。", "error");
                  // 保存失敗しても処理は続行
             } else {
                  console.log("Deck data saved successfully on quit.");
             }
        }

        // 5. resetStudyState を呼んでメモリ上のセッション情報をクリア
        resetStudyState(); // Resets list and index

        // 6. UIリセットと画面遷移
        if(dom.studyCard) dom.studyCard.style.display = 'block';
        if(dom.evaluationControls) dom.evaluationControls.style.display = 'none';
        if(dom.answerArea) dom.answerArea.style.display = 'none';
        if(dom.studyCompleteMessage) dom.studyCompleteMessage.style.display = 'none';
        if(dom.quitStudyButton) dom.quitStudyButton.style.display = 'none';
        if(dom.questionText) dom.questionText.textContent = '';
        if(dom.questionCounter) dom.questionCounter.textContent = '';
        if(dom.optionsButtonsContainer) dom.optionsButtonsContainer.innerHTML = '';

        navigateToScreen('home-screen');
        showNotification("学習を中断しました。ここまでの履歴と統計は保存されました。", "info", 3500); // メッセージ更新
        updateTopScreenDisplay(); // 反映
        updateDeckListUI();       // 反映
    }
    // else: User clicked Cancel - do nothing
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
    // stats (currentSessionCorrect/Incorrect) are NOT reset here.
    // They are reset at the beginning of the *next* session in startStudy().
    console.log("Study state reset (list and index). Session stats remain until next session start.");
}


// ====================================================================
// 学習フィルター関連処理 (Study Filter Handling)
// ====================================================================

/** ホーム画面の学習フィルターラジオボタンが変更されたときのハンドラ */
function handleStudyFilterChange(event) {
    if (event.target.checked && event.target.name === 'study-filter') {
        appState.studyFilter = event.target.value;
        console.log("Study filter changed to:", appState.studyFilter);
        updateFilteredQuestionCount();
    }
}

/**
 * 現在選択されているデッキとフィルターに基づいて、学習対象の問題リストを取得する
 * @returns {QuestionData[]} フィルターされた問題データの配列 (常に配列を返す)
 */
function getFilteredStudyList() {
    const deckId = appState.currentDeckId;
    if (!deckId || !appState.allDecks[deckId] || !Array.isArray(appState.allDecks[deckId].questions)) {
        console.warn("getFilteredStudyList: Current deck or questions not available, returning empty array.");
        return [];
    }

    const questions = appState.allDecks[deckId].questions;
    const filter = appState.studyFilter;
    const lowThreshold = appState.settings.lowAccuracyThreshold;

    console.log(`getFilteredStudyList: Applying filter "${filter}" with threshold <= ${lowThreshold}% to ${questions.length} questions.`);

    try {
        let filteredQuestions;
        switch (filter) {
            case 'lowAccuracy':
                filteredQuestions = questions.filter(q => {
                    const history = q.history || [];
                    if (history.length === 0) return false;
                    const correctCount = history.filter(h => h.correct).length;
                    const accuracy = Math.round((correctCount / history.length) * 100);
                    return accuracy <= lowThreshold;
                });
                break;
            case 'incorrect':
                filteredQuestions = questions.filter(q => {
                    const history = q.history || [];
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
                     return history.length > 0 && history[history.length - 1].evaluation === filter;
                 });
                break;
            case 'all':
            default:
                filteredQuestions = [...questions];
                break;
        }

        if (!Array.isArray(filteredQuestions)) {
            console.error(`getFilteredStudyList: Filtering result was not an array for filter "${filter}". Falling back to an empty array.`);
            return [];
        }

        console.log(`getFilteredStudyList (Filter: ${filter}): Returning ${filteredQuestions.length} questions.`);
        return filteredQuestions;

    } catch (error) {
        console.error(`Error in getFilteredStudyList with filter "${filter}":`, error);
        showNotification("フィルター処理中にエラーが発生しました。", "error");
        return [];
    }
}

/** ホーム画面の「対象問題数」表示を更新し、学習開始ボタンの状態も更新する */
function updateFilteredQuestionCount() {
    if (!dom.filteredQuestionCount || !dom.studyFilterOptions || !dom.startStudyButton) {
        updateStudyButtonsState();
        return;
    }

    if (dom.studyFilterOptions.style.display === 'none') {
         dom.filteredQuestionCount.textContent = '';
         updateStudyButtonsState();
         return;
    }

    try {
        const filteredList = getFilteredStudyList();
        dom.filteredQuestionCount.textContent = `対象問題数: ${filteredList.length}問`;
        updateStudyButtonsState();
    } catch (error) {
        console.error("Error updating filtered question count:", error);
        dom.filteredQuestionCount.textContent = "対象問題数: エラー";
        updateStudyButtonsState();
    }
}


// ====================================================================
// 設定関連処理 (Settings Handling)
// ====================================================================

/** 現在のアプリ設定を設定画面のUIに反映させる */
function loadSettingsToUI() {
    if (!dom.settingsContainer) return;
    try {
        if (dom.settingShuffleOptions) {
            dom.settingShuffleOptions.checked = appState.settings.shuffleOptions;
        }
        if (dom.settingLowAccuracyThreshold) {
            dom.settingLowAccuracyThreshold.value = appState.settings.lowAccuracyThreshold;
        }
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
    if (statusElement) {
        statusElement.textContent = '';
        statusElement.className = 'status-message';
    }

    try {
        let settingsChanged = false;
        const newSettings = { ...appState.settings };

        if (dom.settingShuffleOptions) {
            newSettings.shuffleOptions = dom.settingShuffleOptions.checked;
        }

        let thresholdValid = true;
        if (dom.settingLowAccuracyThreshold) {
            const thresholdInput = dom.settingLowAccuracyThreshold.value;
            const threshold = parseInt(thresholdInput, 10);

            if (isNaN(threshold) || threshold < 1 || threshold > 99) {
                thresholdValid = false;
                dom.settingLowAccuracyThreshold.value = appState.settings.lowAccuracyThreshold;
                showNotification('「苦手な問題」の閾値は1から99の間の整数で設定してください。元の値に戻しました。', 'warning', 5000);
            } else {
                 newSettings.lowAccuracyThreshold = threshold;
            }
        }

        if (thresholdValid && JSON.stringify(newSettings) !== JSON.stringify(appState.settings)) {
             settingsChanged = true;
             appState.settings = newSettings;
        }

        if (settingsChanged) {
            if (saveData(LS_KEYS.SETTINGS, appState.settings)) {
                console.log("Settings saved:", appState.settings);
                loadSettingsToUI();
                updateFilteredQuestionCount();
                if (statusElement) {
                    statusElement.textContent = '設定を保存しました。';
                    statusElement.className = 'status-message success';
                }
                showNotification('設定を保存しました。', 'success');
            } else {
                 if (statusElement) {
                    statusElement.textContent = '設定の保存に失敗しました。';
                    statusElement.className = 'status-message error';
                 }
            }
        } else if (thresholdValid) {
            console.log("Settings not saved, no changes detected.");
            if (statusElement) {
                 statusElement.textContent = '変更はありませんでした。';
                 statusElement.className = 'status-message info';
            }
            showNotification('設定に変更はありませんでした。', 'info', 2500);
        }

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
    if (statusElement) statusElement.textContent = '';

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showNotification('お使いのブラウザはクリップボード機能に対応していません。手動でコピーしてください。', 'warning', 5000);
        if (statusElement) {
            statusElement.textContent = 'ブラウザ未対応';
            statusElement.className = 'status-message warning';
        }
        return;
    }
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

    if (button) button.disabled = true;

    navigator.clipboard.writeText(prompt)
        .then(() => {
            if (statusElement) {
                statusElement.textContent = 'コピーしました！';
                statusElement.className = 'status-message success';
                setTimeout(() => { if(dom.copyStatus) { dom.copyStatus.textContent = ''; dom.copyStatus.className = 'status-message'; } }, 2500);
            }
            showNotification('プロンプトをクリップボードにコピーしました。', 'success', 2500);
        })
        .catch(err => {
            console.error('Failed to copy prompt to clipboard: ', err);
            if (statusElement) {
                statusElement.textContent = 'コピー失敗';
                statusElement.className = 'status-message error';
            }
            showNotification('プロンプトのコピーに失敗しました。手動でコピーしてください。', 'error', 5000);
        })
        .finally(() => {
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
    const previouslySelectedValue = appState.currentDashboardDeckId || select.value;

    select.innerHTML = '<option value="">-- 問題集を選択してください --</option>';

    const deckIds = Object.keys(appState.allDecks);

    deckIds.sort((a, b) => {
        const nameA = appState.allDecks[a]?.name || '';
        const nameB = appState.allDecks[b]?.name || '';
        return nameA.localeCompare(nameB, 'ja');
    });

    const fragment = document.createDocumentFragment();
    deckIds.forEach(deckId => {
        const deck = appState.allDecks[deckId];
        if (deck) {
            const option = document.createElement('option');
            option.value = deckId;
            option.textContent = `${deck.name || '名称未設定'} (${deck.questions?.length || 0}問)`;
            fragment.appendChild(option);
        }
    });
    select.appendChild(fragment);

    if (previouslySelectedValue && appState.allDecks[previouslySelectedValue]) {
         select.value = previouslySelectedValue;
         appState.currentDashboardDeckId = previouslySelectedValue;
    } else {
         select.value = "";
         appState.currentDashboardDeckId = null;
    }
}

/** ダッシュボードのデッキ選択が変更されたときのハンドラ */
function handleDashboardDeckChange() {
    if (!dom.dashboardDeckSelect) return;
    const selectedDeckId = dom.dashboardDeckSelect.value;
    appState.currentDashboardDeckId = selectedDeckId || null;
    console.log("Dashboard deck selection changed to:", appState.currentDashboardDeckId);

    resetDashboardFiltersAndState();
    renderDashboard();
}

/** ダッシュボードの正答率フィルターが変更されたときのハンドラ */
function handleDashboardFilterChange() {
    if (!dom.dashboardFilterAccuracy) return;
    appState.dashboardFilterAccuracy = dom.dashboardFilterAccuracy.value;
    appState.dashboardCurrentPage = 1;
    console.log("Dashboard filter changed to:", appState.dashboardFilterAccuracy);
    renderDashboardQuestionAnalysis();
}

/** ダッシュボードの検索入力が変更されたときのハンドラ */
function handleDashboardSearchInput() {
    if (!dom.dashboardSearchQuery || !dom.dashboardSearchButton) return;
    appState.dashboardSearchQuery = dom.dashboardSearchQuery.value.trim();
    dom.dashboardSearchButton.disabled = appState.dashboardSearchQuery === '';
}

/** ダッシュボードの検索ボタンがクリックされたときのハンドラ */
function applyDashboardSearch() {
    console.log("Applying dashboard search query:", appState.dashboardSearchQuery);
    if (!dom.dashboardSearchButton || dom.dashboardSearchButton.disabled) {
        return;
    }
    appState.dashboardCurrentPage = 1;
    renderDashboardQuestionAnalysis();
}

/** ダッシュボードの検索クリアボタンがクリックされたときのハンドラ */
function clearDashboardSearch() {
    if (dom.dashboardSearchQuery) {
        dom.dashboardSearchQuery.value = '';
    }
    if (dom.dashboardSearchButton) {
        dom.dashboardSearchButton.disabled = true;
    }
    if (appState.dashboardSearchQuery !== '') {
         appState.dashboardSearchQuery = '';
         appState.dashboardCurrentPage = 1;
         console.log("Dashboard search cleared.");
         renderDashboardQuestionAnalysis();
    }
}

/** ダッシュボードのソート順が変更されたときのハンドラ */
function handleDashboardSortChange() {
    if (!dom.dashboardSortOrder) return;
    appState.dashboardSortOrder = dom.dashboardSortOrder.value;
    appState.dashboardCurrentPage = 1;
    console.log("Dashboard sort order changed to:", appState.dashboardSortOrder);
    renderDashboardQuestionAnalysis();
}

/**
 * ダッシュボードの問題分析表示モード（リスト/グラフ）を切り替える
 * @param {'list'|'chart'} mode - 設定するモード
 */
function setDashboardViewMode(mode) {
    if (mode !== 'list' && mode !== 'chart') return;
    if (mode === appState.dashboardViewMode) return;

    appState.dashboardViewMode = mode;

    const isListMode = mode === 'list';
    if (dom.viewModeList) {
        dom.viewModeList.classList.toggle('active', isListMode);
        dom.viewModeList.setAttribute('aria-pressed', String(isListMode));
    }
    if (dom.viewModeChart) {
        dom.viewModeChart.classList.toggle('active', !isListMode);
        dom.viewModeChart.setAttribute('aria-pressed', String(!isListMode));
    }

    if (dom.questionListView) dom.questionListView.classList.toggle('active', isListMode);
    if (dom.questionChartView) dom.questionChartView.classList.toggle('active', !isListMode);

    renderDashboardQuestionAnalysis();
    console.log("Dashboard view mode set to:", mode);
}

/** ダッシュボードのフィルター、ソート、ページング、表示モード等の状態をリセットする */
function resetDashboardFiltersAndState() {
    appState.dashboardFilterAccuracy = 'all';
    appState.dashboardSearchQuery = '';
    appState.dashboardSortOrder = 'accuracyAsc';
    appState.dashboardCurrentPage = 1;
    appState.dashboardViewMode = 'list';

    if (dom.dashboardFilterAccuracy) dom.dashboardFilterAccuracy.value = 'all';
    if (dom.dashboardSearchQuery) dom.dashboardSearchQuery.value = '';
    if (dom.dashboardSearchButton) dom.dashboardSearchButton.disabled = true;
    if (dom.dashboardSortOrder) dom.dashboardSortOrder.value = 'accuracyAsc';

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

    closeQuestionDetailView();
    console.log("Dashboard filters and state reset to defaults.");
}

/**
 * ダッシュボード画面全体をレンダリングする
 */
async function renderDashboard() {
    const deckId = appState.currentDashboardDeckId;
    console.log("renderDashboard called for deck:", deckId);

    if (!dom.dashboardContent || !dom.dashboardNoDeckMessage) {
        console.error("renderDashboard: Dashboard container elements not found in DOM.");
        return;
    }

    if (!deckId || !appState.allDecks[deckId]) {
        dom.dashboardContent.style.display = 'none';
        dom.dashboardNoDeckMessage.style.display = 'flex';
        console.log("renderDashboard: No deck selected or deck data not found.");
        if (studyTrendsChart) { studyTrendsChart.destroy(); studyTrendsChart = null; }
        if (questionAccuracyChart) { questionAccuracyChart.destroy(); questionAccuracyChart = null; }
        return;
    }

    dom.dashboardContent.style.display = 'block';
    dom.dashboardNoDeckMessage.style.display = 'none';
    const deck = appState.allDecks[deckId];

    if (!deck) {
         console.error("renderDashboard: Deck data inconsistency. Deck object not found for ID:", deckId);
         dom.dashboardContent.style.display = 'none';
         dom.dashboardNoDeckMessage.style.display = 'flex';
         const messageSpan = dom.dashboardNoDeckMessage.querySelector('span');
         if (messageSpan) messageSpan.textContent = "選択された問題集データの読み込みエラー";
         showNotification("選択された問題集データの読み込み中に予期せぬエラーが発生しました。", "error");
         return;
    }

    showLoadingOverlay(true);
    try {
        console.log("Rendering Dashboard Overview...");
        renderDashboardOverview(deck); // ここで呼び出される

        console.log("Rendering Dashboard Trends Chart...");
        await renderDashboardTrendsChart(deck);

        console.log("Rendering Dashboard Question Analysis...");
        await renderDashboardQuestionAnalysis();

        console.log("Dashboard rendering process completed successfully for deck:", deckId);
    } catch (error) {
        console.error("Error during dashboard rendering process:", error);
        showNotification(`ダッシュボードの描画中にエラーが発生しました: ${error.message}`, "error", 7000);
        dom.dashboardContent.style.display = 'none';
        dom.dashboardNoDeckMessage.style.display = 'flex';
        const messageSpan = dom.dashboardNoDeckMessage.querySelector('span');
        if (messageSpan) messageSpan.textContent = "ダッシュボード表示エラー";

    } finally {
        showLoadingOverlay(false);
    }
}


/**
 * ダッシュボードの「概要」セクションをレンダリングする
 * @param {DeckData} deck - 表示対象のデッキデータ
 */
function renderDashboardOverview(deck) {
    const requiredKeys = ['dashboardDeckName', 'dashboardTotalQuestions', 'dashboardTotalAnswered', 'dashboardOverallAccuracy', 'dashboardLastStudied'];
    if (requiredKeys.some(key => !dom[key])) {
        console.warn("renderDashboardOverview: One or more overview DOM elements are missing.");
        return;
    }

    try {
        dom.dashboardDeckName.textContent = deck.name || '名称未設定';
        dom.dashboardTotalQuestions.textContent = deck.questions?.length ?? 0;

        const totalCorrect = deck.totalCorrect || 0;
        const totalIncorrect = deck.totalIncorrect || 0;
        const totalAnswered = totalCorrect + totalIncorrect;
        dom.dashboardTotalAnswered.textContent = totalAnswered;

        const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : -1;
        dom.dashboardOverallAccuracy.textContent = overallAccuracy >= 0
            ? `${overallAccuracy}% (${totalCorrect}/${totalAnswered})`
            : 'データなし';

        dom.dashboardLastStudied.textContent = deck.lastStudied ? formatDate(deck.lastStudied) : '未学習';

    } catch (error) {
        console.error("Error rendering dashboard overview:", error);
        if (dom.dashboardDeckName) dom.dashboardDeckName.textContent = "表示エラー";
        if (dom.dashboardOverallAccuracy) dom.dashboardOverallAccuracy.textContent = "エラー";
    }
}

/**
 * ダッシュボードの「学習推移」グラフをレンダリングする (V2.1 積み上げ棒グラフ + セッション番号軸)
 * @param {DeckData} deck - 表示対象のデッキデータ
 */
async function renderDashboardTrendsChart(deck) {
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
        container.style.display = 'none';
        noDataMessage.textContent = "グラフ描画エラー (Context取得失敗)";
        noDataMessage.style.display = 'block';
        return;
    }

    if (studyTrendsChart) {
        try {
             studyTrendsChart.destroy();
             studyTrendsChart = null;
             console.log("Previous study trends chart instance destroyed.");
        } catch(destroyError) {
            console.error("Error destroying previous trends chart:", destroyError);
        }
    }

    // セッション履歴を取得し、最新 DASHBOARD_TREND_SESSIONS 件に絞る
    const sessionHistory = (deck.sessionHistory || []).slice(-DASHBOARD_TREND_SESSIONS);

    if (sessionHistory.length === 0) {
        container.style.display = 'block'; // コンテナは表示
        canvas.style.display = 'none'; // キャンバスは非表示
        noDataMessage.textContent = "学習セッション履歴がありません。";
        noDataMessage.style.display = 'block'; // メッセージを表示
        console.log("renderDashboardTrendsChart: No session history data available.");
        return;
    }

    container.style.display = 'block'; // コンテナ表示
    canvas.style.display = 'block';    // キャンバス表示
    noDataMessage.style.display = 'none'; // メッセージ非表示

    // --- データ準備 ---
    const labels = sessionHistory.map((h, index) => `セッション ${index + 1}`); // X軸ラベル (セッション番号)
    const timestamps = sessionHistory.map(h => h.ts); // ツールチップ用タイムスタンプ
    const correctData = sessionHistory.map(h => h.correct || 0);
    const incorrectData = sessionHistory.map(h => h.incorrect || 0);
    const accuracyData = sessionHistory.map(h => {
        const total = (h.correct || 0) + (h.incorrect || 0);
        return total > 0 ? Math.round(((h.correct || 0) / total) * 100) : 0;
    });

    // --- チャート設定 ---
    const chartConfig = {
        type: 'bar', // 基本タイプをバーに
        data: {
            labels: labels, // X軸ラベル
            datasets: [
                {
                    label: '正解数',
                    data: correctData,
                    backgroundColor: 'rgba(46, 204, 113, 0.7)', // Success Green
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1,
                    stack: 'counts', // 積み上げグループ名
                    yAxisID: 'yCounts', // 左Y軸を使用
                    order: 2 // 積み上げ順序（後）
                },
                {
                    label: '不正解数',
                    data: incorrectData,
                    backgroundColor: 'rgba(231, 76, 60, 0.7)', // Danger Red
                    borderColor: 'rgba(231, 76, 60, 1)',
                    borderWidth: 1,
                    stack: 'counts', // 積み上げグループ名
                    yAxisID: 'yCounts', // 左Y軸を使用
                    order: 3 // 積み上げ順序（先）
                },
                {
                    label: '正答率 (%)',
                    data: accuracyData,
                    borderColor: 'rgba(52, 152, 219, 1)', // Primary Blue
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    yAxisID: 'yAccuracy', // 右Y軸を使用
                    type: 'line', // このデータセットのみ線グラフ
                    tension: 0.2,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    order: 1 // 線グラフを手前に表示
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index', // X軸の同じインデックスにある全データをツールチップ表示
                intersect: false // マウスが直接当たらなくてもツールチップ表示
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { weight: 'bold' },
                    bodySpacing: 5,
                    padding: 10,
                    callbacks: {
                        // ツールチップのタイトル (例: "セッション 5")
                        title: function(tooltipItems) {
                            return tooltipItems[0]?.label || '';
                        },
                        // ツールチップの各行 (データセットごと)
                        label: function(context) {
                             let label = context.dataset.label || '';
                             if (label) {
                                 label += ': ';
                             }
                             if (context.parsed.y !== null) {
                                 if (context.dataset.yAxisID === 'yAccuracy') {
                                     label += `${context.parsed.y}%`;
                                 } else {
                                     label += `${context.parsed.y} 問`;
                                 }
                             }
                             return label;
                        },
                         // ツールチップのフッター (日時表示)
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
                    position: 'bottom', // 凡例を下に表示
                    labels: {
                         padding: 20,
                         usePointStyle: true // 凡例マーカーを点スタイルに
                    }
                },
                 title: { // グラフ上部のタイトル（オプション）
                     display: false, // 必要なら true にして text を設定
                     // text: '学習セッションの推移'
                 }
            },
            scales: {
                x: {
                    // type: 'category', // type は不要 (labels があれば自動で category)
                    stacked: true, // X軸の積み上げ設定 (datasets側でも設定済だが念のため)
                    title: {
                        display: true,
                        text: '学習セッション' // X軸タイトル
                    },
                    grid: {
                        display: false // X軸のグリッド線非表示
                    }
                },
                yCounts: { // 左Y軸 (問題数)
                    type: 'linear',
                    position: 'left',
                    stacked: true, // Y軸の積み上げ設定
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '問題数' // 左Y軸タイトル
                    },
                    grid: {
                        color: '#e0e0e0' // Y軸グリッド線の色
                    },
                    // 目盛りの刻みを整数にする
                    ticks: {
                         precision: 0,
                         // 必要に応じて最大値やステップサイズを調整
                         // suggestedMax: Math.max(...correctData, ...incorrectData) + 5,
                         // stepSize: 1
                    }
                },
                yAccuracy: { // 右Y軸 (正答率)
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: '正答率 (%)' // 右Y軸タイトル
                    },
                    grid: {
                        drawOnChartArea: false // グラフエリアにはグリッド線を描画しない
                    },
                    ticks: {
                        stepSize: 20 // 目盛りを20%刻みに
                    }
                }
            }
        }
    };

    // --- チャート描画 ---
    try {
        requestAnimationFrame(() => {
             // チャートを描画する前にキャンバスがまだ存在するか確認
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
         canvas.style.display = 'none'; // エラー時はキャンバス非表示
         noDataMessage.textContent = "グラフ描画エラー";
         noDataMessage.style.display = 'block'; // エラーメッセージ表示
    }
}

/**
 * フィルターとソートを適用した後の問題統計情報のリストを取得する
 * @returns {Array<Object>} 各問題のデータに統計情報を追加した配列 (常に配列を返す)
 */
function getFilteredAndSortedQuestionStats() {
    const deckId = appState.currentDashboardDeckId;
    if (!deckId || !appState.allDecks[deckId] || !Array.isArray(appState.allDecks[deckId].questions)) {
        return [];
    }

    const questions = appState.allDecks[deckId].questions;
    const filterAccuracy = appState.dashboardFilterAccuracy;
    const searchQuery = appState.dashboardSearchQuery.toLowerCase();
    const sortOrder = appState.dashboardSortOrder;

    let questionStats = questions.map((q, index) => {
        const history = q.history || [];
        const totalCount = history.length;
        const correctCount = history.filter(h => h.correct).length;
        const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : -1;
        const lastAnswered = totalCount > 0 ? history[history.length - 1].ts : 0;
        const incorrectCount = totalCount - correctCount;

        return {
            ...q,
            originalIndex: index,
            correctCount,
            totalCount,
            incorrectCount,
            accuracy,
            lastAnswered,
        };
    });

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

    if (searchQuery !== '') {
        questionStats = questionStats.filter(q =>
            (q.question && q.question.toLowerCase().includes(searchQuery)) ||
            (Array.isArray(q.options) && q.options.some(opt => opt.toLowerCase().includes(searchQuery))) ||
            (q.correctAnswer && q.correctAnswer.toLowerCase().includes(searchQuery)) ||
            (q.explanation && q.explanation.toLowerCase().includes(searchQuery))
        );
    }

    questionStats.sort((a, b) => {
        switch (sortOrder) {
            case 'accuracyAsc':
                if (a.accuracy === -1 && b.accuracy !== -1) return -1;
                if (a.accuracy !== -1 && b.accuracy === -1) return 1;
                if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
                return a.originalIndex - b.originalIndex;
            case 'accuracyDesc':
                if (a.accuracy === -1 && b.accuracy !== -1) return 1;
                if (a.accuracy !== -1 && b.accuracy === -1) return -1;
                if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
                return a.originalIndex - b.originalIndex;
            case 'mostIncorrect':
                if (a.incorrectCount !== b.incorrectCount) return b.incorrectCount - a.incorrectCount;
                return a.originalIndex - b.originalIndex;
            case 'lastAnswered':
                if (a.lastAnswered !== b.lastAnswered) return b.lastAnswered - a.lastAnswered;
                return a.originalIndex - b.originalIndex;
            case 'questionOrder':
            default:
                return a.originalIndex - b.originalIndex;
        }
    });

    return questionStats;
}

/** ダッシュボードの「問題別分析」セクション（リストまたはグラフ）をレンダリングする */
async function renderDashboardQuestionAnalysis() {
    if (!dom.questionAnalysisView || !dom.dashboardAnalysisControls) { // ★ コントロール要素もチェック
        console.warn("renderDashboardQuestionAnalysis: Analysis view container or controls element not found.");
        return;
    }

    closeQuestionDetailView();

    const allFilteredStats = getFilteredAndSortedQuestionStats();
    const totalItems = allFilteredStats.length;

    const totalPages = Math.ceil(totalItems / appState.dashboardQuestionsPerPage) || 1;
    appState.dashboardCurrentPage = Math.max(1, Math.min(appState.dashboardCurrentPage, totalPages));
    const startIndex = (appState.dashboardCurrentPage - 1) * appState.dashboardQuestionsPerPage;
    const endIndex = startIndex + appState.dashboardQuestionsPerPage;
    const statsForCurrentPage = allFilteredStats.slice(startIndex, endIndex);

    try {
        if (dom.questionAccuracyList) dom.questionAccuracyList.innerHTML = '';
        if (dom.questionPagination) dom.questionPagination.innerHTML = '';
        if (dom.questionAccuracyChartContainer && dom.questionAccuracyChart) {
             if (questionAccuracyChart) {
                 try { questionAccuracyChart.destroy(); } catch(e){}
                 questionAccuracyChart = null;
             }
             dom.questionAccuracyChart.style.display = 'none';
             dom.questionAccuracyChartContainer.style.display = 'none';
        }
        if(dom.questionAccuracyNoData) dom.questionAccuracyNoData.style.display = 'none';


        if (appState.dashboardViewMode === 'list') {
            console.log(`Rendering question list view - Page ${appState.dashboardCurrentPage}/${totalPages} (${totalItems} items)`);
            renderDashboardQuestionList(statsForCurrentPage, startIndex);
            renderPaginationControls(totalItems, totalPages);
        } else if (appState.dashboardViewMode === 'chart') {
            console.log("Rendering question analysis chart view...");
             if (dom.questionAccuracyChartContainer) {
                dom.questionAccuracyChartContainer.style.display = 'block';
            }
            await renderDashboardQuestionAnalysisChart(allFilteredStats);
        }
    } catch (error) {
         console.error("Error rendering dashboard question analysis content:", error);
         showNotification("問題分析データの表示中にエラーが発生しました。", "error");
         if (dom.questionAccuracyList) dom.questionAccuracyList.innerHTML = '<li class="status-message error" style="padding: 15px; text-align: center;">表示エラーが発生しました。</li>';
         if (dom.questionPagination) dom.questionPagination.innerHTML = '';
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
    list.innerHTML = '';

    if (!stats || stats.length === 0) {
        list.innerHTML = '<li class="status-message" style="padding: 15px; text-align: center;">該当する問題がありません。フィルター条件を確認してください。</li>';
        return;
    }

    const fragment = document.createDocumentFragment();
    stats.forEach((q, index) => {
        const itemIndex = startIndex + index;
        const li = document.createElement('li');
        li.classList.add('question-accuracy-item');
        li.dataset.questionId = q.id;
        li.dataset.index = itemIndex;
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `問題 ${itemIndex + 1} 詳細表示: ${q.question.substring(0, 50)}...`);

        const questionPreview = document.createElement('div');
        questionPreview.classList.add('question-text-preview');
        questionPreview.textContent = `${itemIndex + 1}. ${q.question || '問題文なし'}`;
        li.appendChild(questionPreview);

        const scoreContainer = document.createElement('div');
        scoreContainer.classList.add('score-container');

        const accuracySpan = document.createElement('span');
        accuracySpan.classList.add('accuracy-score');
        if (q.accuracy === -1) {
            accuracySpan.textContent = '未解答';
            accuracySpan.style.color = 'var(--light-text)';
        } else {
            accuracySpan.textContent = `${q.accuracy}%`;
            if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.LOW) accuracySpan.classList.add('low');
            else if (q.accuracy <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM) accuracySpan.classList.add('medium');
            else accuracySpan.classList.add('high');
        }
        scoreContainer.appendChild(accuracySpan);

        const countsSpan = document.createElement('span');
        countsSpan.classList.add('answer-counts');
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
    if (event.key === 'Enter' || event.key === ' ') {
        const targetItem = event.target.closest('.question-accuracy-item');
        if (targetItem) {
             event.preventDefault();
             showDetailForListItem(targetItem);
        }
    }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
         const currentItem = event.target.closest('.question-accuracy-item');
         if (currentItem) {
             event.preventDefault();
             const sibling = event.key === 'ArrowDown'
                 ? currentItem.nextElementSibling
                 : currentItem.previousElementSibling;
             if (sibling && sibling.matches('.question-accuracy-item')) {
                 sibling.focus();
             }
         }
    }
}

/**
 * 問題リストアイテムがクリックされたときのハンドラ (イベント委任)
 * @param {MouseEvent} event - クリックイベント
 */
function handleQuestionItemClick(event) {
    const targetItem = event.target.closest('.question-accuracy-item');
    if (targetItem) {
        showDetailForListItem(targetItem);
    }
}

/**
 * 指定されたリストアイテムに対応する問題詳細を表示する
 * @param {HTMLElement} listItem - クリックまたはキー操作された<li>要素
 */
function showDetailForListItem(listItem) {
    const questionId = listItem.dataset.questionId;
    const indexStr = listItem.dataset.index;
    const deckId = appState.currentDashboardDeckId;

    if (!questionId || !deckId || !appState.allDecks[deckId] || indexStr === undefined) {
        console.error("Missing data required to show question detail:", { questionId, deckId, indexStr });
        showNotification("問題詳細の表示に必要な情報が見つかりません。", "error");
        return;
    }

    const allStats = getFilteredAndSortedQuestionStats();
    const questionStat = allStats.find(qs => qs.id === questionId);

    if (questionStat) {
        const displayIndex = parseInt(indexStr, 10);
        showQuestionDetail(questionStat, displayIndex);
    } else {
         console.warn("Could not find stats data for clicked/selected question:", questionId);
         showNotification("クリックされた問題データの取得に失敗しました。", "error");
    }
}


/**
 * ダッシュボードの問題分析グラフビューをレンダリングする
 * @param {Array<Object>} stats - フィルター・ソートされた全問題統計データの配列
 */
async function renderDashboardQuestionAnalysisChart(stats) {
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
        container.style.display = 'none';
        noDataMessage.textContent = "グラフ描画エラー (Context取得失敗)";
        noDataMessage.style.display = 'block';
        return;
    }

    if (questionAccuracyChart) {
        try { questionAccuracyChart.destroy(); } catch(e){}
        questionAccuracyChart = null;
    }

    const answeredStats = stats.filter(q => q.accuracy !== -1);

    if (answeredStats.length === 0) {
        container.style.display = 'block';
        canvas.style.display = 'none';
        noDataMessage.textContent = "解答済みの問題データがありません。";
        noDataMessage.style.display = 'block';
        console.log("renderDashboardQuestionAnalysisChart: No answered questions data.");
        return;
    }

    container.style.display = 'block';
    canvas.style.display = 'block';
    noDataMessage.style.display = 'none';

    const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const labels = bins.slice(0, -1).map((bin, i) => {
        const nextBin = bins[i+1];
        if (i === 0) return `0-${nextBin}%`;
        return `${bin + 1}-${nextBin}%`;
    });
    const dataCounts = Array(labels.length).fill(0);

    answeredStats.forEach(q => {
        const acc = q.accuracy;
        let binIndex = -1;
        if (acc >= 0 && acc <= 10) binIndex = 0;
        else if (acc > 10 && acc <= 20) binIndex = 1;
        else if (acc > 20 && acc <= 30) binIndex = 2;
        else if (acc > 30 && acc <= 40) binIndex = 3;
        else if (acc > 40 && acc <= 50) binIndex = 4;
        else if (acc > 50 && acc <= 60) binIndex = 5;
        else if (acc > 60 && acc <= 70) binIndex = 6;
        else if (acc > 70 && acc <= 80) binIndex = 7;
        else if (acc > 80 && acc <= 90) binIndex = 8;
        else if (acc > 90 && acc <= 100) binIndex = 9;

        if (binIndex !== -1) dataCounts[binIndex]++;
        else console.warn(`Could not determine bin for accuracy: ${acc}`);
    });

    const backgroundColors = labels.map(label => {
         const upperBoundary = parseInt(label.split('-')[1].replace('%',''), 10);
         if (upperBoundary <= DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1) return 'rgba(231, 76, 60, 0.7)';
         if (upperBoundary <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1) return 'rgba(230, 126, 34, 0.7)';
         return 'rgba(46, 204, 113, 0.7)';
    });

    const chartConfig = {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '問題数', data: dataCounts,
                backgroundColor: backgroundColors, borderColor: 'rgba(44, 62, 80, 0.8)',
                borderWidth: 1, barPercentage: 0.9, categoryPercentage: 0.8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'x',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { title: (items) => `正答率 ${items[0].label}`, label: (ctx) => `問題数: ${ctx.parsed.y} 問` } },
                title: { display: true, text: '正答率分布 (解答済み問題)', padding: { top: 10, bottom: 10 } }
            },
            scales: {
                y: {
                    beginAtZero: true, title: { display: true, text: '問題数' },
                    ticks: { stepSize: Math.max(1, Math.ceil(Math.max(...dataCounts) / 8)), precision: 0 }
                },
                x: { title: { display: true, text: '正答率範囲 (%)' }, grid: { display: false } }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const clickedIndex = elements[0].index;
                    const clickedLabel = labels[clickedIndex];
                    console.log(`Chart bar clicked: Index=${clickedIndex}, Label=${clickedLabel}`);

                    let filterValue = 'all';
                    const maxAcc = parseInt(clickedLabel.split('-')[1].replace('%',''), 10);
                    if (maxAcc <= DASHBOARD_ACCURACY_THRESHOLDS.LOW + 1) filterValue = 'low';
                    else if (maxAcc <= DASHBOARD_ACCURACY_THRESHOLDS.MEDIUM + 1) filterValue = 'medium';
                    else filterValue = 'high';

                    appState.dashboardFilterAccuracy = filterValue;
                    if (dom.dashboardFilterAccuracy) dom.dashboardFilterAccuracy.value = filterValue;
                    setDashboardViewMode('list');
                }
            }
        }
    };

    try {
        requestAnimationFrame(() => {
             if (document.getElementById(canvas.id)) {
                 questionAccuracyChart = new Chart(ctx, chartConfig);
                 console.log("Question accuracy distribution chart rendered.");
             } else {
                 console.warn("Question accuracy chart canvas removed before chart creation.");
             }
        });
    } catch (chartError) {
        console.error("Error creating question accuracy chart:", chartError);
        showNotification("問題正答率グラフの描画中にエラーが発生しました。", "error");
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
    pagination.innerHTML = '';

    if (totalPages <= 1) {
        if (totalItems > 0) {
             const pageInfo = document.createElement('span');
             pageInfo.classList.add('page-info');
             pageInfo.textContent = `${totalItems}件`;
             pagination.appendChild(pageInfo);
        }
        return;
    }

    const currentPage = appState.dashboardCurrentPage;

    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left" aria-hidden="true"></i> 前へ';
    prevButton.classList.add('button', 'small', 'secondary', 'page-nav');
    prevButton.type = 'button';
    prevButton.dataset.page = currentPage - 1;
    prevButton.disabled = currentPage === 1;
    prevButton.setAttribute('aria-label', '前のページへ');
    pagination.appendChild(prevButton);

    const pageInfo = document.createElement('span');
    pageInfo.classList.add('page-info');
    pageInfo.textContent = `${currentPage} / ${totalPages} ページ (${totalItems}件)`;
    pageInfo.setAttribute('aria-live', 'polite');
    pageInfo.setAttribute('role', 'status');
    pagination.appendChild(pageInfo);

    const nextButton = document.createElement('button');
    nextButton.innerHTML = '次へ <i class="fas fa-chevron-right" aria-hidden="true"></i>';
    nextButton.classList.add('button', 'small', 'secondary', 'page-nav');
    nextButton.type = 'button';
    nextButton.dataset.page = currentPage + 1;
    nextButton.disabled = currentPage === totalPages;
    nextButton.setAttribute('aria-label', '次のページへ');
    pagination.appendChild(nextButton);
}

/**
 * ページネーションコントロール内のボタンクリックを処理する (イベント委任)
 * @param {MouseEvent} event - クリックイベント
 */
function handlePaginationClick(event) {
    const targetButton = event.target.closest('.page-nav');
    if (targetButton && !targetButton.disabled) {
        const page = parseInt(targetButton.dataset.page, 10);
        if (!isNaN(page) && page >= 1) {
            appState.dashboardCurrentPage = page;
            renderDashboardQuestionAnalysis();
            dom.questionAccuracyList?.scrollTo({ top: 0, behavior: 'smooth' });
            dom.questionAccuracyList?.focus();
        }
    }
}


/**
 * 指定された問題の詳細情報を表示する
 * @param {Object} questionStat - 表示する問題のデータ (統計情報含む)
 * @param {number} displayIndex - リスト上での表示インデックス (0始まり)
 */
function showQuestionDetail(questionStat, displayIndex) {
     const requiredKeys = ['questionDetailView', 'detailQuestionNumber', 'detailQuestionText', 'detailCorrectAnswer', 'detailAccuracy', 'detailCorrectCount', 'detailTotalCount', 'detailRecentHistory', 'closeDetailView'];
     if (requiredKeys.some(key => !dom[key])) {
        console.error("showQuestionDetail: One or more detail view DOM elements are missing.");
        showNotification("問題詳細の表示に必要な要素が見つかりません。", "error");
        return;
    }

    dom.detailQuestionNumber.textContent = displayIndex + 1;
    dom.detailQuestionText.textContent = questionStat.question || '問題文なし';
    dom.detailCorrectAnswer.textContent = questionStat.correctAnswer || '正解情報なし';

    const { accuracy, correctCount, totalCount } = questionStat;
    if (accuracy !== undefined && accuracy >= -1) {
        if (accuracy === -1) {
            dom.detailAccuracy.textContent = '未解答';
            dom.detailCorrectCount.textContent = '0';
            dom.detailTotalCount.textContent = '0';
        } else {
            dom.detailAccuracy.textContent = `${accuracy}%`;
            dom.detailCorrectCount.textContent = correctCount ?? '0';
            dom.detailTotalCount.textContent = totalCount ?? '0';
        }
    } else {
        dom.detailAccuracy.textContent = '-';
        dom.detailCorrectCount.textContent = '-';
        dom.detailTotalCount.textContent = '-';
    }

    const historyList = dom.detailRecentHistory;
    historyList.innerHTML = '';
    const recentHistory = (Array.isArray(questionStat.history) ? questionStat.history : [])
                            .slice(-MAX_RECENT_HISTORY).reverse();

    if (recentHistory.length === 0) {
        historyList.innerHTML = '<li>解答履歴はありません。</li>';
    } else {
        const fragment = document.createDocumentFragment();
        recentHistory.forEach(h => {
            const li = document.createElement('li');

            const tsSpan = document.createElement('span');
            tsSpan.textContent = formatDate(h.ts);

            const resultSpan = document.createElement('span');
            const resultClass = h.correct ? 'correct' : 'incorrect';
            const resultText = h.correct ? '正解' : '不正解';
            let evalText = '';
            if (h.evaluation) {
                const evalMap = { difficult: '難しい', normal: '普通', easy: '簡単' };
                evalText = ` (<span class="eval" title="${h.evaluation}">${evalMap[h.evaluation] || h.evaluation}</span>)`;
            } else {
                 evalText = ' (<span class="eval" title="評価なし">-</span>)';
            }
            resultSpan.innerHTML = `<span class="${resultClass}">${resultText}</span>${evalText}`;

            li.appendChild(tsSpan);
            li.appendChild(resultSpan);
            fragment.appendChild(li);
        });
        historyList.appendChild(fragment);
    }

    dom.questionDetailView.style.display = 'block';
    setTimeout(() => {
        if(dom.questionDetailView && dom.questionDetailView.style.display === 'block') {
            dom.questionDetailView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            dom.closeDetailView?.focus();
        }
    }, 50);
}

/** 問題詳細表示エリアを閉じる */
function closeQuestionDetailView() {
    if (dom.questionDetailView && dom.questionDetailView.style.display !== 'none') {
        dom.questionDetailView.style.display = 'none';
        console.log("Question detail view closed.");
        dom.questionAccuracyList?.focus();
    }
}

// ====================================================================
// ヘルパー関数 (Utility Functions)
// ====================================================================

/**
 * 配列の要素をシャッフルする (Fisher-Yates algorithm) - 不変性を保つ
 * @param {Array} array - シャッフルしたい配列
 * @returns {Array} シャッフルされた新しい配列。入力が配列でない場合は空配列を返す。
 */
function shuffleArray(array) {
    if (!Array.isArray(array)) {
        console.warn("shuffleArray: Input is not an array! Returning empty array.", array);
        return [];
    }
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
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
    const placeholder = "----/--/-- --:--";
    if (typeof timestamp !== 'number' || !timestamp || timestamp <= 0) {
         return placeholder;
    }
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
             console.warn("formatDate: Invalid Date object from timestamp:", timestamp);
             return placeholder;
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
        console.error("Error formatting date for timestamp:", timestamp, e);
        return "日付エラー";
    }
}

// ====================================================================
// End of file: script.js
// ====================================================================