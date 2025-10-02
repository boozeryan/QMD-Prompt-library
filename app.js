/**
 * @file app.js
 * @description 品質處 Prompt Library 雲端協作版 - 優化版本
 * @version 3.0
 * @date 2025-10-02
 */

/* ========================================
   常數定義
   ======================================== */
const CONFIG = {
  MAX_HISTORY_VERSIONS: 10,
  TOAST_DURATION: 3000,
  DEBOUNCE_DELAY: 300,
  STORAGE_KEY_AUTHOR: 'promptLibraryAuthor',
};

// Firebase 設定 - 建議從環境變數或設定檔讀取
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDQDorsdx2Cetyp46riQC7i_xB2dMCvuYc",
  authDomain: "qmd-prompt-library.firebaseapp.com",
  projectId: "qmd-prompt-library",
  storageBucket: "qmd-prompt-library.firebasestorage.app",
  messagingSenderId: "622746077507",
  appId: "1:622746077507:web:e5a1089f93dbf4dd5807f6",
  measurementId: "G-KHGRGT7W30"
};

/* ========================================
   工具函式集
   ======================================== */
const Utils = {
  /**
   * 防抖函式 - 限制函式執行頻率
   */
  debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  },

  /**
   * 節流函式 - 確保函式在指定時間內只執行一次
   */
  throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * 轉義 HTML 特殊字元
   */
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * 高亮 Prompt 變數 {{variable}}
   */
  visualizePromptText(text) {
    if (!text) return '';
    const escapedText = this.escapeHTML(text);
    return escapedText.replace(/{{\s*([^}]+)\s*}}/g, '<span class="prompt-placeholder">{{$1}}</span>');
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('zh-TW');
  },

  /**
   * 格式化日期時間
   */
  formatDateTime(date) {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('zh-TW');
  },

  /**
   * 深拷貝物件
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

/* ========================================
   彈出視窗管理器
   ======================================== */
class ModalManager {
  static open(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // 聚焦到第一個可互動元素
    const focusable = modalElement.querySelector('input, textarea, select, button');
    if (focusable) {
      setTimeout(() => focusable.focus(), 100);
    }
  }

  static close(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove('active');
    document.body.style.overflow = '';
  }

  static closeAll() {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      this.close(modal);
    });
  }
}

/* ========================================
   Toast 通知管理器
   ======================================== */
class ToastManager {
  constructor(containerId = 'toastContainer') {
    this.container = document.getElementById(containerId);
    this.activeToasts = [];
  }

  show(message, type = 'success') {
    if (!this.container) {
      console.warn('Toast container not found');
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    
    this.container.appendChild(toast);
    this.activeToasts.push(toast);
    
    // 觸發動畫
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // 自動移除
    setTimeout(() => {
      this.remove(toast);
    }, CONFIG.TOAST_DURATION);
  }

  remove(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
      this.activeToasts = this.activeToasts.filter(t => t !== toast);
    }, 500);
  }

  clear() {
    this.activeToasts.forEach(toast => this.remove(toast));
  }
}

/* ========================================
   Firebase 服務層
   ======================================== */
class FirebaseService {
  constructor() {
    this.db = null;
    this.isOnline = navigator.onLine;
    this.listeners = [];
  }

  /**
   * 初始化 Firebase
   */
  async init() {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      
      this.db = firebase.firestore();
      
      // 啟用離線持久化
      try {
        await this.db.enablePersistence({ synchronizeTabs: true });
        console.log('Firebase 離線持久化已啟用');
      } catch (err) {
        if (err.code === 'failed-precondition') {
          console.warn('多個分頁開啟，離線持久化僅在第一個分頁啟用');
        } else if (err.code === 'unimplemented') {
          console.warn('瀏覽器不支援離線持久化');
        }
      }

      this._setupConnectionMonitoring();
      return true;
    } catch (e) {
      console.error("Firebase 初始化失敗:", e);
      throw new Error("雲端資料庫初始化失敗！請檢查網路連線或 Firebase 設定。");
    }
  }

  /**
   * 監聽網路連線狀態
   */
  _setupConnectionMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('網路已恢復');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.warn('網路已斷線，將使用離線模式');
    });
  }

  /**
   * 即時監聽集合變更
   */
  onSnapshot(collection, orderByConfig, callback) {
    if (!this.db) {
      callback(new Error('Firebase 未初始化'), null);
      return;
    }

    const { field, direction = 'asc' } = orderByConfig;
    
    const unsubscribe = this.db
      .collection(collection)
      .orderBy(field, direction)
      .onSnapshot(
        snapshot => callback(null, snapshot),
        error => {
          console.error(`${collection} 同步錯誤:`, error);
          callback(error, null);
        }
      );
    
    this.listeners.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * 新增文件
   */
  async add(collection, data) {
    if (!this.db) throw new Error('Firebase 未初始化');
    
    try {
      return await this.db.collection(collection).add(data);
    } catch (error) {
      console.error(`新增 ${collection} 失敗:`, error);
      throw new Error(`新增資料失敗: ${error.message}`);
    }
  }

  /**
   * 更新文件
   */
  async update(collection, id, data) {
    if (!this.db) throw new Error('Firebase 未初始化');
    
    try {
      return await this.db.collection(collection).doc(id).update(data);
    } catch (error) {
      console.error(`更新 ${collection} 失敗:`, error);
      throw new Error(`更新資料失敗: ${error.message}`);
    }
  }

  /**
   * 刪除文件
   */
  async delete(collection, id) {
    if (!this.db) throw new Error('Firebase 未初始化');
    
    try {
      return await this.db.collection(collection).doc(id).delete();
    } catch (error) {
      console.error(`刪除 ${collection} 失敗:`, error);
      throw new Error(`刪除資料失敗: ${error.message}`);
    }
  }

  /**
   * 批次寫入
   */
  async batchWrite(operations) {
    if (!this.db) throw new Error('Firebase 未初始化');
    
    const batch = this.db.batch();
    
    operations.forEach(op => {
      const ref = op.ref || this.db.collection(op.collection).doc(op.id);
      
      switch (op.type) {
        case 'set':
          batch.set(ref, op.data);
          break;
        case 'update':
          batch.update(ref, op.data);
          break;
        case 'delete':
          batch.delete(ref);
          break;
      }
    });
    
    try {
      return await batch.commit();
    } catch (error) {
      console.error('批次寫入失敗:', error);
      throw new Error(`批次寫入失敗: ${error.message}`);
    }
  }

  /**
   * 清理所有監聽器
   */
  cleanup() {
    this.listeners.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.listeners = [];
  }
}

/* ========================================
   主應用程式類別
   ======================================== */
class PromptLibraryApp {
  constructor() {
    this._cacheElements();
    this._initState();
    
    this.firebaseService = new FirebaseService();
    this.toastManager = new ToastManager();
    
    // 綁定防抖的搜尋函式
    this._debouncedSearch = Utils.debounce(
      () => this._renderTable(), 
      CONFIG.DEBOUNCE_DELAY
    );
  }

  /**
   * 快取 DOM 元素
   */
  _cacheElements() {
    this.elements = {
      // 主要元素
      tableBody: document.getElementById('prompt-list'),
      initialDataSource: document.getElementById('initial-data'),
      searchInput: document.getElementById('search'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      categoryFilter: document.getElementById('categoryFilter'),
      categoryChipsContainer: document.getElementById('categoryChipsContainer'),
      loadingIndicator: document.getElementById('loadingIndicator'),
      rowTemplate: document.getElementById('prompt-row-template'),
      
      // 功能按鈕
      addNewBtn: document.getElementById('addNew'),
      manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      fileImporter: document.getElementById('fileImporter'),
      importErrorContainer: document.getElementById('importErrorContainer'),
      manualImportLink: document.getElementById('manualImportLink'),
      
      // Prompt 編輯視窗
      promptModal: {
        self: document.getElementById('promptModal'),
        title: document.getElementById('modalTitle'),
        form: document.getElementById('promptForm'),
        idInput: document.getElementById('promptId'),
        taskInput: document.getElementById('taskInput'),
        categoryInput: document.getElementById('categoryInput'),
        promptInput: document.getElementById('promptInput'),
        authorInput: document.getElementById('authorInput'),
        historySelect: document.getElementById('historySelect'),
        saveBtn: document.getElementById('saveBtn'),
        historyPreviewContainer: document.getElementById('historyPreviewContainer'),
        historyPreviewArea: document.getElementById('historyPreviewArea'),
        restoreBtn: document.getElementById('restoreBtn'),
        closePreviewBtn: document.getElementById('closePreviewBtn'),
      },
      
      // 分類管理視窗
      categoryModal: {
        self: document.getElementById('categoryModal'),
        list: document.getElementById('categoryList'),
        form: document.getElementById('newCategoryForm'),
        input: document.getElementById('newCategoryInput'),
        closeBtn: document.getElementById('closeCategoryModalBtn'),
      },
      
      // 手動匯入視窗
      manualImportModal: {
        self: document.getElementById('manualImportModal'),
        textArea: document.getElementById('manualImportText'),
        importBtn: document.getElementById('importFromTextBtn')
      }
    };
  }

  /**
   * 初始化狀態
   */
  _initState() {
    this.state = {
      prompts: [],
      categories: [],
      activeCategories: [],
      isContentDirty: false,
      isLoading: false,
      currentEditingId: null,
    };
  }

  /**
   * 應用程式初始化
   */
  async init() {
    try {
      this._showLoading(true);
      await this.firebaseService.init();
      this._setupRealtimeListeners();
      this._bindEventListeners();
      this._showLoading(false);
    } catch (error) {
      this._showLoading(false);
      this.toastManager.show(error.message, 'error');
      console.error('應用程式初始化失敗:', error);
    }
  }

  /**
   * 顯示/隱藏載入指示器
   */
  _showLoading(show) {
    this.state.isLoading = show;
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * 設定即時監聽器
   */
  _setupRealtimeListeners() {
    // 監聽分類變更
    this.firebaseService.onSnapshot(
      'categories',
      { field: 'name', direction: 'asc' },
      (error, snapshot) => {
        if (error) {
          console.error('分類同步失敗:', error);
          this.toastManager.show('分類同步失敗，請重新整理頁面', 'error');
          return;
        }
        
        this.state.categories = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        this._populateCategoryDropdowns();
        this._renderCategoryChips();
        this._renderTable();
      }
    );

    // 監聽提示詞變更
    this.firebaseService.onSnapshot(
      'prompts',
      { field: 'createdDate', direction: 'desc' },
      async (error, snapshot) => {
        if (error) {
          console.error('提示詞同步失敗:', error);
          this.toastManager.show('提示詞同步失敗，請重新整理頁面', 'error');
          return;
        }

        // 首次載入且資料為空時，植入初始資料
        if (snapshot.empty && this.state.categories.length === 0) {
          await this._seedDataToFirestore();
        } else {
          this.state.prompts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          this._renderTable();
        }
      }
    );
  }

  /**
   * 植入初始資料到 Firestore
   */
  async _seedDataToFirestore() {
    console.log("正在植入初始資料...");
    
    if (!this.elements.initialDataSource) {
      console.warn('找不到初始資料來源');
      return;
    }

    const rows = this.elements.initialDataSource.querySelectorAll('tr');
    const categories = new Set();
    const promptsToSeed = [];

    rows.forEach(row => {
      const categoryText = row.querySelector('.cat')?.innerText.trim();
      const taskCell = row.querySelector('.task');
      const taskText = taskCell?.childNodes[0]?.nodeValue?.trim();
      const promptText = row.querySelector('.prompt .mono')?.innerText.trim();

      if (categoryText && taskText && promptText) {
        categories.add(categoryText);
        promptsToSeed.push({
          task: taskText,
          category: categoryText,
          prompt: promptText,
          author: 'System',
          createdDate: new Date(),
          lastModified: new Date(),
          copyCount: 0,
          history: []
        });
      }
    });

    if (categories.size === 0 && promptsToSeed.length === 0) {
      console.warn('沒有可植入的資料');
      return;
    }

    const operations = [];

    // 新增分類
    [...categories].sort().forEach(catName => {
      operations.push({
        collection: 'categories',
        type: 'set',
        ref: this.firebaseService.db.collection('categories').doc(),
        data: { name: catName }
      });
    });

    // 新增提示詞
    promptsToSeed.forEach(prompt => {
      operations.push({
        collection: 'prompts',
        type: 'set',
        ref: this.firebaseService.db.collection('prompts').doc(),
        data: prompt
      });
    });

    try {
      await this.firebaseService.batchWrite(operations);
      this.toastManager.show("已成功將預設提示詞庫上傳至雲端！");
    } catch (e) {
      console.error("植入初始資料失敗:", e);
      this.toastManager.show("初始化資料失敗", 'error');
    }
  }

  /**
   * 渲染主表格
   */
  _renderTable() {
    const { tableBody, searchInput } = this.elements;
    
    if (!tableBody) return;

    const searchTerm = searchInput?.value.trim().toLowerCase() || '';
    const filtered = this._filterPrompts(searchTerm);

    // 清空表格
    tableBody.innerHTML = '';

    // 無資料顯示
    if (filtered.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="4" style="text-align: center; padding: 32px; color: var(--color-muted);">
          ${searchTerm || this.state.activeCategories.length > 0 
            ? '找不到符合條件的提示詞' 
            : '尚無提示詞資料，請點擊「新增提示詞」開始使用'}
        </td>`;
      tableBody.appendChild(emptyRow);
      return;
    }

    // 使用 DocumentFragment 提升效能
    const fragment = document.createDocumentFragment();

    filtered.forEach((prompt, index) => {
      const row = this._createPromptRow(prompt, index);
      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
    this._updateActiveFilters();
  }

  /**
   * 過濾提示詞
   */
  _filterPrompts(searchTerm) {
    return this.state.prompts.filter(p => {
      // 分類篩選
      const matchesCategory = this.state.activeCategories.length === 0 
        || this.state.activeCategories.includes(p.category);
      
      if (!matchesCategory) return false;
      if (!searchTerm) return true;

      // 關鍵字搜尋
      const searchableText = [
        p.task || '',
        p.prompt || '',
        p.author || '',
        p.category || ''
      ].join(' ').toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  /**
   * 建立提示詞列
   */
  _createPromptRow(prompt, index) {
    if (!this.elements.rowTemplate) {
      console.error('找不到列範本');
      return document.createElement('tr');
    }

    const row = this.elements.rowTemplate.content.cloneNode(true);
    const tr = row.querySelector('.prompt-row');
    
    if (!tr) return row;

    tr.dataset.id = prompt.id;
    
    // 填充資料
    const idCell = row.querySelector('.id');
    const taskCell = row.querySelector('.task');
    const categoryLabel = row.querySelector('.category-label');
    const promptMono = row.querySelector('.prompt .mono');
    const copyCount = row.querySelector('.copy-count');
    const author = row.querySelector('.author');
    const lastModified = row.querySelector('.last-modified');

    if (idCell) idCell.textContent = index + 1;
    if (taskCell) taskCell.textContent = prompt.task || '無標題';
    
    if (categoryLabel) {
      categoryLabel.textContent = prompt.category || '未分類';
      categoryLabel.dataset.category = prompt.category || '';
    }
    
    if (promptMono) {
      promptMono.innerHTML = Utils.visualizePromptText(prompt.prompt || '');
    }
    
    if (copyCount) {
      copyCount.textContent = `複製 ${prompt.copyCount || 0} 次`;
    }
    
    if (author) {
      author.textContent = `作者: ${prompt.author || 'N/A'}`;
    }
    
    if (lastModified) {
      lastModified.textContent = `更新: ${Utils.formatDate(prompt.lastModified)}`;
    }

    return row;
  }

  /**
   * 填充分類下拉選單
   */
  _populateCategoryDropdowns() {
    const { categoryFilter } = this.elements;
    const { categoryInput } = this.elements.promptModal;
    
    if (!categoryFilter || !categoryInput) return;

    const currentFilterValue = categoryFilter.value;
    const currentModalValue = categoryInput.value;

    // 更新主篩選器
    categoryFilter.innerHTML = '<option value="all">全部分類</option>';
    this.state.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      categoryFilter.appendChild(option);
    });
    
    if (this.state.categories.some(c => c.name === currentFilterValue)) {
      categoryFilter.value = currentFilterValue;
    }

    // 更新編輯視窗下拉選單
    categoryInput.innerHTML = '';
    this.state.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      categoryInput.appendChild(option);
    });
    
    if (this.state.categories.some(c => c.name === currentModalValue)) {
      categoryInput.value = currentModalValue;
    }
  }

  /**
   * 渲染分類標籤
   */
  _renderCategoryChips() {
    const { categoryChipsContainer } = this.elements;
    if (!categoryChipsContainer) return;

    categoryChipsContainer.innerHTML = '';

    // 全部分類標籤
    const allChip = this._createChip('全部分類', 'all');
    categoryChipsContainer.appendChild(allChip);

    // 個別分類標籤
    this.state.categories.forEach(cat => {
      const chip = this._createChip(cat.name, cat.name);
      categoryChipsContainer.appendChild(chip);
    });

    this._updateActiveFilters();
  }

  /**
   * 建立分類標籤
   */
  _createChip(text, category) {
    const chip = document.createElement('span');
    chip.className = 'chip clickable';
    chip.textContent = text;
    chip.dataset.category = category;
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    return chip;
  }

  /**
   * 更新篩選器狀態
   */
  _updateActiveFilters() {
    const { categoryFilter, categoryChipsContainer } = this.elements;
    if (!categoryChipsContainer) return;

    categoryChipsContainer.querySelectorAll('.chip').forEach(chip => {
      const category = chip.dataset.category;
      const isActive = (this.state.activeCategories.length === 0 && category === 'all')
        || this.state.activeCategories.includes(category);
      chip.classList.toggle('active', isActive);
    });

    if (categoryFilter) {
      if (this.state.activeCategories.length === 1) {
        categoryFilter.value = this.state.activeCategories[0];
      } else {
        categoryFilter.value = 'all';
      }
    }
  }

  /**
   * 渲染分類管理列表
   */
  _renderCategoryList() {
    const { list } = this.elements.categoryModal;
    if (!list) return;

    list.innerHTML = '';

    this.state.categories.forEach(cat => {
      const isUsed = this.state.prompts.some(p => p.category === cat.name);
      const li = document.createElement('li');
      
      const span = document.createElement('span');
      span.textContent = cat.name;
      
      const btn = document.createElement('button');
      btn.className = 'btn small btn-danger';
      btn.textContent = '刪除';
      btn.dataset.id = cat.id;
      
      if (isUsed) {
        btn.disabled = true;
        btn.title = '分類使用中，無法刪除';
      }
      
      li.appendChild(span);
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  /**
   * 綁定事件監聽器
   */
  _bindEventListeners() {
    this._bindSearchEvents();
    this._bindFilterEvents();
    this._bindActionButtons();
    this._bindTableEvents();
    this._bindModalEvents();
    this._bindGlobalEvents();
  }

  /**
   * 綁定搜尋事件
   */
  _bindSearchEvents() {
    const { searchInput, clearSearchBtn } = this.elements;
    
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._toggleClearSearchBtn();
        this._debouncedSearch();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        this._toggleClearSearchBtn();
        this._renderTable();
      });
    }
  }

  /**
   * 綁定篩選事件
   */
  _bindFilterEvents() {
    const { categoryFilter, categoryChipsContainer } = this.elements;

    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        this.state.activeCategories = e.target.value === 'all' ? [] : [e.target.value];
        this._updateActiveFilters();
        this._renderTable();
      });
    }

    if (categoryChipsContainer) {
      categoryChipsContainer.addEventListener('click', (e) => {
        this._handleChipClick(e);
      });

      // 鍵盤支援
      categoryChipsContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._handleChipClick(e);
        }
      });
    }
  }

  /**
   * 綁定功能按鈕事件
   */
  _bindActionButtons() {
    const {
      addNewBtn,
      manageCategoriesBtn,
      exportBtn,
      importBtn,
      fileImporter,
      manualImportLink
    } = this.elements;

    if (addNewBtn) {
      addNewBtn.addEventListener('click', () => this._openPromptModal('add'));
    }

    if (manageCategoriesBtn) {
      manageCategoriesBtn.addEventListener('click', () => this._openCategoryModal());
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this._exportData());
    }

    if (importBtn && fileImporter) {
      importBtn.addEventListener('click', () => fileImporter.click());
      fileImporter.addEventListener('change', (e) => this._handleFileImport(e));
    }

    if (manualImportLink) {
      manualImportLink.addEventListener('click', (e) => {
        e.preventDefault();
        ModalManager.open(this.elements.manualImportModal.self);
      });
    }
  }

  /**
   * 綁定表格事件
   */
  _bindTableEvents() {
    const { tableBody } = this.elements;
    
    if (tableBody) {
      tableBody.addEventListener('click', (e) => this._handleTableClick(e));
    }
  }

  /**
   * 綁定所有彈出視窗事件
   */
  _bindModalEvents() {
    this._bindPromptModalEvents();
    this._bindCategoryModalEvents();
    this._bindManualImportModalEvents();
  }

  /**
   * 綁定 Prompt 編輯視窗事件
   */
  _bindPromptModalEvents() {
    const { self, form, saveBtn, historySelect, restoreBtn, closePreviewBtn } = this.elements.promptModal;

    if (!self) return;

    // 點擊背景關閉
    self.addEventListener('click', (e) => {
      if (e.target === self || e.target.classList.contains('close-btn')) {
        this._closePromptModal();
      }
    });

    // 表單內容變更追蹤
    if (form) {
      form.addEventListener('input', () => {
        this.state.isContentDirty = true;
      });
    }

    // 儲存按鈕
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._savePrompt());
    }

    // 歷史版本選擇
    if (historySelect) {
      historySelect.addEventListener('change', (e) => this._previewHistory(e));
    }

    // 還原歷史版本
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => this._restoreFromPreview());
    }

    // 關閉預覽
    if (closePreviewBtn) {
      closePreviewBtn.addEventListener('click', () => this._closePreview());
    }
  }

  /**
   * 綁定分類管理視窗事件
   */
  _bindCategoryModalEvents() {
    const { self, form, list, closeBtn } = this.elements.categoryModal;

    if (!self) return;

    // 點擊背景關閉
    self.addEventListener('click', (e) => {
      if (e.target === self || e.target.classList.contains('close-btn') || e.target === closeBtn) {
        ModalManager.close(self);
      }
    });

    // 新增分類表單
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._addNewCategory();
      });
    }

    // 刪除分類
    if (list) {
      list.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.id) {
          this._deleteCategory(e.target.dataset.id);
        }
      });
    }
  }

  /**
   * 綁定手動匯入視窗事件
   */
  _bindManualImportModalEvents() {
    const { self, importBtn } = this.elements.manualImportModal;

    if (!self) return;

    // 點擊背景關閉
    self.addEventListener('click', (e) => {
      if (e.target === self || e.target.classList.contains('close-btn')) {
        ModalManager.close(self);
      }
    });

    // 匯入按鈕
    if (importBtn) {
      importBtn.addEventListener('click', () => this._handleManualImport());
    }
  }

  /**
   * 綁定全域事件
   */
  _bindGlobalEvents() {
    // ESC 鍵關閉彈出視窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ModalManager.closeAll();
      }
    });

    // 離開前確認
    window.addEventListener('beforeunload', (e) => {
      if (this.state.isContentDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // 視窗可見性變更
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('頁面隱藏');
      } else {
        console.log('頁面重新可見');
      }
    });
  }

  /**
   * 處理分類標籤點擊
   */
  _handleChipClick(e) {
    const target = e.target;
    if (!target.classList.contains('chip')) return;

    const category = target.dataset.category;
    
    if (category === 'all') {
      this.state.activeCategories = [];
    } else {
      const index = this.state.activeCategories.indexOf(category);
      if (index > -1) {
        this.state.activeCategories.splice(index, 1);
      } else {
        this.state.activeCategories.push(category);
      }
    }

    this._updateActiveFilters();
    this._renderTable();
  }

  /**
   * 處理表格按鈕點擊
   */
  async _handleTableClick(e) {
    const row = e.target.closest('.prompt-row');
    if (!row) return;

    const id = row.dataset.id;
    const prompt = this.state.prompts.find(p => p.id === id);
    if (!prompt) return;

    if (e.target.closest('.copy')) {
      await this._copyPrompt(id, prompt);
    } else if (e.target.closest('.edit')) {
      this._openPromptModal('edit', id);
    } else if (e.target.closest('.delete')) {
      await this._deletePrompt(id);
    }
  }

  /**
   * 複製提示詞到剪貼簿
   */
  async _copyPrompt(id, prompt) {
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      
      // 更新複製次數
      await this.firebaseService.update('prompts', id, {
        copyCount: firebase.firestore.FieldValue.increment(1)
      });
      
      this.toastManager.show('已成功複製到剪貼簿！');
    } catch (error) {
      console.error('複製失敗:', error);
      
      // 降級方案：使用傳統方式複製
      this._fallbackCopy(prompt.prompt);
    }
  }

  /**
   * 降級複製方案
   */
  _fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      this.toastManager.show('已成功複製到剪貼簿！');
    } catch (err) {
      this.toastManager.show('複製失敗，請手動選取文字', 'error');
    }
    
    document.body.removeChild(textarea);
  }

  /**
   * 刪除提示詞
   */
  async _deletePrompt(id) {
    const prompt = this.state.prompts.find(p => p.id === id);
    if (!prompt) return;

    const confirmMessage = `確定要刪除「${prompt.task}」嗎？\n此操作無法復原。`;
    if (!confirm(confirmMessage)) return;

    try {
      await this.firebaseService.delete('prompts', id);
      this.toastManager.show('提示詞已刪除', 'error');
    } catch (error) {
      console.error('刪除失敗:', error);
      this.toastManager.show('刪除失敗，請稍後再試', 'error');
    }
  }

  /**
   * 開啟 Prompt 編輯視窗
   */
  _openPromptModal(mode = 'add', id = null) {
    const { title, idInput, taskInput, categoryInput, promptInput, authorInput, historySelect } = this.elements.promptModal;

    // 重置狀態
    this.state.isContentDirty = false;
    this.state.currentEditingId = id;
    
    // 清空表單
    if (idInput) idInput.value = '';
    if (taskInput) taskInput.value = '';
    if (promptInput) promptInput.value = '';
    if (authorInput) authorInput.value = '';
    if (categoryInput) categoryInput.value = '';
    
    this._closePreview();

    if (mode === 'edit' && id) {
      const prompt = this.state.prompts.find(p => p.id === id);
      if (!prompt) {
        this.toastManager.show('找不到該提示詞', 'error');
        return;
      }

      if (title) title.textContent = '編輯提示詞';
      if (idInput) idInput.value = prompt.id;
      if (taskInput) taskInput.value = prompt.task || '';
      
      // 處理已刪除的分類
      if (categoryInput) {
        const categoryExists = this.state.categories.some(c => c.name === prompt.category);
        if (!categoryExists && prompt.category) {
          const tempOption = document.createElement('option');
          tempOption.value = prompt.category;
          tempOption.textContent = `${prompt.category} (已刪除)`;
          categoryInput.appendChild(tempOption);
        }
        categoryInput.value = prompt.category || '';
      }
      
      if (promptInput) promptInput.value = prompt.prompt || '';
      if (authorInput) authorInput.value = prompt.author || '';
      
      this._populateHistory(prompt);
    } else {
      // 新增模式
      if (title) title.textContent = '新增提示詞';
      
      if (categoryInput && this.state.categories.length > 0) {
        categoryInput.value = this.state.categories[0].name;
      }
      
      if (historySelect) {
        historySelect.innerHTML = '<option value="">無歷史版本</option>';
        historySelect.disabled = true;
      }
      
      if (authorInput) {
        authorInput.value = localStorage.getItem(CONFIG.STORAGE_KEY_AUTHOR) || '';
      }
    }

    ModalManager.open(this.elements.promptModal.self);
  }

  /**
   * 關閉 Prompt 編輯視窗
   */
  _closePromptModal() {
    if (this.state.isContentDirty) {
      if (!confirm('您有未儲存的變更，確定要關閉嗎？')) {
        return;
      }
    }
    
    this._closePreview();
    this.state.currentEditingId = null;
    ModalManager.close(this.elements.promptModal.self);
  }

  /**
   * 儲存提示詞
   */
  async _savePrompt() {
    const { form, idInput, taskInput, categoryInput, promptInput, authorInput } = this.elements.promptModal;

    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    const id = idInput?.value;
    const data = {
      task: taskInput?.value.trim() || '',
      category: categoryInput?.value || '',
      prompt: promptInput?.value.trim() || '',
      author: authorInput?.value.trim() || '',
      lastModified: new Date()
    };

    // 驗證必填欄位
    if (!data.task || !data.category || !data.prompt || !data.author) {
      this.toastManager.show('請填寫所有必填欄位', 'error');
      return;
    }

    try {
      if (id) {
        // 更新現有提示詞
        const promptToUpdate = this.state.prompts.find(p => p.id === id);
        if (!promptToUpdate) {
          throw new Error('找不到要更新的提示詞');
        }

        // 儲存歷史版本
        const oldHistory = promptToUpdate.history || [];
        oldHistory.unshift({
          prompt: promptToUpdate.prompt,
          modifiedDate: promptToUpdate.lastModified,
          author: promptToUpdate.author
        });

        if (oldHistory.length > CONFIG.MAX_HISTORY_VERSIONS) {
          oldHistory.pop();
        }

        data.history = oldHistory;
        await this.firebaseService.update('prompts', id, data);
        this.toastManager.show('提示詞已更新！');
      } else {
        // 新增提示詞
        data.createdDate = new Date();
        data.copyCount = 0;
        data.history = [];
        await this.firebaseService.add('prompts', data);
        this.toastManager.show('已成功新增提示詞！');
      }

      // 儲存作者名稱到 localStorage
      localStorage.setItem(CONFIG.STORAGE_KEY_AUTHOR, data.author);
      
      this.state.isContentDirty = false;
      ModalManager.close(this.elements.promptModal.self);
    } catch (e) {
      console.error('儲存失敗:', e);
      this.toastManager.show(`儲存失敗: ${e.message}`, 'error');
    }
  }

  /**
   * 填充歷史版本下拉選單
   */
  _populateHistory(prompt) {
    const { historySelect } = this.elements.promptModal;
    if (!historySelect) return;

    historySelect.innerHTML = '<option value="">檢視歷史版本...</option>';

    if (prompt.history && prompt.history.length > 0) {
      prompt.history.forEach((h, index) => {
        const date = h.modifiedDate && h.modifiedDate.toDate 
          ? h.modifiedDate.toDate() 
          : new Date(h.modifiedDate);
        
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `版本 #${prompt.history.length - index} (${date.toLocaleString('zh-TW')})`;
        historySelect.appendChild(option);
      });
      historySelect.disabled = false;
    } else {
      historySelect.disabled = true;
    }
  }

  /**
   * 預覽歷史版本
   */
  _previewHistory(e) {
    const { idInput, historyPreviewContainer, historyPreviewArea } = this.elements.promptModal;
    
    const id = idInput?.value;
    const index = e.target.value;

    if (id && index !== '') {
      const prompt = this.state.prompts.find(p => p.id === id);
      if (!prompt || !prompt.history || !prompt.history[index]) return;

      const historicVersion = prompt.history[index];
      
      if (historyPreviewArea) {
        historyPreviewArea.value = historicVersion.prompt || '';
      }
      
      if (historyPreviewContainer) {
        historyPreviewContainer.style.display = 'block';
      }
    } else {
      this._closePreview();
    }
  }

  /**
   * 從預覽還原歷史版本
   */
  _restoreFromPreview() {
    const { promptInput, historyPreviewArea } = this.elements.promptModal;
    
    if (!promptInput || !historyPreviewArea) return;

    const confirmMessage = '您確定要用預覽的內容覆蓋目前的編輯嗎？';
    if (!confirm(confirmMessage)) return;

    promptInput.value = historyPreviewArea.value || '';
    this.state.isContentDirty = true;
    this._closePreview();
    this.toastManager.show('已還原版本內容至編輯器！');
  }

  /**
   * 關閉歷史預覽
   */
  _closePreview() {
    const { historyPreviewContainer, historySelect } = this.elements.promptModal;
    
    if (historyPreviewContainer) {
      historyPreviewContainer.style.display = 'none';
    }
    
    if (historySelect) {
      historySelect.value = '';
    }
  }

  /**
   * 開啟分類管理視窗
   */
  _openCategoryModal() {
    this._renderCategoryList();
    ModalManager.open(this.elements.categoryModal.self);
  }

  /**
   * 新增分類
   */
  async _addNewCategory() {
    const { input } = this.elements.categoryModal;
    if (!input) return;

    const newCat = input.value.trim();

    if (!newCat) {
      this.toastManager.show('分類名稱不能為空', 'error');
      return;
    }

    if (this.state.categories.some(c => c.name === newCat)) {
      this.toastManager.show('分類已存在', 'error');
      return;
    }

    try {
      await this.firebaseService.add('categories', { name: newCat });
      input.value = '';
      this.toastManager.show('已新增分類！');
    } catch (error) {
      console.error('新增分類失敗:', error);
      this.toastManager.show('新增分類失敗', 'error');
    }
  }

  /**
   * 刪除分類
   */
  async _deleteCategory(id) {
    const category = this.state.categories.find(c => c.id === id);
    if (!category) return;

    const confirmMessage = `確定要刪除「${category.name}」分類嗎？`;
    if (!confirm(confirmMessage)) return;

    try {
      await this.firebaseService.delete('categories', id);
      this.toastManager.show('分類已刪除', 'error');
    } catch (error) {
      console.error('刪除分類失敗:', error);
      this.toastManager.show('刪除分類失敗', 'error');
    }
  }

  /**
   * 處理檔案匯入
   */
  _handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (this.elements.importErrorContainer) {
      this.elements.importErrorContainer.classList.remove('show');
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      this._processImportData(e.target.result);
    };
    
    reader.onerror = () => {
      this.toastManager.show('讀取檔案失敗！', 'error');
      if (this.elements.importErrorContainer) {
        this.elements.importErrorContainer.classList.add('show');
      }
    };

    reader.readAsText(file);
    
    // 清空 input，允許重複選擇同一檔案
    event.target.value = '';
  }

  /**
   * 處理手動匯入
   */
  _handleManualImport() {
    const { textArea, self } = this.elements.manualImportModal;
    if (!textArea) return;

    const content = textArea.value.trim();
    
    if (!content) {
      this.toastManager.show('請貼上 JSON 內容', 'error');
      return;
    }

    if (this._processImportData(content)) {
      ModalManager.close(self);
      textArea.value = '';
    }
  }

  /**
   * 處理匯入資料
   */
  async _processImportData(jsonString) {
    try {
      if (!jsonString || !jsonString.trim()) {
        throw new Error('匯入內容為空');
      }

      const data = JSON.parse(jsonString);

      // 驗證資料格式
      if (!data.prompts || !Array.isArray(data.prompts)) {
        throw new Error('缺少 prompts 陣列');
      }
      
      if (!data.categories || !Array.isArray(data.categories)) {
        throw new Error('缺少 categories 陣列');
      }

      const confirmMessage = `確定要匯入 ${data.prompts.length} 條提示詞與 ${data.categories.length} 個分類嗎？\n\n此操作只會新增，不會刪除現有資料。`;
      
      if (!confirm(confirmMessage)) {
        return false;
      }

      await this._importDataToFirestore(data.prompts, data.categories);
      return true;
    } catch (err) {
      console.error('匯入處理錯誤:', err);
      this.toastManager.show(`檔案格式錯誤: ${err.message}`, 'error');
      
      if (this.elements.importErrorContainer) {
        this.elements.importErrorContainer.classList.add('show');
      }
      
      return false;
    }
  }

  /**
   * 匯入資料到 Firestore
   */
  async _importDataToFirestore(prompts, categories) {
    if (!this.firebaseService.db) {
      this.toastManager.show('資料庫未初始化', 'error');
      return;
    }

    this.toastManager.show('正在匯入資料...');

    const operations = [];
    const existingCategoryNames = this.state.categories.map(c => c.name);
    const newCategories = categories.filter(catName => 
      !existingCategoryNames.includes(catName)
    );

    // 新增分類
    newCategories.forEach(catName => {
      operations.push({
        collection: 'categories',
        type: 'set',
        ref: this.firebaseService.db.collection('categories').doc(),
        data: { name: catName }
      });
    });

    // 新增提示詞
    prompts.forEach(p => {
      operations.push({
        collection: 'prompts',
        type: 'set',
        ref: this.firebaseService.db.collection('prompts').doc(),
        data: {
          task: p.task || '無標題',
          category: p.category || '未分類',
          prompt: p.prompt || '',
          author: p.author || 'Imported',
          createdDate: new Date(),
          lastModified: new Date(),
          copyCount: p.copyCount || 0,
          history: p.history || []
        }
      });
    });

    try {
      await this.firebaseService.batchWrite(operations);
      this.toastManager.show(`成功匯入 ${prompts.length} 條提示詞與 ${newCategories.length} 個新分類！`);
      
      if (this.elements.importErrorContainer) {
        this.elements.importErrorContainer.classList.remove('show');
      }
    } catch (err) {
      console.error('匯入失敗:', err);
      this.toastManager.show('匯入失敗，請稍後再試', 'error');
      
      if (this.elements.importErrorContainer) {
        this.elements.importErrorContainer.classList.add('show');
      }
    }
  }

  /**
   * 匯出資料
   */
  _exportData() {
    try {
      // 清理資料，將 Firestore Timestamp 轉換為 ISO 字串
      const sanitizedPrompts = this.state.prompts.map(p => {
        const { id, ...rest } = p;
        
        if (rest.createdDate?.toDate) {
          rest.createdDate = rest.createdDate.toDate().toISOString();
        }
        
        if (rest.lastModified?.toDate) {
          rest.lastModified = rest.lastModified.toDate().toISOString();
        }
        
        if (rest.history && Array.isArray(rest.history)) {
          rest.history = rest.history.map(h => {
            if (h.modifiedDate?.toDate) {
              h.modifiedDate = h.modifiedDate.toDate().toISOString();
            }
            return h;
          });
        }
        
        return rest;
      });

      const dataToExport = {
        version: 'prompt-library-v3.0',
        exportedDate: new Date().toISOString(),
        prompts: sanitizedPrompts,
        categories: this.state.categories.map(c => c.name)
      };

      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `prompt_library_backup_${date}.json`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      this.toastManager.show('資料已成功匯出！');
    } catch (e) {
      console.error('匯出失敗:', e);
      this.toastManager.show('匯出資料時發生錯誤', 'error');
    }
  }

  /**
   * 切換清除搜尋按鈕顯示
   */
  _toggleClearSearchBtn() {
    const { searchInput, clearSearchBtn } = this.elements;
    
    if (searchInput && clearSearchBtn) {
      clearSearchBtn.style.display = searchInput.value.length > 0 ? 'block' : 'none';
    }
  }

  /**
   * 清理資源
   */
  destroy() {
    this.firebaseService.cleanup();
    this.toastManager.clear();
    console.log('應用程式已清理');
  }
}

/* ========================================
   應用程式啟動
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
  const app = new PromptLibraryApp();
  app.init();
  
  // 將 app 實例掛載到 window，方便除錯
  if (process.env.NODE_ENV !== 'production') {
    window.promptLibraryApp = app;
  }
});