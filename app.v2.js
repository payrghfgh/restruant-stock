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
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAklfWiwNnx76ZP5HTPMWsWrxcWkUydj9w",
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
  restaurants: [],
  currentId: null,
  lastRestaurantId: null,
  searchTerm: "",
  passUnlocked: false,
  passError: "",
  showPassSetup: false,
  editingId: null,
  editingItem: null,
  items: [],
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
    lastRestaurantId: state.lastRestaurantId
  };
  localStorage.setItem(APP_KEY, JSON.stringify(data));
}

async function hashPass(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
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
  return state.restaurants.find((r) => r.id === state.currentId) || null;
}

function setCurrentRestaurant(id) {
  state.currentId = id;
  state.lastRestaurantId = id;
  state.passUnlocked = false;
  state.passError = "";
  state.showPassSetup = false;
  state.editingId = null;
  state.editingItem = null;
  saveApp();
  subscribeItems();
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

function renderHome() {
  const page = el("div", "page");
  const header = el("header", "header");
  const headerText = el("div");
  headerText.append(el("h1", "", "Your Restaurants"));
  headerText.append(el("p", "subtext", "Tap your restaurant to continue."));
  header.append(headerText);
  page.append(header);

  const sortedRestaurants = state.restaurants
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const yourRestaurant = sortedRestaurants.find((r) => r.id === state.lastRestaurantId) || null;

  const yourCard = el("section", "card");
  yourCard.append(el("h2", "", "Your Restaurant"));
  const yourList = el("div", "item-list");
  if (state.loading) {
    yourList.append(el("p", "subtext", "Loading..."));
  } else if (!yourRestaurant) {
    yourList.append(el("p", "subtext", "No restaurant selected yet."));
  } else {
    const item = el("div", "item good");
    const main = el("div", "item-main");
    const info = el("div");
    info.append(el("h3", "", yourRestaurant.name));
    const open = el("button", "primary", "Open");
    open.addEventListener("click", () => {
      setCurrentRestaurant(yourRestaurant.id);
      render();
    });
    main.append(info, open);
    item.append(main);
    yourList.append(item);
  }
  yourCard.append(yourList);
  page.append(yourCard);

  const allCard = el("section", "card");
  allCard.append(el("h2", "", "All Restaurants"));
  const search = el("input");
  search.placeholder = "Search all restaurants";
  search.value = state.searchTerm || "";
  search.addEventListener("input", () => {
    state.searchTerm = search.value;
    render();
  });
  allCard.append(search);

  const list = el("div", "item-list");
  const queryText = (state.searchTerm || "").trim().toLowerCase();
  const visibleRestaurants = sortedRestaurants.filter((r) =>
    String(r.name || "").toLowerCase().includes(queryText)
  );

  if (state.loading) {
    list.append(el("p", "subtext", "Loading..."));
  } else if (state.restaurants.length === 0) {
    list.append(el("p", "subtext", "No restaurants yet. Create one below."));
  } else if (visibleRestaurants.length === 0) {
    list.append(el("p", "subtext", "No matching restaurants."));
  } else {
    visibleRestaurants.forEach((r) => {
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

  allCard.append(list);
  page.append(allCard);

  const setup = el("section", "card");
  setup.append(el("h2", "", "New Restaurant Setup"));
  const form = el("form", "stack");
  const nameInput = el("input");
  nameInput.placeholder = "Restaurant name";
  nameInput.required = true;
  const passInput = el("input");
  passInput.type = "password";
  passInput.placeholder = "Set password";
  passInput.required = true;

  const submit = el("button", "primary", "Create Restaurant");
  submit.type = "submit";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput.value.trim() || !passInput.value) return;
    submit.disabled = true;
    try {
      const hashed = await hashPass(passInput.value);
      const restaurantRef = await addDoc(collection(db, "restaurants"), {
        name: nameInput.value.trim(),
        passHash: hashed,
        createdAt: serverTimestamp()
      });
      setCurrentRestaurant(restaurantRef.id);
      render();
    } catch (error) {
      alert(`Create failed: ${error?.message || "Unknown error"}`);
    } finally {
      submit.disabled = false;
    }
  });

  form.append(nameInput, passInput, submit);
  setup.append(form);
  page.append(setup);

  return page;
}

function renderPassGate() {
  const page = el("div", "page auth-page");
  const card = el("div", "card");
  const restaurant = getCurrentRestaurant();
  const title = el("h1", "", restaurant ? restaurant.name : "Enter Password");
  const sub = el("p", "subtext", "Staff access only.");

  const form = el("form", "stack");
  const pass = el("input");
  pass.type = "password";
  pass.placeholder = "Password";
  pass.required = true;

  const error = el("div", "error", state.passError || "");
  if (!state.passError) error.style.display = "none";

  const submit = el("button", "primary", "Unlock");
  submit.type = "submit";

  const back = el("button", "outline", "Back");
  back.type = "button";
  back.addEventListener("click", () => {
    state.currentId = null;
    state.passUnlocked = false;
    state.passError = "";
    saveApp();
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.passError = "";
    render();
    const hashed = await hashPass(pass.value);
    if (restaurant && hashed === restaurant.passHash) {
      state.passUnlocked = true;
      render();
      return;
    }
    state.passError = "Wrong password.";
    render();
  });

  form.append(pass, error, submit, back);
  card.append(title, sub, form);
  page.append(card);
  return page;
}

function renderPassSetup() {
  const page = el("div", "page auth-page");
  const card = el("div", "card");
  const title = el("h1", "", "Change Password");
  const sub = el("p", "subtext", "Set a new password for this restaurant.");

  const form = el("form", "stack");
  const pass1 = el("input");
  pass1.type = "password";
  pass1.placeholder = "New password";
  pass1.required = true;

  const pass2 = el("input");
  pass2.type = "password";
  pass2.placeholder = "Confirm password";
  pass2.required = true;

  const error = el("div", "error", state.passError || "");
  if (!state.passError) error.style.display = "none";

  const submit = el("button", "primary", "Save Password");
  submit.type = "submit";

  const cancel = el("button", "outline", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    state.showPassSetup = false;
    state.passError = "";
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pass1.value !== pass2.value) {
      state.passError = "Passwords do not match.";
      render();
      return;
    }
    const restaurant = getCurrentRestaurant();
    if (!restaurant) return;
    await updateDoc(doc(db, "restaurants", restaurant.id), {
      passHash: await hashPass(pass1.value)
    });
    state.showPassSetup = false;
    state.passError = "";
    render();
  });

  form.append(pass1, pass2, error, submit, cancel);
  card.append(title, sub, form);
  page.append(card);
  return page;
}

function renderApp() {
  const restaurant = getCurrentRestaurant();
  if (!restaurant) return renderHome();

  const page = el("div", "page");

  const header = el("header", "header");
  const headerText = el("div");
  headerText.append(el("h1", "", restaurant.name));
  headerText.append(el("p", "subtext", "Restaurant stock"));

  const switchBtn = el("button", "outline", "Switch Restaurant");
  switchBtn.addEventListener("click", () => {
    state.currentId = null;
    state.passUnlocked = false;
    saveApp();
    render();
  });

  header.append(headerText, switchBtn);
  page.append(header);

  const passBtn = el("button", "outline", "Change Password");
  passBtn.addEventListener("click", () => {
    state.showPassSetup = true;
    render();
  });
  page.append(passBtn);

  const formCard = el("section", "card");
  const formTitle = el("h2", "", state.editingId ? "Edit Item" : "Add Item");
  const form = el("form", "stack");
  const nameInput = el("input");
  nameInput.placeholder = "Item name";
  nameInput.required = true;

  const unitInput = el("input");
  unitInput.placeholder = "Unit (pcs, oz, l, ml, etc.)";
  unitInput.setAttribute("list", "unit-list");

  const stockInput = el("input");
  stockInput.type = "number";
  stockInput.placeholder = "Current stock";
  stockInput.min = "0";

  const thresholdsTitle = el("p", "subtext", "Daily thresholds");
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
    stockInput.value = state.editingItem.currentStock ?? 0;
    unitInput.value = state.editingItem.unit || "";
    const thresholds = normalizeThresholds(state.editingItem);
    DAYS.forEach((day) => {
      thresholdInputs[day].value = thresholds[day] ?? 0;
    });
  }

  const submit = el("button", "primary", state.editingId ? "Save Changes" : "Add Item");
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

  const unitList = el("datalist");
  unitList.id = "unit-list";
  ["pcs", "oz", "l", "ml", "kg", "g", "lb", "pack", "box", "bottle"].forEach((u) => {
    const option = document.createElement("option");
    option.value = u;
    unitList.append(option);
  });

  form.append(nameInput, unitInput, stockInput, thresholdsTitle, thresholdsGrid, submit, unitList);
  formCard.append(formTitle, form);
  page.append(formCard);

  const listCard = el("section", "card");
  const listHeader = el("div", "section-header");
  listHeader.append(el("h2", "", "Items"));
  listCard.append(listHeader);

  if (state.items.length === 0) {
    listCard.append(el("p", "subtext", "No items yet. Add your first one above."));
  } else {
    const list = el("div", "item-list");
    state.items.forEach((item) => {
      const thresholds = normalizeThresholds(item);
      const today = todayKey();
      const todayThreshold = Number(thresholds[today] || 0);
      const status = getStatus(item.currentStock || 0, todayThreshold);
      const card = el("div", `item ${status}`);

      const main = el("div", "item-main");
      const info = el("div");
      info.append(el("h3", "", item.name || "Item"));
      const unitLabel = item.unit ? ` ${item.unit}` : "";
      info.append(el("p", "subtext", `Stock: ${item.currentStock || 0}${unitLabel} | Today: ${todayThreshold}${unitLabel}`));

      const edit = el("button", "outline", "Edit");
      edit.addEventListener("click", () => {
        state.editingId = item.id;
        state.editingItem = item;
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
          : "Below threshold";
      statusRow.append(label);

      card.append(main, actions, statusRow);
      list.append(card);
    });
    listCard.append(list);
  }

  page.append(listCard);

  const footer = el("footer", "footer");
  footer.append(el("p", "subtext", "Tip: Add this app to your home screen for quick access."));
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
  if (!state.currentId) {
    root.append(renderHome());
    return;
  }
  if (!state.passUnlocked) {
    root.append(renderPassGate());
    return;
  }
  if (state.showPassSetup) {
    root.append(renderPassSetup());
    return;
  }
  root.append(renderApp());
}

(async function init() {
  const saved = loadApp();
  state.lastRestaurantId = saved.lastRestaurantId;
  state.currentId = null;
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        alert(`Auth failed: ${error?.message || "Unknown error"}`);
      }
      return;
    }
    subscribeRestaurants();
    if (state.currentId) subscribeItems();
  });
  render();
})();
