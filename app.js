/**
 * @file app.js
 * @description 品質處 Prompt Library 雲端協作版的核心應用程式邏輯。
 * @version 2.1 - 兩欄式佈局與提示詞高亮
 * @date 2025-10-01
 */

/**
 * @class PromptLibraryApp
 * @description 整個提示詞庫應用程式的主要類別。
 * 它封裝了所有與 UI 互動、資料處理、以及與 Firebase 後端通訊的功能。
 */
class PromptLibraryApp {
  /**
   * @constructor
   * @description 初始化應用程式。主要工作是快取所有會用到的 DOM 元素以便快速存取，
   * 並設定應用程式的初始狀態變數。
   */
  constructor() {
    // --- DOM 元素快取 ---
    // 預先選取所有 HTML 元素並存放在 this.elements 物件中，可避免重複查詢 DOM，提升效能。
    this.elements = {
      tableBody: document.getElementById('prompt-list'),
      initialDataSource: document.getElementById('initial-data'),
      searchInput: document.getElementById('search'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      categoryFilter: document.getElementById('categoryFilter'),
      categoryChipsContainer: document.getElementById('categoryChipsContainer'),
      addNewBtn: document.getElementById('addNew'),
      manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      fileImporter: document.getElementById('fileImporter'),
      importErrorContainer: document.getElementById('importErrorContainer'),
      manualImportLink: document.getElementById('manualImportLink'),
      promptModal: { self: document.getElementById('promptModal'), title: document.getElementById('modalTitle'), form: document.getElementById('promptForm'), idInput: document.getElementById('promptId'), taskInput: document.getElementById('taskInput'), categoryInput: document.getElementById('categoryInput'), promptInput: document.getElementById('promptInput'), authorInput: document.getElementById('authorInput'), historySelect: document.getElementById('historySelect'), saveBtn: document.getElementById('saveBtn'), historyPreviewContainer: document.getElementById('historyPreviewContainer'), historyPreviewArea: document.getElementById('historyPreviewArea'), restoreBtn: document.getElementById('restoreBtn'), closePreviewBtn: document.getElementById('closePreviewBtn'), },
      categoryModal: { self: document.getElementById('categoryModal'), list: document.getElementById('categoryList'), form: document.getElementById('newCategoryForm'), input: document.getElementById('newCategoryInput'), closeBtn: document.getElementById('closeCategoryModalBtn'), },
      manualImportModal: { self: document.getElementById('manualImportModal'), textArea: document.getElementById('manualImportText'), importBtn: document.getElementById('importFromTextBtn') },
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
   * @description 應用程式的公開進入點。
   * 負責依序呼叫各個初始化函式，啟動整個應用程式。
   */
  init() {
    this._initFirebase();
    this._setupRealtimeListeners();
    this._bindEventListeners();
  }

  /**
   * @private
   * @method _initFirebase
   * @description 初始化 Firebase 應用和 Firestore 資料庫連線。
   * 如果初始化失敗，會向使用者顯示警告。
   */
  _initFirebase() {
    // 【重要】請將此處替換為您自己的 Firebase 設定
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
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      this.db = firebase.firestore();
    } catch (e) {
      console.error("Firebase 初始化失敗:", e);
      alert("雲端資料庫初始化失敗！請檢查您的 Firebase 設定。");
    }
  }

  /**
   * @private
   * @method _setupRealtimeListeners
   * @description 設定 Firestore 的即時監聽器。
   * 當雲端資料庫中的 'categories' 或 'prompts' 集合發生任何變動時，
   * 會自動獲取最新資料並觸發 UI 重新渲染，達到即時同步的效果。
   * 同時也負責處理初次使用時的資料庫 seeding。
   */
  _setupRealtimeListeners() {
    if (!this.db) return;
    this.db.collection("categories").orderBy("name").onSnapshot(snapshot => {
      this.categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this._populateCategoryDropdowns();
      this._renderCategoryChips();
      this._renderTable();
    });
    this.db.collection("prompts").orderBy("createdDate", "desc").onSnapshot(snapshot => {
      if (snapshot.empty && this.categories.length === 0) {
        this._seedDataToFirestore();
      } else {
        this.prompts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this._renderTable();
      }
    });
  }

  /**
   * @private
   * @method _seedDataToFirestore
   * @description 植入初始資料。此函式僅在雲端資料庫完全為空時被觸發一次。
   * 它會從 HTML 中隱藏的表格讀取預設資料，並使用批次寫入 (batch write)
   * 的方式將其高效地上傳到 Firestore。
   */
  async _seedDataToFirestore() {
    console.log("資料庫是空的，正在從 HTML 植入初始資料到雲端...");
    if (!this.db) return;
    const rows = this.elements.initialDataSource.querySelectorAll('tr');
    const categories = new Set();
    const promptsToSeed = [];
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
   * @private
   * @method _renderTable
   * @description 核心的 UI 渲染函式。
   * 根據目前的搜尋關鍵字和已啟用的分類篩選條件，
   * 過濾 `this.prompts` 陣列，並使用 `<template>` 動態生成提示詞列表。
   */
  _renderTable() {
    const { tableBody, searchInput } = this.elements;
    tableBody.innerHTML = '';
    const searchTerm = searchInput.value.trim().toLowerCase();
    const filtered = this.prompts.filter(p => {
      const matchesCategory = this.activeCategories.length === 0 || this.activeCategories.includes(p.category);
      const matchesSearch = !searchTerm || p.task.toLowerCase().includes(searchTerm) || p.prompt.toLowerCase().includes(searchTerm) || (p.author && p.author.toLowerCase().includes(searchTerm));
      return matchesCategory && matchesSearch;
    });
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 32px;">找不到符合條件的提示詞。</td></tr>`;
      return;
    }
    filtered.forEach((prompt, index) => {
      const row = this.elements.rowTemplate.content.cloneNode(true);
      const tr = row.querySelector('.prompt-row');
      tr.dataset.id = prompt.id;
      row.querySelector('.id').textContent = index + 1;
      row.querySelector('.task').textContent = prompt.task;
      const categoryLabel = row.querySelector('.category-label');
      categoryLabel.textContent = prompt.category;
      categoryLabel.dataset.category = prompt.category;
      
      const promptMonoElement = row.querySelector('.prompt .mono');
      promptMonoElement.innerHTML = this._visualizePromptText(prompt.prompt);
      
      // row.querySelector('.copy-count').textContent = `複製 ${prompt.copyCount || 0} 次`; //
      row.querySelector('.author').textContent = `作者: ${prompt.author || 'N/A'}`;
      const lastModifiedDate = prompt.lastModified && prompt.lastModified.toDate ? prompt.lastModified.toDate() : new Date();
      row.querySelector('.last-modified').textContent = `更新: ${lastModifiedDate.toLocaleDateString()}`;
      tableBody.appendChild(row);
    });
    this._updateActiveFilters();
  }

  /**
   * @private
   * @method _populateCategoryDropdowns
   * @description 更新頁面上所有與分類相關的 `<select>` 下拉選單，
   * 包含主篩選器和編輯視窗中的選單，確保它們同步顯示最新的分類列表。
   */
  _populateCategoryDropdowns() {
    const { categoryFilter, promptModal } = this.elements;
    const { categoryInput } = promptModal;
    const currentFilterValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">全部分類</option>';
    this.categories.forEach(cat => {
      categoryFilter.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
    if (this.categories.some(c => c.name === currentFilterValue)) {
      categoryFilter.value = currentFilterValue;
    }
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
   * @private
   * @method _renderCategoryChips
   * @description 渲染位於主列表上方的可點擊分類標籤 (Chips)，提供更直觀的篩選方式。
   */
  _renderCategoryChips() {
    const { categoryChipsContainer } = this.elements;
    categoryChipsContainer.innerHTML = '';
    const allChip = document.createElement('span');
    allChip.className = 'chip clickable';
    allChip.textContent = '全部分類';
    allChip.dataset.category = 'all';
    categoryChipsContainer.appendChild(allChip);
    this.categories.forEach(cat => {
      const chip = document.createElement('span');
      chip.className = 'chip clickable';
      chip.textContent = cat.name;
      chip.dataset.category = cat.name;
      categoryChipsContainer.appendChild(chip);
    });
    this._updateActiveFilters();
  }

  /**
   * @private
   * @method _updateActiveFilters
   * @description 同步篩選器 UI 的狀態。根據 `this.activeCategories` 陣列的內容，
   * 為對應的分類標籤 (Chip) 加上 'active' class，並更新下拉選單的選中項。
   */
  _updateActiveFilters() {
    const { categoryFilter, categoryChipsContainer } = this.elements;
    categoryChipsContainer.querySelectorAll('.chip').forEach(chip => {
      const category = chip.dataset.category;
      const isActive = (this.activeCategories.length === 0 && category === 'all') || this.activeCategories.includes(category);
      chip.classList.toggle('active', isActive);
    });
    if (this.activeCategories.length === 1) {
      categoryFilter.value = this.activeCategories[0];
    } else {
      categoryFilter.value = 'all';
    }
  }
    
  /**
   * @private
   * @method _renderCategoryList
   * @description 在「管理分類」彈出視窗中，渲染目前的分類列表。
   * 如果某個分類已被提示詞使用，則其對應的刪除按鈕會被禁用。
   */
 _renderCategoryList() {
    const { list } = this.elements.categoryModal;
    list.innerHTML = '';
    this.categories.forEach(cat => {
      const isUsed = this.prompts.some(p => p.category === cat.name);
      const escapedName = this._escapeHTML(cat.name);
      // 為每個 li 項目產生包含一般和編輯模式所需的所有 HTML 元素
      list.innerHTML += `
        <li data-id="${cat.id}" data-name="${escapedName}">
          <span class="category-name">${escapedName}</span>
          <input type="text" class="edit-input" value="${escapedName}">
          <div class="category-actions">
            <button class="btn small btn-success btn-save">儲存</button>
            <button class="btn small ghost btn-cancel">取消</button>
            <button class="btn small ghost btn-edit">編輯</button>
            <button class="btn small btn-danger" ${isUsed ? 'disabled title="分類使用中，無法刪除"' : ''}>刪除</button>
          </div>
        </li>
      `;
    });
  }
  /**
   * @private
   * @method _openModal
   * @param {HTMLElement} modalElement - 要開啟的彈出視窗元素。
   * @description 開啟彈出視窗的通用輔助函式。
   */
  _openModal(modalElement) {
    modalElement.classList.add('active');
  }

  /**
   * @private
   * @method _closeModal
   * @param {HTMLElement} modalElement - 要關閉的彈出視窗元素。
   * @description 關閉彈出視窗的通用輔助函式。
   */
  _closeModal(modalElement) {
    modalElement.classList.remove('active');
  }
    
  /**
   * @private
   * @method _bindEventListeners
   * @description 集中管理和綁定頁面上所有的事件監聽器。
   * 這有助於將事件處理邏輯與其他業務邏輯分離，使程式碼更清晰。
   */
  _bindEventListeners() {
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
            this.activeCategories.splice(index, 1);
          } else {
            this.activeCategories.push(category);
          }
        }
        this._updateActiveFilters();
        this._renderTable();
      }
    });
    addNewBtn.addEventListener('click', () => this._openPromptModal('add'));
    manageCategoriesBtn.addEventListener('click', () => {
  this._renderCategoryList();
  this._openModal(this.elements.categoryModal.self);
});
    exportBtn.addEventListener('click', () => this._exportData());
    importBtn.addEventListener('click', () => fileImporter.click());
    fileImporter.addEventListener('change', e => this._handleFileImport(e));
    manualImportLink.addEventListener('click', e => {
      e.preventDefault();
      this._openModal(manualImportModal);
    });
    this.elements.tableBody.addEventListener('click', e => this._handleTableClick(e));
    promptModal.addEventListener('click', e => {
      if (e.target === promptModal || e.target.classList.contains('close-btn')) this._closePromptModal();
    });
    this.elements.promptModal.form.addEventListener('input', () => {
      this.isContentDirty = true;
    });
    saveBtn.addEventListener('click', () => this._savePrompt());
    historySelect.addEventListener('change', (e) => this._previewHistory(e));
    restoreBtn.addEventListener('click', () => this._restoreFromPreview());
    closePreviewBtn.addEventListener('click', () => this._closePreview());
    categoryModal.addEventListener('click', e => {
      if (e.target === categoryModal || e.target.classList.contains('close-btn') || e.target === closeCategoryModalBtn) this._closeModal(categoryModal);
    });
    categoryForm.addEventListener('submit', e => {
      e.preventDefault();
      this._addNewCategory();
    });
   categoryList.addEventListener('click', e => {
      const target = e.target;
      const li = target.closest('li');
      if (!li) return;

      const id = li.dataset.id;
      const currentName = li.dataset.name;
      
      // 處理「編輯」按鈕點擊
      if (target.classList.contains('btn-edit')) {
        const currentlyEditing = categoryList.querySelector('li.editing');
        if (currentlyEditing) {
            currentlyEditing.classList.remove('editing');
        }
        li.classList.add('editing');
        li.querySelector('.edit-input').focus();
      }
      // 處理「取消」按鈕點擊
      else if (target.classList.contains('btn-cancel')) {
        li.classList.remove('editing');
        li.querySelector('.edit-input').value = currentName;
      }
      // 處理「儲存」按鈕點擊
      else if (target.classList.contains('btn-save')) {
        this._saveCategoryEdit(li);
      }
      // 處理「刪除」按鈕點擊
      else if (target.classList.contains('btn-danger')) {
        this._deleteCategory(id);
      }
    });
    manualImportModal.addEventListener('click', e => {
      if (e.target === manualImportModal || e.target.classList.contains('close-btn')) this._closeModal(manualImportModal);
    });
    importFromTextBtn.addEventListener('click', () => this._handleManualImport());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && (promptModal.classList.contains('active') || categoryModal.classList.contains('active') || manualImportModal.classList.contains('active'))) {
        this._closeModal(promptModal);
        this._closeModal(categoryModal);
        this._closeModal(manualImportModal);
      }
    });
    window.addEventListener('beforeunload', e => {
      if (this.isContentDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /**
   * @private
   * @method _handleTableClick
   * @description 使用事件代理 (event delegation) 處理主列表中的按鈕點擊事件（複製、編輯、刪除）。
   * 這樣可以避免為每一列的按鈕都單獨綁定監聽器，提升效能。
   * @param {Event} e - 點擊事件對象。
   */
  _handleTableClick(e) {
    const row = e.target.closest('.prompt-row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('.copy')) {
      const prompt = this.prompts.find(p => p.id === id);
      if (prompt) {
        navigator.clipboard.writeText(prompt.prompt);
        this.db.collection("prompts").doc(id).update({
          copyCount: firebase.firestore.FieldValue.increment(1)
        });
        this._showToast('已成功複製到剪貼簿！');
      }
    } else if (e.target.closest('.edit')) {
      this._openPromptModal('edit', id);
    } else if (e.target.closest('.delete')) {
      if (confirm('確定要刪除這條提示詞嗎？')) {
        this.db.collection("prompts").doc(id).delete();
        this._showToast('提示詞已刪除', 'error');
      }
    }
  }

  /**
   * @private
   * @method _openPromptModal
   * @description 開啟新增或編輯提示詞的彈出視窗。
   * @param {('add'|'edit')} mode - 'add' (新增) 或 'edit' (編輯) 模式。
   * @param {string|null} id - 如果是編輯模式，則傳入提示詞的 Firestore 文件 ID。
   */
  _openPromptModal(mode = 'add', id = null) {
    const { title, idInput, taskInput, categoryInput, promptInput, authorInput, historySelect } = this.elements.promptModal;
    this.isContentDirty = false;
    idInput.value = '';
    taskInput.value = '';
    promptInput.value = '';
    authorInput.value = '';
    categoryInput.value = '';
    this._closePreview();
    if (mode === 'edit') {
      const prompt = this.prompts.find(p => p.id === id);
      if (!prompt) return;
      title.textContent = '編輯提示詞';
      idInput.value = prompt.id;
      taskInput.value = prompt.task;
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
      this._populateHistory(prompt);
    } else {
      title.textContent = '新增提示詞';
      if (this.categories.length > 0) {
        categoryInput.value = this.categories[0].name;
      }
      historySelect.innerHTML = '<option value="">無歷史版本</option>';
      historySelect.disabled = true;
      authorInput.value = localStorage.getItem('promptLibraryAuthor') || '';
    }
    this._openModal(this.elements.promptModal.self);
    taskInput.focus();
  }

  /**
   * @private
   * @method _closePromptModal
   * @description 關閉新增/編輯視窗。如果表單內容有未儲存的變更，會彈出確認提示。
   */
  _closePromptModal() {
    if (this.isContentDirty && !confirm('您有未儲存的變更，確定要關閉嗎？')) {
      return;
    }
    this._closePreview();
    this._closeModal(this.elements.promptModal.self);
  }

  /**
   * @private
   * @method _savePrompt
   * @description 儲存新增或編輯的提示詞到 Firestore。
   * 執行瀏覽器內建的表單驗證，並根據是否有 ID 來判斷是執行新增還是更新操作。
   * 更新時會將舊版本存入歷史紀錄。
   */
  async _savePrompt() {
    const { form, idInput, taskInput, categoryInput, promptInput, authorInput } = this.elements.promptModal;
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
      if (id) {
        const promptToUpdate = this.prompts.find(p => p.id === id);
        const oldHistory = promptToUpdate.history || [];
        oldHistory.unshift({
          prompt: promptToUpdate.prompt,
          modifiedDate: promptToUpdate.lastModified,
          author: promptToUpdate.author
        });
        if (oldHistory.length > 10) oldHistory.pop();
        data.history = oldHistory;
        await this.db.collection("prompts").doc(id).update(data);
        this._showToast('提示詞已更新！');
      } else {
        data.createdDate = new Date();
        data.copyCount = 0;
        data.history = [];
        await this.db.collection("prompts").add(data);
        this._showToast('已成功新增提示詞！');
      }
      localStorage.setItem('promptLibraryAuthor', data.author);
      this.isContentDirty = false;
      this._closeModal(this.elements.promptModal.self);
    } catch (e) {
      console.error("儲存失敗: ", e);
      this._showToast("儲存至雲端時發生錯誤。", "error");
    }
  }

  /**
   * @private
   * @method _addNewCategory
   * @description 在「管理分類」視窗中新增一個分類。
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
   * @private
   * @method _deleteCategory
   * @description 刪除一個分類。
   * @param {string} id - 要刪除的分類的 Firestore 文件 ID。
   */
  _deleteCategory(id) {
    if (confirm('確定要刪除這個分類嗎？')) {
      this.db.collection("categories").doc(id).delete();
      this._showToast('分類已刪除', 'error');
    }
  }
  /**
   * @private
   * @method _saveCategoryEdit
   * @description 儲存分類名稱的編輯。使用批次寫入來確保資料一致性。
   * @param {HTMLLIElement} li - 被編輯的列表項元素。
   */
  async _saveCategoryEdit(li) {
    const id = li.dataset.id;
    const oldName = li.dataset.name;
    const input = li.querySelector('.edit-input');
    const newName = input.value.trim();

    // --- 驗證 ---
    if (!newName) {
      this._showToast('分類名稱不能為空', 'error');
      return;
    }
    if (newName === oldName) {
      li.classList.remove('editing');
      return;
    }
    if (this.categories.some(cat => cat.name.toLowerCase() === newName.toLowerCase() && cat.id !== id)) {
      this._showToast('該分類名稱已存在', 'error');
      return;
    }

    // --- Firestore 批次更新 ---
    this._showToast('正在更新分類...');
    const batch = this.db.batch();
    
    // 1. 更新 categories 集合中的分類文件
    const categoryRef = this.db.collection('categories').doc(id);
    batch.update(categoryRef, { name: newName });

    // 2. 查詢 prompts 集合中所有使用舊分類名稱的文件
    const promptsToUpdateQuery = this.db.collection('prompts').where('category', '==', oldName);
    
    try {
      const snapshot = await promptsToUpdateQuery.get();
      if (!snapshot.empty) {
        snapshot.docs.forEach(doc => {
          // 3. 將這些 prompt 文件的 category 欄位更新為新名稱
          batch.update(doc.ref, { category: newName });
        });
      }
      
      // 4. 提交所有更新操作
      await batch.commit();

      li.classList.remove('editing');
      this._showToast('分類名稱更新成功！');
    } catch (e) {
      console.error("更新分類失敗:", e);
      this._showToast("更新分類時發生錯誤。", "error");
      li.classList.remove('editing');
      input.value = oldName; // 出錯時還原輸入框內容
    }
  }  
  /**
   * @private
   * @method _previewHistory
   * @description 在編輯視窗中預覽選定的歷史版本。
   * @param {Event} e - 來自下拉選單的 change 事件對象。
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
        historyPreviewContainer.style.display = 'block';
      }
    } else {
      this._closePreview();
    }
  }

  /**
   * @private
   * @method _restoreFromPreview
   * @description 將預覽中的歷史版本內容還原到目前的編輯框中。
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
   * @private
   * @method _closePreview
   * @description 關閉歷史版本預覽區塊。
   */
  _closePreview() {
    const { historyPreviewContainer, historySelect } = this.elements.promptModal;
    historyPreviewContainer.style.display = 'none';
    if(historySelect) historySelect.value = '';
  }

  /**
   * @private
   * @method _handleFileImport
   * @description 處理透過檔案選擇器匯入的 JSON 檔案。
   * @param {Event} event - 來自 file input 的 change 事件對象。
   */
  _handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.elements.importErrorContainer.style.display = 'none';
    const reader = new FileReader();
    reader.onload = (e) => this._processImportData(e.target.result);
    reader.onerror = () => {
      this._showToast("讀取檔案失敗！", "error");
      this.elements.importErrorContainer.style.display = 'block';
    };
    reader.readAsText(file);
    event.target.value = null;
  }

  /**
   * @private
   * @method _handleManualImport
   * @description 處理從文字框貼上內容的手動匯入。
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
   * @private
   * @method _processImportData
   * @description 解析匯入的 JSON 字串，驗證格式，並呼叫寫入資料庫的函式。
   * @param {string} jsonString - 包含匯入資料的 JSON 字串。
   * @returns {boolean} - 回傳處理是否成功。
   */
  async _processImportData(jsonString) {
    try {
      if (!jsonString) throw new Error("Input is empty.");
      const data = JSON.parse(jsonString);
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
   * @private
   * @method _importDataToFirestore
   * @description 將解析後的資料批次寫入到 Firestore。
   * @param {Array<object>} prompts - 要匯入的提示詞陣列。
   * @param {Array<string>} categories - 要匯入的分類名稱陣列。
   */
  async _importDataToFirestore(prompts, categories) {
    if (!this.db) return;
    this._showToast("正在匯入資料...");
    const batch = this.db.batch();
    const existingCategoryNames = this.categories.map(c => c.name);
    const newCategories = categories.filter(catName => !existingCategoryNames.includes(catName));
    newCategories.forEach(catName => {
      const catRef = this.db.collection("categories").doc();
      batch.set(catRef, { name: catName });
    });
    prompts.forEach(p => {
      const promptRef = this.db.collection("prompts").doc();
      batch.set(promptRef, {
        task: p.task || "無標題", category: p.category || "未分類",
        prompt: p.prompt || "", author: p.author || "Imported",
        createdDate: new Date(), lastModified: new Date(),
        copyCount: p.copyCount || 0, history: p.history || []
      });
    });
    try {
      await batch.commit();
      this._showToast(`成功匯入 ${prompts.length} 條提示詞與 ${newCategories.length} 個新分類！`);
    } catch (err) {
      this._showToast("匯入失敗，請稍後再試。", "error");
      console.error("Import failed:", err);
      this.elements.importErrorContainer.style.display = 'block';
    }
  }
    
  /**
   * @private
   * @method _exportData
   * @description 將目前的提示詞庫資料匯出成一個 JSON 檔案。
   * 在匯出前會清理資料，將 Firestore 特有的 Timestamp 物件轉換為標準的 ISO 字串格式。
   */
  _exportData() {
    try {
      const sanitizedPrompts = this.prompts.map(p => {
          const { id, ...rest } = p;
          if (rest.createdDate && rest.createdDate.toDate) { rest.createdDate = rest.createdDate.toDate().toISOString(); }
          if (rest.lastModified && rest.lastModified.toDate) { rest.lastModified = rest.lastModified.toDate().toISOString(); }
          if (rest.history && Array.isArray(rest.history)) {
              rest.history = rest.history.map(h => {
                  if (h.modifiedDate && h.modifiedDate.toDate) { h.modifiedDate = h.modifiedDate.toDate().toISOString(); }
                  return h;
              });
          }
          return rest;
      });
      const dataToExport = { version: "prompt-library-v2.0", exportedDate: new Date().toISOString(), prompts: sanitizedPrompts, categories: this.categories.map(c => c.name) };
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
      this._showToast("資料已成功匯出！");
    } catch (e) {
      console.error("匯出失敗:", e);
      this._showToast("匯出資料時發生錯誤。", "error");
    }
  }

  /**
   * @private
   * @method _showToast
   * @description 顯示一個短暫的提示訊息（Toast Notification）。
   * @param {string} message - 要顯示的訊息。
   * @param {('success'|'error')} [type='success'] - 提示的類型，決定其顏色。
   */
  _showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  /**
   * @private
   * @method _toggleClearSearchBtn
   * @description 根據搜尋框中是否有文字，來顯示或隱藏「清除」按鈕。
   */
  _toggleClearSearchBtn() {
      if(this.elements.searchInput) {
          this.elements.clearSearchBtn.style.display = this.elements.searchInput.value.length > 0 ? 'block' : 'none';
      }
  }

  /**
   * @private
   * @method _populateHistory
   * @description 填充編輯視窗中的歷史版本下拉選單。
   * @param {object} prompt - 包含歷史紀錄的提示詞物件。
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
  
  /**
   * @private
   * @method _escapeHTML
   * @description 轉換特殊字元為 HTML 實體，防止 XSS (跨站腳本攻擊)。
   * 這是在使用 `innerHTML` 插入來自使用者或資料庫的內容時，一個重要的安全措施。
   * @param {string} str - 原始字串。
   * @returns {string} - 經過轉義處理的安全字串。
   */
  _escapeHTML(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * @private
   * @method _visualizePromptText
   * @description 將 prompt 文字中的 `{{變數}}` 替換為帶有高亮樣式的 HTML `<span>` 標籤。
   * 它首先使用 `_escapeHTML` 確保內容安全，然後才進行替換。
   * @param {string} text - 原始 prompt 文字。
   * @returns {string} - 處理後，包含高亮標籤的 HTML 字串。
   */
  _visualizePromptText(text) {
      if (!text) return '';
      // 1. 先對整個字串進行 HTML escape，防止惡意程式碼
      const escapedText = this._escapeHTML(text);
      // 2. 再用正規表示式找到 {{...}} 格式的變數，並為其加上 span 標籤
      return escapedText.replace(/{{\s*([^}]+)\s*}}/g, '<span class="prompt-placeholder">{{$1}}</span>');
  }

}

/**
 * @description 應用程式啟動入口。
 * 監聽 DOMContentLoaded 事件，確保在 HTML 文件完全載入並解析完畢後，
 * 才建立 PromptLibraryApp 的實例並啟動它。
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = new PromptLibraryApp();
  app.init();
});



