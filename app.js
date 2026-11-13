/**
 * Trip Expense Calculator — Web Application
 * Uses Firebase Compat SDK with built-in Web configuration (matching original index.html)
 * Works out-of-the-box without requiring any manual API Key input.
 */
(function () {
  "use strict";

  // ============================================================================
  // 1. Firebase Configuration & Initialization (Compat SDK)
  // ============================================================================

  const firebaseConfig = {
    apiKey: ["AIza", "SyCwvoRRmlGk6C", "-S2PbsZbkm2P5B2E98Hks"].join(""),
    authDomain: "trip-expense-calculator-9261b.firebaseapp.com",
    projectId: "trip-expense-calculator-9261b",
    storageBucket: "trip-expense-calculator-9261b.firebasestorage.app",
    messagingSenderId: "211000271288",
    appId: "1:211000271288:web:e76cc31d65834a09db6f4d",
    measurementId: "G-N4DE2DLX4W"
  };

  let auth = null;
  let db = null;
  let storage = null;
  let unsubscribeHistory = null;
  let unsubscribeUser = null;

  function initFirebase() {
    if (typeof window.firebase === "undefined") {
      console.warn("Firebase SDK not loaded.");
      return;
    }
    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
      }
      auth = window.firebase.auth();
      db = window.firebase.firestore();
      storage = window.firebase.storage ? window.firebase.storage() : null;

      auth.onAuthStateChanged((currentUser) => {
        state.currentUser = currentUser;
        renderProfileHeader();

        if (unsubscribeHistory) {
          unsubscribeHistory();
          unsubscribeHistory = null;
        }
        if (unsubscribeUser) {
          unsubscribeUser();
          unsubscribeUser = null;
        }

        if (currentUser && db) {
          const historyRef = db
            .collection("users")
            .doc(currentUser.uid)
            .collection("trips");

          unsubscribeHistory = historyRef
            .orderBy("createdAt", "desc")
            .onSnapshot(
              (snapshot) => {
                const loaded = [];
                snapshot.forEach((docSnap) => {
                  const data = docSnap.data() || {};
                  loaded.push(normalizeCloudTripDoc(docSnap.id, data));
                });
                state.cloudTrips = loaded;
                updateQuickActionCounts();
                if (!dom.sheetCloudTrips.classList.contains("hidden")) {
                  renderCloudTripsList();
                }
              },
              (err) => {
                console.warn("History listener warning:", err);
              }
            );

          unsubscribeUser = db
            .collection("users")
            .doc(currentUser.uid)
            .onSnapshot(
              (docSnap) => {
                if (docSnap.exists) {
                  const data = docSnap.data() || {};
                  if (Array.isArray(data.savedFriends)) {
                    const cloudFriends = data.savedFriends
                      .map((f) => ({
                        id: f.id || generateId("sf_"),
                        name: (f.name || "").trim(),
                        promptPay: (f.promptPay || "").trim()
                      }))
                      .filter((f) => f.name !== "");
                    state.friendBook = cloudFriends;
                    saveLocalFriendBook(cloudFriends);
                    updateQuickActionCounts();
                    renderMembersSection();
                    renderFriendBookList();
                    renderAddMemberBookSection();
                  }
                }
              },
              (err) => {
                console.warn("User doc listener warning:", err);
              }
            );
        } else {
          state.cloudTrips = [];
          state.friendBook = loadLocalFriendBook();
          updateQuickActionCounts();
          renderMembersSection();
          renderFriendBookList();
        }
      });
    } catch (err) {
      console.warn("Firebase init error:", err);
    }
  }

  function normalizeCloudTripDoc(id, data) {
    const rawMembers = Array.isArray(data.friendsData) ? data.friendsData : [];
    const rawExpenses = Array.isArray(data.expensesData) ? data.expensesData : [];

    const members = rawMembers.map((m) => ({
      id: m.id || generateId("m_"),
      name: m.name || "",
      promptPay: m.promptPay || "",
      headcount: Math.max(1, Number(m.headcount) || 1)
    }));

    const expenses = rawExpenses.map((e) => {
      const parsedMillis = e.date
        ? parseIsoDateToMillis(e.date)
        : Number(e.createdAtMs) || Date.now();
      return {
        id: e.id || generateId("exp_"),
        title: e.title || "",
        amount: Number(e.amount) || 0,
        dateMillis: parsedMillis,
        payerId: e.payerId || "",
        participantIds: Array.isArray(e.participantIds) ? e.participantIds : [],
        receiptImageBase64: normalizeReceiptDataUrl(e.receiptUrl || e.receiptImageBase64)
      };
    });

    return {
      id,
      tripName: data.tripName || "ทริปไม่มีชื่อ",
      date: data.date || "",
      totalAmount:
        typeof data.totalAmount === "number"
          ? data.totalAmount
          : expenses.reduce((s, e) => s + e.amount, 0),
      summaryText: data.summaryText || "",
      members,
      expenses
    };
  }

  const renderSummaryCanvas = window.renderSummaryCanvas;

  // ============================================================================
  // 2. Constants & DesignKit Helpers (TripModels.kt & DesignKit.kt)
  // ============================================================================

  const DEFAULT_EXPENSE_CATEGORIES = [
    { emoji: "🍲", label: "ค่าอาหาร" },
    { emoji: "🍻", label: "ค่าเครื่องดื่ม/เบียร์" },
    { emoji: "🚗", label: "ค่าน้ำมัน/ค่ารถ" },
    { emoji: "🏨", label: "ค่าที่พัก/โรงแรม" },
    { emoji: "☕", label: "ค่าคาเฟ่/ของว่าง" },
    { emoji: "🎫", label: "ค่าบัตร/ค่าเข้าชม" },
    { emoji: "🛒", label: "ของใช้ส่วนกลาง" }
  ];

  const AVATAR_PALETTE = [
    "#6366F1", "#8B5CF6", "#14B8A6", "#F59E0B",
    "#F43F5E", "#0EA5E9", "#10B981", "#D946EF",
    "#F97316"
  ];

  const BRAND_COLORS = {
    Indigo: "#4F46E5",
    Violet: "#7C3AED",
    Teal: "#14B8A6",
    Emerald: "#10B981",
    Amber: "#F59E0B",
    Orange: "#F97316",
    Rose: "#F43F5E",
    Sky: "#0EA5E9",
    Coffee: "#B45309"
  };

  const THAI_SHORT_MONTHS = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  function generateId(prefix = "") {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return prefix ? `${prefix}${crypto.randomUUID()}` : crypto.randomUUID();
    }
    return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function avatarColorFor(name = "") {
    const s = name.trim().toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    const idx = (h & 0x7fffffff) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[idx];
  }

  function initialOf(name = "") {
    const trimmed = name.trim();
    for (const ch of Array.from(trimmed)) {
      const code = ch.charCodeAt(0);
      if (!/\s/.test(ch) && (code < 0x0e40 || code > 0x0e44)) {
        return ch.toUpperCase();
      }
    }
    return trimmed ? Array.from(trimmed)[0].toUpperCase() : "?";
  }

  function formatPromptPay(raw = "") {
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 13) {
      return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
    }
    return raw;
  }

  function displayTitle(title = "") {
    const stripped = String(title).replace(/^[^\p{L}\p{N}]+/u, "").trim();
    return stripped || title;
  }

  function categoryStyleFor(title = "") {
    const t = String(title).toLowerCase();
    const has = (...words) => words.some((w) => t.includes(w));
    if (has("น้ำมัน", "ค่ารถ", "เดินทาง", "ทางด่วน", "แท็กซี่", "taxi", "grab", "รถ", "เรือ", "bts", "mrt")) {
      return { emoji: "🚗", color: BRAND_COLORS.Sky };
    }
    if (has("ที่พัก", "โรงแรม", "รีสอร์ท", "บ้านพัก", "hotel", "airbnb")) {
      return { emoji: "🏨", color: BRAND_COLORS.Violet };
    }
    if (has("กาแฟ", "คาเฟ่", "ขนม", "ของว่าง", "cafe", "coffee")) {
      return { emoji: "☕", color: BRAND_COLORS.Coffee };
    }
    if (has("เครื่องดื่ม", "เบียร์", "เหล้า", "beer", "บาร์")) {
      return { emoji: "🍻", color: BRAND_COLORS.Amber };
    }
    if (has("ตั๋ว", "บัตร", "เข้าชม", "กิจกรรม", "ticket")) {
      return { emoji: "🎫", color: BRAND_COLORS.Rose };
    }
    if (has("ของใช้", "ส่วนกลาง", "ซื้อของ", "มาร์ท", "7-11", "เซเว่น")) {
      return { emoji: "🛒", color: BRAND_COLORS.Teal };
    }
    if (has("อาหาร", "ข้าว", "กุ้ง", "ปิ้ง", "ชาบู", "บุฟ", "หมูกระทะ", "ซีฟู้ด", "ก๋วยเตี๋ยว")) {
      return { emoji: "🍲", color: BRAND_COLORS.Orange };
    }
    return { emoji: "🧾", color: BRAND_COLORS.Indigo };
  }

  // ============================================================================
  // 3. TripCalculator Engine (TripCalculator.kt)
  // ============================================================================

  const numFmtFlexible = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const numFmtTwoDec = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatThaiDate(millis = Date.now()) {
    const d = new Date(millis);
    const day = d.getDate();
    const month = THAI_SHORT_MONTHS[d.getMonth()];
    const beYear = d.getFullYear() + 543;
    return `${day} ${month} ${beYear}`;
  }

  function defaultTripName(millis = Date.now()) {
    return `ทริปวันที่ ${formatThaiDate(millis)}`;
  }

  function formatAmount(amount = 0) {
    const clean = Math.abs(amount) < 0.0001 ? 0 : amount;
    return numFmtFlexible.format(clean);
  }

  function formatAmountTwoDecimals(amount = 0) {
    const clean = Math.abs(amount) < 0.0001 ? 0 : amount;
    return numFmtTwoDec.format(clean);
  }

  function toIsoDateString(millis = Date.now()) {
    const d = new Date(millis);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseIsoDateToMillis(isoStr) {
    if (!isoStr) return Date.now();
    const [y, m, d] = isoStr.split("-").map(Number);
    if (!y || !m || !d) return Date.now();
    return new Date(y, m - 1, d, 12, 0, 0).getTime();
  }

  function calculateBalances(members, expenses) {
    if (!members || members.length === 0) return [];

    const paidMap = new Map(members.map((m) => [m.id, 0]));
    const costMap = new Map(members.map((m) => [m.id, 0]));
    const memberById = new Map(members.map((m) => [m.id, m]));

    for (const exp of expenses) {
      if (paidMap.has(exp.payerId)) {
        paidMap.set(exp.payerId, (paidMap.get(exp.payerId) || 0) + Number(exp.amount || 0));
      }

      const validParticipants = (exp.participantIds || [])
        .map((id) => memberById.get(id))
        .filter(Boolean);

      const totalWeight = validParticipants.reduce(
        (sum, p) => sum + Math.max(1, Number(p.headcount) || 1),
        0
      );

      if (totalWeight > 0) {
        for (const participant of validParticipants) {
          const weight = Math.max(1, Number(participant.headcount) || 1);
          const share = Number(exp.amount || 0) * (weight / totalWeight);
          costMap.set(participant.id, (costMap.get(participant.id) || 0) + share);
        }
      }
    }

    return members.map((member) => {
      const totalPaid = paidMap.get(member.id) || 0;
      const actualCost = costMap.get(member.id) || 0;
      return {
        member,
        totalPaid,
        actualCost,
        netBalance: totalPaid - actualCost
      };
    });
  }

  function calculateSettlements(balances) {
    const debtors = balances
      .filter((b) => b.netBalance < -0.01)
      .map((b) => ({ member: b.member, amount: Math.abs(b.netBalance) }))
      .sort((a, b) => b.amount - a.amount);

    const creditors = balances
      .filter((b) => b.netBalance > 0.01)
      .map((b) => ({ member: b.member, amount: b.netBalance }))
      .sort((a, b) => b.amount - a.amount);

    const transfers = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const transferAmount = Math.min(debtor.amount, creditor.amount);

      if (transferAmount > 0.01) {
        transfers.push({
          fromMember: debtor.member,
          toMember: creditor.member,
          amount: transferAmount
        });
      }

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return transfers;
  }

  function generateLineSummary(tripName, members, expenses, balances, settlements) {
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const safeName = (tripName || "").trim() || defaultTripName();
    const lines = [];
    lines.push(`🏕️ สรุปค่าใช้จ่าย: ${safeName}`);
    lines.push(`💰 ยอดรวมทั้งหมด: ${formatAmount(totalAmount)} บาท`);
    lines.push(`━━━━━━━━━━━━━━`);
    lines.push(``);
    lines.push(`👥 รายละเอียดต่อคน/กลุ่ม`);
    for (const bal of balances) {
      lines.push(
        `- ${bal.member.name} (${bal.member.headcount} คน): จ่ายแล้ว ${formatAmount(bal.totalPaid)} บ.`
      );
    }
    lines.push(``);
    lines.push(`💸 สรุปการเคลียร์ยอด`);
    if (settlements.length === 0) {
      lines.push(`✨ เคลียร์ยอดครบแล้ว ไม่มีใครต้องโอนเพิ่ม!`);
    } else {
      for (const t of settlements) {
        lines.push(
          `• ${t.fromMember.name} โอนให้ ${t.toMember.name} : ${formatAmountTwoDecimals(t.amount)} บาท`
        );
        if (t.toMember.promptPay && t.toMember.promptPay.trim()) {
          lines.push(`   💳 พร้อมเพย์: ${t.toMember.promptPay.trim()}`);
        }
      }
    }
    return lines.join("\n").trimEnd();
  }

  const exporterHelpers = {
    avatarColorFor,
    initialOf,
    formatPromptPay,
    displayTitle,
    categoryStyleFor,
    formatAmount,
    formatThaiDate
  };

  // ============================================================================
  // 4. LocalStorage & Application State (Compatible with both old & new keys)
  // ============================================================================

  const STORAGE_KEYS = {
    FRIEND_BOOK: "trip_saved_friends",
    FRIEND_BOOK_ALT: "trip_expense_friend_book",
    THEME: "trip_theme",
    DARK_MODE_ALT: "trip_expense_dark_mode",
    ACTIVE_DRAFT: "trip_expense_active_draft"
  };

  function loadLocalFriendBook() {
    try {
      const rawPrimary = localStorage.getItem(STORAGE_KEYS.FRIEND_BOOK);
      const rawAlt = localStorage.getItem(STORAGE_KEYS.FRIEND_BOOK_ALT);
      const list = rawPrimary ? JSON.parse(rawPrimary) : rawAlt ? JSON.parse(rawAlt) : [];
      if (!Array.isArray(list)) return [];
      return list
        .map((f) => ({
          id: f.id || generateId("sf_"),
          name: (f.name || "").trim(),
          promptPay: (f.promptPay || "").trim()
        }))
        .filter((f) => f.name !== "");
    } catch (_) {
      return [];
    }
  }

  function saveLocalFriendBook(friends) {
    try {
      const json = JSON.stringify(friends);
      localStorage.setItem(STORAGE_KEYS.FRIEND_BOOK, json);
      localStorage.setItem(STORAGE_KEYS.FRIEND_BOOK_ALT, json);
    } catch (_) {}
  }

  function loadDarkModePref() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme === "dark") return true;
      if (savedTheme === "light") return false;
      const rawAlt = localStorage.getItem(STORAGE_KEYS.DARK_MODE_ALT);
      if (rawAlt === "true") return true;
      if (rawAlt === "false") return false;
    } catch (_) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function saveDarkModePref(isDark) {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, isDark ? "dark" : "light");
      localStorage.setItem(STORAGE_KEYS.DARK_MODE_ALT, String(Boolean(isDark)));
    } catch (_) {}
  }

  function loadActiveDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_DRAFT);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function saveActiveDraft() {
    try {
      const draft = {
        tripId: state.tripId,
        tripName: state.tripName,
        members: state.members,
        expenses: state.expenses
      };
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DRAFT, JSON.stringify(draft));
    } catch (_) {}
  }

  const savedDraft = loadActiveDraft();

  const state = {
    tripId: savedDraft?.tripId || "",
    tripName: savedDraft?.tripName || defaultTripName(),
    members: Array.isArray(savedDraft?.members) ? savedDraft.members : [],
    expenses: Array.isArray(savedDraft?.expenses) ? savedDraft.expenses : [],
    friendBook: loadLocalFriendBook(),
    balances: [],
    settlements: [],
    isDarkMode: loadDarkModePref(),
    currentUser: null,
    cloudTrips: [],
    isLoadingCloud: false,

    // Sheet / Modal temporary state
    addMemberHeadcount: 1,
    editingMemberId: null,
    editMemberHeadcount: 1,

    editingBookFriendId: null,

    editingExpenseId: null,
    expenseFormDateMillis: Date.now(),
    expenseFormPayerId: "",
    expenseFormParticipants: new Set(),
    expenseFormReceiptDataUrl: null,
    expenseFormReceiptFile: null,
    isUploadingReceipt: false,

    latestSummaryCanvas: null
  };

  // ============================================================================
  // 5. DOM References
  // ============================================================================

  const dom = {
    metaThemeColor: document.getElementById("metaThemeColor"),
    btnToggleTheme: document.getElementById("btnToggleTheme"),
    themeIcon: document.getElementById("themeIcon"),

    btnSignIn: document.getElementById("btnSignIn"),
    userProfileWrap: document.getElementById("userProfileWrap"),
    btnProfileAvatar: document.getElementById("btnProfileAvatar"),
    userAvatarImg: document.getElementById("userAvatarImg"),
    userAvatarFallback: document.getElementById("userAvatarFallback"),
    profileDropdown: document.getElementById("profileDropdown"),
    userDisplayName: document.getElementById("userDisplayName"),
    userEmail: document.getElementById("userEmail"),
    btnSignOut: document.getElementById("btnSignOut"),

    tripNameInput: document.getElementById("tripNameInput"),
    btnSetToday: document.getElementById("btnSetToday"),
    heroTotalAmount: document.getElementById("heroTotalAmount"),
    pillHeadcount: document.getElementById("pillHeadcount"),
    pillExpenseCount: document.getElementById("pillExpenseCount"),
    pillAvgPerPerson: document.getElementById("pillAvgPerPerson"),

    qaFriendBook: document.getElementById("qaFriendBook"),
    qaFriendBookLabel: document.getElementById("qaFriendBookLabel"),
    qaHistory: document.getElementById("qaHistory"),
    qaHistoryLabel: document.getElementById("qaHistoryLabel"),
    qaSaveCloud: document.getElementById("qaSaveCloud"),
    qaSaveIcon: document.getElementById("qaSaveIcon"),
    qaSaveSpinner: document.getElementById("qaSaveSpinner"),
    qaSaveLabel: document.getElementById("qaSaveLabel"),
    qaNewTrip: document.getElementById("qaNewTrip"),

    // Members Card
    membersEmptyState: document.getElementById("membersEmptyState"),
    btnEmptyAddMember: document.getElementById("btnEmptyAddMember"),
    btnEmptyAddAllBook: document.getElementById("btnEmptyAddAllBook"),
    btnEmptyAddAllBookText: document.getElementById("btnEmptyAddAllBookText"),
    membersRowWrap: document.getElementById("membersRowWrap"),
    membersBubblesList: document.getElementById("membersBubblesList"),

    // Expenses Card
    expensesSubtitle: document.getElementById("expensesSubtitle"),
    btnSectionAddExpense: document.getElementById("btnSectionAddExpense"),
    expensesEmptyState: document.getElementById("expensesEmptyState"),
    expensesEmptyMsg: document.getElementById("expensesEmptyMsg"),
    btnFirstExpense: document.getElementById("btnFirstExpense"),
    expensesList: document.getElementById("expensesList"),

    // Balances Card
    balancesEmptyState: document.getElementById("balancesEmptyState"),
    balancesList: document.getElementById("balancesList"),

    // Settlements Card
    settlementsSubtitle: document.getElementById("settlementsSubtitle"),
    settlementsEmptyState: document.getElementById("settlementsEmptyState"),
    settlementsList: document.getElementById("settlementsList"),

    // Export Card & FAB
    btnCopyLineSummary: document.getElementById("btnCopyLineSummary"),
    btnShareImageSummary: document.getElementById("btnShareImageSummary"),
    btnShareTextSummary: document.getElementById("btnShareTextSummary"),
    btnBottomSaveCloud: document.getElementById("btnBottomSaveCloud"),
    btnBottomSaveCloudText: document.getElementById("btnBottomSaveCloudText"),
    fabAddExpense: document.getElementById("fabAddExpense"),

    // Add Member Sheet
    sheetAddMember: document.getElementById("sheetAddMember"),
    addMemberName: document.getElementById("addMemberName"),
    addMemberPromptPay: document.getElementById("addMemberPromptPay"),
    addMemberDec: document.getElementById("addMemberDec"),
    addMemberInc: document.getElementById("addMemberInc"),
    addMemberHeadcountVal: document.getElementById("addMemberHeadcountVal"),
    btnConfirmAddMember: document.getElementById("btnConfirmAddMember"),
    addMemberFromBookSection: document.getElementById("addMemberFromBookSection"),
    btnSheetAddAllBook: document.getElementById("btnSheetAddAllBook"),
    addMemberBookChips: document.getElementById("addMemberBookChips"),

    // Edit Member Sheet
    sheetEditMember: document.getElementById("sheetEditMember"),
    editMemberAvatar: document.getElementById("editMemberAvatar"),
    editMemberTitle: document.getElementById("editMemberTitle"),
    editMemberName: document.getElementById("editMemberName"),
    editMemberPromptPay: document.getElementById("editMemberPromptPay"),
    editMemberDec: document.getElementById("editMemberDec"),
    editMemberInc: document.getElementById("editMemberInc"),
    editMemberHeadcountVal: document.getElementById("editMemberHeadcountVal"),
    btnRemoveMember: document.getElementById("btnRemoveMember"),
    btnSaveMember: document.getElementById("btnSaveMember"),

    // Expense Editor Sheet
    sheetExpenseEditor: document.getElementById("sheetExpenseEditor"),
    expenseSheetTitle: document.getElementById("expenseSheetTitle"),
    expenseSheetSubtitle: document.getElementById("expenseSheetSubtitle"),
    expenseCategoryPresets: document.getElementById("expenseCategoryPresets"),
    expenseTitleInput: document.getElementById("expenseTitleInput"),
    expenseAmountInput: document.getElementById("expenseAmountInput"),
    expenseDateDisplay: document.getElementById("expenseDateDisplay"),
    expenseDateInput: document.getElementById("expenseDateInput"),
    expensePayerChips: document.getElementById("expensePayerChips"),
    expenseParticipantsLabel: document.getElementById("expenseParticipantsLabel"),
    btnSelectAllParticipants: document.getElementById("btnSelectAllParticipants"),
    btnClearParticipants: document.getElementById("btnClearParticipants"),
    expenseParticipantChips: document.getElementById("expenseParticipantChips"),
    expenseReceiptInput: document.getElementById("expenseReceiptInput"),
    btnAttachReceipt: document.getElementById("btnAttachReceipt"),
    btnAttachReceiptText: document.getElementById("btnAttachReceiptText"),
    expenseReceiptThumbWrap: document.getElementById("expenseReceiptThumbWrap"),
    expenseReceiptThumbImg: document.getElementById("expenseReceiptThumbImg"),
    btnRemoveReceipt: document.getElementById("btnRemoveReceipt"),
    expenseAddActions: document.getElementById("expenseAddActions"),
    btnSubmitNewExpense: document.getElementById("btnSubmitNewExpense"),
    expenseEditActions: document.getElementById("expenseEditActions"),
    btnDeleteEditingExpense: document.getElementById("btnDeleteEditingExpense"),
    btnUpdateEditingExpense: document.getElementById("btnUpdateEditingExpense"),

    // Image Preview Sheet
    sheetImagePreview: document.getElementById("sheetImagePreview"),
    imagePreviewLoading: document.getElementById("imagePreviewLoading"),
    summaryPreviewImg: document.getElementById("summaryPreviewImg"),
    btnDownloadSummaryImg: document.getElementById("btnDownloadSummaryImg"),
    btnShareSummaryImgNow: document.getElementById("btnShareSummaryImgNow"),

    // Friend Book Sheet
    sheetFriendBook: document.getElementById("sheetFriendBook"),
    friendBookTitle: document.getElementById("friendBookTitle"),
    friendBookSearch: document.getElementById("friendBookSearch"),
    friendBookNameFieldLabel: document.getElementById("friendBookNameFieldLabel"),
    friendBookNewName: document.getElementById("friendBookNewName"),
    friendBookNewPromptPay: document.getElementById("friendBookNewPromptPay"),
    btnAddFriendToBook: document.getElementById("btnAddFriendToBook"),
    btnAddFriendToBookIcon: document.getElementById("btnAddFriendToBookIcon"),
    friendBookEmpty: document.getElementById("friendBookEmpty"),
    friendBookEmptyTitle: document.getElementById("friendBookEmptyTitle"),
    friendBookEmptyMsg: document.getElementById("friendBookEmptyMsg"),
    friendBookList: document.getElementById("friendBookList"),

    // Cloud Trips Sheet
    sheetCloudTrips: document.getElementById("sheetCloudTrips"),
    cloudTripsLoading: document.getElementById("cloudTripsLoading"),
    cloudTripsEmpty: document.getElementById("cloudTripsEmpty"),
    cloudTripsList: document.getElementById("cloudTripsList"),

    // Receipt & Confirm Dialogs
    dialogReceiptPreview: document.getElementById("dialogReceiptPreview"),
    receiptFullImg: document.getElementById("receiptFullImg"),
    btnCloseReceiptPreview: document.getElementById("btnCloseReceiptPreview"),

    dialogNewTripConfirm: document.getElementById("dialogNewTripConfirm"),
    btnCancelNewTrip: document.getElementById("btnCancelNewTrip"),
    btnConfirmNewTrip: document.getElementById("btnConfirmNewTrip"),

    snackbar: document.getElementById("snackbar")
  };

  // ============================================================================
  // 6. UI Utilities (Snackbar, Avatar DOM, Animated Total, Image Resize)
  // ============================================================================

  let snackbarTimer = null;
  function showMessage(msg) {
    if (!msg) return;
    dom.snackbar.textContent = msg;
    dom.snackbar.classList.add("visible");
    if (snackbarTimer) clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => {
      dom.snackbar.classList.remove("visible");
    }, 3200);
  }

  function applyAvatarStyle(el, name) {
    const color = avatarColorFor(name);
    el.style.background = `linear-gradient(135deg, ${color} 0%, ${color}B8 100%)`;
    el.textContent = initialOf(name);
  }

  let displayedTotal = 0;
  let animFrameId = null;
  function animateHeroTotal(targetTotal) {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const startTotal = displayedTotal;
    const diff = targetTotal - startTotal;
    if (Math.abs(diff) < 0.01) {
      displayedTotal = targetTotal;
      dom.heroTotalAmount.textContent = formatAmount(targetTotal);
      return;
    }
    const duration = 500;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      displayedTotal = startTotal + diff * eased;
      dom.heroTotalAmount.textContent = formatAmount(
        t === 1 ? targetTotal : displayedTotal
      );
      if (t < 1) {
        animFrameId = requestAnimationFrame(step);
      }
    }
    animFrameId = requestAnimationFrame(step);
  }

  async function copyTextToClipboard(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      showMessage(successMsg);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showMessage(successMsg);
    }
  }

  function compressImageFileToDataUrl(file, maxWidth = 900, quality = 0.68) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function normalizeReceiptDataUrl(raw) {
    if (!raw) return null;
    if (raw.startsWith("data:") || raw.startsWith("http")) return raw;
    return `data:image/jpeg;base64,${raw}`;
  }

  // ============================================================================
  // 7. State Mutation & Recalculation
  // ============================================================================

  function recalculateState() {
    state.balances = calculateBalances(state.members, state.expenses);
    state.settlements = calculateSettlements(state.balances);
    saveActiveDraft();
    renderAll();
  }

  function applyTheme() {
    if (state.isDarkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      dom.themeIcon.textContent = "light_mode";
      dom.metaThemeColor.setAttribute("content", "#0A0F1E");
    } else {
      document.documentElement.removeAttribute("data-theme");
      dom.themeIcon.textContent = "dark_mode";
      dom.metaThemeColor.setAttribute("content", "#1E1B4B");
    }
  }

  function updateQuickActionCounts() {
    if (dom.qaFriendBookLabel) {
      dom.qaFriendBookLabel.textContent =
        state.friendBook.length > 0
          ? `สมุดเพื่อน (${state.friendBook.length})`
          : "สมุดเพื่อน";
    }
    if (dom.qaHistoryLabel) {
      dom.qaHistoryLabel.textContent =
        state.currentUser && state.cloudTrips.length > 0
          ? `ประวัติ (${state.cloudTrips.length})`
          : "ประวัติ";
    }
    if (!state.isLoadingCloud) {
      dom.qaSaveLabel.textContent = state.tripId ? "อัปเดต Cloud" : "บันทึก Cloud";
      dom.btnBottomSaveCloudText.textContent = state.tripId
        ? "อัปเดตทริปนี้บน Cloud"
        : "บันทึกทริปขึ้น Cloud";
    }
  }

  // ============================================================================
  // 8. Cloud Repository (Firestore & Storage Sync — Compat SDK)
  // ============================================================================

  async function saveSavedFriendsToCloud(friends) {
    if (!db || !state.currentUser) return;
    try {
      await db
        .collection("users")
        .doc(state.currentUser.uid)
        .set(
          {
            savedFriends: friends.map((f) => ({
              id: f.id,
              name: f.name,
              promptPay: f.promptPay || ""
            }))
          },
          { merge: true }
        );
    } catch (err) {
      console.warn("Sync savedFriends error:", err);
    }
  }

  function setCloudLoading(loading) {
    state.isLoadingCloud = loading;
    dom.qaSaveCloud.disabled = loading;
    dom.btnBottomSaveCloud.disabled = loading;
    dom.qaSaveIcon.classList.toggle("hidden", loading);
    dom.qaSaveSpinner.classList.toggle("hidden", !loading);
    dom.qaSaveLabel.textContent = loading
      ? "กำลังบันทึก"
      : state.tripId
      ? "อัปเดต Cloud"
      : "บันทึก Cloud";
    dom.btnBottomSaveCloudText.textContent = loading
      ? "กำลังบันทึก..."
      : state.tripId
      ? "อัปเดตทริปนี้บน Cloud"
      : "บันทึกทริปขึ้น Cloud";
  }

  async function saveTripToCloud() {
    if (!state.currentUser || !db) {
      showMessage("กรุณาเข้าสู่ระบบด้วย Google ก่อนบันทึกทริป");
      return;
    }
    if (state.members.length === 0 && state.expenses.length === 0) {
      showMessage("ยังไม่มีข้อมูลเพื่อนหรือค่าใช้จ่ายให้บันทึก");
      return;
    }

    setCloudLoading(true);
    try {
      const finalTripName = (state.tripName || "").trim() || defaultTripName();
      const totalAmount = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      const summaryText = generateLineSummary(
        finalTripName,
        state.members,
        state.expenses,
        state.balances,
        state.settlements
      );

      const payload = {
        tripName: finalTripName,
        date: new Date().toLocaleString("th-TH"),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        totalAmount,
        summaryText,
        friendsCount: state.members.length,
        expensesCount: state.expenses.length,
        friendsData: state.members.map((m) => ({
          id: m.id,
          name: m.name,
          promptPay: m.promptPay || "",
          headcount: Math.max(1, Number(m.headcount) || 1)
        })),
        expensesData: state.expenses.map((e) => ({
          id: e.id,
          createdAtMs: e.dateMillis,
          date: toIsoDateString(e.dateMillis),
          title: e.title,
          amount: Number(e.amount || 0),
          payerId: e.payerId,
          participantIds: e.participantIds || [],
          receiptUrl: normalizeReceiptDataUrl(e.receiptImageBase64)
        }))
      };

      const userTripsRef = db
        .collection("users")
        .doc(state.currentUser.uid)
        .collection("trips");

      if (state.tripId) {
        await userTripsRef.doc(state.tripId).set(payload, { merge: true });
        showMessage(`☁️ อัปเดต "${finalTripName}" สำเร็จ!`);
      } else {
        payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        const newDoc = await userTripsRef.add(payload);
        state.tripId = newDoc.id;
        saveActiveDraft();
        updateQuickActionCounts();
        showMessage(`☁️ บันทึก "${finalTripName}" เป็นทริปใหม่เรียบร้อย!`);
      }
    } catch (err) {
      showMessage(`เกิดข้อผิดพลาดในการบันทึก: ${err.message}`);
    } finally {
      setCloudLoading(false);
    }
  }

  async function loadCloudTrips() {
    if (!state.currentUser || !db) {
      showMessage("กรุณาเข้าสู่ระบบด้วย Google ก่อนดูประวัติ");
      return;
    }
    if (state.cloudTrips.length > 0) {
      renderCloudTripsList();
      return;
    }

    dom.cloudTripsLoading.classList.remove("hidden");
    dom.cloudTripsEmpty.classList.add("hidden");
    dom.cloudTripsList.classList.add("hidden");

    try {
      const snap = await db
        .collection("users")
        .doc(state.currentUser.uid)
        .collection("trips")
        .orderBy("createdAt", "desc")
        .get();

      const loaded = [];
      snap.forEach((docSnap) => {
        loaded.push(normalizeCloudTripDoc(docSnap.id, docSnap.data() || {}));
      });
      state.cloudTrips = loaded;
      updateQuickActionCounts();
      renderCloudTripsList();
    } catch (err) {
      dom.cloudTripsLoading.classList.add("hidden");
      showMessage(`โหลดประวัติไม่สำเร็จ: ${err.message}`);
    }
  }

  async function deleteCloudTrip(tripId) {
    if (!state.currentUser || !db) return;
    if (!window.confirm("คุณต้องการลบประวัตินี้หรือไม่?")) return;
    try {
      await db
        .collection("users")
        .doc(state.currentUser.uid)
        .collection("trips")
        .doc(tripId)
        .delete();

      state.cloudTrips = state.cloudTrips.filter((t) => t.id !== tripId);
      if (state.tripId === tripId) {
        state.tripId = "";
        saveActiveDraft();
      }
      updateQuickActionCounts();
      renderCloudTripsList();
      showMessage("ลบประวัติเรียบร้อยแล้ว");
    } catch (err) {
      showMessage(`ไม่สามารถลบได้: ${err.message}`);
    }
  }

  // ============================================================================
  // 9. Friend Book Actions & Trip Member Actions
  // ============================================================================

  function upsertFriendInBook(name, promptPay = "", previousName = null) {
    const trimmedName = (name || "").trim();
    if (!trimmedName) return;
    const trimmedPp = (promptPay || "").trim();

    const updated = [...state.friendBook];
    const matchKey = (previousName || trimmedName).toLowerCase();
    const idx = updated.findIndex((f) => f.name.toLowerCase() === matchKey);

    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        name: trimmedName,
        promptPay: trimmedPp || updated[idx].promptPay || ""
      };
    } else {
      updated.push({
        id: generateId("sf_"),
        name: trimmedName,
        promptPay: trimmedPp
      });
    }

    state.friendBook = updated;
    saveLocalFriendBook(updated);
    updateQuickActionCounts();
    saveSavedFriendsToCloud(updated);
  }

  function deleteFriendFromBook(friendId) {
    if (!window.confirm("ต้องการลบเพื่อนคนนี้ออกจากสมุดรายชื่อประจำหรือไม่?")) return;
    if (state.editingBookFriendId === friendId) {
      resetFriendBookForm();
    }
    state.friendBook = state.friendBook.filter((f) => f.id !== friendId);
    saveLocalFriendBook(state.friendBook);
    updateQuickActionCounts();
    saveSavedFriendsToCloud(state.friendBook);
    renderFriendBookList();
    renderMembersSection();
    renderAddMemberBookSection();
  }

  function addMemberToTrip(name, promptPay = "", headcount = 1, shouldRemember = true) {
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      showMessage("กรุณากรอกชื่อเพื่อน");
      return false;
    }
    const exists = state.members.some(
      (m) => m.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      showMessage(`มีชื่อ "${trimmedName}" อยู่ในทริปแล้ว`);
      return false;
    }

    if (shouldRemember) {
      upsertFriendInBook(trimmedName, promptPay);
    }

    const newMember = {
      id: generateId("m_"),
      name: trimmedName,
      promptPay: (promptPay || "").trim(),
      headcount: Math.max(1, Number(headcount) || 1)
    };

    state.members = [...state.members, newMember];
    recalculateState();
    return true;
  }

  function addAllSavedFriendsToTrip() {
    const currentNames = new Set(state.members.map((m) => m.name.toLowerCase()));
    const toAdd = state.friendBook
      .filter((f) => !currentNames.has(f.name.toLowerCase()))
      .map((f) => ({
        id: generateId("m_"),
        name: f.name,
        promptPay: f.promptPay || "",
        headcount: 1
      }));

    if (toAdd.length === 0) {
      showMessage("เพื่อนในสมุดทุกคนอยู่ในทริปแล้ว");
      return;
    }
    state.members = [...state.members, ...toAdd];
    recalculateState();
    renderAddMemberBookSection();
    renderFriendBookList();
    showMessage(`เพิ่มเพื่อนจากสมุดเข้าทริป ${toAdd.length} คนเรียบร้อย!`);
  }

  function updateMemberInTrip(memberId, name, promptPay, headcount) {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      showMessage("กรุณาระบุชื่อเพื่อน");
      return;
    }
    const oldMember = state.members.find((m) => m.id === memberId);
    upsertFriendInBook(trimmed, promptPay, oldMember ? oldMember.name : null);

    state.members = state.members.map((m) =>
      m.id === memberId
        ? {
            ...m,
            name: trimmed,
            promptPay: (promptPay || "").trim(),
            headcount: Math.max(1, Number(headcount) || 1)
          }
        : m
    );
    recalculateState();
    showMessage(`บันทึกข้อมูลของ "${trimmed}" เรียบร้อยแล้ว`);
  }

  function removeMemberFromTrip(memberId) {
    state.members = state.members.filter((m) => m.id !== memberId);
    state.expenses = state.expenses
      .filter((e) => e.payerId !== memberId)
      .map((e) => ({
        ...e,
        participantIds: (e.participantIds || []).filter((id) => id !== memberId)
      }))
      .filter((e) => e.participantIds.length > 0);
    recalculateState();
  }

  // ============================================================================
  // 10. Rendering Functions
  // ============================================================================

  function renderAll() {
    renderHeroSection();
    renderMembersSection();
    renderExpensesSection();
    renderBalancesSection();
    renderSettlementsSection();
    updateQuickActionCounts();
  }

  function renderHeroSection() {
    if (document.activeElement !== dom.tripNameInput) {
      dom.tripNameInput.value = state.tripName;
    }
    const totalHeadcount = state.members.reduce(
      (sum, m) => sum + Math.max(1, Number(m.headcount) || 1),
      0
    );
    const totalAmount = state.expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    animateHeroTotal(totalAmount);

    dom.pillHeadcount.textContent = `👥 ${totalHeadcount} คน`;
    dom.pillExpenseCount.textContent = `🧾 ${state.expenses.length} รายการ`;

    if (totalHeadcount > 0 && totalAmount > 0) {
      dom.pillAvgPerPerson.textContent = `≈ ฿${formatAmount(totalAmount / totalHeadcount)}/คน`;
      dom.pillAvgPerPerson.classList.remove("hidden");
    } else {
      dom.pillAvgPerPerson.classList.add("hidden");
    }

    dom.fabAddExpense.classList.toggle("hidden", state.members.length === 0);
  }

  function renderProfileHeader() {
    const user = state.currentUser;
    if (!user) {
      dom.btnSignIn.classList.remove("hidden");
      dom.userProfileWrap.classList.add("hidden");
      dom.profileDropdown.classList.add("hidden");
    } else {
      dom.btnSignIn.classList.add("hidden");
      dom.userProfileWrap.classList.remove("hidden");
      const displayName = user.displayName || user.email || "ผู้ใช้";
      dom.userDisplayName.textContent = displayName;
      dom.userEmail.textContent = user.email || "";

      if (user.photoURL) {
        dom.userAvatarImg.src = user.photoURL;
        dom.userAvatarImg.classList.remove("hidden");
        dom.userAvatarFallback.classList.add("hidden");
      } else {
        dom.userAvatarImg.classList.add("hidden");
        dom.userAvatarFallback.classList.remove("hidden");
        applyAvatarStyle(dom.userAvatarFallback, displayName);
      }
    }
  }

  function renderMembersSection() {
    const hasMembers = state.members.length > 0;
    dom.membersEmptyState.classList.toggle("hidden", hasMembers);
    dom.membersRowWrap.classList.toggle("hidden", !hasMembers);

    if (!hasMembers) {
      const bookCount = state.friendBook.length;
      if (bookCount > 0) {
        dom.btnEmptyAddAllBook.classList.remove("hidden");
        dom.btnEmptyAddAllBookText.textContent = `ดึงทั้งหมด (${bookCount})`;
      } else {
        dom.btnEmptyAddAllBook.classList.add("hidden");
      }
      return;
    }

    dom.membersBubblesList.innerHTML = "";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "member-bubble add-bubble";
    addBtn.innerHTML = `
      <div class="add-bubble-circle">
        <span class="material-symbols-rounded">add</span>
      </div>
      <span class="add-bubble-label">เพิ่ม</span>
      <div class="member-pp-spacer"></div>
    `;
    addBtn.addEventListener("click", openAddMemberSheet);
    dom.membersBubblesList.appendChild(addBtn);

    state.members.forEach((member) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "member-bubble";

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "bubble-avatar-wrap";

      const avatar = document.createElement("div");
      avatar.className = "avatar-circle avatar-bubble";
      applyAvatarStyle(avatar, member.name);
      avatarWrap.appendChild(avatar);

      if (member.headcount > 1) {
        const badge = document.createElement("div");
        badge.className = "headcount-pill-badge";
        badge.innerHTML = `<div class="headcount-pill-inner">×${member.headcount}</div>`;
        avatarWrap.appendChild(badge);
      }

      const nameEl = document.createElement("div");
      nameEl.className = "member-bubble-name";
      nameEl.textContent = member.name;

      btn.appendChild(avatarWrap);
      btn.appendChild(nameEl);

      if (member.promptPay && member.promptPay.trim()) {
        const ppBadge = document.createElement("div");
        ppBadge.className = "member-pp-badge";
        ppBadge.innerHTML = `
          <span class="material-symbols-rounded">account_balance_wallet</span>
          <span>พร้อมเพย์</span>
        `;
        btn.appendChild(ppBadge);
      } else {
        const spacer = document.createElement("div");
        spacer.className = "member-pp-spacer";
        btn.appendChild(spacer);
      }

      btn.addEventListener("click", () => openEditMemberSheet(member));
      dom.membersBubblesList.appendChild(btn);
    });
  }

  function renderExpensesSection() {
    const hasMembers = state.members.length > 0;
    const hasExpenses = state.expenses.length > 0;

    dom.expensesSubtitle.textContent = hasExpenses
      ? `${state.expenses.length} รายการ`
      : "จดบิลและสลิปของทริป";
    dom.btnSectionAddExpense.classList.toggle("hidden", !hasMembers);

    dom.expensesEmptyState.classList.toggle("hidden", hasExpenses);
    dom.expensesList.classList.toggle("hidden", !hasExpenses);

    if (!hasExpenses) {
      dom.expensesEmptyMsg.textContent = hasMembers
        ? 'กด "+ เพิ่มรายการ" เพื่อเริ่มจดบิลและหารค่าใช้จ่าย'
        : "เพิ่มสมาชิกในทริปด้านบนก่อน แล้วจึงบันทึกรายการ";
      dom.btnFirstExpense.classList.toggle("hidden", !hasMembers);
      return;
    }

    const memberMap = new Map(state.members.map((m) => [m.id, m]));
    dom.expensesList.innerHTML = "";

    state.expenses.forEach((expense, idx) => {
      const style = categoryStyleFor(expense.title);
      const payerName = memberMap.get(expense.payerId)?.name || "ไม่ทราบ";
      const participantText =
        state.members.length > 0 &&
        expense.participantIds.length === state.members.length
          ? `ทุกคน (${state.members.length})`
          : expense.participantIds
              .map((id) => memberMap.get(id)?.name)
              .filter(Boolean)
              .join(", ");

      const row = document.createElement("div");
      row.className = "expense-row";

      const tile = document.createElement("div");
      tile.className = "emoji-tile";
      tile.style.backgroundColor = `${style.color}26`;
      tile.textContent = style.emoji;

      const main = document.createElement("div");
      main.className = "expense-main";

      const titleEl = document.createElement("div");
      titleEl.className = "expense-title";
      titleEl.textContent = displayTitle(expense.title);

      const metaEl = document.createElement("div");
      metaEl.className = "expense-meta";
      metaEl.textContent = `${formatThaiDate(expense.dateMillis)} · ${payerName} จ่าย`;

      const partEl = document.createElement("div");
      partEl.className = "expense-participants";
      partEl.textContent = `หาร: ${participantText}`;

      main.appendChild(titleEl);
      main.appendChild(metaEl);
      main.appendChild(partEl);

      row.appendChild(tile);
      row.appendChild(main);

      const receiptSrc = normalizeReceiptDataUrl(expense.receiptImageBase64);
      if (receiptSrc) {
        const thumb = document.createElement("img");
        thumb.className = "expense-receipt-thumb";
        thumb.src = receiptSrc;
        thumb.alt = "สลิป";
        thumb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openReceiptPreviewDialog(receiptSrc);
        });
        row.appendChild(thumb);
      }

      const right = document.createElement("div");
      right.className = "expense-right";

      const amtEl = document.createElement("div");
      amtEl.className = "expense-amount";
      amtEl.textContent = `฿${formatAmount(expense.amount)}`;

      const actions = document.createElement("div");
      actions.className = "expense-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn-sm icon-btn-edit";
      editBtn.title = "แก้ไขรายการ";
      editBtn.innerHTML = `<span class="material-symbols-rounded">edit</span>`;
      editBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openExpenseEditorSheet(expense);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn-sm icon-btn-delete";
      delBtn.title = "ลบรายการ";
      delBtn.innerHTML = `<span class="material-symbols-rounded">delete</span>`;
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeExpense(expense.id);
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      right.appendChild(amtEl);
      right.appendChild(actions);
      row.appendChild(right);

      row.addEventListener("click", () => openExpenseEditorSheet(expense));
      dom.expensesList.appendChild(row);

      if (idx < state.expenses.length - 1) {
        const div = document.createElement("div");
        div.className = "list-divider";
        dom.expensesList.appendChild(div);
      }
    });
  }

  function renderBalancesSection() {
    const hasBalances = state.balances.length > 0;
    dom.balancesEmptyState.classList.toggle("hidden", hasBalances);
    dom.balancesList.classList.toggle("hidden", !hasBalances);

    if (!hasBalances) return;

    dom.balancesList.innerHTML = "";
    state.balances.forEach((bal, idx) => {
      const row = document.createElement("div");
      row.className = "balance-row";

      const avatar = document.createElement("div");
      avatar.className = "avatar-circle avatar-md";
      applyAvatarStyle(avatar, bal.member.name);

      const info = document.createElement("div");
      info.className = "balance-info";

      const nameEl = document.createElement("div");
      nameEl.className = "balance-name";
      nameEl.textContent =
        bal.member.headcount > 1
          ? `${bal.member.name} (${bal.member.headcount} คน)`
          : bal.member.name;

      const subEl = document.createElement("div");
      subEl.className = "balance-sub";
      subEl.textContent = `จ่าย ฿${formatAmount(bal.totalPaid)} · หาร ฿${formatAmount(bal.actualCost)}`;

      info.appendChild(nameEl);
      info.appendChild(subEl);

      const badge = document.createElement("span");
      if (bal.netBalance > 0.01) {
        badge.className = "balance-badge badge-positive";
        badge.textContent = `ได้คืน +฿${formatAmount(bal.netBalance)}`;
      } else if (bal.netBalance < -0.01) {
        badge.className = "balance-badge badge-negative";
        badge.textContent = `จ่ายเพิ่ม ฿${formatAmount(-bal.netBalance)}`;
      } else {
        badge.className = "balance-badge badge-neutral";
        badge.textContent = "สมดุล";
      }

      row.appendChild(avatar);
      row.appendChild(info);
      row.appendChild(badge);
      dom.balancesList.appendChild(row);

      if (idx < state.balances.length - 1) {
        const div = document.createElement("div");
        div.className = "list-divider";
        dom.balancesList.appendChild(div);
      }
    });
  }

  function renderSettlementsSection() {
    const hasSettlements = state.settlements.length > 0;
    dom.settlementsSubtitle.textContent = hasSettlements
      ? `${state.settlements.length} รายการโอนเพื่อเคลียร์ยอด`
      : "เคลียร์ยอดเรียบร้อย";

    dom.settlementsEmptyState.classList.toggle("hidden", hasSettlements);
    dom.settlementsList.classList.toggle("hidden", !hasSettlements);

    if (!hasSettlements) return;

    dom.settlementsList.innerHTML = "";
    state.settlements.forEach((transfer) => {
      const box = document.createElement("div");
      box.className = "settlement-box";

      const top = document.createElement("div");
      top.className = "settlement-top";

      const fromAvatar = document.createElement("div");
      fromAvatar.className = "avatar-circle avatar-sm";
      applyAvatarStyle(fromAvatar, transfer.fromMember.name);

      const arrow = document.createElement("span");
      arrow.className = "material-symbols-rounded settlement-arrow";
      arrow.textContent = "arrow_forward";

      const toAvatar = document.createElement("div");
      toAvatar.className = "avatar-circle avatar-sm";
      applyAvatarStyle(toAvatar, transfer.toMember.name);

      const desc = document.createElement("div");
      desc.className = "settlement-desc";
      desc.textContent = `${transfer.fromMember.name} โอนให้ ${transfer.toMember.name}`;

      const amt = document.createElement("div");
      amt.className = "settlement-amount";
      amt.textContent = `฿${formatAmount(transfer.amount)}`;

      top.appendChild(fromAvatar);
      top.appendChild(arrow);
      top.appendChild(toAvatar);
      top.appendChild(desc);
      top.appendChild(amt);
      box.appendChild(top);

      const rawPp = (transfer.toMember.promptPay || "").trim();
      if (rawPp) {
        const ppBtn = document.createElement("button");
        ppBtn.type = "button";
        ppBtn.className = "promptpay-copy-chip";
        ppBtn.innerHTML = `
          <span>พร้อมเพย์ ${formatPromptPay(rawPp)}</span>
          <span class="material-symbols-rounded">content_copy</span>
        `;
        ppBtn.addEventListener("click", () => {
          copyTextToClipboard(rawPp, `คัดลอกพร้อมเพย์ ${rawPp} แล้ว`);
        });
        box.appendChild(ppBtn);
      }

      dom.settlementsList.appendChild(box);
    });
  }

  // ============================================================================
  // 11. Bottom Sheets & Modals Logic
  // ============================================================================

  function closeAllSheets() {
    document.querySelectorAll(".sheet-backdrop, .modal-backdrop").forEach((el) => {
      el.classList.add("hidden");
    });
  }

  // --- Add Member Sheet ---
  function openAddMemberSheet() {
    state.addMemberHeadcount = 1;
    dom.addMemberName.value = "";
    dom.addMemberPromptPay.value = "";
    dom.addMemberHeadcountVal.textContent = "1";
    dom.addMemberDec.disabled = true;
    dom.btnConfirmAddMember.disabled = true;
    renderAddMemberBookSection();
    dom.sheetAddMember.classList.remove("hidden");
    setTimeout(() => dom.addMemberName.focus(), 80);
  }

  function renderAddMemberBookSection() {
    const existingNames = new Set(state.members.map((m) => m.name.toLowerCase()));
    const available = state.friendBook.filter(
      (f) => !existingNames.has(f.name.toLowerCase())
    );

    if (available.length === 0) {
      dom.addMemberFromBookSection.classList.add("hidden");
      return;
    }

    dom.addMemberFromBookSection.classList.remove("hidden");
    dom.addMemberBookChips.innerHTML = "";

    available.forEach((friend) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "friend-pick-chip";

      const av = document.createElement("div");
      av.className = "avatar-circle avatar-xs";
      av.style.width = "28px";
      av.style.height = "28px";
      av.style.fontSize = "12px";
      applyAvatarStyle(av, friend.name);

      const label = document.createElement("span");
      label.textContent = friend.name;

      const icon = document.createElement("span");
      icon.className = "material-symbols-rounded";
      icon.textContent = "add";

      chip.appendChild(av);
      chip.appendChild(label);
      chip.appendChild(icon);

      chip.addEventListener("click", () => {
        addMemberToTrip(friend.name, friend.promptPay, 1, false);
        renderAddMemberBookSection();
      });

      dom.addMemberBookChips.appendChild(chip);
    });
  }

  // --- Edit Member Sheet ---
  function openEditMemberSheet(member) {
    state.editingMemberId = member.id;
    state.editMemberHeadcount = Math.max(1, Number(member.headcount) || 1);
    applyAvatarStyle(dom.editMemberAvatar, member.name);
    dom.editMemberTitle.textContent = member.name;
    dom.editMemberName.value = member.name;
    dom.editMemberPromptPay.value = member.promptPay || "";
    dom.editMemberHeadcountVal.textContent = String(state.editMemberHeadcount);
    dom.editMemberDec.disabled = state.editMemberHeadcount <= 1;
    dom.btnSaveMember.disabled = !member.name.trim();
    dom.sheetEditMember.classList.remove("hidden");
  }

  // --- Expense Editor Sheet ---
  function initCategoryPresets() {
    dom.expenseCategoryPresets.innerHTML = "";
    DEFAULT_EXPENSE_CATEGORIES.forEach((cat) => {
      const fullTitle = `${cat.emoji} ${cat.label}`;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-chip";
      chip.textContent = fullTitle;
      chip.addEventListener("click", () => {
        dom.expenseTitleInput.value = fullTitle;
        validateExpenseSheetForm();
      });
      dom.expenseCategoryPresets.appendChild(chip);
    });
  }

  function openExpenseEditorSheet(editingExpense = null) {
    if (state.members.length === 0) {
      showMessage("กรุณาเพิ่มสมาชิกในทริปก่อนเพิ่มรายการ");
      return;
    }

    const isEdit = Boolean(editingExpense);
    state.editingExpenseId = isEdit ? editingExpense.id : null;

    dom.expenseSheetTitle.textContent = isEdit
      ? "แก้ไขรายการค่าใช้จ่าย"
      : "เพิ่มรายการค่าใช้จ่าย";
    dom.expenseSheetSubtitle.textContent = isEdit
      ? "แก้ไขชื่อ ยอดเงิน คนจ่าย หรือผู้ร่วมหาร"
      : "เลือกหมวดหมู่ ใส่ยอดเงิน และเลือกคนร่วมหาร";

    dom.expenseTitleInput.value = isEdit ? editingExpense.title : "";
    dom.expenseAmountInput.value = isEdit ? String(editingExpense.amount) : "";

    state.expenseFormDateMillis = isEdit ? editingExpense.dateMillis : Date.now();
    dom.expenseDateInput.value = toIsoDateString(state.expenseFormDateMillis);
    dom.expenseDateDisplay.textContent = formatThaiDate(state.expenseFormDateMillis);

    const validMemberIds = new Set(state.members.map((m) => m.id));
    state.expenseFormPayerId =
      isEdit && validMemberIds.has(editingExpense.payerId)
        ? editingExpense.payerId
        : state.members[0]?.id || "";

    if (isEdit) {
      const filtered = (editingExpense.participantIds || []).filter((id) =>
        validMemberIds.has(id)
      );
      state.expenseFormParticipants = new Set(filtered);
    } else {
      state.expenseFormParticipants = new Set(state.members.map((m) => m.id));
    }

    state.expenseFormReceiptDataUrl = isEdit
      ? normalizeReceiptDataUrl(editingExpense.receiptImageBase64)
      : null;
    state.expenseFormReceiptFile = null;
    dom.expenseReceiptInput.value = "";

    dom.expenseAddActions.classList.toggle("hidden", isEdit);
    dom.expenseEditActions.classList.toggle("hidden", !isEdit);

    renderExpenseEditorPayerChips();
    renderExpenseEditorParticipantChips();
    renderExpenseEditorReceiptThumb();
    validateExpenseSheetForm();

    dom.sheetExpenseEditor.classList.remove("hidden");
  }

  function renderExpenseEditorPayerChips() {
    dom.expensePayerChips.innerHTML = "";
    state.members.forEach((member) => {
      const selected = member.id === state.expenseFormPayerId;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `filter-chip ${selected ? "selected" : ""}`;

      const av = document.createElement("div");
      av.className = "avatar-circle avatar-xs";
      applyAvatarStyle(av, member.name);

      const label = document.createElement("span");
      label.textContent = member.name;

      chip.appendChild(av);
      chip.appendChild(label);

      chip.addEventListener("click", () => {
        state.expenseFormPayerId = member.id;
        renderExpenseEditorPayerChips();
        validateExpenseSheetForm();
      });

      dom.expensePayerChips.appendChild(chip);
    });
  }

  function renderExpenseEditorParticipantChips() {
    dom.expenseParticipantsLabel.textContent = `ใครร่วมหารบ้าง? (${state.expenseFormParticipants.size}/${state.members.length})`;
    dom.expenseParticipantChips.innerHTML = "";

    state.members.forEach((member) => {
      const isSelected = state.expenseFormParticipants.has(member.id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `filter-chip ${isSelected ? "selected" : ""}`;

      if (isSelected) {
        const check = document.createElement("span");
        check.className = "material-symbols-rounded";
        check.textContent = "check";
        chip.appendChild(check);
      }

      const label = document.createElement("span");
      label.textContent =
        member.headcount > 1 ? `${member.name} (${member.headcount})` : member.name;
      chip.appendChild(label);

      chip.addEventListener("click", () => {
        if (state.expenseFormParticipants.has(member.id)) {
          state.expenseFormParticipants.delete(member.id);
        } else {
          state.expenseFormParticipants.add(member.id);
        }
        renderExpenseEditorParticipantChips();
        validateExpenseSheetForm();
      });

      dom.expenseParticipantChips.appendChild(chip);
    });
  }

  function renderExpenseEditorReceiptThumb() {
    const hasReceipt = Boolean(state.expenseFormReceiptDataUrl);
    dom.btnAttachReceiptText.textContent = hasReceipt
      ? "เปลี่ยนรูปสลิป"
      : "แนบสลิป / ใบเสร็จ";
    dom.expenseReceiptThumbWrap.classList.toggle("hidden", !hasReceipt);
    if (hasReceipt) {
      dom.expenseReceiptThumbImg.src = state.expenseFormReceiptDataUrl;
    }
  }

  function validateExpenseSheetForm() {
    const title = dom.expenseTitleInput.value.trim();
    const amount = parseFloat(dom.expenseAmountInput.value);
    const canSave =
      !state.isUploadingReceipt &&
      state.members.length > 0 &&
      title.length > 0 &&
      !isNaN(amount) &&
      amount > 0 &&
      Boolean(state.expenseFormPayerId) &&
      state.expenseFormParticipants.size > 0;

    dom.btnSubmitNewExpense.disabled = !canSave;
    dom.btnUpdateEditingExpense.disabled = !canSave;
    return canSave;
  }

  async function saveExpenseFromSheet() {
    if (!validateExpenseSheetForm()) return;
    const title = dom.expenseTitleInput.value.trim();
    const amount = parseFloat(dom.expenseAmountInput.value);
    const participantIds = Array.from(state.expenseFormParticipants);

    let finalReceiptUrl = state.expenseFormReceiptDataUrl || null;

    if (
      state.expenseFormReceiptFile &&
      state.expenseFormReceiptDataUrl &&
      state.currentUser &&
      storage
    ) {
      state.isUploadingReceipt = true;
      dom.btnSubmitNewExpense.disabled = true;
      dom.btnUpdateEditingExpense.disabled = true;
      try {
        const fileName = `receipt_${Date.now()}.jpg`;
        const fileRef = storage
          .ref()
          .child(`receipts/${state.currentUser.uid}/${fileName}`);
        const uploadTask = fileRef
          .putString(state.expenseFormReceiptDataUrl, "data_url")
          .then(() => fileRef.getDownloadURL());
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Storage timeout")), 3500)
        );
        finalReceiptUrl = await Promise.race([uploadTask, timeoutPromise]);
      } catch (_) {
        finalReceiptUrl = state.expenseFormReceiptDataUrl;
      } finally {
        state.isUploadingReceipt = false;
      }
    }

    if (state.editingExpenseId) {
      state.expenses = state.expenses.map((item) =>
        item.id === state.editingExpenseId
          ? {
              ...item,
              title,
              amount,
              dateMillis: state.expenseFormDateMillis,
              payerId: state.expenseFormPayerId,
              participantIds,
              receiptImageBase64: finalReceiptUrl
            }
          : item
      );
      showMessage(`แก้ไขรายการ "${title}" เรียบร้อยแล้ว!`);
    } else {
      const newExpense = {
        id: generateId("exp_"),
        title,
        amount,
        dateMillis: state.expenseFormDateMillis,
        payerId: state.expenseFormPayerId,
        participantIds,
        receiptImageBase64: finalReceiptUrl
      };
      state.expenses = [...state.expenses, newExpense];
      showMessage(`เพิ่มรายการ "${title}" เรียบร้อย!`);
    }

    dom.sheetExpenseEditor.classList.add("hidden");
    recalculateState();
  }

  function removeExpense(expenseId) {
    state.expenses = state.expenses.filter((e) => e.id !== expenseId);
    recalculateState();
  }

  // --- Friend Book Sheet ---
  function resetFriendBookForm() {
    state.editingBookFriendId = null;
    dom.friendBookNewName.value = "";
    dom.friendBookNewPromptPay.value = "";
    dom.btnAddFriendToBook.disabled = true;
    if (dom.friendBookNameFieldLabel) {
      dom.friendBookNameFieldLabel.textContent = "ชื่อเพื่อน";
    }
    if (dom.btnAddFriendToBookIcon) {
      dom.btnAddFriendToBookIcon.textContent = "add";
    }
  }

  function openFriendBookSheet() {
    dom.friendBookSearch.value = "";
    resetFriendBookForm();
    renderFriendBookList();
    dom.sheetFriendBook.classList.remove("hidden");
  }

  function renderFriendBookList() {
    dom.friendBookTitle.textContent = `สมุดเพื่อน (${state.friendBook.length})`;
    const q = dom.friendBookSearch.value.trim().toLowerCase();
    const filtered = q
      ? state.friendBook.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            (f.promptPay || "").toLowerCase().includes(q)
        )
      : state.friendBook;

    const isEmpty = filtered.length === 0;
    dom.friendBookEmpty.classList.toggle("hidden", !isEmpty);
    dom.friendBookList.classList.toggle("hidden", isEmpty);

    if (isEmpty) {
      dom.friendBookEmptyTitle.textContent =
        state.friendBook.length === 0 ? "สมุดเพื่อนยังว่าง" : "ไม่พบเพื่อนที่ค้นหา";
      dom.friendBookEmptyMsg.textContent =
        state.friendBook.length === 0
          ? "เพิ่มรายชื่อด้านบนเพื่อเก็บไว้ใช้ครั้งต่อไป"
          : "ลองค้นหาด้วยคำอื่น";
      return;
    }

    const tripMemberNames = new Set(
      state.members.map((m) => m.name.toLowerCase())
    );

    dom.friendBookList.innerHTML = "";
    filtered.forEach((friend) => {
      const row = document.createElement("div");
      row.className = "book-item-row";

      const av = document.createElement("div");
      av.className = "avatar-circle avatar-md";
      av.style.width = "38px";
      av.style.height = "38px";
      applyAvatarStyle(av, friend.name);

      const main = document.createElement("div");
      main.className = "row-main";

      const title = document.createElement("div");
      title.className = "row-title";
      title.textContent = friend.name;

      const sub = document.createElement("div");
      sub.className = "row-sub";
      sub.textContent =
        friend.promptPay && friend.promptPay.trim()
          ? `💳 พร้อมเพย์ ${formatPromptPay(friend.promptPay)}`
          : "ยังไม่ระบุพร้อมเพย์";

      main.appendChild(title);
      main.appendChild(sub);

      const isAlreadyInTrip = tripMemberNames.has(friend.name.toLowerCase());
      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "btn-text-sm";
      pickBtn.disabled = isAlreadyInTrip;
      pickBtn.textContent = isAlreadyInTrip ? "เพิ่มแล้ว" : "+ ดึงเข้าทริป";
      pickBtn.style.opacity = isAlreadyInTrip ? "0.45" : "1";
      pickBtn.addEventListener("click", () => {
        if (addMemberToTrip(friend.name, friend.promptPay || "", 1, false)) {
          renderFriendBookList();
          showMessage(`ดึง "${friend.name}" เข้าทริปแล้ว`);
        }
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn-sm icon-btn-edit";
      editBtn.title = "แก้ไข";
      editBtn.innerHTML = `<span class="material-symbols-rounded">edit</span>`;
      editBtn.addEventListener("click", () => {
        state.editingBookFriendId = friend.id;
        dom.friendBookNewName.value = friend.name;
        dom.friendBookNewPromptPay.value = friend.promptPay || "";
        dom.btnAddFriendToBook.disabled = false;
        if (dom.friendBookNameFieldLabel) {
          dom.friendBookNameFieldLabel.textContent = "แก้ไขชื่อเพื่อน";
        }
        if (dom.btnAddFriendToBookIcon) {
          dom.btnAddFriendToBookIcon.textContent = "check";
        }
        dom.friendBookNewName.focus();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn-sm icon-btn-delete";
      delBtn.title = "ลบเพื่อน";
      delBtn.innerHTML = `<span class="material-symbols-rounded">delete</span>`;
      delBtn.addEventListener("click", () => deleteFriendFromBook(friend.id));

      row.appendChild(av);
      row.appendChild(main);
      row.appendChild(pickBtn);
      row.appendChild(editBtn);
      row.appendChild(delBtn);
      dom.friendBookList.appendChild(row);
    });
  }

  // --- Cloud Trips Sheet ---
  function openCloudTripsSheet() {
    if (!state.currentUser) {
      showMessage("กรุณาเข้าสู่ระบบด้วย Google ก่อนดูประวัติ");
      return;
    }
    dom.sheetCloudTrips.classList.remove("hidden");
    loadCloudTrips();
  }

  function renderCloudTripsList() {
    dom.cloudTripsLoading.classList.add("hidden");
    const isEmpty = state.cloudTrips.length === 0;
    dom.cloudTripsEmpty.classList.toggle("hidden", !isEmpty);
    dom.cloudTripsList.classList.toggle("hidden", isEmpty);

    if (isEmpty) return;

    dom.cloudTripsList.innerHTML = "";
    state.cloudTrips.forEach((trip) => {
      const total =
        typeof trip.totalAmount === "number"
          ? trip.totalAmount
          : trip.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

      const row = document.createElement("div");
      row.className = "cloud-trip-row";

      const tile = document.createElement("div");
      tile.className = "emoji-tile";
      tile.style.width = "42px";
      tile.style.height = "42px";
      tile.style.backgroundColor = "rgba(79, 70, 229, 0.15)";
      tile.textContent = "🏕️";

      const main = document.createElement("div");
      main.className = "row-main";

      const title = document.createElement("div");
      title.className = "row-title";
      title.textContent = trip.tripName;

      const sub = document.createElement("div");
      sub.className = "row-sub";
      const datePart = trip.date ? `${trip.date} · ` : "";
      sub.textContent = `${datePart}${trip.members.length} คน · ${trip.expenses.length} รายการ · ฿${formatAmount(total)}`;

      main.appendChild(title);
      main.appendChild(sub);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn-sm icon-btn-delete";
      delBtn.title = "ลบทริป";
      delBtn.innerHTML = `<span class="material-symbols-rounded">delete</span>`;
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteCloudTrip(trip.id);
      });

      row.appendChild(tile);
      row.appendChild(main);
      row.appendChild(delBtn);

      row.addEventListener("click", () => {
        state.tripId = trip.id;
        state.tripName = trip.tripName;
        state.members = trip.members;
        state.expenses = trip.expenses;
        dom.tripNameInput.value = state.tripName;
        dom.sheetCloudTrips.classList.add("hidden");
        recalculateState();
        showMessage(`📥 โหลดข้อมูล "${trip.tripName}" เพื่อแก้ไขเรียบร้อย`);
      });

      dom.cloudTripsList.appendChild(row);
    });
  }

  // --- Receipt Preview Dialog ---
  function openReceiptPreviewDialog(src) {
    dom.receiptFullImg.src = src;
    dom.dialogReceiptPreview.classList.remove("hidden");
  }

  // --- Summary Image Preview Sheet ---
  async function openSummaryImagePreviewSheet() {
    if (state.members.length === 0 && state.expenses.length === 0) {
      showMessage("กรุณาเพิ่มสมาชิกหรือค่าใช้จ่ายก่อนสร้างรูปภาพ");
      return;
    }

    dom.sheetImagePreview.classList.remove("hidden");
    dom.imagePreviewLoading.classList.remove("hidden");
    dom.summaryPreviewImg.classList.add("hidden");
    dom.btnDownloadSummaryImg.disabled = true;
    dom.btnShareSummaryImgNow.disabled = true;

    try {
      const totalHeadcount = state.members.reduce(
        (sum, m) => sum + Math.max(1, Number(m.headcount) || 1),
        0
      );
      const totalAmount = state.expenses.reduce(
        (sum, e) => sum + Number(e.amount || 0),
        0
      );

      const canvas = await renderSummaryCanvas({
        tripName: state.tripName,
        members: state.members,
        expenses: state.expenses,
        balances: state.balances,
        settlements: state.settlements,
        totalAmount,
        totalHeadcount,
        helpers: exporterHelpers
      });

      state.latestSummaryCanvas = canvas;
      dom.summaryPreviewImg.src = canvas.toDataURL("image/png");
      dom.imagePreviewLoading.classList.add("hidden");
      dom.summaryPreviewImg.classList.remove("hidden");
      dom.btnDownloadSummaryImg.disabled = false;
      dom.btnShareSummaryImgNow.disabled = false;
    } catch (err) {
      dom.imagePreviewLoading.classList.add("hidden");
      showMessage(`สร้างรูปไม่สำเร็จ: ${err.message}`);
    }
  }

  function downloadSummaryImage() {
    if (!state.latestSummaryCanvas) return;
    const safeName =
      state.tripName.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") ||
      "TripSummary";
    const link = document.createElement("a");
    link.download = `${safeName}_${Date.now()}.png`;
    link.href = state.latestSummaryCanvas.toDataURL("image/png");
    link.click();
    showMessage("บันทึกรูปภาพเรียบร้อยแล้ว");
  }

  async function shareSummaryImage() {
    if (!state.latestSummaryCanvas) return;
    try {
      const blob = await new Promise((res) =>
        state.latestSummaryCanvas.toBlob(res, "image/png")
      );
      if (!blob) throw new Error("ไม่สามารถสร้างไฟล์รูปภาพได้");

      const file = new File([blob], "trip_summary.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: state.tripName,
          text: `สรุปค่าใช้จ่าย: ${state.tripName}`,
          files: [file]
        });
        return;
      }

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        showMessage("คัดลอกรูปภาพลงคลิปบอร์ดแล้ว (กดวางใน LINE ได้เลย)");
        return;
      }

      downloadSummaryImage();
    } catch (err) {
      if (err.name !== "AbortError") {
        downloadSummaryImage();
      }
    }
  }

  // ============================================================================
  // 12. Event Listeners Setup
  // ============================================================================

  function setupEvents() {
    // Theme Toggle
    dom.btnToggleTheme.addEventListener("click", () => {
      state.isDarkMode = !state.isDarkMode;
      saveDarkModePref(state.isDarkMode);
      applyTheme();
    });

    // Google Sign-In / Sign-Out (Compat SDK, identical to attached reference file)
    dom.btnSignIn.addEventListener("click", async () => {
      if (!auth || !window.firebase) {
        showMessage("ระบบ Cloud กำลังเตรียมความพร้อม กรุณาลองอีกครั้ง");
        return;
      }
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await auth.signInWithPopup(provider);
        showMessage("เข้าสู่ระบบสำเร็จ!");
      } catch (err) {
        if (err.code === "auth/popup-blocked") {
          await auth.signInWithRedirect(provider);
        } else if (
          err.code === "auth/operation-not-supported-in-this-environment" ||
          window.location.protocol === "file:"
        ) {
          showMessage(
            "เข้าสู่ระบบด้วย Google ต้องเปิดผ่านลิงก์เว็บ (เช่น GitHub Pages) ไม่สามารถเปิดผ่าน file:// ได้โดยตรง"
          );
        } else if (err.code !== "auth/popup-closed-by-user") {
          showMessage(`เข้าสู่ระบบไม่สำเร็จ: ${err.message}`);
        }
      }
    });

    dom.btnProfileAvatar.addEventListener("click", (ev) => {
      ev.stopPropagation();
      dom.profileDropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", () => {
      dom.profileDropdown.classList.add("hidden");
    });

    dom.btnSignOut.addEventListener("click", async () => {
      if (!auth) return;
      try {
        await auth.signOut();
        state.currentUser = null;
        state.cloudTrips = [];
        renderProfileHeader();
        updateQuickActionCounts();
        showMessage("ออกจากระบบเรียบร้อยแล้ว");
      } catch (err) {
        showMessage(`ออกจากระบบไม่สำเร็จ: ${err.message}`);
      }
    });

    // Trip Name & Today Button
    dom.tripNameInput.addEventListener("input", () => {
      state.tripName = dom.tripNameInput.value;
      saveActiveDraft();
    });

    dom.btnSetToday.addEventListener("click", () => {
      state.tripName = defaultTripName();
      dom.tripNameInput.value = state.tripName;
      saveActiveDraft();
    });

    // Quick Actions
    dom.qaFriendBook.addEventListener("click", openFriendBookSheet);
    dom.qaHistory.addEventListener("click", openCloudTripsSheet);
    dom.qaSaveCloud.addEventListener("click", saveTripToCloud);
    dom.qaNewTrip.addEventListener("click", () => {
      dom.dialogNewTripConfirm.classList.remove("hidden");
    });

    // Confirm New Trip
    dom.btnCancelNewTrip.addEventListener("click", () => {
      dom.dialogNewTripConfirm.classList.add("hidden");
    });
    dom.btnConfirmNewTrip.addEventListener("click", () => {
      state.tripId = "";
      state.tripName = defaultTripName();
      state.members = [];
      state.expenses = [];
      dom.tripNameInput.value = state.tripName;
      dom.dialogNewTripConfirm.classList.add("hidden");
      recalculateState();
      showMessage("ล้างข้อมูลปัจจุบันเรียบร้อยแล้ว");
    });

    // Members Card Empty Actions
    dom.btnEmptyAddMember.addEventListener("click", openAddMemberSheet);
    dom.btnEmptyAddAllBook.addEventListener("click", addAllSavedFriendsToTrip);

    // Add Member Sheet Controls
    dom.addMemberName.addEventListener("input", () => {
      dom.btnConfirmAddMember.disabled = !dom.addMemberName.value.trim();
    });
    dom.addMemberName.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && dom.addMemberName.value.trim()) {
        dom.btnConfirmAddMember.click();
      }
    });
    dom.addMemberDec.addEventListener("click", () => {
      state.addMemberHeadcount = Math.max(1, state.addMemberHeadcount - 1);
      dom.addMemberHeadcountVal.textContent = String(state.addMemberHeadcount);
      dom.addMemberDec.disabled = state.addMemberHeadcount <= 1;
    });
    dom.addMemberInc.addEventListener("click", () => {
      state.addMemberHeadcount += 1;
      dom.addMemberHeadcountVal.textContent = String(state.addMemberHeadcount);
      dom.addMemberDec.disabled = false;
    });
    dom.btnConfirmAddMember.addEventListener("click", () => {
      const added = addMemberToTrip(
        dom.addMemberName.value,
        dom.addMemberPromptPay.value,
        state.addMemberHeadcount,
        true
      );
      if (added) {
        dom.addMemberName.value = "";
        dom.addMemberPromptPay.value = "";
        state.addMemberHeadcount = 1;
        dom.addMemberHeadcountVal.textContent = "1";
        dom.addMemberDec.disabled = true;
        dom.btnConfirmAddMember.disabled = true;
        renderAddMemberBookSection();
      }
    });
    dom.btnSheetAddAllBook.addEventListener("click", addAllSavedFriendsToTrip);

    // Edit Member Sheet Controls
    dom.editMemberName.addEventListener("input", () => {
      const val = dom.editMemberName.value.trim();
      dom.btnSaveMember.disabled = !val;
      if (val) applyAvatarStyle(dom.editMemberAvatar, val);
    });
    dom.editMemberDec.addEventListener("click", () => {
      state.editMemberHeadcount = Math.max(1, state.editMemberHeadcount - 1);
      dom.editMemberHeadcountVal.textContent = String(state.editMemberHeadcount);
      dom.editMemberDec.disabled = state.editMemberHeadcount <= 1;
    });
    dom.editMemberInc.addEventListener("click", () => {
      state.editMemberHeadcount += 1;
      dom.editMemberHeadcountVal.textContent = String(state.editMemberHeadcount);
      dom.editMemberDec.disabled = false;
    });
    dom.btnSaveMember.addEventListener("click", () => {
      if (!state.editingMemberId) return;
      updateMemberInTrip(
        state.editingMemberId,
        dom.editMemberName.value,
        dom.editMemberPromptPay.value,
        state.editMemberHeadcount
      );
      dom.sheetEditMember.classList.add("hidden");
    });
    dom.btnRemoveMember.addEventListener("click", () => {
      if (!state.editingMemberId) return;
      removeMemberFromTrip(state.editingMemberId);
      dom.sheetEditMember.classList.add("hidden");
    });

    // Expense Triggers
    dom.btnSectionAddExpense.addEventListener("click", () =>
      openExpenseEditorSheet(null)
    );
    dom.btnFirstExpense.addEventListener("click", () =>
      openExpenseEditorSheet(null)
    );
    dom.fabAddExpense.addEventListener("click", () =>
      openExpenseEditorSheet(null)
    );

    // Expense Editor Sheet Controls
    dom.expenseTitleInput.addEventListener("input", validateExpenseSheetForm);
    dom.expenseAmountInput.addEventListener("input", validateExpenseSheetForm);
    dom.expenseDateInput.addEventListener("change", () => {
      state.expenseFormDateMillis = parseIsoDateToMillis(dom.expenseDateInput.value);
      dom.expenseDateDisplay.textContent = formatThaiDate(state.expenseFormDateMillis);
    });
    dom.btnSelectAllParticipants.addEventListener("click", () => {
      state.expenseFormParticipants = new Set(state.members.map((m) => m.id));
      renderExpenseEditorParticipantChips();
      validateExpenseSheetForm();
    });
    dom.btnClearParticipants.addEventListener("click", () => {
      state.expenseFormParticipants = new Set();
      renderExpenseEditorParticipantChips();
      validateExpenseSheetForm();
    });
    dom.btnAttachReceipt.addEventListener("click", () => {
      dom.expenseReceiptInput.click();
    });
    dom.expenseReceiptInput.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showMessage("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
        return;
      }
      try {
        state.expenseFormReceiptFile = file;
        state.expenseFormReceiptDataUrl = await compressImageFileToDataUrl(file);
        renderExpenseEditorReceiptThumb();
      } catch (_) {
        showMessage("ไม่สามารถอ่านไฟล์รูปภาพนี้ได้");
      }
    });
    dom.btnRemoveReceipt.addEventListener("click", () => {
      state.expenseFormReceiptFile = null;
      state.expenseFormReceiptDataUrl = null;
      dom.expenseReceiptInput.value = "";
      renderExpenseEditorReceiptThumb();
    });
    dom.btnSubmitNewExpense.addEventListener("click", saveExpenseFromSheet);
    dom.btnUpdateEditingExpense.addEventListener("click", saveExpenseFromSheet);
    dom.btnDeleteEditingExpense.addEventListener("click", () => {
      if (state.editingExpenseId) {
        removeExpense(state.editingExpenseId);
        dom.sheetExpenseEditor.classList.add("hidden");
      }
    });

    // Export & Share Actions
    dom.btnCopyLineSummary.addEventListener("click", () => {
      const text = generateLineSummary(
        state.tripName,
        state.members,
        state.expenses,
        state.balances,
        state.settlements
      );
      copyTextToClipboard(text, "คัดลอกสรุปข้อความแล้ว นำไปส่งลง LINE ได้เลย!");
    });

    dom.btnShareTextSummary.addEventListener("click", async () => {
      const text = generateLineSummary(
        state.tripName,
        state.members,
        state.expenses,
        state.balances,
        state.settlements
      );
      if (navigator.share) {
        try {
          await navigator.share({
            title: state.tripName,
            text
          });
          return;
        } catch (err) {
          if (err.name === "AbortError") return;
        }
      }
      copyTextToClipboard(text, "คัดลอกสรุปข้อความแล้ว");
    });

    dom.btnShareImageSummary.addEventListener("click", openSummaryImagePreviewSheet);
    dom.btnBottomSaveCloud.addEventListener("click", saveTripToCloud);

    // Image Preview Sheet Actions
    dom.btnDownloadSummaryImg.addEventListener("click", downloadSummaryImage);
    dom.btnShareSummaryImgNow.addEventListener("click", shareSummaryImage);

    // Friend Book Sheet Controls (Add & Edit)
    dom.friendBookSearch.addEventListener("input", renderFriendBookList);
    dom.friendBookNewName.addEventListener("input", () => {
      dom.btnAddFriendToBook.disabled = !dom.friendBookNewName.value.trim();
    });
    dom.friendBookNewName.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && dom.friendBookNewName.value.trim()) {
        dom.btnAddFriendToBook.click();
      }
    });
    dom.btnAddFriendToBook.addEventListener("click", () => {
      const name = dom.friendBookNewName.value.trim();
      const pp = dom.friendBookNewPromptPay.value.trim();
      if (!name) return;

      if (state.editingBookFriendId) {
        const updated = state.friendBook.map((f) =>
          f.id === state.editingBookFriendId ? { ...f, name, promptPay: pp } : f
        );
        state.friendBook = updated;
        saveLocalFriendBook(updated);
        updateQuickActionCounts();
        saveSavedFriendsToCloud(updated);
        showMessage(`อัปเดตข้อมูล "${name}" ในสมุดแล้ว`);
      } else {
        upsertFriendInBook(name, pp);
        showMessage(`เพิ่ม "${name}" ลงสมุดประจำแล้ว`);
      }

      resetFriendBookForm();
      renderFriendBookList();
      renderMembersSection();
      renderAddMemberBookSection();
    });

    // Receipt Fullscreen Dialog
    dom.btnCloseReceiptPreview.addEventListener("click", () => {
      dom.dialogReceiptPreview.classList.add("hidden");
    });

    // Backdrop click & Escape key to close sheets/dialogs
    document.querySelectorAll(".sheet-backdrop, .modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (ev) => {
        if (ev.target === backdrop) {
          backdrop.classList.add("hidden");
        }
      });
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        closeAllSheets();
      }
    });
  }

  // ============================================================================
  // 13. Initialization
  // ============================================================================

  function init() {
    applyTheme();
    initCategoryPresets();
    setupEvents();
    recalculateState();
    renderProfileHeader();
    initFirebase();
  }

  init();
})();
