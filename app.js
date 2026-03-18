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
  setDoc,
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
  itemSearchTerm: "",
  lowOnly: false,
  sortBy: "name",
  userName: "Staff",
  restaurantRoles: {},
  loading: true
};

let unsubRestaurants = null;
let unsubItems = null;
let undoState = {
  label: "",
  undoFn: null,
  timeoutId: null
};

function loadApp() {
  try {
    const data = JSON.parse(localStorage.getItem(APP_KEY) || "{}");
    return {
      lastRestaurantId: data.lastRestaurantId || null,
      userName: data.userName || "Staff",
      restaurantRoles: data.restaurantRoles || {}
    };
  } catch {
    return {
      lastRestaurantId: null,
      userName: "Staff",
      restaurantRoles: {}
    };
  }
}

function saveApp() {
  const data = {
    lastRestaurantId: state.lastRestaurantId,
    userName: state.userName,
    restaurantRoles: state.restaurantRoles
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

function getItemMinStock(item) {
  if (typeof item.minStock === "number") return Number(item.minStock || 0);
  if (item.thresholds && typeof item.thresholds === "object") {
    return Number(Object.values(item.thresholds)[0] || 0);
  }
  return Number(item.dailyThreshold || 0);
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

function formatTimestamp(value) {
  if (!value) return "Unknown";
  if (typeof value.toDate === "function") return value.toDate().toLocaleString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function getCurrentRole() {
  if (!state.currentId) return "owner";
  return state.restaurantRoles[state.currentId] || "owner";
}

function setCurrentRole(role) {
  if (!state.currentId) return;
  state.restaurantRoles[state.currentId] = role;
  saveApp();
}

function setUndo(label, undoFn) {
  if (undoState.timeoutId) clearTimeout(undoState.timeoutId);
  undoState = { label, undoFn, timeoutId: null };
  undoState.timeoutId = setTimeout(() => {
    undoState = { label: "", undoFn: null, timeoutId: null };
    render();
  }, 8000);
  render();
}

function clearUndo() {
  if (undoState.timeoutId) clearTimeout(undoState.timeoutId);
  undoState = { label: "", undoFn: null, timeoutId: null };
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
  headerText.append(el("p", "subtext", "BUILD 2026-03-18"));
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
        createdAt: serverTimestamp(),
        ownerUid: auth.currentUser ? auth.currentUser.uid : null,
        staffUids: [],
        viewerUids: [],
        isPublic: true
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
  const role = getCurrentRole();
  const canManageRestaurant = role === "owner";
  const canEditItems = role !== "viewer";
  const canDeleteItems = role === "owner";

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

  const profileCard = el("section", "card");
  profileCard.append(el("h2", "", "Session"));
  const profileRow = el("div", "controls-row");
  const nameInput = el("input");
  nameInput.placeholder = "Your name";
  nameInput.value = state.userName || "Staff";
  nameInput.addEventListener("change", () => {
    state.userName = (nameInput.value || "").trim() || "Staff";
    saveApp();
  });
  const roleSelect = document.createElement("select");
  roleSelect.className = "select";
  [["owner", "Owner"], ["staff", "Staff"], ["viewer", "Viewer"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    roleSelect.append(option);
  });
  roleSelect.value = role;
  roleSelect.addEventListener("change", () => {
    setCurrentRole(roleSelect.value);
    render();
  });
  profileRow.append(nameInput, roleSelect);
  profileCard.append(profileRow);

  const passBtn = el("button", "outline", "Change Password");
  passBtn.disabled = !canManageRestaurant;
  passBtn.addEventListener("click", () => {
    if (!canManageRestaurant) return;
    state.showPassSetup = true;
    render();
  });
  profileCard.append(passBtn);
  page.append(profileCard);

  const formCard = el("section", "card");
  if (!canEditItems) {
    formCard.append(el("h2", "", "Read Only"));
    formCard.append(el("p", "subtext", "Viewer role cannot change stock."));
  } else {
    const formTitle = el("h2", "", state.editingId ? "Edit Item" : "Add Item");
    const form = el("form", "stack");
    const itemNameInput = el("input");
    itemNameInput.placeholder = "Item name";
    itemNameInput.required = true;

    const unitInput = el("input");
    unitInput.placeholder = "Unit (pcs, oz, l, ml, etc.)";
    unitInput.setAttribute("list", "unit-list");

    const stockInput = el("input");
    stockInput.type = "number";
    stockInput.placeholder = "Current stock";
    stockInput.min = "0";

    const minStockInput = el("input");
    minStockInput.type = "number";
    minStockInput.placeholder = "Minimum stock";
    minStockInput.min = "0";

    if (state.editingId && state.editingItem) {
      itemNameInput.value = state.editingItem.name || "";
      stockInput.value = state.editingItem.currentStock ?? 0;
      unitInput.value = state.editingItem.unit || "";
      minStockInput.value = getItemMinStock(state.editingItem);
    }

    const submit = el("button", "primary", state.editingId ? "Save Changes" : "Add Item");
    submit.type = "submit";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!itemNameInput.value.trim()) return;
      submit.disabled = true;

      const payload = {
        name: itemNameInput.value.trim(),
        currentStock: Number(stockInput.value || 0),
        minStock: Number(minStockInput.value || 0),
        unit: unitInput.value.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: state.userName || "Staff"
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

    const importTitle = el("p", "subtext", "Quick add (name,stock,unit,min)");
    const importBox = document.createElement("textarea");
    importBox.className = "textarea";
    importBox.placeholder = "Tomato,25,kg,10\nCheese,8,block,3";
    const importBtn = el("button", "outline", "Import Lines");
    importBtn.type = "button";
    importBtn.addEventListener("click", async () => {
      const lines = (importBox.value || "").split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) return;
      importBtn.disabled = true;
      let imported = 0;
      for (const line of lines) {
        const [name, stock, unit, min] = line.split(",").map((part) => (part || "").trim());
        if (!name) continue;
        await addDoc(collection(db, `restaurants/${restaurant.id}/items`), {
          name,
          currentStock: Number(stock || 0),
          unit: unit || "",
          minStock: Number(min || 0),
          updatedAt: serverTimestamp(),
          updatedBy: state.userName || "Staff"
        });
        imported += 1;
      }
      importBtn.disabled = false;
      importBox.value = "";
      alert(`Imported ${imported} item(s).`);
    });

    form.append(itemNameInput, unitInput, stockInput, minStockInput, submit, unitList);
    formCard.append(formTitle, form, importTitle, importBox, importBtn);
  }
  page.append(formCard);

  const listCard = el("section", "card");
  const listHeader = el("div", "section-header");
  listHeader.append(el("h2", "", "Items"));
  const headerActions = el("div", "item-actions");
  const exportBtn = el("button", "outline", "Export CSV");
  exportBtn.addEventListener("click", () => {
    const rows = [["Item", "Stock", "Unit", "Min Stock", "Status", "Updated At", "Updated By"]];
    state.items.forEach((item) => {
      const minStock = getItemMinStock(item);
      const status = getStatus(item.currentStock || 0, minStock);
      rows.push([
        item.name || "",
        String(item.currentStock || 0),
        item.unit || "",
        String(minStock),
        status,
        formatTimestamp(item.updatedAt),
        item.updatedBy || ""
      ]);
    });
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${restaurant.name || "restaurant"}-stock.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  const printBtn = el("button", "outline", "Print Sheet");
  printBtn.addEventListener("click", () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const rows = state.items.map((item) => {
      const minStock = getItemMinStock(item);
      return `<tr><td>${item.name || ""}</td><td>${item.currentStock || 0}</td><td>${item.unit || ""}</td><td>${minStock}</td></tr>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Stock Sheet</title><style>body{font-family:Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body><h1>${restaurant.name || "Restaurant"} Stock Sheet</h1><table><thead><tr><th>Item</th><th>Stock</th><th>Unit</th><th>Min</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  });
  headerActions.append(exportBtn, printBtn);
  listHeader.append(headerActions);
  listCard.append(listHeader);

  const itemSearch = el("input");
  itemSearch.placeholder = "Search item";
  itemSearch.value = state.itemSearchTerm || "";
  itemSearch.addEventListener("input", () => {
    state.itemSearchTerm = itemSearch.value;
    render();
  });
  listCard.append(itemSearch);
  const controls = el("div", "controls-row");
  const lowOnlyBtn = el("button", state.lowOnly ? "primary" : "outline", state.lowOnly ? "Low Only: On" : "Low Only: Off");
  lowOnlyBtn.addEventListener("click", () => {
    state.lowOnly = !state.lowOnly;
    render();
  });
  const sortSelect = document.createElement("select");
  sortSelect.className = "select";
  [["name", "Sort: Name"], ["stock", "Sort: Stock"], ["low", "Sort: Low First"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sortSelect.append(option);
  });
  sortSelect.value = state.sortBy;
  sortSelect.addEventListener("change", () => {
    state.sortBy = sortSelect.value;
    render();
  });
  controls.append(lowOnlyBtn, sortSelect);
  listCard.append(controls);

  let visibleItems = state.items.filter((item) =>
    String(item.name || "").toLowerCase().includes(String(state.itemSearchTerm || "").trim().toLowerCase())
  );
  if (state.lowOnly) {
    visibleItems = visibleItems.filter((item) => Number(item.currentStock || 0) < getItemMinStock(item));
  }
  visibleItems = visibleItems.slice().sort((a, b) => {
    if (state.sortBy === "stock") return Number(a.currentStock || 0) - Number(b.currentStock || 0);
    if (state.sortBy === "low") {
      const aLow = Number(a.currentStock || 0) - getItemMinStock(a);
      const bLow = Number(b.currentStock || 0) - getItemMinStock(b);
      return aLow - bLow;
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  if (state.items.length === 0) {
    listCard.append(el("p", "subtext", "No items yet. Add your first one above."));
  } else if (visibleItems.length === 0) {
    listCard.append(el("p", "subtext", "No matching items."));
  } else {
    const list = el("div", "item-list");
    visibleItems.forEach((item) => {
      const minStock = getItemMinStock(item);
      const status = getStatus(item.currentStock || 0, minStock);
      const card = el("div", `item ${status}`);

      const main = el("div", "item-main");
      const info = el("div");
      info.append(el("h3", "", item.name || "Item"));
      const unitLabel = item.unit ? ` ${item.unit}` : "";
      info.append(el("p", "subtext", `Stock: ${item.currentStock || 0}${unitLabel} | Min: ${minStock}${unitLabel}`));
      info.append(el("p", "subtext", `Updated: ${formatTimestamp(item.updatedAt)} by ${item.updatedBy || "Unknown"}`));

      const edit = el("button", "outline", "Edit");
      edit.disabled = !canEditItems;
      edit.addEventListener("click", () => {
        if (!canEditItems) return;
        state.editingId = item.id;
        state.editingItem = item;
        render();
      });

      const remove = el("button", "btn-danger", "Delete");
      remove.disabled = !canDeleteItems;
      remove.addEventListener("click", async () => {
        if (!canDeleteItems) return;
        const ok = confirm(`Delete "${item.name || "item"}"?`);
        if (!ok) return;
        const deletedCopy = { ...item };
        await deleteDoc(doc(db, `restaurants/${restaurant.id}/items`, item.id));
        setUndo(`Deleted ${item.name || "item"}`, async () => {
          await setDoc(doc(db, `restaurants/${restaurant.id}/items`, item.id), deletedCopy);
        });
      });

      const actionWrap = el("div", "item-actions");
      actionWrap.append(edit, remove);
      main.append(info, actionWrap);

      const actions = el("div", "actions");
      const directInput = el("input");
      directInput.type = "number";
      directInput.min = "0";
      directInput.placeholder = "Update stock";
      directInput.value = Number(item.currentStock || 0);
      directInput.disabled = !canEditItems;

      const saveDirectStock = async () => {
        if (!canEditItems) return;
        const previousStock = Number(item.currentStock || 0);
        const nextStock = Number(directInput.value || 0);
        if (previousStock === nextStock) return;
        await updateDoc(doc(db, `restaurants/${restaurant.id}/items`, item.id), {
          currentStock: nextStock,
          updatedAt: serverTimestamp(),
          updatedBy: state.userName || "Staff"
        });
        setUndo(`Updated ${item.name || "item"} stock`, async () => {
          await updateDoc(doc(db, `restaurants/${restaurant.id}/items`, item.id), {
            currentStock: previousStock,
            updatedAt: serverTimestamp(),
            updatedBy: state.userName || "Staff"
          });
        });
      };

      directInput.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        await saveDirectStock();
      });

      directInput.addEventListener("blur", async () => {
        if (Number(directInput.value || 0) === Number(item.currentStock || 0)) return;
        await saveDirectStock();
      });

      actions.append(directInput);

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

  if (undoState.label) {
    const undoBar = el("section", "card undo-bar");
    undoBar.append(el("p", "subtext", undoState.label));
    const undoBtn = el("button", "outline", "Undo");
    undoBtn.addEventListener("click", async () => {
      const fn = undoState.undoFn;
      clearUndo();
      render();
      if (fn) await fn();
    });
    undoBar.append(undoBtn);
    page.append(undoBar);
  }

  const footer = el("footer", "footer");
  footer.append(el("p", "subtext", "Security: apply strict Firestore rules before production use."));
  footer.append(el("p", "subtext", "Tip: Add this app to your home screen for quick access."));
  page.append(footer);

  return page;
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
  state.userName = saved.userName;
  state.restaurantRoles = saved.restaurantRoles || {};
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
