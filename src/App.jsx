import { useEffect, useMemo, useRef, useState } from "react";

const initialProducts = [
  { id: 1, name: "House Blend Coffee", category: "Pantry", sku: "COF-001", price: 14.5, stock: 24, unit: "bag", color: "sand", mark: "☕" },
  { id: 2, name: "Olive Oil · Extra Virgin", category: "Pantry", sku: "OIL-014", price: 18, stock: 8, unit: "bottle", color: "olive", mark: "◉" },
  { id: 3, name: "Sourdough Loaf", category: "Bakery", sku: "BAK-003", price: 8.25, stock: 12, unit: "loaf", color: "peach", mark: "♨" },
  { id: 4, name: "Wildflower Honey", category: "Pantry", sku: "PAN-022", price: 11.75, stock: 6, unit: "jar", color: "gold", mark: "✳" },
  { id: 5, name: "Ceramic Travel Mug", category: "Home", sku: "HOM-008", price: 22, stock: 15, unit: "each", color: "blue", mark: "◒" },
  { id: 6, name: "Oat Milk", category: "Pantry", sku: "PAN-017", price: 5.5, stock: 3, unit: "carton", color: "lilac", mark: "◡" },
  { id: 7, name: "Linen Tea Towel", category: "Home", sku: "HOM-011", price: 16, stock: 19, unit: "each", color: "pink", mark: "▤" },
  { id: 8, name: "Dark Chocolate Bar", category: "Pantry", sku: "PAN-031", price: 6.75, stock: 2, unit: "bar", color: "brown", mark: "▰" },
];
const initialCustomers = [
  { id: 1, name: "Olivia Chen", email: "olivia.chen@email.com", visits: 12, initials: "OC", tone: "lavender" },
  { id: 2, name: "James Wilson", email: "james.w@email.com", visits: 8, initials: "JW", tone: "mint" },
  { id: 3, name: "Amara Okafor", email: "amara.o@email.com", visits: 5, initials: "AO", tone: "peach" },
  { id: 4, name: "Noah Patel", email: "noah.p@email.com", visits: 3, initials: "NP", tone: "blue" },
];
const money = (value) => new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
}).format(value);
const greetingFor = (date) => {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};
const createTransactionId = () => globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `sale_${Date.now()}_${Math.random().toString(36).slice(2)}`;

function readSaved(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage`, error);
    return fallback;
  }
}
function toUiSale(transaction) {
  return {
    id: transaction.transactionId,
    date: transaction.createdAt,
    customer: transaction.customer,
    customerId: transaction.customerId,
    items: transaction.items.map((item) => ({
      id: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    subtotal: transaction.subtotal,
    tax: transaction.tax,
    total: transaction.total,
    method: transaction.method,
    status: transaction.status === "synced" ? "Synced" : "Pending sync",
  };
}
function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    receipt: <><path d="M4 2v20l4-2 4 2 4-2 4 2V2l-4 2-4-2-4 2-4-2Z" /><path d="M8 9h8M8 13h6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m7 10 5 5 5-5" />,
    cart: <><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M2 3h2l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L22 8H5" /></>,
    cloud: <><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5h-1.3A6 6 0 1 0 5 15.3" /><path d="m8 16 4-4 4 4M12 12v9" /></>,
    wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function LoginPage({ onLogin, error, busy, checking }) {
  if (checking) {
    return <main className="auth-page"><div className="auth-loading">Checking your session…</div></main>;
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <a className="brand auth-brand" href="/" aria-label="Cornerstone home">
          <span className="brand-mark">c<span>.</span></span>
          <span className="brand-name">cornerstone<small>RETAIL STUDIO</small></span>
        </a>
        <span className="eyebrow">EMPLOYEE ACCESS</span>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-intro">Sign in with your employee number to continue to the store.</p>
        <form className="auth-form" onSubmit={onLogin}>
          <label>
            <span>Employee number</span>
            <input name="employeeNo" type="text" autoComplete="username" required maxLength={32} autoFocus />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required maxLength={128} />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="checkout-button auth-submit" type="submit" disabled={busy}>
            <span>{busy ? "Signing in…" : "Sign in"}</span>
            {!busy && <Icon name="chevron" size={17} />}
          </button>
        </form>
        <p className="auth-help">Need access? Contact your store administrator.</p>
      </section>
    </main>
  );
}

export default function App() {
  const [products, setProducts] = useState(() => readSaved("cornerstone-products", initialProducts));
  const [customers, setCustomers] = useState(() => readSaved("cornerstone-customers", initialCustomers));
  const [sales, setSales] = useState(() => readSaved("cornerstone-sales", []));
  const [cart, setCart] = useState(() => readSaved("cornerstone-cart", []));
  const [online, setOnline] = useState(navigator.onLine);
  const [edgeAvailable, setEdgeAvailable] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [view, setView] = useState("Sales");
  const [category, setCategory] = useState("All items");
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [paidAmount, setPaidAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "" });
  const [showProductForm, setShowProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", sku: "", category: "Pantry", price: "", stock: "", unit: "each" });
  const [savingSale, setSavingSale] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [authChecking, setAuthChecking] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const syncInProgress = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error(`Session check failed with status ${response.status}`);
        return response.json();
      })
      .then((session) => {
        if (active && session) setEmployee(session);
      })
      .catch((error) => {
        console.error("Unable to verify the employee session:", error);
        if (active) setAuthError("Unable to reach the sign-in service. Check the connection and try again.");
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });
    return () => { active = false; };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeNo: form.get("employeeNo"),
          password: form.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Sign-in failed with status ${response.status}`);
      setEmployee(result);
    } catch (error) {
      console.error("Employee sign-in failed:", error);
      setAuthError(error.message === "Failed to fetch"
        ? "Unable to reach the sign-in service. Check the connection and try again."
        : error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error(`Sign-out failed with status ${response.status}`);
      setEmployee(null);
      setAuthError("");
    } catch (error) {
      console.error("Unable to sign out:", error);
      setNotice("Unable to sign out. Please check the connection and try again.");
    }
  }

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  useEffect(() => {
    if (!employee) return undefined;
    let active = true;
    async function syncWithEdge() {
      if (syncInProgress.current) return;
      syncInProgress.current = true;
      try {
        const queuedSales = readSaved("cornerstone-sales", []).filter((sale) => sale.status !== "Synced");
        const uploadedSales = [];
        for (const sale of queuedSales) {
          const subtotal = Number((sale.subtotal ?? sale.items.reduce((sum, item) => sum + item.price * item.quantity, 0)).toFixed(2));
          const tax = Number((sale.tax ?? sale.total - subtotal).toFixed(2));
          const response = await fetch("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: sale.id,
              date: sale.date,
              customer: sale.customer,
              customerId: sale.customerId || null,
              items: sale.items,
              subtotal,
              tax,
              total: sale.total,
              method: sale.method,
            }),
          });
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || `Transaction upload failed with status ${response.status}`);
          }
          uploadedSales.push(toUiSale(await response.json()));
        }

        const [healthResponse, transactionsResponse, productsResponse, customersResponse] = await Promise.all([
          fetch("/api/health"),
          fetch("/api/transactions"),
          fetch("/api/products"),
          fetch("/api/customers"),
        ]);
        if (!healthResponse.ok || !transactionsResponse.ok || !productsResponse.ok || !customersResponse.ok) {
          throw new Error(`Edge API request failed with status ${healthResponse.status}/${transactionsResponse.status}/${productsResponse.status}/${customersResponse.status}`);
        }
        const health = await healthResponse.json();
        const [transactions, serverProducts, serverCustomers] = await Promise.all([
          transactionsResponse.json(),
          productsResponse.json(),
          customersResponse.json(),
        ]);
        const serverSales = transactions.map(toUiSale);
        if (active) {
          setEdgeAvailable(true);
          setCloudConnected(health.cloudConnected);
          setProducts(serverProducts);
          setCustomers(serverCustomers);
          setSales((current) => {
            const merged = new Map(current.map((sale) => [sale.id, sale]));
            uploadedSales.forEach((sale) => merged.set(sale.id, sale));
            serverSales.forEach((sale) => merged.set(sale.id, sale));
            const next = [...merged.values()].sort((left, right) => new Date(right.date) - new Date(left.date));
            return JSON.stringify(next) === JSON.stringify(current) ? current : next;
          });
        }
      } catch (error) {
        if (active) setEdgeAvailable(false);
        console.warn("Unable to synchronize transactions with the local edge API; sales remain queued in this browser:", error);
      } finally {
        syncInProgress.current = false;
      }
    }
    const requestSync = () => { void syncWithEdge(); };
    requestSync();
    window.addEventListener("online", requestSync);
    window.addEventListener("pos-sync-request", requestSync);
    const timer = window.setInterval(requestSync, 10000);
    return () => {
      active = false;
      window.removeEventListener("online", requestSync);
      window.removeEventListener("pos-sync-request", requestSync);
      window.clearInterval(timer);
    };
  }, [employee]);
  useEffect(() => { localStorage.setItem("cornerstone-sales", JSON.stringify(sales)); }, [sales]);
  useEffect(() => { window.dispatchEvent(new Event("pos-sync-request")); }, [sales]);
  useEffect(() => { localStorage.setItem("cornerstone-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const categories = ["All items", "Pantry", "Bakery", "Home"];
  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "All items" || product.category === category;
    const matchesSearch = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [products, category, search]);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  const pendingSales = sales.filter((sale) => sale.status === "Pending sync").length;
  const lowStock = products.filter((product) => product.stock <= 5).length;
  const todaysSales = sales.filter((sale) => new Date(sale.date).toDateString() === new Date().toDateString());
  const todayTotal = todaysSales.reduce((sum, sale) => sum + sale.total, 0);

  function addToCart(product) {
    if (product.stock <= 0) {
      setNotice(`${product.name} is out of stock`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          setNotice(`Only ${product.stock} ${product.unit}${product.stock === 1 ? "" : "s"} available`);
          return current;
        }
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }
  function changeQuantity(id, delta) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== id) return [item];
      const quantity = item.quantity + delta;
      if (quantity <= 0) return [];
      if (quantity > item.stock) {
        setNotice(`Only ${item.stock} available`);
        return [item];
      }
      return [{ ...item, quantity }];
    }));
  }
  async function completeSale() {
    if (cart.length === 0 || savingSale) return;
    if (paymentMethod === "Cash" && Number(paidAmount) < total) {
      setNotice("Amount received must cover the total");
      return;
    }
    const sale = {
      id: createTransactionId(),
      date: new Date().toISOString(),
      customer: selectedCustomer?.name || "Walk-in customer",
      customerId: selectedCustomer ? String(selectedCustomer.id) : null,
      items: cart.map(({ id, name, quantity, price }) => ({ id, name, quantity, price })),
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total: Number(total.toFixed(2)),
      method: paymentMethod,
      status: "Pending sync",
    };
    let savedSale = sale;
    if (online) {
      setSavingSale(true);
      try {
        const response = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Sale could not be saved (status ${response.status})`);
        setEdgeAvailable(true);
        savedSale = toUiSale(result);
      } catch (error) {
        if (error instanceof TypeError && error.message === "Failed to fetch") {
          console.warn("Edge API unavailable; keeping the sale queued in this browser:", error);
        } else {
          console.error("Unable to save sale to the database:", error);
          setNotice(error.message || "Unable to save this sale. Please try again.");
          setSavingSale(false);
          return;
        }
      } finally {
        setSavingSale(false);
      }
    }
    setSales((current) => [savedSale, ...current.filter((item) => item.id !== sale.id)]);
    setProducts((current) => current.map((product) => {
      const sold = cart.find((item) => item.id === product.id);
      return sold ? { ...product, stock: product.stock - sold.quantity } : product;
    }));
    setCart([]);
    setSelectedCustomer(null);
    setShowCheckout(false);
    setPaidAmount("");
    setNotice(savedSale.status === "Synced"
      ? "Sale saved to the database"
      : online
        ? "Sale queued in this browser · syncing with the edge database"
        : "Sale queued in this browser · will sync when the edge database is reachable");
    setView("Sales");
  }
  async function addCustomer(event) {
    event.preventDefault();
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomer),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Customer could not be saved (status ${response.status})`);
      setEdgeAvailable(true);
      setCustomers((current) => [result, ...current]);
      setSelectedCustomer(result);
      setNewCustomer({ name: "", email: "" });
      setShowCustomerForm(false);
      setNotice("Customer saved to the database");
    } catch (error) {
      console.error("Unable to save customer:", error);
      setNotice(error.message || "Unable to save this customer. Please try again.");
    }
  }
  async function addProduct(event) {
    event.preventDefault();
    const colorByCategory = { Pantry: "olive", Bakery: "peach", Home: "blue" };
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newProduct,
          price: Number(newProduct.price),
          stock: Number(newProduct.stock),
          color: colorByCategory[newProduct.category] || "sand",
          mark: "◉",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Product could not be saved (status ${response.status})`);
      setEdgeAvailable(true);
      setProducts((current) => [result, ...current]);
      setNewProduct({ name: "", sku: "", category: "Pantry", price: "", stock: "", unit: "each" });
      setShowProductForm(false);
      setNotice("Product saved to the database");
    } catch (error) {
      console.error("Unable to save product:", error);
      setNotice(error.message || "Unable to save this product. Please try again.");
    }
  }
  async function syncPending() {
    window.dispatchEvent(new Event("pos-sync-request"));
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok) throw new Error(`Sync request failed with status ${response.status}`);
      const result = await response.json();
      if (!result.cloudConfigured) {
        setNotice("Cloud database is not configured · transactions remain safely stored on the edge device");
      } else if (result.pending) {
        setNotice(`${result.pending} transaction${result.pending === 1 ? "" : "s"} queued until cloud connectivity returns`);
      } else {
        setNotice("All local transactions are synchronized");
      }
      setCloudConnected(result.cloudConnected);
    } catch (error) {
      console.error("Unable to request edge database synchronization:", error);
      setNotice("Edge API unavailable · transactions remain queued on this device");
    }
  }

  const navItems = [
    { name: "Sales", icon: "grid" },
    { name: "Inventory", icon: "box" },
    { name: "Customers", icon: "users" },
    { name: "Transactions", icon: "receipt" },
  ];

  if (authChecking || !employee) {
    return <LoginPage onLogin={signIn} error={authError} busy={authBusy} checking={authChecking} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#sales" onClick={() => setView("Sales")} aria-label="Cornerstone home">
          <span className="brand-mark">c<span>.</span></span>
          <span className="brand-name">cornerstone<small>RETAIL STUDIO</small></span>
        </a>
        <div className="store-select"><span className="store-avatar">G</span><span className="store-copy">Goodfolk Market<small>Brooklyn, NY</small></span><Icon name="down" size={15} /></div>
        <span className="side-label">WORKSPACE</span>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => <button key={item.name} onClick={() => setView(item.name)} className={`nav-item ${view === item.name ? "active" : ""}`}><Icon name={item.icon} /><span>{item.name}</span>{item.name === "Transactions" && pendingSales > 0 && <span className="nav-count">{pendingSales}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className={`sync-card ${edgeAvailable && cloudConnected ? "" : "offline-card"}`}>
            <div className="sync-card-top"><span className={`status-dot ${edgeAvailable && cloudConnected ? "online" : "offline"}`} /><strong>{edgeAvailable ? (cloudConnected ? "Cloud connected" : "Edge database ready") : "Edge API unavailable"}</strong></div>
            <p>{edgeAvailable ? (cloudConnected ? "Local database ready · cloud is connected." : "Local database ready · cloud sync will retry.") : "Sales queue in this browser until the edge API is reachable."}</p>
            <button className="sync-link" onClick={syncPending}><Icon name="cloud" size={15} />{pendingSales ? `${pendingSales} saved locally` : "View sync status"}<Icon name="chevron" size={14} /></button>
          </div>
          <button className="profile-button" onClick={signOut} aria-label={`Sign out ${employee.displayName || employee.employeeNo}`}><span className="profile-avatar">{(employee.displayName || employee.employeeNo).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span className="profile-copy">{employee.displayName || employee.employeeNo}<small>Employee · Sign out</small></span><Icon name="down" size={15} /></button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu"><Icon name="menu" /></button>
          <div className="breadcrumb"><span>Goodfolk Market</span><Icon name="chevron" size={15} /><strong>{view}</strong></div>
          <div className="topbar-right">
            <div className={`connection-pill ${online ? "connected" : "disconnected"}`}><span className="status-dot" /><span>{online ? "Internet available" : "No internet"}</span></div>
            <span className="topbar-divider" />
            <span className="date-label">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span>
          </div>
        </header>

        {!online && <div className="offline-banner"><span className="banner-icon"><Icon name="wifi" size={17} /></span><div><strong>You’re working offline</strong><span>Transactions are stored locally and will synchronize when cloud connectivity returns.</span></div><button onClick={() => setView("Transactions")}>View pending sales <Icon name="arrow" size={14} /></button></div>}

        {view === "Sales" && (
          <section className="sales-layout">
            <div className="catalog-panel">
              <div className="page-heading"><div><span className="eyebrow">{new Intl.DateTimeFormat("en-ZA", { weekday: "long", month: "long", day: "numeric" }).format(now).toUpperCase()}</span><h1>{greetingFor(now)}, {employee.displayName || employee.employeeNo} <span className="wave">✳</span></h1><p>Ready for another good day at the shop?</p></div><button className="outline-button" onClick={() => setView("Transactions")}><Icon name="clock" size={16} /> Sales history</button></div>
              <div className="metrics-row">
                <div className="metric-card"><span className="metric-icon violet"><Icon name="receipt" size={17} /></span><span className="metric-label">TODAY’S SALES</span><strong>{money(todayTotal)}</strong><small>Recorded on this device</small></div>
                <div className="metric-card"><span className="metric-icon green"><Icon name="cart" size={17} /></span><span className="metric-label">TRANSACTIONS</span><strong>{todaysSales.length.toString().padStart(2, "0")}</strong><small>Completed today</small></div>
                <div className="metric-card"><span className="metric-icon amber"><Icon name="alert" size={17} /></span><span className="metric-label">LOW STOCK</span><strong>{lowStock.toString().padStart(2, "0")} <i>items</i></strong><small><button className="text-link" onClick={() => setView("Inventory")}>Review inventory <Icon name="chevron" size={12} /></button></small></div>
              </div>
              <div className="catalog-heading"><div><h2>Products</h2><span>{filteredProducts.length} items</span></div><label className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" aria-label="Search products" /><kbd>⌘ K</kbd></label></div>
              <div className="category-tabs">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? "selected" : ""}>{item}{item === "All items" && <span>{products.length}</span>}</button>)}</div>
              <div className="product-grid">
                {filteredProducts.map((product) => <button className="product-card" key={product.id} onClick={() => addToCart(product)} disabled={product.stock === 0}>
                  <span className={`product-art ${product.color}`}><span>{product.mark}</span><span className="product-add"><Icon name="plus" size={15} /></span></span>
                  <span className="product-info"><span className="product-name">{product.name}</span><span className="product-meta">{product.stock <= 5 ? <span className="stock-low">{product.stock} left</span> : <span>{product.stock} in stock</span>}<strong>{money(product.price)}</strong></span></span>
                </button>)}
                {filteredProducts.length === 0 && <div className="empty-state">No products match “{search}”. Try another search.</div>}
              </div>
              <div className="catalog-footer"><span><span className="tiny-dot" /> Inventory saved in the database</span><button onClick={() => setView("Inventory")}>Manage inventory <Icon name="arrow" size={13} /></button></div>
            </div>

            <aside className={`cart-panel ${mobileCartOpen ? "cart-mobile-open" : ""}`}>
              <div className="cart-header"><div><h2>Current sale</h2><span>Order #{String(sales.length + 1).padStart(4, "0")}</span></div><button className="icon-button close-cart" onClick={() => setMobileCartOpen(false)} aria-label="Close cart"><Icon name="close" /></button><button className="more-button" aria-label="More options">···</button></div>
              <button className="customer-select" onClick={() => setView("Customers")}><span className="customer-icon"><Icon name="user" size={17} /></span><span>{selectedCustomer ? <><strong>{selectedCustomer.name}</strong><small>Customer selected</small></> : <><strong>Add a customer</strong><small>Optional · earn loyalty points</small></>}</span><Icon name="plus" size={16} /></button>
              <div className="cart-label"><span>ITEMS</span><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span></div>
              <div className="cart-items">
                {cart.length === 0 ? <div className="cart-empty"><span className="empty-cart-icon"><Icon name="cart" size={21} /></span><strong>Your sale is looking a little empty</strong><span>Tap a product to add it to this order.</span></div> : cart.map((item) => <div className="cart-item" key={item.id}>
                  <span className={`cart-product-art ${item.color}`}>{item.mark}</span><div className="cart-product-info"><strong>{item.name}</strong><small>{money(item.price)} / {item.unit}</small><div className="quantity-control"><button onClick={() => changeQuantity(item.id, -1)} aria-label={`Decrease ${item.name} quantity`}><Icon name="minus" size={12} /></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)} aria-label={`Increase ${item.name} quantity`}><Icon name="plus" size={12} /></button></div></div><strong className="line-total">{money(item.price * item.quantity)}</strong><button className="remove-item" aria-label={`Remove ${item.name}`} onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))}><Icon name="close" size={14} /></button>
                </div>)}
              </div>
              <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Tax <small>(8%)</small></span><strong>{money(tax)}</strong></div><div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div></div>
              <button className="checkout-button" disabled={!cart.length} onClick={() => setShowCheckout(true)}><span>Continue to payment</span><span>{money(total)} <Icon name="chevron" size={15} /></span></button>
              <div className="secure-note"><Icon name="check" size={14} /> Checkout <span>·</span> <Icon name="cloud" size={14} /> Saved to database</div>
            </aside>
          </section>
        )}

        {view === "Inventory" && <section className="content-page"><div className="page-heading"><div><span className="eyebrow">YOUR STORE</span><h1>Inventory</h1><p>Keep an eye on what’s on your shelves.</p></div><button className="primary-button" onClick={() => setShowProductForm(true)}><Icon name="plus" size={16} /> Add product</button></div><div className="inventory-summary"><div><span>PRODUCTS</span><strong>{products.length}</strong></div><div><span>LOW STOCK</span><strong className="warning-text">{lowStock}</strong></div><div><span>UNITS ON HAND</span><strong>{products.reduce((sum, product) => sum + product.stock, 0)}</strong></div><div><span>INVENTORY VALUE</span><strong>{money(products.reduce((sum, product) => sum + product.stock * product.price, 0))}</strong></div></div><div className="table-card"><div className="table-heading"><div><h2>All products</h2><span>Stock levels update as sales are made and are stored in the database</span></div><label className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" aria-label="Search inventory" /></label></div><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>PRICE</th><th>STOCK ON HAND</th><th>STATUS</th></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id}><td><span className={`table-product-art ${product.color}`}>{product.mark}</span><strong>{product.name}</strong></td><td>{product.sku}</td><td>{product.category}</td><td>{money(product.price)}</td><td>{product.stock} {product.unit}{product.stock === 1 ? "" : "s"}</td><td><span className={`stock-badge ${product.stock <= 5 ? "needs-restock" : "in-stock"}`}><span />{product.stock <= 5 ? "Low stock" : "In stock"}</span></td></tr>)}</tbody></table></div></div></section>}

        {view === "Customers" && <section className="content-page"><div className="page-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h1>Customers</h1><p>Get to know the people who make your shop.</p></div><button className="primary-button" onClick={() => setShowCustomerForm(true)}><Icon name="plus" size={16} /> Add customer</button></div><div className="customer-stats"><div><span>TOTAL CUSTOMERS</span><strong>{customers.length}</strong></div><div><span>RETURNING CUSTOMERS</span><strong>{customers.filter((customer) => customer.visits > 1).length}</strong></div><div><span>LOYALTY MEMBERS</span><strong>{customers.filter((customer) => customer.visits >= 5).length}</strong></div></div><div className="table-card customer-table"><div className="table-heading"><div><h2>Customer directory</h2><span>Saved in the database</span></div><label className="search-box"><Icon name="search" size={17} /><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search customers…" aria-label="Search customers" /></label></div><div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>VISITS</th><th>LOYALTY</th><th /></tr></thead><tbody>{customers.filter((customer) => `${customer.name} ${customer.email}`.toLowerCase().includes(customerQuery.toLowerCase())).map((customer) => <tr key={customer.id}><td><span className={`customer-avatar ${customer.tone}`}>{customer.initials}</span><strong>{customer.name}</strong></td><td>{customer.email}</td><td>{customer.visits} visits</td><td><span className={`loyalty-badge ${customer.visits >= 5 ? "loyal" : ""}`}>{customer.visits >= 5 ? "Regular" : "New friend"}</span></td><td><button className="select-customer-button" onClick={() => { setSelectedCustomer(customer); setView("Sales"); setNotice(`${customer.name} added to current sale`); }}>Add to sale <Icon name="arrow" size={13} /></button></td></tr>)}</tbody></table></div></div></section>}

        {view === "Transactions" && <section className="content-page"><div className="page-heading"><div><span className="eyebrow">YOUR SALES</span><h1>Transactions</h1><p>A clear record of every sale, even when the internet isn’t.</p></div><button className="outline-button" onClick={syncPending}><Icon name="cloud" size={16} /> Check sync status{pendingSales > 0 && <span className="button-count">{pendingSales}</span>}</button></div><div className="inventory-summary"><div><span>SALES TODAY</span><strong>{todaysSales.length}</strong></div><div><span>GROSS TOTAL</span><strong>{money(todayTotal)}</strong></div><div><span>PENDING SYNC</span><strong className={pendingSales ? "warning-text" : ""}>{pendingSales}</strong></div></div><div className="table-card"><div className="table-heading"><div><h2>Recent transactions</h2><span>{edgeAvailable ? (cloudConnected ? "Local MongoDB connected · cloud sync available" : "Local MongoDB connected · awaiting cloud connection") : "Edge API unavailable · transactions queued in browser storage"}</span></div></div>{sales.length ? <div className="table-scroll"><table><thead><tr><th>ORDER</th><th>TIME</th><th>CUSTOMER</th><th>PAYMENT</th><th>TOTAL</th><th>SYNC STATUS</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><strong className="order-id">{sale.id}</strong><small className="order-items">{sale.items.reduce((sum, item) => sum + item.quantity, 0)} items</small></td><td>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(sale.date))}</td><td>{sale.customer}</td><td>{sale.method}</td><td><strong>{money(sale.total)}</strong></td><td><span className={`sync-badge ${sale.status === "Synced" ? "synced" : "pending"}`}><span />{sale.status}</span></td></tr>)}</tbody></table></div> : <div className="transactions-empty"><span className="empty-cart-icon"><Icon name="receipt" size={22} /></span><strong>No transactions yet</strong><span>Completed sales will show up here, whether you’re online or offline.</span><button className="text-link" onClick={() => setView("Sales")}>Start a sale <Icon name="arrow" size={13} /></button></div>}</div></section>}

        <footer className="main-footer"><span>Cornerstone POS <span>·</span> Built for the way you work</span><span><span className={`footer-dot ${edgeAvailable && cloudConnected && pendingSales === 0 ? "online" : "offline"}`} />{edgeAvailable && cloudConnected && pendingSales === 0 ? "Everything is up to date" : pendingSales ? `${pendingSales} ${pendingSales === 1 ? "sale" : "sales"} waiting to sync` : edgeAvailable ? "Waiting for cloud connection" : "Edge API unavailable"}</span></footer>
      </main>

      <button className="mobile-cart-fab" onClick={() => setMobileCartOpen(true)}><Icon name="cart" size={17} /><span>Current sale</span><strong>{cart.reduce((sum, item) => sum + item.quantity, 0)}</strong><b>{money(total)}</b></button>

      {showCheckout && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCheckout(false); }}><section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="modal-heading"><div><span className="eyebrow">ORDER #{String(sales.length + 1).padStart(4, "0")}</span><h2 id="checkout-title">Take payment</h2><p>{selectedCustomer ? `For ${selectedCustomer.name}` : "Walk-in customer"}</p></div><button className="icon-button" onClick={() => setShowCheckout(false)} aria-label="Close checkout"><Icon name="close" /></button></div><div className="payment-total"><span>Amount due</span><strong>{money(total)}</strong><small>{cart.reduce((sum, item) => sum + item.quantity, 0)} items · includes {money(tax)} tax</small></div><span className="form-label">PAYMENT METHOD</span><div className="payment-methods">{["Card", "Cash"].map((method) => <button key={method} onClick={() => setPaymentMethod(method)} className={paymentMethod === method ? "payment-selected" : ""}><Icon name={method === "Card" ? "card" : "receipt"} size={18} />{method}{paymentMethod === method && <span className="radio-check"><Icon name="check" size={12} /></span>}</button>)}</div>{paymentMethod === "Cash" && <label className="cash-input"><span>Amount received</span><span className="cash-field"><span>R</span><input type="number" min={total} step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder={total.toFixed(2)} /></span>{Number(paidAmount) >= total && <small>Change due: {money(Number(paidAmount) - total)}</small>}</label>}<div className="payment-note"><Icon name={edgeAvailable ? "cloud" : "wifi"} size={16} /><span>{edgeAvailable ? "Completed sales are saved in the local database. Card payments are recorded only; no payment processor is connected." : "Sales are queued in this browser until the local database is reachable. Card payments are not processed offline."}</span></div><button className="checkout-button confirm-payment" onClick={completeSale} disabled={savingSale}><span>{savingSale ? "Saving sale…" : "Complete sale"}</span><span>{money(total)} <Icon name="check" size={16} /></span></button><p className="modal-secure"><Icon name="check" size={13} /> {edgeAvailable ? "Saved to the local database" : "Queued in this browser until the database is reachable"}</p></section></div>}

      {showProductForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProductForm(false); }}><form className="checkout-modal customer-modal product-modal" onSubmit={addProduct}><div className="modal-heading"><div><span className="eyebrow">YOUR STORE</span><h2>Add inventory item</h2><p>Product details and stock are saved in the database.</p></div><button type="button" className="icon-button" onClick={() => setShowProductForm(false)} aria-label="Close"><Icon name="close" /></button></div><label className="cash-input"><span>Product name</span><input required maxLength={160} value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="e.g. Ground coffee" /></label><div className="product-form-row"><label className="cash-input"><span>SKU</span><input required maxLength={40} pattern="[A-Za-z0-9_-]+" value={newProduct.sku} onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })} placeholder="COF-002" /></label><label className="cash-input"><span>Category</span><select value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}><option>Pantry</option><option>Bakery</option><option>Home</option></select></label></div><div className="product-form-row"><label className="cash-input"><span>Price (ZAR)</span><input required type="number" min="0" step="0.01" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} placeholder="0.00" /></label><label className="cash-input"><span>Initial stock</span><input required type="number" min="0" step="1" value={newProduct.stock} onChange={(event) => setNewProduct({ ...newProduct, stock: event.target.value })} placeholder="0" /></label></div><label className="cash-input"><span>Unit</span><input required maxLength={30} value={newProduct.unit} onChange={(event) => setNewProduct({ ...newProduct, unit: event.target.value })} placeholder="each" /></label><button className="checkout-button confirm-payment" type="submit"><span>Save product</span><Icon name="check" size={16} /></button></form></div>}

      {showCustomerForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCustomerForm(false); }}><form className="checkout-modal customer-modal" onSubmit={addCustomer}><div className="modal-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Add a customer</h2><p>Customer details are saved to the database.</p></div><button type="button" className="icon-button" onClick={() => setShowCustomerForm(false)} aria-label="Close"><Icon name="close" /></button></div><label className="cash-input"><span>Full name</span><input required value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} placeholder="e.g. Taylor Rivera" /></label><label className="cash-input"><span>Email address</span><input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} placeholder="taylor@email.com" /></label><button className="checkout-button confirm-payment" type="submit"><span>Save customer</span><Icon name="check" size={16} /></button></form></div>}

      {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><Icon name="close" size={14} /></button></div>}
    </div>
  );
}
