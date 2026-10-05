import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ShoppingBag,
  Search,
  UserRound,
  Heart,
  X,
  Plus,
  Minus,
  Check,
  Menu,
  Truck,
  ShieldCheck,
  Leaf,
  LogOut,
  SlidersHorizontal,
  Armchair,
  Package,
  ChevronDown,
  CheckCircle2,
  Trash2,
  Pencil,
} from "lucide-react";
import "./style.css";
const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
const categories = [
  "All pieces",
  "Sofas",
  "Chairs",
  "Tables",
  "Bedroom",
  "Storage",
  "Lighting",
];
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}
function App() {
  const [path, setPath] = useState(location.pathname),
    [products, setProducts] = useState([]),
    [user, setUser] = useState(null),
    [cart, setCart] = useState([]),
    [wishlist, setWishlist] = useState([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState("All pieces"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("featured"),
    [price, setPrice] = useState("all"),
    [searchOpen, setSearchOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null),
    [authMode, setAuthMode] = useState("login"),
    [afterAuth, setAfterAuth] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [orders, setOrders] = useState([]),
    [orderLoading, setOrderLoading] = useState(false),
    [success, setSuccess] = useState(null);
  const [adminProducts, setAdminProducts] = useState([]),
    [adminOrders, setAdminOrders] = useState([]),
    [adminTab, setAdminTab] = useState("products"),
    [editProduct, setEditProduct] = useState(null);
  const dialog = useRef(null),
    requestKey = useRef(crypto.randomUUID());
  const navigate = (url) => {
    history.pushState(null, "", url);
    setPath(url);
    setMenuOpen(false);
    setError("");
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const fn = () => {
      setPath(location.pathname);
      setError("");
    };
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  const refresh = async () => {
    setLoadError("");
    try {
      const [p, u, c] = await Promise.all([
        api("/products"),
        api("/auth/me"),
        api("/cart"),
      ]);
      setProducts(p);
      setUser(u);
      setCart(c);
      if (u) setWishlist(await api("/wishlist"));
      else setWishlist([]);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (modal) {
      setError("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (path === "/orders" && user) {
      setOrderLoading(true);
      api("/orders")
        .then(setOrders)
        .catch((e) => setError(e.message))
        .finally(() => setOrderLoading(false));
    }
    if (path === "/admin" && user?.role === "admin") loadAdmin();
  }, [path, user?.id]);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "search_furniture",
          title: "Search furniture",
          description:
            "Filter the furniture catalog by a search term. Does not place orders or change your bag.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string", maxLength: 100 } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute(input) {
            if (typeof input?.query !== "string" || input.query.length > 100)
              throw new Error(
                "Provide a search query of 100 characters or fewer.",
              );
            setSearch(input.query);
            setCategory("All pieces");
            navigate("/shop");
            return {
              query: input.query,
              matches: products
                .filter((p) =>
                  (p.name + " " + p.category + " " + p.material)
                    .toLowerCase()
                    .includes(input.query.toLowerCase()),
                )
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  price: p.price / 100,
                  currency: "USD",
                })),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [products]);
  async function loadAdmin() {
    try {
      const [p, o] = await Promise.all([
        api("/admin/products"),
        api("/admin/orders"),
      ]);
      setAdminProducts(p);
      setAdminOrders(o);
    } catch (e) {
      setError(e.message);
    }
  }
  const action = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const requireLogin = (next) => {
    setAfterAuth(next || null);
    setAuthMode("login");
    setModal("auth");
  };
  async function changeCart(p, quantity) {
    await action(async () => {
      setCart(
        await api("/cart/" + p.id, {
          method: "PUT",
          body: JSON.stringify({ quantity }),
        }),
      );
      if (quantity > (cart.find((i) => i.id === p.id)?.quantity || 0))
        setToast(`${p.name} added to your bag`);
    });
  }
  async function wish(p) {
    if (!user) return requireLogin();
    await action(async () => {
      const saved = !wishlist.some((x) => x.id === p.id);
      await api("/wishlist/" + p.id, {
        method: "PUT",
        body: JSON.stringify({ saved }),
      });
      setWishlist(
        saved ? [...wishlist, p] : wishlist.filter((x) => x.id !== p.id),
      );
      setToast(saved ? "Saved to your wishlist" : "Removed from your wishlist");
    });
  }
  const count = cart.reduce((s, p) => s + p.quantity, 0),
    subtotal = cart.reduce((s, p) => s + p.price * p.quantity, 0),
    shipping = subtotal >= 100000 || !subtotal ? 0 : 4900;
  let filtered = products.filter(
    (p) =>
      (category === "All pieces" || p.category === category) &&
      (p.name + " " + p.category + " " + p.material + " " + p.color)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (price === "all" ||
        (price === "under500" ? p.price < 50000 : p.price >= 50000)),
  );
  if (sort === "low") filtered.sort((a, b) => a.price - b.price);
  if (sort === "high") filtered.sort((a, b) => b.price - a.price);
  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  const product = products.find((p) => path === "/product/" + p.id);
  const openShop = (cat = "All pieces") => {
    setCategory(cat);
    setSearch("");
    navigate("/shop");
  };
  const productCard = (p) => (
    <article className="product-card" key={p.id}>
      <div className="product-photo">
        <button
          className="photo-link"
          onClick={() => navigate("/product/" + p.id)}
          aria-label={"View " + p.name}
        >
          <img src={p.image} alt={p.name} loading="lazy" />
        </button>
        {p.featured === 1 && (
          <span className="product-badge">A house favorite</span>
        )}
        <button
          className={
            "favorite icon-button " +
            (wishlist.some((x) => x.id === p.id) ? "saved" : "")
          }
          aria-label={
            (wishlist.some((x) => x.id === p.id) ? "Unsave " : "Save ") + p.name
          }
          onClick={() => wish(p)}
        >
          <Heart
            size={19}
            fill={wishlist.some((x) => x.id === p.id) ? "currentColor" : "none"}
          />
        </button>
        <button
          className="quick-add"
          disabled={busy || p.stock === 0}
          onClick={() =>
            changeCart(p, (cart.find((i) => i.id === p.id)?.quantity || 0) + 1)
          }
        >
          <Plus size={17} />
          {p.stock ? "Add to bag" : "Sold out"}
        </button>
      </div>
      <div className="product-meta">
        <div>
          <button
            className="text-title"
            onClick={() => navigate("/product/" + p.id)}
          >
            {p.name}
          </button>
          <p>
            {p.color} · {p.category}
          </p>
        </div>
        <strong>{money(p.price)}</strong>
      </div>
    </article>
  );
  const empty = (title, description) => (
    <div className="empty">
      <Armchair size={42} strokeWidth={1} />
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="button" onClick={() => openShop()}>
        Explore the collection
      </button>
    </div>
  );
  const summary = (
    <div className="summary">
      <div>
        <span>Subtotal</span>
        <strong>{money(subtotal)}</strong>
      </div>
      <div>
        <span>Delivery</span>
        <span>{shipping ? money(shipping) : "On us"}</span>
      </div>
      <div className="total">
        <span>Total</span>
        <strong>{money(subtotal + shipping)}</strong>
      </div>
      <p className="small">USD · No additional tax charged by this store.</p>
    </div>
  );
  const cartLines = (
    <div className="cart-lines">
      {cart.map((p) => (
        <div className="cart-line" key={p.id}>
          <img src={p.image} alt={p.name} />
          <div className="cart-info">
            <h3>{p.name}</h3>
            <p>{p.color}</p>
            <div className="quantity">
              <button
                aria-label={"Decrease " + p.name}
                disabled={busy}
                onClick={() => changeCart(p, p.quantity - 1)}
              >
                <Minus size={14} />
              </button>
              <span>{p.quantity}</span>
              <button
                aria-label={"Increase " + p.name}
                disabled={busy || p.quantity >= Math.min(p.stock, 20)}
                onClick={() => changeCart(p, p.quantity + 1)}
              >
                <Plus size={14} />
              </button>
            </div>
            {(!p.active || p.stock < p.quantity) && (
              <p className="error-text">Please update this unavailable item.</p>
            )}
          </div>
          <div className="cart-end">
            <strong>{money(p.price * p.quantity)}</strong>
            <button
              className="icon-button"
              aria-label={"Remove " + p.name}
              disabled={busy}
              onClick={() => changeCart(p, 0)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
  const authForm = (
    <>
      <span className="eyebrow">A little closer to home</span>
      <h2>
        {authMode === "login" ? "Welcome back." : "Make yourself at home."}
      </h2>
      <p className="muted">
        {authMode === "login"
          ? "Sign in to see your saved pieces and orders."
          : "Save your favorites and keep track of your orders."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const body = Object.fromEntries(new FormData(e.currentTarget));
          action(async () => {
            const u = await api(
              "/auth/" + (authMode === "login" ? "login" : "register"),
              { method: "POST", body: JSON.stringify(body) },
            );
            setUser(u);
            setCart(await api("/cart"));
            setWishlist(await api("/wishlist"));
            setModal(null);
            if (afterAuth) navigate(afterAuth);
            setAfterAuth(null);
            setToast(
              authMode === "login"
                ? "Welcome back, " + u.name.split(" ")[0]
                : "Your account is ready",
            );
          });
        }}
      >
        {authMode === "register" && (
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              minLength="2"
              maxLength="80"
              required
            />
          </label>
        )}
        <label>
          Email address
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={
              authMode === "login" ? "current-password" : "new-password"
            }
            minLength="10"
            maxLength="72"
            required
          />
          {authMode === "register" && <small>At least 10 characters.</small>}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button full" disabled={busy}>
          {busy
            ? "Please wait…"
            : authMode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
      <p className="auth-switch">
        {authMode === "login" ? "New around here?" : "Already have an account?"}{" "}
        <button
          className="text-button"
          onClick={() => {
            setAuthMode(authMode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {authMode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </>
  );
  return (
    <>
      <div className="announcement">
        Thoughtful pieces. Everyday comfort.{" "}
        <span>Complimentary delivery on orders $1,000+</span>
      </div>
      <header>
        <div className="header-inner">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu />
          </button>
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            hearth <i>&</i> form<span>FURNITURE FOR LIVING</span>
          </a>
          <nav className={menuOpen ? "open" : ""}>
            <button
              className={path === "/shop" ? "active" : ""}
              onClick={() => openShop()}
            >
              Shop all
            </button>
            <button onClick={() => openShop("Sofas")}>Living</button>
            <button onClick={() => openShop("Tables")}>Dining</button>
            <button onClick={() => openShop("Bedroom")}>Bedroom</button>
            <button onClick={() => openShop("Lighting")}>
              Finishing touches
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search"
              onClick={() => {
                setSearchOpen(!searchOpen);
                if (!searchOpen) navigate("/shop");
              }}
            >
              <Search size={21} />
            </button>
            <button
              className="icon-button wish-header"
              aria-label="Wishlist"
              onClick={() =>
                user ? navigate("/wishlist") : requireLogin("/wishlist")
              }
            >
              <Heart size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="My account"
              onClick={() => (user ? navigate("/account") : requireLogin())}
            >
              <UserRound size={21} />
            </button>
            <button
              className="bag-button"
              aria-label={"Shopping bag, " + count + " items"}
              onClick={() => setModal("cart")}
            >
              <ShoppingBag size={21} />
              <span>{count}</span>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="search-bar">
            <Search size={19} />
            <input
              autoFocus
              aria-label="Search furniture"
              placeholder="Find your next favorite piece…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="Close search"
              onClick={() => {
                setSearchOpen(false);
                setSearch("");
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}
      </header>
      <main>
        {loadError ? (
          <div className="empty">
            <h2>We couldn’t load the store.</h2>
            <p>{loadError}</p>
            <button className="button" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="loading">Making room for something lovely…</div>
        ) : (
          <>
            {path === "/" && (
              <>
                <section className="hero">
                  <div className="hero-copy">
                    <span className="eyebrow">THE ART OF FEELING AT HOME</span>
                    <h1>
                      Good living
                      <br />
                      starts <em>here.</em>
                    </h1>
                    <p>
                      Thoughtfully chosen furniture.
                      <br />
                      For the spaces — and moments — that matter.
                    </p>
                    <button className="button light" onClick={() => openShop()}>
                      Find your everyday favorites
                    </button>
                    <span className="hero-caption">
                      Comfort, with a considered touch.
                    </span>
                  </div>
                  <div className="hero-image">
                    <img
                      src="/images/hero.jpg"
                      alt="A sunlit living room with a soft sofa, natural textures, and warm wood furniture"
                      fetchPriority="high"
                    />
                    <div className="image-caption">
                      <span>A slower kind of living</span>
                      <span>THE EVERYDAY COLLECTION</span>
                    </div>
                  </div>
                </section>
                <div className="benefits">
                  <span>
                    <Truck size={20} /> Free delivery over $1,000
                  </span>
                  <span>
                    <Leaf size={20} /> Natural textures, lasting appeal
                  </span>
                  <span>
                    <ShieldCheck size={20} /> Pay when your order arrives
                  </span>
                </div>
                <section className="section collection">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">COME ON IN</span>
                      <h2>Find your kind of comfort.</h2>
                    </div>
                    <button className="underlined" onClick={() => openShop()}>
                      Explore all pieces
                    </button>
                  </div>
                  <div className="category-tabs">
                    {categories.map((c) => (
                      <button
                        key={c}
                        className={category === c ? "selected" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="product-grid">
                    {(category === "All pieces"
                      ? products.filter((p) => p.featured)
                      : products.filter((p) => p.category === category)
                    ).map(productCard)}
                  </div>
                </section>
                <section className="home-note">
                  <span className="eyebrow">LESS, BUT LOVELIER</span>
                  <h2>
                    A home that feels like <em>you.</em>
                  </h2>
                  <p>
                    Soft edges. Honest materials. Pieces that settle in
                    beautifully.
                    <br />
                    Create a space you’ll love coming back to.
                  </p>
                  <button className="button" onClick={() => openShop()}>
                    Make room for the everyday
                  </button>
                </section>
              </>
            )}
            {path === "/shop" && (
              <section className="section shop">
                <div className="page-intro">
                  <span className="eyebrow">THE COLLECTION</span>
                  <h1>
                    {search
                      ? "A little something for you."
                      : category === "All pieces"
                        ? "Pieces to come home to."
                        : category + ". Made for living."}
                  </h1>
                  <p>
                    Considered design. Comfortable living. Find the piece that
                    belongs in your home.
                  </p>
                </div>
                <div className="category-tabs">
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="filter-bar">
                  <span>{filtered.length} thoughtfully chosen pieces</span>
                  <div>
                    <label className="inline-label">
                      <SlidersHorizontal size={16} />
                      <select
                        aria-label="Price filter"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      >
                        <option value="all">All prices</option>
                        <option value="under500">Under $500</option>
                        <option value="over500">$500 and above</option>
                      </select>
                    </label>
                    <select
                      aria-label="Sort products"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="featured">Featured</option>
                      <option value="low">Price: low to high</option>
                      <option value="high">Price: high to low</option>
                      <option value="name">Name: A–Z</option>
                    </select>
                  </div>
                </div>
                {filtered.length ? (
                  <div className="product-grid">
                    {filtered.map(productCard)}
                  </div>
                ) : (
                  empty(
                    "No pieces found.",
                    "Try another search or choose a different category.",
                  )
                )}
              </section>
            )}
            {product && (
              <section className="section">
                <button
                  className="underlined breadcrumb"
                  onClick={() => openShop(product.category)}
                >
                  Collection / {product.category}
                </button>
                <div className="product-detail">
                  <div className="detail-photo">
                    <img src={product.image} alt={product.name} />
                  </div>
                  <div className="detail-copy">
                    <span className="eyebrow">A PLACE IN YOUR EVERYDAY</span>
                    <h1>{product.name}</h1>
                    <p className="detail-price">{money(product.price)}</p>
                    <p>{product.description}</p>
                    <div className="color-choice">
                      <span className="swatch" />
                      {product.color}
                    </div>
                    <p className="availability">
                      {product.stock > 0 ? (
                        <>
                          <span className="stock-dot" />
                          {product.stock > 5
                            ? "In stock, ready for your home"
                            : `Only ${product.stock} left`}
                        </>
                      ) : (
                        "Currently sold out"
                      )}
                    </p>
                    <div className="detail-actions">
                      <button
                        className="button"
                        disabled={busy || !product.stock}
                        onClick={() =>
                          changeCart(
                            product,
                            (cart.find((x) => x.id === product.id)?.quantity ||
                              0) + 1,
                          )
                        }
                      >
                        <ShoppingBag size={18} />
                        {product.stock ? "Add to bag" : "Sold out"}
                      </button>
                      <button
                        className="outline-button"
                        aria-label="Save to wishlist"
                        onClick={() => wish(product)}
                      >
                        <Heart
                          fill={
                            wishlist.some((x) => x.id === product.id)
                              ? "currentColor"
                              : "none"
                          }
                          size={20}
                        />
                      </button>
                    </div>
                    <div className="detail-specs">
                      <div>
                        <span>Materials</span>
                        <strong>{product.material}</strong>
                      </div>
                      <div>
                        <span>Dimensions</span>
                        <strong>{product.dimensions}</strong>
                      </div>
                      <div>
                        <span>Delivery</span>
                        <strong>
                          5–10 business days · $49
                          <br />
                          Complimentary over $1,000
                        </strong>
                      </div>
                    </div>
                    <p className="small">
                      Pay on delivery. Keep your order number for any questions
                      about your purchase.
                    </p>
                  </div>
                </div>
              </section>
            )}
            {path === "/wishlist" && (
              <section className="section">
                <div className="page-intro">
                  <span className="eyebrow">KEEP THE ONES YOU LOVE CLOSE</span>
                  <h1>Your saved pieces.</h1>
                </div>
                {!user ? (
                  <button
                    className="button"
                    onClick={() => requireLogin("/wishlist")}
                  >
                    Sign in to view your wishlist
                  </button>
                ) : wishlist.length ? (
                  <div className="product-grid">
                    {wishlist.map(productCard)}
                  </div>
                ) : (
                  empty(
                    "A little room for favorites.",
                    "Tap the heart on any piece to save it here.",
                  )
                )}
              </section>
            )}
            {path === "/checkout" && (
              <section className="section">
                <div className="page-intro">
                  <span className="eyebrow">ALMOST HOME</span>
                  <h1>The finishing details.</h1>
                </div>
                {!user ? (
                  <button
                    className="button"
                    onClick={() => requireLogin("/checkout")}
                  >
                    Sign in to check out
                  </button>
                ) : !cart.length ? (
                  empty(
                    "Your bag is empty.",
                    "Find a piece that makes your space feel like home.",
                  )
                ) : (
                  <div className="checkout-grid">
                    <form
                      className="checkout-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const address = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        action(async () => {
                          const o = await api("/orders", {
                            method: "POST",
                            body: JSON.stringify({
                              requestKey: requestKey.current,
                              address,
                            }),
                          });
                          setSuccess(o);
                          setCart([]);
                          requestKey.current = crypto.randomUUID();
                          navigate("/order-confirmed");
                          api("/products")
                            .then(setProducts)
                            .catch(() => {});
                        });
                      }}
                    >
                      <h2>Where’s home?</h2>
                      <label>
                        Full name
                        <input
                          name="name"
                          defaultValue={user.name}
                          autoComplete="name"
                          minLength="2"
                          required
                        />
                      </label>
                      <label>
                        Phone number
                        <input
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          minLength="7"
                          required
                        />
                      </label>
                      <label>
                        Street address
                        <input
                          name="line1"
                          autoComplete="street-address"
                          placeholder="Street, building, apartment"
                          minLength="5"
                          required
                        />
                      </label>
                      <div className="form-row">
                        <label>
                          City
                          <input
                            name="city"
                            autoComplete="address-level2"
                            minLength="2"
                            required
                          />
                        </label>
                        <label>
                          Country
                          <input
                            name="country"
                            autoComplete="country-name"
                            minLength="2"
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Delivery notes <span className="muted">(optional)</span>
                        <textarea
                          name="notes"
                          rows="3"
                          maxLength="500"
                          placeholder="Anything that will help us find you?"
                        />
                      </label>
                      <div className="payment">
                        <CheckCircle2 size={22} />
                        <div>
                          <strong>Cash on delivery</strong>
                          <p>
                            Pay {money(subtotal + shipping)} when your furniture
                            arrives. No card details needed.
                          </p>
                        </div>
                      </div>
                      <p className="small">
                        Estimated delivery: 5–10 business days. Delivery
                        available where our store operates; confirm your service
                        area with the store before ordering.
                      </p>
                      <button className="button full" disabled={busy}>
                        {busy
                          ? "Placing your order…"
                          : "Place order · " + money(subtotal + shipping)}
                      </button>
                    </form>
                    <aside className="checkout-summary">
                      <h2>Coming home with you</h2>
                      {cartLines}
                      {summary}
                      <div className="secure-note">
                        <ShieldCheck size={18} /> Your order is securely saved.
                      </div>
                    </aside>
                  </div>
                )}
              </section>
            )}
            {path === "/order-confirmed" && (
              <section className="section confirmation">
                <CheckCircle2 size={50} strokeWidth={1.2} />
                <span className="eyebrow">SOMETHING GOOD IS ON ITS WAY</span>
                <h1>Make a little room.</h1>
                <p>
                  Your order has been placed. We can’t wait for your new pieces
                  to feel at home.
                </p>
                {success && (
                  <div className="confirmation-box">
                    <p>
                      Order{" "}
                      <strong>#{success.id.slice(0, 8).toUpperCase()}</strong>
                    </p>
                    <p>{money(success.total)} · Cash on delivery</p>
                    <p>
                      Delivery to {success.address.city} · 5–10 business days
                    </p>
                  </div>
                )}
                <button className="button" onClick={() => navigate("/orders")}>
                  View my orders
                </button>
                <button className="underlined" onClick={() => openShop()}>
                  Keep exploring
                </button>
              </section>
            )}
            {path === "/orders" && (
              <section className="section account-section">
                <div className="page-intro">
                  <span className="eyebrow">YOUR HOME, IN THE MAKING</span>
                  <h1>Your orders.</h1>
                </div>
                {!user ? (
                  <button
                    className="button"
                    onClick={() => requireLogin("/orders")}
                  >
                    Sign in to view orders
                  </button>
                ) : orderLoading ? (
                  <p>Loading your orders…</p>
                ) : orders.length ? (
                  orders.map((o) => <Order key={o.id} order={o} />)
                ) : (
                  empty(
                    "Your story starts here.",
                    "Your orders will appear here after your first checkout.",
                  )
                )}
              </section>
            )}
            {path === "/account" && (
              <section className="section account-section">
                <div className="page-intro">
                  <span className="eyebrow">YOUR OWN LITTLE CORNER</span>
                  <h1>
                    {user
                      ? "Hello, " + user.name.split(" ")[0] + "."
                      : "Welcome home."}
                  </h1>
                  <p>{user?.email}</p>
                </div>
                {user ? (
                  <>
                    <div className="account-links">
                      <button onClick={() => navigate("/orders")}>
                        <Package />
                        <strong>Your orders</strong>
                        <span>Follow your pieces home</span>
                      </button>
                      <button onClick={() => navigate("/wishlist")}>
                        <Heart />
                        <strong>Your wishlist</strong>
                        <span>All your favorites, together</span>
                      </button>
                      {user.role === "admin" && (
                        <button onClick={() => navigate("/admin")}>
                          <SlidersHorizontal />
                          <strong>Manage store</strong>
                          <span>Products, inventory & orders</span>
                        </button>
                      )}
                    </div>
                    <div className="account-actions">
                      <button
                        className="underlined"
                        onClick={() => setModal("password")}
                      >
                        Change password
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          action(async () => {
                            await api("/auth/logout", {
                              method: "POST",
                              body: "{}",
                            });
                            setUser(null);
                            setWishlist([]);
                            setCart(await api("/cart"));
                            navigate("/");
                          })
                        }
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="button"
                    onClick={() => requireLogin("/account")}
                  >
                    Sign in
                  </button>
                )}
              </section>
            )}
            {path === "/admin" && (
              <section className="section admin-section">
                <div className="page-intro">
                  <span className="eyebrow">BEHIND THE COMFORT</span>
                  <h1>Store studio.</h1>
                  <p>Keep your collection and customer orders in good shape.</p>
                </div>
                {user?.role !== "admin" ? (
                  <p className="error">Administrator access is required.</p>
                ) : (
                  <>
                    <div className="stats">
                      <div>
                        <span>Catalog pieces</span>
                        <strong>{adminProducts.length}</strong>
                      </div>
                      <div>
                        <span>Orders</span>
                        <strong>{adminOrders.length}</strong>
                      </div>
                      <div>
                        <span>Order value · excluding cancelled</span>
                        <strong>
                          {money(
                            adminOrders
                              .filter((o) => o.status !== "cancelled")
                              .reduce((s, o) => s + o.total, 0),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Low stock · 5 or fewer</span>
                        <strong>
                          {
                            adminProducts.filter(
                              (p) => p.stock <= 5 && p.active,
                            ).length
                          }
                        </strong>
                      </div>
                    </div>
                    <div className="admin-toolbar">
                      <div className="category-tabs">
                        <button
                          className={adminTab === "products" ? "selected" : ""}
                          onClick={() => setAdminTab("products")}
                        >
                          Products & inventory
                        </button>
                        <button
                          className={adminTab === "orders" ? "selected" : ""}
                          onClick={() => setAdminTab("orders")}
                        >
                          Orders
                        </button>
                      </div>
                      {adminTab === "products" && (
                        <button
                          className="button"
                          onClick={() => {
                            setEditProduct({
                              name: "",
                              category: "Sofas",
                              price: 10000,
                              description: "",
                              material: "",
                              dimensions: "",
                              color: "",
                              image: "/images/sofa.jpg",
                              stock: 0,
                              featured: 0,
                              active: 1,
                            });
                            setModal("product");
                          }}
                        >
                          <Plus size={17} />
                          Add product
                        </button>
                      )}
                    </div>
                    {adminTab === "products" ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Price</th>
                              <th>Stock</th>
                              <th>Visibility</th>
                              <th>Edit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminProducts.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <div className="table-product">
                                    <img src={p.image} alt="" />
                                    <div>
                                      <strong>{p.name}</strong>
                                      <small>{p.category}</small>
                                    </div>
                                  </div>
                                </td>
                                <td>{money(p.price)}</td>
                                <td>{p.stock}</td>
                                <td>{p.active ? "Published" : "Archived"}</td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={"Edit " + p.name}
                                    onClick={() => {
                                      setEditProduct(p);
                                      setModal("product");
                                    }}
                                  >
                                    <Pencil size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : adminOrders.length ? (
                      adminOrders.map((o) => (
                        <Order
                          key={o.id}
                          order={o}
                          admin
                          busy={busy}
                          onStatus={(status) =>
                            action(async () => {
                              await api("/admin/orders/" + o.id, {
                                method: "PATCH",
                                body: JSON.stringify({ status }),
                              });
                              await loadAdmin();
                              setToast("Order updated");
                            })
                          }
                        />
                      ))
                    ) : (
                      empty(
                        "No orders yet.",
                        "New customer orders will appear here.",
                      )
                    )}
                  </>
                )}
              </section>
            )}
            {![
              "/",
              "/shop",
              "/wishlist",
              "/checkout",
              "/order-confirmed",
              "/orders",
              "/account",
              "/admin",
            ].includes(path) &&
              !product &&
              empty(
                "This room is still empty.",
                "We couldn’t find that page. Explore the collection instead.",
              )}
          </>
        )}
        {error && !modal && (
          <div className="global-error" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
      </main>
      <footer>
        <div>
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            hearth <i>&</i> form
          </a>
          <p>Good pieces. Better everyday living.</p>
        </div>
        <div className="footer-links">
          <button onClick={() => openShop()}>The collection</button>
          <button
            onClick={() =>
              user ? navigate("/orders") : requireLogin("/orders")
            }
          >
            Your orders
          </button>
          <button onClick={() => setModal("delivery")}>Delivery & care</button>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Hearth & Form</span>
          <span>Made for the way you live.</span>
          <span>USD · Cash on delivery</span>
        </div>
      </footer>
      <dialog
        ref={dialog}
        className={"dialog " + (modal === "cart" ? "cart-dialog" : "")}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setModal(null);
        }}
      >
        <div className="dialog-content">
          <button
            className="close-dialog icon-button"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={22} />
          </button>
          {modal === "auth" && authForm}
          {modal === "cart" && (
            <>
              <span className="eyebrow">GOOD CHOICES, ALL YOURS</span>
              <h2>
                Your bag <span className="muted">({count})</span>
              </h2>
              {cart.length ? (
                <>
                  {cartLines}
                  <p className="delivery-progress">
                    {subtotal >= 100000
                      ? "Lovely. Your delivery is on us."
                      : `${money(100000 - subtotal)} away from complimentary delivery.`}
                  </p>
                  {summary}
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className="button full"
                    onClick={() => {
                      setModal(null);
                      if (user) navigate("/checkout");
                      else requireLogin("/checkout");
                    }}
                  >
                    Continue to checkout
                  </button>
                  <button
                    className="underlined continue"
                    onClick={() => {
                      setModal(null);
                      openShop();
                    }}
                  >
                    Keep exploring
                  </button>
                </>
              ) : (
                <div className="empty">
                  <ShoppingBag size={38} strokeWidth={1} />
                  <h3>Room for something lovely.</h3>
                  <p>Your bag is waiting for your favorite pieces.</p>
                  <button
                    className="button"
                    onClick={() => {
                      setModal(null);
                      openShop();
                    }}
                  >
                    Explore the collection
                  </button>
                </div>
              )}
            </>
          )}
          {modal === "password" && (
            <>
              <h2>A fresh password.</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  action(async () => {
                    await api("/auth/password", {
                      method: "PUT",
                      body: JSON.stringify(data),
                    });
                    setUser(null);
                    setWishlist([]);
                    setModal(null);
                    setToast("Password changed. Please sign in again.");
                    navigate("/account");
                  });
                }}
              >
                <label>
                  Current password
                  <input
                    type="password"
                    name="currentPassword"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    minLength="10"
                    maxLength="72"
                    required
                  />
                </label>
                {error && <p className="error">{error}</p>}
                <button className="button full" disabled={busy}>
                  Update password
                </button>
              </form>
            </>
          )}
          {modal === "delivery" && (
            <>
              <span className="eyebrow">THE LITTLE DETAILS</span>
              <h2>From our store to your home.</h2>
              <h3>Delivery</h3>
              <p>
                Standard delivery is $49, or complimentary on orders of $1,000
                or more. Allow 5–10 business days. Payment is collected on
                delivery.
              </p>
              <h3>Furniture care</h3>
              <p>
                Wipe wood with a soft, dry cloth. Blot spills promptly and keep
                furniture out of prolonged direct sunlight. Vacuum upholstery
                gently with a brush attachment.
              </p>
              <h3>Need to make a change?</h3>
              <p>
                Keep your order number handy when contacting the store. Orders
                can be cancelled by the store team before they ship.
              </p>
            </>
          )}
          {modal === "product" && editProduct && (
            <>
              <span className="eyebrow">CURATE THE COLLECTION</span>
              <h2>{editProduct.id ? "Edit piece" : "A new piece."}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  const p = {
                    ...f,
                    price: Math.round(Number(f.price) * 100),
                    stock: Number(f.stock),
                    featured: f.featured === "on" ? 1 : 0,
                    active: f.active === "on" ? 1 : 0,
                  };
                  action(async () => {
                    await api(
                      "/admin/products" +
                        (editProduct.id ? "/" + editProduct.id : ""),
                      {
                        method: editProduct.id ? "PUT" : "POST",
                        body: JSON.stringify(p),
                      },
                    );
                    await loadAdmin();
                    setProducts(await api("/products"));
                    setModal(null);
                    setToast("Product saved");
                  });
                }}
              >
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={editProduct.name}
                    required
                    minLength="2"
                    maxLength="100"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Category
                    <select name="category" defaultValue={editProduct.category}>
                      {categories.slice(1).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Price (USD)
                    <input
                      name="price"
                      type="number"
                      min="1"
                      step="0.01"
                      defaultValue={editProduct.price / 100}
                      required
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={editProduct.description}
                    minLength="10"
                    maxLength="2000"
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    Material
                    <input
                      name="material"
                      defaultValue={editProduct.material}
                    />
                  </label>
                  <label>
                    Dimensions
                    <input
                      name="dimensions"
                      defaultValue={editProduct.dimensions}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Color
                    <input name="color" defaultValue={editProduct.color} />
                  </label>
                  <label>
                    Stock
                    <input
                      name="stock"
                      type="number"
                      min="0"
                      max="100000"
                      defaultValue={editProduct.stock}
                      required
                    />
                  </label>
                </div>
                <label>
                  Image URL
                  <input
                    name="image"
                    defaultValue={editProduct.image}
                    placeholder="https://…"
                    required
                  />
                </label>
                <div className="form-row">
                  <label className="check-label">
                    <input
                      name="featured"
                      type="checkbox"
                      defaultChecked={!!editProduct.featured}
                    />{" "}
                    House favorite
                  </label>
                  <label className="check-label">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={!!editProduct.active}
                    />{" "}
                    Published
                  </label>
                </div>
                {error && <p className="error">{error}</p>}
                <button className="button full" disabled={busy}>
                  {busy ? "Saving…" : "Save product"}
                </button>
              </form>
            </>
          )}
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </>
  );
}
function Order({ order: o, admin, onStatus, busy }) {
  const transitions = {
    confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
  };
  return (
    <article className="order">
      <div className="order-heading">
        <div>
          <strong>Order #{o.id.slice(0, 8).toUpperCase()}</strong>
          <span>
            {new Date(o.created_at).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <span className={"status " + o.status}>{o.status}</span>
      </div>
      {o.items.map((i) => (
        <div className="order-item" key={i.id}>
          <img src={i.image} alt={i.name} />
          <div>
            <strong>{i.name}</strong>
            <p>
              Quantity {i.quantity} · {money(i.price)} each
            </p>
          </div>
          <strong>{money(i.quantity * i.price)}</strong>
        </div>
      ))}
      <div className="order-footer">
        <div>
          <strong>{admin ? o.customer_name : o.address.name}</strong>
          <p>
            {o.address.line1}, {o.address.city}, {o.address.country}
          </p>
          <p>
            {o.address.phone}
            {admin ? " · " + o.customer_email : ""}
          </p>
          {o.address.notes && <p>Note: {o.address.notes}</p>}
        </div>
        <div>
          <strong>Total {money(o.total)}</strong>
          <p>
            Cash on delivery ·{" "}
            {o.status === "cancelled"
              ? "No payment due"
              : o.status === "delivered"
                ? "Delivery completed"
                : "Payment due on arrival"}
          </p>
        </div>
      </div>
      {admin && transitions[o.status]?.length > 0 && (
        <div className="status-controls">
          <label>
            Update order
            <select
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onStatus(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Choose next status
              </option>
              {transitions[o.status].map((s) => (
                <option key={s} value={s}>
                  {s === "cancelled" ? "Cancel & restore inventory" : s}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </article>
  );
}
createRoot(document.getElementById("root")).render(<App />);
