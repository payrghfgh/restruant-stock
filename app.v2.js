import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
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
  userName: localStorage.getItem("userName") || "",
  restaurants: [],
  customRestaurant: null,
  currentId: null,
  editingId: null,
  editingItem: null,
  items: [],
  searchQuery: "",
  showLowStockOnly: false,
  loading: true
};

let unsubRestaurants = null;
let unsubItems = null;

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

function subscribeRestaurants() {
  if (unsubRestaurants) unsubRestaurants();
  // For the dashboard list: order alphabetically
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
  const q = query(itemsRef, orderBy("name")); // items initially ordered by name
  unsubItems = onSnapshot(q, (snap) => {
    state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

function renderNameSetup() {
  const page = el("div", "page auth-page");
  const card = el("div", "card");
  card.append(el("h1", "", "Welcome"));
  card.append(el("p", "subtext", "Please enter your name to continue."));
  
  const form = el("form", "stack");
  const nameInput = el("input");
  nameInput.placeholder = "Your Name (e.g. Jeff)";
  nameInput.required = true;
  
  const submit = el("button", "primary", "Continue");
  submit.type = "submit";
  
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name) {
      state.userName = name;
      localStorage.setItem("userName", name);
      render();
    }
  });
  
  form.append(nameInput, submit);
  card.append(form);
  page.append(card);
  return page;
}

function renderHome() {
  const page = el("div", "page");
  const header = el("header", "header");
  const headerText = el("div");
  headerText.append(el("h1", "", `Hello, ${state.userName}`));
  headerText.append(el("p", "subtext", "Select a restaurant or join one."));
  
  const changeNameBtn = el("button", "outline", "Change Name");
  changeNameBtn.addEventListener("click", () => {
    state.userName = "";
    localStorage.removeItem("userName");
    render();
  });
  
  header.append(headerText, changeNameBtn);
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
    const restaurantRef = await addDoc(collection(db, "restaurants"), {
      name: nameInput.value.trim(),
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
  // To avoid losing focus on every keystroke rendering: Give focus back manually or render only on enter 
  // Let's do a loose bind for input rendering
  searchInput.addEventListener("input", (e) => {
      // Small debounce
      state.searchQuery = e.target.value.toLowerCase();
      // Only do a DOM render after the user pauses typing to preserve focus
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

  filterRow.append(searchInput, lowStockBtn);
  listCard.append(listHeader, filterRow);

  // Sorting and Display
  let displayItems = [...state.items];
  
  // Sort by category safely
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
        // scroll up
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
      
      // Cost value indication right-aligned
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

function render() {
  clear(root);
  if (!state.userName) {
    root.append(renderNameSetup());
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
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      await signInAnonymously(auth);
      return;
    }
    subscribeRestaurants();
    if (state.currentId) subscribeItems();
  });
  render();
})();
