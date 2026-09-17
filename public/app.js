import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyChuDKFI3RBghxC2Lhr_oElFZPvbgjxgno",
  authDomain: "rangla-app.firebaseapp.com",
  projectId: "rangla-app",
  storageBucket: "rangla-app.firebasestorage.app",
  messagingSenderId: "505473918149",
  appId: "1:505473918149:web:35de49d92905d49e30fcac"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const root = document.getElementById("root");
const PRIMARY_ADMIN_EMAIL = "rushanbindra@gmail.com";

const STATUS = {
  GOOD: "good",
  WARN: "warn",
  LOW: "low"
};

const APP_KEY = "restaurant-stock-app";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat"
};

let state = {
  currentUser: null,
  userProfile: null,
  adminSettings: { extraAdmins: [], allowRegistration: true },
  viewMode: "app", // 'app', 'admin', or 'settings'
  restaurants: [],
  customRestaurant: null,
  currentId: null,
  editingId: null,
  editingItem: null,
  items: [],
  searchQuery: "",
  showLowStockOnly: false,
  loading: true,
  authTab: "login" // 'login' or 'register'
};

let unsubRestaurants = null;
let unsubItems = null;
let unsubAdminConfig = null;

function loadApp() {
  try {
    const data = JSON.parse(localStorage.getItem(APP_KEY) || "{}");
    return {
      lastRestaurantId: data.lastRestaurantId || null
    };
  } catch {
    return { lastRestaurantId: null };
  }
}

function saveApp() {
  const data = {
    lastRestaurantId: state.currentId
  };
  localStorage.setItem(APP_KEY, JSON.stringify(data));
}

function isAdmin(user) {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase();
  if (email === PRIMARY_ADMIN_EMAIL.toLowerCase()) return true;
  return (state.adminSettings.extraAdmins || []).map(e => e.toLowerCase()).includes(email);
}

function getStatus(current, threshold) {
  if (threshold <= 0) return STATUS.GOOD;
  if (current < threshold) return STATUS.LOW;
  if (current <= threshold * 1.2) return STATUS.WARN;
  return STATUS.GOOD;
}

function todayKey() {
  return DAYS[new Date().getDay()];
}

function normalizeThresholds(item) {
  if (item.thresholds && typeof item.thresholds === "object") {
    return item.thresholds;
  }
  const fallback = Number(item.dailyThreshold || 0);
  const thresholds = {};
  DAYS.forEach((day) => {
    thresholds[day] = fallback;
  });
  return thresholds;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function getCurrentRestaurant() {
  return state.restaurants.find((r) => r.id === state.currentId) || state.customRestaurant || null;
}

function setCurrentRestaurant(id) {
  state.currentId = id;
  state.editingId = null;
  state.editingItem = null;
  state.searchQuery = "";
  state.showLowStockOnly = false;
  saveApp();
  subscribeItems();
}

function subscribeAdminConfig() {
  if (unsubAdminConfig) unsubAdminConfig();
  const docRef = doc(db, "settings", "admin_config");
  unsubAdminConfig = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      state.adminSettings = { extraAdmins: [], allowRegistration: true, ...docSnap.data() };
    } else {
      state.adminSettings = { extraAdmins: [], allowRegistration: true };
    }
    render();
  });
}

function subscribeRestaurants() {
  if (unsubRestaurants) unsubRestaurants();
  const q = query(collection(db, "restaurants"), orderBy("name"));
  unsubRestaurants = onSnapshot(q, (snap) => {
    state.restaurants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.loading = false;
    render();
  });
}

function subscribeItems() {
  if (unsubItems) {
    unsubItems();
    unsubItems = null;
  }
  const restaurant = getCurrentRestaurant();
  if (!restaurant) {
    state.items = [];
    render();
    return;
  }
  const itemsRef = collection(db, `restaurants/${restaurant.id}/items`);
  const q = query(itemsRef, orderBy("name"));
  unsubItems = onSnapshot(q, (snap) => {
    state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

function renderAuthPage() {
  const page = el("div", "page auth-page");
  const card = el("div", "card auth-card");
  
  card.append(el("h1", "", "Restaurant Stock App"));
  card.append(el("p", "subtext", state.authTab === "login" ? "Sign in to manage inventory" : "Create an account"));

  const tabContainer = el("div", "auth-tabs");
  const loginTab = el("button", state.authTab === "login" ? "primary tab-btn" : "outline tab-btn", "Sign In");
  loginTab.addEventListener("click", () => {
    state.authTab = "login";
    render();
  });
  
  const regTab = el("button", state.authTab === "register" ? "primary tab-btn" : "outline tab-btn", "Register");
  regTab.addEventListener("click", () => {
    state.authTab = "register";
    render();
  });

  tabContainer.append(loginTab, regTab);
  card.append(tabContainer);

  const form = el("form", "stack");
  form.style.marginTop = "20px";

  const emailInput = el("input");
  emailInput.type = "email";
  emailInput.placeholder = "Email address";
  emailInput.required = true;

  const passwordInput = el("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Password";
  passwordInput.required = true;

  let nameInput = null;
  if (state.authTab === "register") {
    nameInput = el("input");
    nameInput.placeholder = "Full Name (e.g. Jeff)";
    nameInput.required = true;
    form.append(nameInput);
  }

  form.append(emailInput, passwordInput);

  const submitBtn = el("button", "primary", state.authTab === "login" ? "Sign In" : "Create Account");
  submitBtn.type = "submit";
  form.append(submitBtn);

  if (state.authTab === "login") {
    const resetLink = el("button", "outline", "🔑 Forgot / Reset Password?");
    resetLink.type = "button";
    resetLink.style.marginTop = "8px";
    resetLink.style.fontSize = "0.9rem";
    resetLink.style.padding = "8px 12px";
    resetLink.addEventListener("click", async () => {
      const email = emailInput.value.trim() || prompt("Enter your account email to receive a password reset link:");
      if (!email) return;
      try {
        await sendPasswordResetEmail(auth, email);
        alert(`Password reset email sent to ${email}! Check your inbox/spam folder.`);
      } catch (err) {
        alert("Reset error: " + err.message);
      }
    });
    form.append(resetLink);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      if (state.authTab === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (state.adminSettings.allowRegistration === false) {
          alert("New user registrations are currently disabled by the administrator.");
          submitBtn.disabled = false;
          return;
        }
        const name = nameInput.value.trim();
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName: name });
        // Store user profile record in firestore
        await setDoc(doc(db, "users", userCred.user.uid), {
          uid: userCred.user.uid,
          email: email,
          displayName: name,
          createdAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      alert("Auth error: " + err.message);
      submitBtn.disabled = false;
    }
  });

  card.append(form);
  page.append(card);
  return page;
}

function renderAdminPanel() {
  const page = el("div", "page");

  const header = el("header", "header");
  const headerText = el("div");
  headerText.append(el("h1", "", "⚙️ Super Admin Panel"));
  headerText.append(el("p", "subtext", `Logged in as ${state.currentUser.email}`));

  const backBtn = el("button", "outline", "Return to App");
  backBtn.addEventListener("click", () => {
    state.viewMode = "app";
    render();
  });

  header.append(headerText, backBtn);
  page.append(header);

  // Settings Card
  const settingsCard = el("section", "card");
  settingsCard.append(el("h2", "", "System Settings"));

  const regToggleRow = el("div", "admin-row");
  const regLabel = el("span", "", "Allow New User Registrations");
  regLabel.style.fontWeight = "600";
  const regCheckbox = el("input");
  regCheckbox.type = "checkbox";
  regCheckbox.style.width = "auto";
  regCheckbox.checked = state.adminSettings.allowRegistration !== false;
  regCheckbox.addEventListener("change", async (e) => {
    await setDoc(doc(db, "settings", "admin_config"), {
      allowRegistration: e.target.checked
    }, { merge: true });
  });

  regToggleRow.append(regLabel, regCheckbox);
  settingsCard.append(regToggleRow);
  page.append(settingsCard);

  // Admin Delegation Card
  const adminDelegationCard = el("section", "card");
  adminDelegationCard.append(el("h2", "", "Admin Access Control"));
  adminDelegationCard.append(el("p", "subtext", `Primary Admin (${PRIMARY_ADMIN_EMAIL}) has full control. Add secondary admin emails below.`));

  const extraAdminsList = el("div", "item-list");
  extraAdminsList.style.marginTop = "16px";

  const currentExtraAdmins = state.adminSettings.extraAdmins || [];
  if (currentExtraAdmins.length === 0) {
    extraAdminsList.append(el("p", "subtext", "No secondary admins assigned."));
  } else {
    currentExtraAdmins.forEach((email) => {
      const row = el("div", "admin-user-item");
      row.append(el("span", "", email));
      const revokeBtn = el("button", "btn-danger", "Revoke Admin");
      revokeBtn.addEventListener("click", async () => {
        await updateDoc(doc(db, "settings", "admin_config"), {
          extraAdmins: arrayRemove(email)
        });
      });
      row.append(revokeBtn);
      extraAdminsList.append(row);
    });
  }

  const addAdminForm = el("form", "input-row");
  addAdminForm.style.marginTop = "16px";
  const newAdminInput = el("input");
  newAdminInput.placeholder = "Enter email to grant admin rights";
  newAdminInput.type = "email";
  newAdminInput.required = true;

  const addAdminBtn = el("button", "primary", "Grant Admin");
  addAdminBtn.type = "submit";

  addAdminForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = newAdminInput.value.trim().toLowerCase();
    if (!email) return;
    await setDoc(doc(db, "settings", "admin_config"), {
      extraAdmins: arrayUnion(email)
    }, { merge: true });
    newAdminInput.value = "";
  });

  addAdminForm.append(newAdminInput, addAdminBtn);
  adminDelegationCard.append(extraAdminsList, addAdminForm);
  page.append(adminDelegationCard);

  // Manage Restaurants & Members
  const restCard = el("section", "card");
  restCard.append(el("h2", "", "Manage Restaurants & Members"));

  if (state.restaurants.length === 0) {
    restCard.append(el("p", "subtext", "No restaurants in the system yet."));
  } else {
    const restList = el("div", "item-list");
    state.restaurants.forEach((r) => {
      const card = el("div", "item good");
      const title = el("h3", "", r.name);
      const codeSpan = el("p", "subtext", `Code: ${r.id}`);
      
      const memberList = el("div", "member-section");
      memberList.append(el("h4", "", "Members / Staff:"));

      const members = r.members || [];
      if (members.length === 0) {
        memberList.append(el("p", "subtext", "No specific members assigned (accessible via code)."));
      } else {
        const memUl = el("div", "stack");
        memUl.style.gap = "8px";
        members.forEach((mEmail) => {
          const memRow = el("div", "member-row");
          memRow.append(el("span", "", mEmail));
          const removeMemBtn = el("button", "btn-danger", "Remove");
          removeMemBtn.style.padding = "6px 12px";
          removeMemBtn.style.fontSize = "0.85rem";
          removeMemBtn.addEventListener("click", async () => {
            await updateDoc(doc(db, "restaurants", r.id), {
              members: arrayRemove(mEmail)
            });
          });
          memRow.append(removeMemBtn);
          memUl.append(memRow);
        });
        memberList.append(memUl);
      }

      // Add member form
      const addMemForm = el("form", "input-row");
      addMemForm.style.marginTop = "12px";
      const memInput = el("input");
      memInput.placeholder = "Add user email to restaurant";
      memInput.type = "email";
      memInput.required = true;
      const addMemBtn = el("button", "primary", "+ Add Member");
      addMemBtn.type = "submit";

      addMemForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = memInput.value.trim().toLowerCase();
        if (!email) return;
        await updateDoc(doc(db, "restaurants", r.id), {
          members: arrayUnion(email)
        });
        memInput.value = "";
      });

      addMemForm.append(memInput, addMemBtn);
      memberList.append(addMemForm);

      // Delete Restaurant button
      const delRestBtn = el("button", "btn-danger", "Delete Restaurant");
      delRestBtn.style.marginTop = "16px";
      delRestBtn.addEventListener("click", async () => {
        if (confirm(`Are you sure you want to delete "${r.name}"?`)) {
          await deleteDoc(doc(db, "restaurants", r.id));
        }
      });

      card.append(title, codeSpan, memberList, delRestBtn);
      restList.append(card);
    });
    restCard.append(restList);
  }

  page.append(restCard);
  return page;
}

function renderHome() {
  const page = el("div", "page");
  const header = el("header", "header");
  const headerText = el("div");
  const userDisplayName = state.currentUser?.displayName || state.currentUser?.email || state.userName || "User";
  headerText.append(el("h1", "", `Hello, ${userDisplayName}`));
  headerText.append(el("p", "subtext", "Select a restaurant or join one."));

  const headerActions = el("div", "item-actions");
  
  if (isAdmin(state.currentUser)) {
    const adminBtn = el("button", "primary", "⚙️ Admin Panel");
    adminBtn.addEventListener("click", () => {
      state.viewMode = "admin";
      render();
    });
    headerActions.append(adminBtn);
  }

  const userSettingsBtn = el("button", "outline", "👤 User Settings");
  userSettingsBtn.addEventListener("click", () => {
    state.viewMode = "settings";
    render();
  });
  headerActions.append(userSettingsBtn);

  const logoutBtn = el("button", "outline", "Sign Out");
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });
  headerActions.append(logoutBtn);
  
  header.append(headerText, headerActions);
  page.append(header);

  const listCard = el("section", "card");
  const list = el("div", "item-list");

  if (state.loading) {
    list.append(el("p", "subtext", "Loading..."));
  } else if (state.restaurants.length === 0) {
    list.append(el("p", "subtext", "No restaurants yet. Create one below."));
  } else {
    state.restaurants.forEach((r) => {
      const item = el("div", "item good");
      const main = el("div", "item-main");
      const info = el("div");
      info.append(el("h3", "", r.name));
      const open = el("button", "primary", "Open");
      open.addEventListener("click", () => {
        setCurrentRestaurant(r.id);
        render();
      });
      main.append(info, open);
      item.append(main);
      list.append(item);
    });
  }

  listCard.append(list);
  page.append(listCard);

  const setup = el("section", "card");
  setup.append(el("h2", "", "New Restaurant Setup"));
  const form = el("form", "stack");
  const nameInput = el("input");
  nameInput.placeholder = "Restaurant name";
  nameInput.required = true;

  const submit = el("button", "primary", "Create Restaurant");
  submit.type = "submit";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput.value.trim()) return;
    const userEmail = state.currentUser?.email || "";
    const restaurantRef = await addDoc(collection(db, "restaurants"), {
      name: nameInput.value.trim(),
      ownerEmail: userEmail,
      members: userEmail ? [userEmail] : [],
      createdAt: serverTimestamp()
    });
    setCurrentRestaurant(restaurantRef.id);
    render();
  });

  form.append(nameInput, submit);
  setup.append(form);
  page.append(setup);

  const joinCard = el("section", "card");
  joinCard.append(el("h2", "", "Join Existing Restaurant"));
  const joinForm = el("form", "stack");
  const codeInput = el("input");
  codeInput.placeholder = "Enter Restaurant Code";
  codeInput.required = true;
  const joinSubmit = el("button", "primary", "Join by Code");
  joinSubmit.type = "submit";

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!code) return;
    try {
      joinSubmit.disabled = true;
      joinSubmit.textContent = "Checking...";
      const docSnap = await getDoc(doc(db, "restaurants", code));
      if (docSnap.exists()) {
        state.customRestaurant = { id: docSnap.id, ...docSnap.data() };
        // Auto add member email if signed in
        if (state.currentUser?.email) {
          await updateDoc(doc(db, "restaurants", code), {
            members: arrayUnion(state.currentUser.email)
          });
        }
        setCurrentRestaurant(docSnap.id);
        render();
      } else {
        alert("Restaurant not found. Please check the code.");
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      joinSubmit.disabled = false;
      joinSubmit.textContent = "Join by Code";
    }
  });

  joinForm.append(codeInput, joinSubmit);
  joinCard.append(joinForm);
  page.append(joinCard);

  return page;
}

function renderApp() {
  const restaurant = getCurrentRestaurant();
  if (!restaurant) return renderHome();

  const page = el("div", "page");

  const header = el("header", "header");
  const headerText = el("div");
  headerText.append(el("h1", "", restaurant.name));
  headerText.append(el("p", "subtext", `Code to invite others: ${restaurant.id}`));
  headerText.append(el("p", "subtext", "Restaurant stock management"));

  const switchBtn = el("button", "outline", "Switch Restaurant");
  switchBtn.addEventListener("click", () => {
    state.currentId = null;
    saveApp();
    render();
  });

  header.append(headerText, switchBtn);
  page.append(header);

  // Focus: Adding categories & costs
  const formCard = el("section", "card");
  const formTitle = el("h2", "", state.editingId ? "Edit Item" : "Add Inventory Item");
  const form = el("form", "stack");
  
  const nameInput = el("input");
  nameInput.placeholder = "Item name";
  nameInput.required = true;

  const categoryInput = el("input");
  categoryInput.placeholder = "Category (e.g. Produce, Meat)";
  categoryInput.setAttribute("list", "category-list");
  
  const unitInput = el("input");
  unitInput.placeholder = "Unit (pcs, oz, l, ml, kg, etc.)";
  unitInput.setAttribute("list", "unit-list");

  // Row for inputs
  const costInput = el("input");
  costInput.type = "number";
  costInput.step = "0.01";
  costInput.placeholder = "Cost per unit ($)";
  costInput.min = "0";

  const stockInput = el("input");
  stockInput.type = "number";
  stockInput.placeholder = "Current stock amount";
  stockInput.min = "0";

  const thresholdsTitle = el("p", "subtext", "Minimum daily thresholds (when to order)");
  const thresholdsGrid = el("div", "threshold-grid");
  const thresholdInputs = {};
  DAYS.forEach((day) => {
    const wrap = el("div", "threshold-item");
    const label = el("label", "", DAY_LABELS[day]);
    const input = el("input");
    input.type = "number";
    input.min = "0";
    input.placeholder = "0";
    thresholdInputs[day] = input;
    wrap.append(label, input);
    thresholdsGrid.append(wrap);
  });

  if (state.editingId && state.editingItem) {
    nameInput.value = state.editingItem.name || "";
    categoryInput.value = state.editingItem.category || "";
    unitInput.value = state.editingItem.unit || "";
    costInput.value = state.editingItem.cost || "";
    stockInput.value = state.editingItem.currentStock ?? 0;
    const thresholds = normalizeThresholds(state.editingItem);
    DAYS.forEach((day) => {
      thresholdInputs[day].value = thresholds[day] ?? 0;
    });
  }

  const submit = el("button", "primary", state.editingId ? "Save Changes" : "Save Item");
  submit.type = "submit";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput.value.trim()) return;
    submit.disabled = true;

    const thresholds = {};
    DAYS.forEach((day) => {
      thresholds[day] = Number(thresholdInputs[day].value || 0);
    });

    const payload = {
      name: nameInput.value.trim(),
      category: categoryInput.value.trim() || "Uncategorized",
      cost: Number(costInput.value || 0),
      currentStock: Number(stockInput.value || 0),
      thresholds,
      unit: unitInput.value.trim(),
      updatedAt: serverTimestamp()
    };

    const itemsRef = collection(db, `restaurants/${restaurant.id}/items`);

    if (state.editingId) {
      await updateDoc(doc(db, `restaurants/${restaurant.id}/items`, state.editingId), payload);
    } else {
      await addDoc(itemsRef, payload);
    }

    state.editingId = null;
    state.editingItem = null;
    render();
  });

  // Data lists for easier typing
  const categoryList = el("datalist");
  categoryList.id = "category-list";
  ["Produce", "Meat", "Dairy", "Dry Goods", "Beverages", "Spices", "Packaging", "Cleaning"].forEach((u) => {
    const option = document.createElement("option");
    option.value = u;
    categoryList.append(option);
  });

  const unitList = el("datalist");
  unitList.id = "unit-list";
  ["pcs", "oz", "l", "ml", "kg", "g", "lb", "pack", "box", "bottle", "case"].forEach((u) => {
    const option = document.createElement("option");
    option.value = u;
    unitList.append(option);
  });

  const row1 = document.createElement("div");
  row1.className = "input-row";
  row1.append(nameInput, categoryInput);

  const row2 = document.createElement("div");
  row2.className = "input-row";
  row2.append(unitInput, costInput, stockInput);

  form.append(row1, row2, thresholdsTitle, thresholdsGrid, submit, unitList, categoryList);
  formCard.append(formTitle, form);
  page.append(formCard);

  // Items List Segment
  const listCard = el("section", "card");
  const listHeader = el("div", "section-header");
  listHeader.append(el("h2", "", "Current Inventory"));
  
  // Calculate total inventory value
  const totalValue = state.items.reduce((sum, item) => sum + ((item.currentStock || 0) * (item.cost || 0)), 0);
  const valLabel = el("p", "subtext", `Estimated Value: $${totalValue.toFixed(2)}`);
  valLabel.style.fontWeight = "600";
  listHeader.append(valLabel);

  // Filters & Search
  const filterRow = document.createElement("div");
  filterRow.className = "filter-row";

  const searchInput = el("input");
  searchInput.className = "search-input";
  searchInput.placeholder = "Search items by name or category...";
  searchInput.value = state.searchQuery || "";

  searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase();
  });
  searchInput.addEventListener("blur", () => render()); 
  searchInput.addEventListener("keydown", (e) => {
      if(e.key === "Enter") render();
  });

  const lowStockBtn = el("button", state.showLowStockOnly ? "primary filter-btn" : "outline filter-btn", state.showLowStockOnly ? "🛑 Showing Low Stock List" : "Filter Shopping List");
  lowStockBtn.addEventListener("click", () => {
    state.showLowStockOnly = !state.showLowStockOnly;
    render();
  });

  const exportExcelBtn = el("button", "outline filter-btn", "📊 Export to Excel");
  exportExcelBtn.addEventListener("click", () => {
    exportToExcel(restaurant.name);
  });

  filterRow.append(searchInput, lowStockBtn, exportExcelBtn);
  listCard.append(listHeader, filterRow);

  // Sorting and Display
  let displayItems = [...state.items];
  
  displayItems.sort((a,b) => {
      const catA = (a.category || "Uncategorized").toLowerCase();
      const catB = (b.category || "Uncategorized").toLowerCase();
      if(catA !== catB) return catA.localeCompare(catB);
      return (a.name||"").localeCompare(b.name||"");
  });

  if (state.searchQuery) {
    displayItems = displayItems.filter(i => 
      (i.name || "").toLowerCase().includes(state.searchQuery) ||
      (i.category || "").toLowerCase().includes(state.searchQuery)
    );
  }

  if (state.showLowStockOnly) {
    displayItems = displayItems.filter(i => {
      const thresholds = normalizeThresholds(i);
      const today = todayKey();
      const todayThreshold = Number(thresholds[today] || 0);
      const status = getStatus(i.currentStock || 0, todayThreshold);
      return status !== STATUS.GOOD;
    });
  }

  if (displayItems.length === 0) {
    if (state.items.length === 0) {
      listCard.append(el("p", "subtext", "Welcome! Add your first inventory item above."));
    } else {
      listCard.append(el("p", "subtext", "No items matched your search or filters."));
    }
  } else {
    const list = el("div", "item-list");
    displayItems.forEach((item) => {
      const thresholds = normalizeThresholds(item);
      const today = todayKey();
      const todayThreshold = Number(thresholds[today] || 0);
      const status = getStatus(item.currentStock || 0, todayThreshold);
      const card = el("div", `item ${status}`);

      const main = el("div", "item-main");
      const info = el("div");
      
      const badge = el("span", "subtext", (item.category || "Uncategorized").toUpperCase());
      badge.style.fontSize = "0.75rem"; badge.style.fontWeight = "700"; badge.style.color = "var(--accent)"; badge.style.letterSpacing = "0.05em";
      
      const title = el("h3", "", item.name || "Item");
      title.style.margin = "4px 0";
      
      const unitLabel = item.unit ? ` ${item.unit}` : "";
      const valLabel = el("p", "subtext", `Stock: ${item.currentStock || 0}${unitLabel} | Daily Needs: ${todayThreshold}${unitLabel}`);
      valLabel.style.margin = "0";

      info.append(badge, title, valLabel);

      const edit = el("button", "outline", "Edit");
      edit.addEventListener("click", () => {
        state.editingId = item.id;
        state.editingItem = item;
        window.scrollTo({top: 0, behavior: 'smooth'});
        render();
      });

      const remove = el("button", "btn-danger", "Delete");
      remove.addEventListener("click", async () => {
        const ok = confirm(`Delete "${item.name || "item"}"?`);
        if (!ok) return;
        await deleteDoc(doc(db, `restaurants/${restaurant.id}/items`, item.id));
      });

      const actionWrap = el("div", "item-actions");
      actionWrap.append(edit, remove);
      main.append(info, actionWrap);

      const actions = el("div", "actions");
      
      const qtyInput = el("input", "qty-input");
      qtyInput.type = "number";
      qtyInput.min = "0";
      qtyInput.value = item.currentStock ?? 0;
      qtyInput.title = "Directly edit stock quantity";
      
      let updateTimeout = null;
      qtyInput.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        if (isNaN(val)) return;
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(async () => {
          await updateDoc(doc(db, `restaurants/${restaurant.id}/items`, item.id), {
            currentStock: val,
            updatedAt: serverTimestamp()
          });
        }, 500);
      });

      actions.append(qtyInput);
      actions.append(makeAdjustButton(restaurant.id, item.id, "+1", 1));
      actions.append(makeAdjustButton(restaurant.id, item.id, "+5", 5));
      actions.append(makeAdjustButton(restaurant.id, item.id, "-1", -1));
      actions.append(makeAdjustButton(restaurant.id, item.id, "-5", -5));

      const statusRow = el("div", "status-row");
      statusRow.append(el("span", `dot ${status}`));
      const label = el("span", "status-label");
      label.textContent = status === STATUS.GOOD
        ? "Stock healthy"
        : status === STATUS.WARN
          ? "Near threshold"
          : "Out or Below limits";
      
      if (item.cost) {
         const valStr = document.createElement("span");
         valStr.style.marginLeft = "auto";
         valStr.style.fontWeight = "600";
         valStr.style.fontSize = "0.9rem";
         valStr.style.color = "var(--text-muted)";
         valStr.textContent = `Value: $${((item.currentStock || 0) * item.cost).toFixed(2)}`;
         statusRow.append(valStr);
      } else {
         label.style.flex = "1";
      }

      statusRow.insertBefore(label, statusRow.children[1]);

      card.append(main, actions, statusRow);
      list.append(card);
    });
    listCard.append(list);
  }

  page.append(listCard);

  const footer = el("footer", "footer");
  footer.append(el("p", "subtext", "Tip: Share the restaurant code with trusted managers to co-manage inventory."));
  page.append(footer);

  return page;
}

function makeAdjustButton(restaurantId, id, label, delta) {
  const btn = el("button", "action", label);
  btn.addEventListener("click", async () => {
    await updateDoc(doc(db, `restaurants/${restaurantId}/items`, id), {
      currentStock: Number((state.items.find((i) => i.id === id) || {}).currentStock || 0) + delta,
      updatedAt: serverTimestamp()
    });
  });
  return btn;
}

function exportToExcel(restaurantName) {
  if (!state.items || state.items.length === 0) {
    alert("No inventory items to export.");
    return;
  }

  const today = todayKey();
  const data = state.items.map((item) => {
    const thresholds = normalizeThresholds(item);
    const todayThreshold = Number(thresholds[today] || 0);
    const status = getStatus(item.currentStock || 0, todayThreshold);
    const statusText = status === STATUS.GOOD ? "Healthy" : status === STATUS.WARN ? "Near Threshold" : "Low Stock";
    const totalVal = Number(((item.currentStock || 0) * (item.cost || 0)).toFixed(2));

    return {
      "Item Name": item.name || "",
      "Category": item.category || "Uncategorized",
      "Current Stock": item.currentStock || 0,
      "Unit": item.unit || "",
      "Cost ($)": item.cost || 0,
      "Total Value ($)": totalVal,
      "Today Need": todayThreshold,
      "Status": statusText
    };
  });

  const safeName = (restaurantName || "restaurant").toLowerCase().replace(/[^a-z0-9]/g, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${safeName}_inventory_${dateStr}.xlsx`;

  if (window.XLSX) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    
    const max_width = data.reduce((acc, row) => {
      Object.keys(row).forEach((k, colIdx) => {
        const valStr = String(row[k] ?? "");
        acc[colIdx] = Math.max(acc[colIdx] || k.length, valStr.length);
      });
      return acc;
    }, []);
    worksheet["!cols"] = max_width.map((w) => ({ wch: w + 3 }));

    XLSX.writeFile(workbook, fileName);
  } else {
    const headers = Object.keys(data[0]);
    const rows = [headers, ...data.map(obj => headers.map(h => `"${String(obj[h]).replace(/"/g, '""')}"`))];
    const csvContent = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${safeName}_inventory_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

function renderUserSettings() {
  const page = el("div", "page");

  const header = el("header", "header");
  const headerText = el("div");
  headerText.append(el("h1", "", "👤 Account Settings"));
  headerText.append(el("p", "subtext", `Manage profile, credentials & account for ${state.currentUser.email}`));

  const backBtn = el("button", "outline", "Return to Home");
  backBtn.addEventListener("click", () => {
    state.viewMode = "app";
    render();
  });

  header.append(headerText, backBtn);
  page.append(header);

  // 1. Update Display Name
  const nameCard = el("section", "card");
  nameCard.append(el("h2", "", "Update Display Name"));
  const nameForm = el("form", "stack");
  const nameInput = el("input");
  nameInput.placeholder = "Full Name";
  nameInput.value = state.currentUser.displayName || "";
  nameInput.required = true;
  const saveNameBtn = el("button", "primary", "Save Name");
  saveNameBtn.type = "submit";

  nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newName = nameInput.value.trim();
    if (!newName) return;
    saveNameBtn.disabled = true;
    try {
      await updateProfile(state.currentUser, { displayName: newName });
      await setDoc(doc(db, "users", state.currentUser.uid), { displayName: newName }, { merge: true });
      alert("Name updated successfully!");
    } catch (err) {
      alert("Error updating name: " + err.message);
    } finally {
      saveNameBtn.disabled = false;
      render();
    }
  });

  nameForm.append(nameInput, saveNameBtn);
  nameCard.append(nameForm);
  page.append(nameCard);

  // 2. Change Email Address
  const emailCard = el("section", "card");
  emailCard.append(el("h2", "", "Change Email Address"));
  const emailForm = el("form", "stack");
  const emailInput = el("input");
  emailInput.type = "email";
  emailInput.placeholder = "New Email Address";
  emailInput.value = state.currentUser.email || "";
  emailInput.required = true;

  const saveEmailBtn = el("button", "primary", "Update Email");
  saveEmailBtn.type = "submit";

  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newEmail = emailInput.value.trim().toLowerCase();
    if (!newEmail || newEmail === state.currentUser.email) return;
    saveEmailBtn.disabled = true;
    try {
      await updateEmail(state.currentUser, newEmail);
      await setDoc(doc(db, "users", state.currentUser.uid), { email: newEmail }, { merge: true });
      alert("Email updated successfully!");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        const pass = prompt("For security, please confirm your current password:");
        if (pass) {
          try {
            const cred = EmailAuthProvider.credential(state.currentUser.email, pass);
            await reauthenticateWithCredential(state.currentUser, cred);
            await updateEmail(state.currentUser, newEmail);
            await setDoc(doc(db, "users", state.currentUser.uid), { email: newEmail }, { merge: true });
            alert("Email updated successfully!");
          } catch (reAuthErr) {
            alert("Re-authentication failed: " + reAuthErr.message);
          }
        }
      } else {
        alert("Error updating email: " + err.message);
      }
    } finally {
      saveEmailBtn.disabled = false;
      render();
    }
  });

  emailForm.append(emailInput, saveEmailBtn);
  emailCard.append(emailForm);
  page.append(emailCard);

  // 3. Change Password
  const passCard = el("section", "card");
  passCard.append(el("h2", "", "Change Password"));
  const passForm = el("form", "stack");
  const newPassInput = el("input");
  newPassInput.type = "password";
  newPassInput.placeholder = "New Password (min 6 chars)";
  newPassInput.required = true;

  const savePassBtn = el("button", "primary", "Update Password");
  savePassBtn.type = "submit";

  passForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPass = newPassInput.value;
    if (!newPass || newPass.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }
    savePassBtn.disabled = true;
    try {
      await updatePassword(state.currentUser, newPass);
      alert("Password updated successfully!");
      newPassInput.value = "";
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        const currentPass = prompt("For security, please enter your current password:");
        if (currentPass) {
          try {
            const cred = EmailAuthProvider.credential(state.currentUser.email, currentPass);
            await reauthenticateWithCredential(state.currentUser, cred);
            await updatePassword(state.currentUser, newPass);
            alert("Password updated successfully!");
            newPassInput.value = "";
          } catch (reAuthErr) {
            alert("Re-authentication failed: " + reAuthErr.message);
          }
        }
      } else {
        alert("Error updating password: " + err.message);
      }
    } finally {
      savePassBtn.disabled = false;
    }
  });

  passForm.append(newPassInput, savePassBtn);
  passCard.append(passForm);
  page.append(passCard);

  // 4. Delete Account
  const deleteCard = el("section", "card");
  deleteCard.style.borderColor = "var(--danger-soft)";
  deleteCard.append(el("h2", "", "Delete Account"));
  deleteCard.append(el("p", "subtext", "Permanently delete your user profile and access credentials. This action cannot be undone."));

  const deleteBtn = el("button", "btn-danger", "⚠️ Delete My Account");
  deleteBtn.style.marginTop = "16px";
  deleteBtn.addEventListener("click", async () => {
    const confirm1 = confirm("Are you sure you want to permanently delete your account?");
    if (!confirm1) return;
    const confirm2 = confirm("Final Confirmation: All account data will be removed. Proceed?");
    if (!confirm2) return;

    try {
      const uid = state.currentUser.uid;
      await deleteUser(state.currentUser);
      await deleteDoc(doc(db, "users", uid));
      alert("Your account has been deleted.");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        const pass = prompt("For security, enter your password to confirm account deletion:");
        if (pass) {
          try {
            const cred = EmailAuthProvider.credential(state.currentUser.email, pass);
            await reauthenticateWithCredential(state.currentUser, cred);
            const uid = state.currentUser.uid;
            await deleteUser(state.currentUser);
            await deleteDoc(doc(db, "users", uid));
            alert("Your account has been deleted.");
          } catch (reAuthErr) {
            alert("Re-authentication failed: " + reAuthErr.message);
          }
        }
      } else {
        alert("Error deleting account: " + err.message);
      }
    }
  });

  deleteCard.append(deleteBtn);
  page.append(deleteCard);

  return page;
}

function render() {
  clear(root);
  if (!state.currentUser) {
    root.append(renderAuthPage());
    return;
  }
  if (state.viewMode === "admin" && isAdmin(state.currentUser)) {
    root.append(renderAdminPanel());
    return;
  }
  if (state.viewMode === "settings") {
    root.append(renderUserSettings());
    return;
  }
  if (!state.currentId) {
    root.append(renderHome());
    return;
  }
  root.append(renderApp());
}

(async function init() {
  const saved = loadApp();
  state.currentId = saved.lastRestaurantId;
  
  subscribeAdminConfig();

  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;
    state.loading = false;
    if (user) {
      subscribeRestaurants();
      if (state.currentId) subscribeItems();
    } else {
      if (unsubRestaurants) unsubRestaurants();
      if (unsubItems) unsubItems();
      state.restaurants = [];
      state.items = [];
    }
    render();
  });
})();
