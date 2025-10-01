// --- 最終版 app.js ---

/**
 * @class PromptLibraryApp
 * @description 整個提示詞庫應用程式的主要類別，封裝了所有功能。
 */
class PromptLibraryApp {
  /**
   * @constructor
   * @description 初始化應用程式，獲取所有需要的 DOM 元素並設定初始狀態。
   */
  constructor() {
    // --- DOM 元素快取 ---
    // 預先將所有會用到的 HTML 元素選取起來並存放在 this.elements 物件中，
    // 這樣可以避免重複查詢 DOM，提升效能。
    this.elements = {
      tableBody: document.getElementById('prompt-list'),
      initialDataSource: document.getElementById('initial-data'), // 存放預設資料的隱藏表格
      searchInput: document.getElementById('search'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      categoryFilter: document.getElementById('categoryFilter'),
      categoryChipsContainer: document.getElementById('categoryChipsContainer'),
      addNewBtn: document.getElementById('addNew'),
      manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      fileImporter: document.getElementById('fileImporter'), // 隱藏的檔案上傳 input
      importErrorContainer: document.getElementById('importErrorContainer'),
      manualImportLink: document.getElementById('manualImportLink'),
      // 新增/編輯提示詞的彈出視窗 (Modal)
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
      // 管理分類的彈出視窗
      categoryModal: {
        self: document.getElementById('categoryModal'),
        list: document.getElementById('categoryList'),
        form: document.getElementById('newCategoryForm'),
        input: document.getElementById('newCategoryInput'),
        closeBtn: document.getElementById('closeCategoryModalBtn'),
      },
      // 手動匯入的彈出視窗
      manualImportModal: {
        self: document.getElementById('manualImportModal'),
        textArea: document.getElementById('manualImportText'),
        importBtn: document.getElementById('importFromTextBtn')
      },
      // 表格列的 HTML 樣板
      rowTemplate: document.getElementById('prompt-row-template'),
    };

    // --- 應用程式狀態變數 ---
    this.prompts = []; // 存放從 Firestore 讀取的所有提示詞資料
    this.categories = []; // 存放所有分類資料
    this.isContentDirty = false; // 標記彈出視窗內的表單是否有未儲存的變更
    this.activeCategories = []; // 存放目前被使用者選取用於篩選的分類
    this.db = null; // 用於存放 Firebase Firestore 的實例
  }

  /**
   * @method init
   * @description 應用程式的進入點，負責啟動所有初始化程序。
   */
  init() {
    this._initFirebase(); // 初始化 Firebase 連線
    this._setupRealtimeListeners(); // 設定即時資料監聽器
    this._bindEventListeners(); // 綁定所有的 DOM 事件監聽器
  }

  /**
   * @method _initFirebase
   * @description 初始化 Firebase 應用和 Firestore 資料庫連線。
   * @private
   */
  _initFirebase() {
    // Firebase 的設定檔，請確保這些金鑰的安全性
    const firebaseConfig = {
      apiKey: "AIzaSyDQDorsdx2Cetyp46riQC7i_xB2dMCvuYc",
      authDomain: "qmd-prompt-library.firebaseapp.com",
      projectId: "qmd-prompt-library",
      storageBucket: "qmd-prompt-library.firebasestorage.app",
      messagingSenderId: "622746077507",
      appId: "1:622746077507:web:e5a1089f93dbf4dd5807f6",
      measurementId: "G-KHGRGT7W30"
    };
    try {
      // 避免重複初始化 Firebase
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      this.db = firebase.firestore(); // 取得 Firestore 服務的實例
    } catch (e) {
      console.error("Firebase 初始化失敗:", e);
      alert("雲端資料庫初始化失敗！請檢查您的 Firebase 設定。");
    }
  }

  /**
   * @method _setupRealtimeListeners
   * @description 設定 Firestore 的即時監聽器，當雲端資料變動時，會自動更新前端畫面。
   * @private
   */
  _setupRealtimeListeners() {
    if (!this.db) return; // 如果資料庫未成功初始化，則不執行

    // 監聽 'categories' 集合的變動
    this.db.collection("categories").orderBy("name").onSnapshot(snapshot => {
      this.categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this._populateCategoryDropdowns(); // 更新所有分類下拉選單
      this._renderCategoryChips(); // 重新渲染分類標籤
      this._renderTable(); // 重新渲染提示詞列表
    });

    // 監聽 'prompts' 集合的變動
    this.db.collection("prompts").orderBy("createdDate", "desc").onSnapshot(snapshot => {
      // 如果 prompts 和 categories 集合都為空，則觸發植入初始資料
      if (snapshot.empty && this.categories.length === 0) {
        this._seedDataToFirestore();
      } else {
        this.prompts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this._renderTable(); // 重新渲染提示詞列表
      }
    });
  }

  /**
   * @method _seedDataToFirestore
   * @description 當雲端資料庫完全為空時，從 HTML 中讀取預設資料並上傳到 Firestore。
   * @private
   */
  async _seedDataToFirestore() {
    console.log("資料庫是空的，正在從 HTML 植入初始資料到雲端...");
    if (!this.db) return;
    const rows = this.elements.initialDataSource.querySelectorAll('tr');
    const categories = new Set(); // 使用 Set 自動去除重複的分類
    const promptsToSeed = [];

    // 從 HTML 內的隱藏表格中解析出預設資料
    rows.forEach(row => {
      const categoryText = row.querySelector('.cat').innerText.trim();
      const taskCell = row.querySelector('.task');
      const taskText = taskCell.childNodes[0].nodeValue.trim();
      categories.add(categoryText);
      promptsToSeed.push({
        task: taskText,
        category: categoryText,
        prompt: row.querySelector('.prompt .mono').innerText.trim(),
        author: 'System',
        createdDate: new Date(),
        lastModified: new Date(),
        copyCount: 0,
        history: []
      });
    });

    // 使用 batch write (批次寫入) 來一次性提交所有操作，提高效率和保證原子性
    const batch = this.db.batch();
    [...categories].sort().forEach(catName => {
      const catRef = this.db.collection("categories").doc();
      batch.set(catRef, { name: catName });
    });
    promptsToSeed.forEach(prompt => {
      const promptRef = this.db.collection("prompts").doc();
      batch.set(promptRef, prompt);
    });

    try {
      await batch.commit();
      this._showToast("已成功將預設提示詞庫上傳至雲端！");
    } catch (e) {
      console.error("植入初始資料失敗:", e);
    }
  }

  /**
   * @method _renderTable
   * @description 根據目前的篩選條件（關鍵字、分類）來渲染主列表。
   * @private
   */
  _renderTable() {
    const { tableBody, searchInput } = this.elements;
    tableBody.innerHTML = '';
    const searchTerm = searchInput.value.trim().toLowerCase();

    // 過濾資料
    const filtered = this.prompts.filter(p => {
      const matchesCategory = this.activeCategories.length === 0 || this.activeCategories.includes(p.category);
      const matchesSearch = !searchTerm || p.task.toLowerCase().includes(searchTerm) || p.prompt.toLowerCase().includes(searchTerm) || (p.author && p.author.toLowerCase().includes(searchTerm));
      return matchesCategory && matchesSearch;
    });

    // 如果沒有結果，顯示提示訊息
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 32px;">找不到符合條件的提示詞。</td></tr>`;
      return;
    }

    // 使用 <template> 元素來動態生成每一列表格
    filtered.forEach((prompt, index) => {
      const row = this.elements.rowTemplate.content.cloneNode(true);
      const tr = row.querySelector('.prompt-row');
      tr.dataset.id = prompt.id; // 將 Firestore 文件 ID 存放在 data-id 屬性中

      row.querySelector('.id').textContent = index + 1;
      row.querySelector('.task').textContent = prompt.task;
      const categoryLabel = row.querySelector('.category-label');
      categoryLabel.textContent = prompt.category;
      categoryLabel.dataset.category = prompt.category;
      row.querySelector('.prompt .mono').textContent = prompt.prompt;
      row.querySelector('.copy-count').textContent = `複製 ${prompt.copyCount || 0} 次`;
      row.querySelector('.author').textContent = `作者: ${prompt.author || 'N/A'}`;
      const lastModifiedDate = prompt.lastModified && prompt.lastModified.toDate ? prompt.lastModified.toDate() : new Date();
      row.querySelector('.last-modified').textContent = `更新: ${lastModifiedDate.toLocaleDateString()}`;

      tableBody.appendChild(row);
    });

    this._updateActiveFilters(); // 更新篩選器 UI 狀態
  }
    
  /**
   * @method _populateCategoryDropdowns
   * @description 將最新的分類列表填充到所有相關的下拉選單中。
   * @private
   */
  _populateCategoryDropdowns() {
    const { categoryFilter, promptModal } = this.elements;
    const { categoryInput } = promptModal;
    
    // 保存當前選中的值，以便在刷新後恢復
    const currentFilterValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">全部分類</option>';
    this.categories.forEach(cat => {
      categoryFilter.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
    // 嘗試恢復之前選中的值
    if (this.categories.some(c => c.name === currentFilterValue)) {
      categoryFilter.value = currentFilterValue;
    }

    // 同步更新編輯視窗中的分類下拉選單
    const currentModalValue = categoryInput.value;
    categoryInput.innerHTML = '';
    this.categories.forEach(cat => {
      categoryInput.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
    if (this.categories.some(c => c.name === currentModalValue)) {
      categoryInput.value = currentModalValue;
    }
  }

  /**
   * @method _renderCategoryChips
   * @description 渲染位於主列表上方的可點擊分類標籤 (Chips)。
   * @private
   */
  _renderCategoryChips() {
    const { categoryChipsContainer } = this.elements;
    categoryChipsContainer.innerHTML = '';
    
    // 建立「全部分類」標籤
    const allChip = document.createElement('span');
    allChip.className = 'chip clickable';
    allChip.textContent = '全部分類';
    allChip.dataset.category = 'all';
    categoryChipsContainer.appendChild(allChip);

    // 建立所有分類的標籤
    this.categories.forEach(cat => {
      const chip = document.createElement('span');
      chip.className = 'chip clickable';
      chip.textContent = cat.name;
      chip.dataset.category = cat.name;
      categoryChipsContainer.appendChild(chip);
    });
    
    this._updateActiveFilters(); // 更新標籤的啟用狀態
  }

  /**
   * @method _updateActiveFilters
   * @description 根據 `this.activeCategories` 陣列的內容，更新分類標籤和下拉選單的 UI 顯示狀態。
   * @private
   */
  _updateActiveFilters() {
    const { categoryFilter, categoryChipsContainer } = this.elements;
    
    // 更新 Chips 的 .active class
    categoryChipsContainer.querySelectorAll('.chip').forEach(chip => {
      const category = chip.dataset.category;
      const isActive = (this.activeCategories.length === 0 && category === 'all') || this.activeCategories.includes(category);
      chip.classList.toggle('active', isActive);
    });

    // 同步更新下拉選單的值
    if (this.activeCategories.length === 1) {
      categoryFilter.value = this.activeCategories[0];
    } else {
      categoryFilter.value = 'all';
    }
  }
    
  /**
   * @method _renderCategoryList
   * @description 在「管理分類」彈出視窗中，渲染目前的分類列表以及刪除按鈕。
   * @private
   */
  _renderCategoryList() {
    const { list } = this.elements.categoryModal;
    list.innerHTML = '';
    this.categories.forEach(cat => {
      // 檢查該分類是否仍被某些 prompt 使用
      const isUsed = this.prompts.some(p => p.category === cat.name);
      // 如果分類正在被使用，則禁用刪除按鈕
      list.innerHTML += `<li><span>${cat.name}</span><button class="btn small btn-danger" data-id="${cat.id}" ${isUsed ? 'disabled title="分類使用中，無法刪除"' : ''}>刪除</button></li>`;
    });
  }

  /**
   * @method _openModal & _closeModal
   * @description 開啟和關閉彈出視窗的通用輔助函式。
   * @private
   */
  _openModal(modalElement) {
    modalElement.classList.add('active');
  }

  _closeModal(modalElement) {
    modalElement.classList.remove('active');
  }
    
  /**
   * @method _bindEventListeners
   * @description 集中管理和綁定頁面上所有的事件監聽器。
   * @private
   */
  _bindEventListeners() {
    // 解構赋值，方便後續使用
    const {
      searchInput, clearSearchBtn, categoryFilter, addNewBtn,
      manageCategoriesBtn, exportBtn, importBtn, fileImporter,
      categoryChipsContainer, manualImportLink
    } = this.elements;

    const {
      self: promptModal, saveBtn, historySelect,
      restoreBtn, closePreviewBtn
    } = this.elements.promptModal;

    const {
      self: categoryModal, form: categoryForm, list: categoryList,
      closeBtn: closeCategoryModalBtn
    } = this.elements.categoryModal;

    const {
      self: manualImportModal, importBtn: importFromTextBtn
    } = this.elements.manualImportModal;

    // --- 搜尋與篩選事件 ---
    searchInput.addEventListener('input', () => {
      this._toggleClearSearchBtn();
      this._renderTable();
    });
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      this._toggleClearSearchBtn();
      this._renderTable();
    });
    categoryFilter.addEventListener('change', (e) => {
      this.activeCategories = e.target.value === 'all' ? [] : [e.target.value];
      this._updateActiveFilters();
      this._renderTable();
    });
    categoryChipsContainer.addEventListener('click', e => {
      const target = e.target;
      if (target.classList.contains('chip')) {
        const category = target.dataset.category;
        if (category === 'all') {
          this.activeCategories = [];
        } else {
          const index = this.activeCategories.indexOf(category);
          if (index > -1) {
            this.activeCategories.splice(index, 1); // 再次點擊已選中的，則取消選取
          } else {
            this.activeCategories.push(category); // 點擊未選中的，則加入選取
          }
        }
        this._updateActiveFilters();
        this._renderTable();
      }
    });

    // --- 主要功能按鈕事件 ---
    addNewBtn.addEventListener('click', () => this._openPromptModal('add'));
    manageCategoriesBtn.addEventListener('click', () => {
      this._renderCategoryList();
      this._openModal(categoryModal);
    });
    exportBtn.addEventListener('click', () => this._exportData());
    importBtn.addEventListener('click', () => fileImporter.click()); // 點擊按鈕觸發隱藏的 file input
    fileImporter.addEventListener('change', e => this._handleFileImport(e));
    manualImportLink.addEventListener('click', e => {
      e.preventDefault();
      this._openModal(manualImportModal);
    });

    // --- 事件代理：監聽整個表格的點擊，再判斷是哪個按鈕被觸發 ---
    this.elements.tableBody.addEventListener('click', e => this._handleTableClick(e));

    // --- 新增/編輯視窗 (Prompt Modal) 事件 ---
    promptModal.addEventListener('click', e => {
      // 點擊半透明背景或關閉按鈕時關閉視窗
      if (e.target === promptModal || e.target.classList.contains('close-btn')) this._closePromptModal();
    });
    this.elements.promptModal.form.addEventListener('input', () => {
      this.isContentDirty = true; // 監聽表單輸入，標記為「有未儲存的變更」
    });
    saveBtn.addEventListener('click', () => this._savePrompt());
    historySelect.addEventListener('change', (e) => this._previewHistory(e));
    restoreBtn.addEventListener('click', () => this._restoreFromPreview());
    closePreviewBtn.addEventListener('click', () => this._closePreview());
    
    // --- 管理分類視窗 (Category Modal) 事件 ---
    categoryModal.addEventListener('click', e => {
      if (e.target === categoryModal || e.target.classList.contains('close-btn') || e.target === closeCategoryModalBtn) this._closeModal(categoryModal);
    });
    categoryForm.addEventListener('submit', e => {
      e.preventDefault();
      this._addNewCategory();
    });
    categoryList.addEventListener('click', e => {
      // 事件代理：只處理刪除按鈕的點擊
      if (e.target.tagName === 'BUTTON') this._deleteCategory(e.target.dataset.id);
    });
    
    // --- 手動匯入視窗 (Manual Import Modal) 事件 ---
    manualImportModal.addEventListener('click', e => {
      if (e.target === manualImportModal || e.target.classList.contains('close-btn')) this._closeModal(manualImportModal);
    });
    importFromTextBtn.addEventListener('click', () => this._handleManualImport());
    
    // --- 全域事件 ---
    document.addEventListener('keydown', e => {
      // 按下 'Escape' 鍵關閉所有已開啟的彈出視窗
      if (e.key === 'Escape' && (promptModal.classList.contains('active') || categoryModal.classList.contains('active') || manualImportModal.classList.contains('active'))) {
        this._closeModal(promptModal);
        this._closeModal(categoryModal);
        this._closeModal(manualImportModal);
      }
    });
    window.addEventListener('beforeunload', e => {
      // 如果有未儲存的變更，在關閉頁面前提示使用者
      if (this.isContentDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /**
   * @method _handleTableClick
   * @description 使用事件代理處理主列表中的按鈕點擊事件（複製、編輯、刪除）。
   * @param {Event} e - 點擊事件對象
   * @private
   */
  _handleTableClick(e) {
    const row = e.target.closest('.prompt-row'); // 找到被點擊的按鈕所在的列
    if (!row) return;

    const id = row.dataset.id;
    // 複製按鈕
    if (e.target.closest('.copy')) {
      const prompt = this.prompts.find(p => p.id === id);
      if (prompt) {
        navigator.clipboard.writeText(prompt.prompt);
        // 使用 FieldValue.increment() 原子性地增加計數，避免多人同時操作時的衝突
        this.db.collection("prompts").doc(id).update({
          copyCount: firebase.firestore.FieldValue.increment(1)
        });
        this._showToast('已成功複製到剪貼簿！');
      }
    } 
    // 編輯按鈕
    else if (e.target.closest('.edit')) {
      this._openPromptModal('edit', id);
    } 
    // 刪除按鈕
    else if (e.target.closest('.delete')) {
      if (confirm('確定要刪除這條提示詞嗎？')) {
        this.db.collection("prompts").doc(id).delete();
        this._showToast('提示詞已刪除', 'error');
      }
    }
  }

  /**
   * @method _openPromptModal
   * @description 開啟新增或編輯提示詞的彈出視窗。
   * @param {string} mode - 'add' (新增) 或 'edit' (編輯)
   * @param {string|null} id - 如果是編輯模式，則傳入提示詞的 ID
   * @private
   */
  _openPromptModal(mode = 'add', id = null) {
    const { title, idInput, taskInput, categoryInput, promptInput, authorInput, historySelect } = this.elements.promptModal;
    this.isContentDirty = false;
    
    // --- 重設表單 ---
    idInput.value = '';
    taskInput.value = '';
    promptInput.value = '';
    authorInput.value = '';
    categoryInput.value = '';
    this._closePreview(); // 關閉可能已開啟的歷史版本預覽

    if (mode === 'edit') {
      const prompt = this.prompts.find(p => p.id === id);
      if (!prompt) return;

      title.textContent = '編輯提示詞';
      idInput.value = prompt.id;
      taskInput.value = prompt.task;

      // 特殊處理：如果該 prompt 的分類已被刪除，則動態新增一個臨時選項以正確顯示
      const categoryExists = this.categories.some(c => c.name === prompt.category);
      if (!categoryExists && prompt.category) {
        const tempOption = document.createElement('option');
        tempOption.value = prompt.category;
        tempOption.textContent = `${prompt.category} (已刪除)`;
        categoryInput.appendChild(tempOption);
      }
      categoryInput.value = prompt.category;
      
      promptInput.value = prompt.prompt;
      authorInput.value = prompt.author || '';
      this._populateHistory(prompt); // 填充歷史版本下拉選單
    } else {
      title.textContent = '新增提示詞';
      if (this.categories.length > 0) {
        categoryInput.value = this.categories[0].name; // 預設選取第一個分類
      }
      historySelect.innerHTML = '<option value="">無歷史版本</option>';
      historySelect.disabled = true;
      // 自動填入上次使用的作者名稱
      authorInput.value = localStorage.getItem('promptLibraryAuthor') || '';
    }
    
    this._openModal(this.elements.promptModal.self);
    taskInput.focus(); // 自動聚焦到第一個輸入框
  }

  /**
   * @method _closePromptModal
   * @description 關閉新增/編輯視窗，並在有未儲存變更時提醒使用者。
   * @private
   */
  _closePromptModal() {
    if (this.isContentDirty && !confirm('您有未儲存的變更，確定要關閉嗎？')) {
      return;
    }
    this._closePreview();
    this._closeModal(this.elements.promptModal.self);
  }

  /**
   * @method _savePrompt
   * @description 儲存新增或編輯的提示詞到 Firestore。
   * @private
   */
  async _savePrompt() {
    const { form, idInput, taskInput, categoryInput, promptInput, authorInput } = this.elements.promptModal;
    
    // 執行瀏覽器內建的表單驗證
    if (!form.checkValidity()) {
      form.reportValidity();
      this._showToast("儲存失敗：請檢查所有必填欄位！", "error");
      return;
    }

    const id = idInput.value;
    const data = {
      task: taskInput.value.trim(),
      category: categoryInput.value,
      prompt: promptInput.value.trim(),
      author: authorInput.value.trim(),
      lastModified: new Date()
    };

    try {
      if (id) { // --- 編輯模式 ---
        const promptToUpdate = this.prompts.find(p => p.id === id);
        const oldHistory = promptToUpdate.history || [];
        // 將目前的版本存入歷史紀錄
        oldHistory.unshift({
          prompt: promptToUpdate.prompt,
          modifiedDate: promptToUpdate.lastModified,
          author: promptToUpdate.author
        });
        if (oldHistory.length > 10) oldHistory.pop(); // 只保留最近 10 筆歷史紀錄
        data.history = oldHistory;
        
        await this.db.collection("prompts").doc(id).update(data);
        this._showToast('提示詞已更新！');
      } else { // --- 新增模式 ---
        data.createdDate = new Date();
        data.copyCount = 0;
        data.history = [];
        await this.db.collection("prompts").add(data);
        this._showToast('已成功新增提示詞！');
      }
      
      localStorage.setItem('promptLibraryAuthor', data.author); // 儲存作者名稱以供下次使用
      this.isContentDirty = false;
      this._closeModal(this.elements.promptModal.self);
    } catch (e) {
      console.error("儲存失敗: ", e);
      this._showToast("儲存至雲端時發生錯誤。", "error");
    }
  }

  /**
   * @method _addNewCategory
   * @description 在「管理分類」視窗中新增一個分類。
   * @private
   */
  _addNewCategory() {
    const { input } = this.elements.categoryModal;
    const newCat = input.value.trim();
    if (newCat && !this.categories.some(c => c.name === newCat)) {
      this.db.collection("categories").add({ name: newCat });
      input.value = '';
      this._showToast('已新增分類！');
    } else {
      this._showToast(newCat ? '分類已存在' : '分類名稱不能為空', 'error');
    }
  }

  /**
   * @method _deleteCategory
   * @description 刪除一個分類。
   * @param {string} id - 要刪除的分類的 Firestore ID
   * @private
   */
  _deleteCategory(id) {
    if (confirm('確定要刪除這個分類嗎？')) {
      this.db.collection("categories").doc(id).delete();
      this._showToast('分類已刪除', 'error');
    }
  }
    
  /**
   * @method _previewHistory
   * @description 在編輯視窗中預覽選定的歷史版本。
   * @param {Event} e - change 事件對象
   * @private
   */
  _previewHistory(e) {
    const { idInput, historyPreviewContainer, historyPreviewArea } = this.elements.promptModal;
    const id = idInput.value;
    const index = e.target.value;
    
    if (id && index !== '') {
      const prompt = this.prompts.find(p => p.id === id);
      const historicVersion = prompt.history[index];
      if (historicVersion) {
        historyPreviewArea.value = historicVersion.prompt;
        historyPreviewContainer.style.display = 'block'; // 顯示預覽區塊
      }
    } else {
      this._closePreview(); // 如果選擇了預設選項，則關閉預覽
    }
  }

  /**
   * @method _restoreFromPreview
   * @description 將預覽中的歷史版本內容還原到目前的編輯框中。
   * @private
   */
  _restoreFromPreview() {
    const { promptInput, historyPreviewArea } = this.elements.promptModal;
    if (confirm('您確定要用預覽的內容覆蓋目前的編輯嗎？')) {
      promptInput.value = historyPreviewArea.value;
      this._closePreview();
      this._showToast('已還原版本內容至編輯器！');
    }
  }

  /**
   * @method _closePreview
   * @description 關閉歷史版本預覽區塊。
   * @private
   */
  _closePreview() {
    const { historyPreviewContainer, historySelect } = this.elements.promptModal;
    historyPreviewContainer.style.display = 'none';
    if(historySelect) historySelect.value = ''; // 重設下拉選單
  }

  /**
   * @method _handleFileImport
   * @description 處理透過檔案選擇器匯入的 JSON 檔案。
   * @param {Event} event - change 事件對象
   * @private
   */
  _handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.elements.importErrorContainer.style.display = 'none';
    const reader = new FileReader();
    reader.onload = (e) => this._processImportData(e.target.result); // 讀取成功後處理資料
    reader.onerror = () => {
      this._showToast("讀取檔案失敗！", "error");
      this.elements.importErrorContainer.style.display = 'block';
    };
    reader.readAsText(file);
    event.target.value = null; // 清空 file input 的值，確保下次選擇同一個檔案也能觸發 change 事件
  }

  /**
   * @method _handleManualImport
   * @description 處理從文字框貼上內容的手動匯入。
   * @private
   */
  _handleManualImport() {
    const { textArea, self } = this.elements.manualImportModal;
    const content = textArea.value;
    if (this._processImportData(content)) {
      this._closeModal(self);
      textArea.value = '';
    }
  }

  /**
   * @method _processImportData
   * @description 解析匯入的 JSON 字串，驗證格式，並呼叫寫入資料庫的函式。
   * @param {string} jsonString - 包含匯入資料的 JSON 字串
   * @returns {boolean} - 回傳處理是否成功
   * @private
   */
  async _processImportData(jsonString) {
    try {
      if (!jsonString) throw new Error("Input is empty.");
      const data = JSON.parse(jsonString);
      // 驗證 JSON 結構是否符合預期
      if (!data.prompts || !Array.isArray(data.prompts) || !data.categories || !Array.isArray(data.categories)) {
        throw new Error("Invalid file format: missing prompts or categories array.");
      }
      if (confirm(`確定要從檔案中匯入 ${data.prompts.length} 條提示詞與 ${data.categories.length} 個分類嗎？\n此操作只會新增，不會刪除現有資料。`)) {
        await this._importDataToFirestore(data.prompts, data.categories);
      }
      return true;
    } catch (err) {
      this._showToast("檔案格式錯誤或解析失敗！", "error");
      this.elements.importErrorContainer.style.display = 'block';
      console.error("Import processing error:", err);
      return false;
    }
  }

  /**
   * @method _importDataToFirestore
   * @description 將解析後的資料批次寫入到 Firestore。
   * @param {Array} prompts - 要匯入的提示詞陣列
   * @param {Array} categories - 要匯入的分類名稱陣列
   * @private
   */
  async _importDataToFirestore(prompts, categories) {
    if (!this.db) return;
    this._showToast("正在匯入資料...");
    const batch = this.db.batch();
    
    // 過濾掉已存在的分類，只新增不重複的分類
    const existingCategoryNames = this.categories.map(c => c.name);
    const newCategories = categories.filter(catName => !existingCategoryNames.includes(catName));
    newCategories.forEach(catName => {
      const catRef = this.db.collection("categories").doc();
      batch.set(catRef, { name: catName });
    });

    // 將所有提示詞加入批次操作
    prompts.forEach(p => {
      const promptRef = this.db.collection("prompts").doc();
      batch.set(promptRef, {
        task: p.task || "無標題",
        category: p.category || "未分類",
        prompt: p.prompt || "",
        author: p.author || "Imported",
        createdDate: new Date(),
        lastModified: new Date(),
        copyCount: p.copyCount || 0,
        history: p.history || []
      });
    });

    try {
      await batch.commit(); // 執行批次寫入
      this._showToast(`成功匯入 ${prompts.length} 條提示詞與 ${newCategories.length} 個新分類！`);
    } catch (err) {
      this._showToast("匯入失敗，請稍後再試。", "error");
      console.error("Import failed:", err);
      this.elements.importErrorContainer.style.display = 'block';
    }
  }
    
  /**
   * @method _exportData
   * @description 將目前的提示詞庫資料匯出成一個 JSON 檔案。
   * @private
   */
  _exportData() {
    try {
      // 對資料進行清理，移除 Firestore 特定的 ID 和時間戳物件
      const sanitizedPrompts = this.prompts.map(p => {
          const { id, ...rest } = p; // 移除 id
          // 將 Firestore Timestamps 轉換為 ISO 字串，以確保 JSON 的通用性
          if (rest.createdDate && rest.createdDate.toDate) {
              rest.createdDate = rest.createdDate.toDate().toISOString();
          }
          if (rest.lastModified && rest.lastModified.toDate) {
              rest.lastModified = rest.lastModified.toDate().toISOString();
          }
          if (rest.history && Array.isArray(rest.history)) {
              rest.history = rest.history.map(h => {
                  if (h.modifiedDate && h.modifiedDate.toDate) {
                      h.modifiedDate = h.modifiedDate.toDate().toISOString();
                  }
                  return h;
              });
          }
          return rest;
      });

      const dataToExport = {
        version: "prompt-library-v2.0",
        exportedDate: new Date().toISOString(),
        prompts: sanitizedPrompts,
        categories: this.categories.map(c => c.name)
      };

      // 建立並觸發下載
      const jsonString = JSON.stringify(dataToExport, null, 2); // 格式化 JSON 讓檔案更易讀
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `prompt_library_backup_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url); // 釋放記憶體
      this._showToast("資料已成功匯出！");
    } catch (e) {
      console.error("匯出失敗:", e);
      this._showToast("匯出資料時發生錯誤。", "error");
    }
  }

  /**
   * @method _showToast
   * @description 顯示一個短暫的提示訊息（Toast Notification）。
   * @param {string} message - 要顯示的訊息
   * @param {string} type - 'success' 或 'error'
   * @private
   */
  _showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10); // 延遲一點點時間來觸發 CSS transition
    setTimeout(() => {
      toast.classList.remove('show');
      // 等待淡出動畫結束後再從 DOM 中移除
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  /**
   * @method _toggleClearSearchBtn
   * @description 根據搜尋框中是否有文字，來顯示或隱藏「清除」按鈕。
   * @private
   */
  _toggleClearSearchBtn() {
      if(this.elements.searchInput) {
          this.elements.clearSearchBtn.style.display = this.elements.searchInput.value.length > 0 ? 'block' : 'none';
      }
  }

  /**
   * @method _populateHistory
   * @description 填充編輯視窗中的歷史版本下拉選單。
   * @param {object} prompt - 包含歷史紀錄的提示詞物件
   * @private
   */
  _populateHistory(prompt) {
    const { historySelect } = this.elements.promptModal;
    historySelect.innerHTML = '<option value="">檢視歷史版本...</option>';
    if (prompt.history && prompt.history.length > 0) {
      prompt.history.forEach((h, index) => {
        const date = h.modifiedDate && h.modifiedDate.toDate ? h.modifiedDate.toDate() : new Date(h.modifiedDate);
        historySelect.innerHTML += `<option value="${index}">版本 #${prompt.history.length - index} (${date.toLocaleString('zh-TW')})</option>`;
      });
      historySelect.disabled = false;
    } else {
      historySelect.disabled = true;
    }
  }
}

// --- 應用程式啟動 ---
// 當 HTML 文件完全載入並解析完畢後，建立 PromptLibraryApp 的實例並啟動它。
document.addEventListener('DOMContentLoaded', () => {
  const app = new PromptLibraryApp();
  app.init();
});
