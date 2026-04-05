import { useEffect, useState } from 'react';
import { supabase, User, Product, Order, Complaint } from './lib/supabase';
import { daysFromNow, formatDate, formatTime, generateOrderNumber, showToast, getProductImage } from './lib/utils';
import './farmconnect.css';

interface CartItem extends Product {
  qty: number;
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authRole, setAuthRole] = useState<'farmer' | 'user' | 'admin' | 'delivery'>('user');
  const [authStep, setAuthStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [farmers, setFarmers] = useState<User[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [activePage, setActivePage] = useState('dash');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadData();
      setupRealtime();
    }
  }, [currentUser]);

  async function loadData() {
    try {
      const { data: productsData } = await supabase
        .from('products')
        .select(`
          *,
          farmer:users!products_farmer_id_fkey(name)
        `)
        .gt('expiry_date', new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false });

      if (productsData) {
        setProducts(productsData.map(p => ({
          ...p,
          farmer: p.farmer
        })) as unknown as Product[]);
      }

      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(name, phone),
          farmer:users!orders_farmer_id_fkey(name),
          delivery_partner:users!orders_delivery_partner_id_fkey(name)
        `)
        .order('created_at', { ascending: false });

      if (ordersData) {
        setOrders(ordersData as unknown as Order[]);
      }

      const { data: complaintsData } = await supabase
        .from('complaints')
        .select(`
          *,
          user:users!complaints_user_id_fkey(name),
          order:orders(order_number)
        `)
        .order('created_at', { ascending: false });

      if (complaintsData) {
        setComplaints(complaintsData as unknown as Complaint[]);
      }

      if (currentUser?.role === 'admin') {
        const { data: farmersData } = await supabase
          .from('users')
          .select('*')
          .eq('role', 'farmer');

        if (farmersData) {
          setFarmers(farmersData);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  function setupRealtime() {
    const ordersChannel = supabase
      .channel('orders-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();

    const productsChannel = supabase
      .channel('products-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      ordersChannel.unsubscribe();
      productsChannel.unsubscribe();
    };
  }

  async function handleLogin() {
    if (authStep === 1) {
      if (!phone || phone.length < 10) {
        showToast('Enter a valid phone number');
        return;
      }
      setAuthStep(2);
      showToast('OTP sent! Use 1234 for demo');
      return;
    }

    const otpValue = otp.join('');
    if (otpValue !== '1234') {
      showToast('Invalid OTP. Use 1234 for demo');
      return;
    }

    try {
      let { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone)
        .eq('role', authRole)
        .maybeSingle();

      if (!user) {
        const { data: newUser, error } = await supabase
          .from('users')
          .insert([
            {
              phone,
              name: authRole === 'farmer' ? 'New Farmer' : authRole === 'delivery' ? 'New Driver' : authRole === 'admin' ? 'Admin' : 'New User',
              role: authRole,
              location: 'Tirupati, AP',
              status: 'active',
            },
          ])
          .select()
          .single();

        if (error) throw error;
        user = newUser;
      }

      setCurrentUser(user);
      setShowAuth(false);
      setAuthStep(1);
      setOtp(['', '', '', '']);
      setPhone('');
      showToast(`Welcome ${user.name}!`);
    } catch (error) {
      console.error('Login error:', error);
      showToast('Login failed. Please try again.');
    }
  }

  function openAuth(role: 'farmer' | 'user' | 'admin' | 'delivery') {
    setAuthRole(role);
    setShowAuth(true);
    setAuthStep(1);
  }

  function logout() {
    setCurrentUser(null);
    setCart([]);
    showToast('Logged out successfully');
  }

  async function addProduct(formData: {
    name: string;
    category: string;
    price: number;
    unit: string;
    stock: number;
    harvest_date: string;
    expiry_date: string;
    image_url: string;
    description: string;
  }) {
    try {
      const { error } = await supabase.from('products').insert([
        {
          ...formData,
          farmer_id: currentUser!.id,
        },
      ]);

      if (error) throw error;
      showToast('Product added successfully!');
      loadData();
    } catch (error) {
      console.error('Error adding product:', error);
      showToast('Failed to add product');
    }
  }

  async function updateProductPrice(productId: string, newPrice: number) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ price: newPrice })
        .eq('id', productId);

      if (error) throw error;
      showToast('Price updated!');
      loadData();
    } catch (error) {
      console.error('Error updating price:', error);
      showToast('Failed to update price');
    }
  }

  async function deleteProduct(productId: string) {
    if (!confirm('Remove this product?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      showToast('Product removed');
      loadData();
    } catch (error) {
      console.error('Error deleting product:', error);
      showToast('Failed to remove product');
    }
  }

  function addToCart(product: Product) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
    showToast(`${product.name} added to cart`);
  }

  function updateCartQty(productId: string, delta: number) {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }).filter(item => item.qty > 0));
  }

  async function placeOrder() {
    if (cart.length === 0) {
      showToast('Cart is empty');
      return;
    }

    try {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
      const total = subtotal + 25;

      const orderItems = cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        img: item.image_url || getProductImage(item.name),
        unit: item.unit,
      }));

      const { error } = await supabase.from('orders').insert([
        {
          order_number: generateOrderNumber(),
          user_id: currentUser!.id,
          farmer_id: cart[0].farmer_id,
          items: orderItems,
          total_amount: total,
          status: 'pending',
        },
      ]);

      if (error) throw error;

      setCart([]);
      showToast('Order placed successfully!');
      loadData();
      setActivePage('orders');
    } catch (error) {
      console.error('Error placing order:', error);
      showToast('Failed to place order');
    }
  }

  async function updateOrderStatus(orderId: string, status: string, deliveryPartnerId?: string) {
    try {
      const updateData: any = { status };
      if (deliveryPartnerId) {
        updateData.delivery_partner_id = deliveryPartnerId;
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;
      showToast(`Order status updated to ${status}`);
      loadData();
    } catch (error) {
      console.error('Error updating order:', error);
      showToast('Failed to update order');
    }
  }

  async function submitComplaint(orderId: string, type: string, description: string) {
    try {
      const { error } = await supabase.from('complaints').insert([
        {
          user_id: currentUser!.id,
          order_id: orderId,
          type,
          description,
          status: 'open',
        },
      ]);

      if (error) throw error;
      showToast('Complaint submitted successfully');
      loadData();
    } catch (error) {
      console.error('Error submitting complaint:', error);
      showToast('Failed to submit complaint');
    }
  }

  async function updateComplaintStatus(complaintId: string, status: string) {
    try {
      const { error} = await supabase
        .from('complaints')
        .update({ status })
        .eq('id', complaintId);

      if (error) throw error;
      showToast(`Complaint marked as ${status}`);
      loadData();
    } catch (error) {
      console.error('Error updating complaint:', error);
      showToast('Failed to update complaint');
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const myProducts = currentUser?.role === 'farmer'
    ? products.filter(p => p.farmer_id === currentUser.id)
    : [];

  const myOrders = currentUser
    ? orders.filter(o =>
        o.user_id === currentUser.id ||
        o.farmer_id === currentUser.id ||
        o.delivery_partner_id === currentUser.id
      )
    : [];

  const pendingOrdersCount = currentUser?.role === 'farmer'
    ? orders.filter(o => o.farmer_id === currentUser.id && o.status === 'pending').length
    : 0;

  const availableDeliveries = orders.filter(o => o.status === 'accepted' && !o.delivery_partner_id);

  if (!currentUser) {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,700;1,9..144,400&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
        <div id="landing">
          <div className="land-noise"></div>
          <div className="land-glow"></div>
          <div className="land-glow2"></div>
          <nav className="land-nav">
            <div className="brand">
              <div className="leaf-logo">
                <svg viewBox="0 0 42 42" fill="none">
                  <ellipse cx="21" cy="21" rx="18" ry="18" fill="rgba(46,122,60,0.2)" />
                  <path d="M21 6C13 6 8 13 8 20c0 5 3 9 7 11.5.7-4.5 3-8.5 6-11-3 3-4.5 7-4.5 11 1.5.3 3 .5 4.5.5 8 0 13-7 13-13.5C34 11 28 6 21 6z" fill="#4aa85c" />
                </svg>
              </div>
              <span className="brand-name">Farm<span>Connect</span></span>
            </div>
            <div className="land-tag">🌿 Fresh • Local • Trusted</div>
          </nav>
          <div className="land-hero">
            <div className="hero-eyebrow">India's Farm-Direct Marketplace</div>
            <h1 className="hero-h1">Fresh from the<br /><em>field</em> to your table</h1>
            <p className="hero-sub">Connect directly with farmers. Get the freshest produce, daily harvested, delivered to your doorstep.</p>
            <div className="hero-img-strip">
              <div className="hero-img-item"><img src="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&h=130&fit=crop" alt="tomatoes" /></div>
              <div className="hero-img-item"><img src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=200&h=130&fit=crop" alt="spinach" /></div>
              <div className="hero-img-item"><img src="https://images.unsplash.com/photo-1564093497595-593b96d80180?w=200&h=130&fit=crop" alt="carrots" /></div>
              <div className="hero-img-item"><img src="https://images.unsplash.com/photo-1553279768-865429fa0078?w=200&h=130&fit=crop" alt="mangoes" /></div>
              <div className="hero-img-item"><img src="https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=200&h=130&fit=crop" alt="peppers" /></div>
            </div>
            <div className="roles-grid">
              <div className="role-btn" onClick={() => openAuth('farmer')}>
                <div className="role-ico f">🌾</div>
                <h3>Farmer</h3>
                <p>List products & manage orders</p>
              </div>
              <div className="role-btn" onClick={() => openAuth('user')}>
                <div className="role-ico u">🛒</div>
                <h3>Consumer</h3>
                <p>Browse & order farm fresh</p>
              </div>
              <div className="role-btn" onClick={() => openAuth('admin')}>
                <div className="role-ico a">⚙️</div>
                <h3>Admin</h3>
                <p>Manage the platform</p>
              </div>
              <div className="role-btn" onClick={() => openAuth('delivery')}>
                <div className="role-ico d">🚚</div>
                <h3>Delivery</h3>
                <p>Accept & track deliveries</p>
              </div>
            </div>
          </div>
        </div>

        {showAuth && (
          <div className={`overlay ${showAuth ? 'on' : ''}`}>
            <div className="auth-box">
              <button className="modal-x" onClick={() => setShowAuth(false)}>✕</button>
              <div className="auth-brand">
                <div className="leaf-logo">
                  <svg viewBox="0 0 42 42" fill="none">
                    <path d="M21 6C13 6 8 13 8 20c0 5 3 9 7 11.5.7-4.5 3-8.5 6-11-3 3-4.5 7-4.5 11 1.5.3 3 .5 4.5.5 8 0 13-7 13-13.5C34 11 28 6 21 6z" fill="#2e7a3c" />
                  </svg>
                </div>
                <span>FarmConnect</span>
              </div>
              <div className="auth-role-pill">
                {authRole === 'farmer' ? '🌾 Farmer Login' :
                 authRole === 'user' ? '🛒 Consumer Login' :
                 authRole === 'admin' ? '⚙️ Admin Login' : '🚚 Delivery Partner'}
              </div>

              {authStep === 1 ? (
                <>
                  <h2>Welcome back 👋</h2>
                  <p>Enter your mobile number to receive OTP</p>
                  <div className="inp-group">
                    <label>Mobile Number</label>
                    <div className="inp-wrap">
                      <i>📱</i>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        maxLength={15}
                      />
                    </div>
                  </div>
                  <button className="btn-main" onClick={handleLogin}>Send OTP →</button>
                </>
              ) : (
                <>
                  <h2>Verify OTP 🔐</h2>
                  <p>OTP sent to {phone}</p>
                  <div className="inp-group">
                    <label>Enter 4-digit OTP</label>
                    <div className="otp-boxes">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => {
                            const newOtp = [...otp];
                            newOtp[i] = e.target.value;
                            setOtp(newOtp);
                            if (e.target.value && i < 3) {
                              document.getElementById(`otp-${i + 1}`)?.focus();
                            }
                          }}
                          id={`otp-${i}`}
                        />
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--txt3)', marginTop: '8px' }}>
                      Demo OTP: <strong>1234</strong>
                    </p>
                  </div>
                  <button className="btn-main" onClick={handleLogin}>Login →</button>
                  <button className="btn-ghost" onClick={() => setAuthStep(1)}>← Change Number</button>
                </>
              )}
            </div>
          </div>
        )}
        <div id="toast" className="toast"></div>
      </>
    );
  }

  if (currentUser.role === 'user' && activePage === 'products') {
    setActivePage('products');
  } else if (activePage === 'products') {
    setActivePage('dash');
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,700;1,9..144,400&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <div className="app-shell on">
        <div className="sidebar">
          <div className="sb-brand">
            <div className="leaf-logo">
              <svg viewBox="0 0 42 42" fill="none">
                <path d="M21 6C13 6 8 13 8 20c0 5 3 9 7 11.5.7-4.5 3-8.5 6-11-3 3-4.5 7-4.5 11 1.5.3 3 .5 4.5.5 8 0 13-7 13-13.5C34 11 28 6 21 6z" fill="#4aa85c" />
              </svg>
            </div>
            <span>FarmConnect</span>
          </div>
          <div className="sb-user">
            <div className="sb-av">
              {currentUser.role === 'farmer' ? '👨‍🌾' :
               currentUser.role === 'delivery' ? '🚚' :
               currentUser.role === 'admin' ? '⚙️' : '👤'}
            </div>
            <div className="sb-uname">{currentUser.name}</div>
            <div className="sb-urole">
              {currentUser.role === 'farmer' ? `🌾 Farmer · ${currentUser.location}` :
               currentUser.role === 'delivery' ? '🚚 Delivery Partner' :
               currentUser.role === 'admin' ? '🔧 Admin' : '🛒 Consumer'}
            </div>
          </div>
          <nav className="sb-nav">
            {currentUser.role === 'user' && (
              <>
                <div className="sb-sec">Shop</div>
                <div className={`nav-it ${activePage === 'products' ? 'act' : ''}`} onClick={() => setActivePage('products')}>
                  <span className="ni">🌿</span>Browse Products
                </div>
                <div className={`nav-it ${activePage === 'cart' ? 'act' : ''}`} onClick={() => setActivePage('cart')}>
                  <span className="ni">🛒</span>Cart
                  {cart.length > 0 && <span className="nbadge">{cart.reduce((sum, item) => sum + item.qty, 0)}</span>}
                </div>
                <div className={`nav-it ${activePage === 'orders' ? 'act' : ''}`} onClick={() => setActivePage('orders')}>
                  <span className="ni">📦</span>My Orders
                </div>
                <div className="sb-sec">Support</div>
                <div className={`nav-it ${activePage === 'complaints' ? 'act' : ''}`} onClick={() => setActivePage('complaints')}>
                  <span className="ni">📢</span>Complaints
                </div>
              </>
            )}
            {currentUser.role === 'farmer' && (
              <>
                <div className="sb-sec">Dashboard</div>
                <div className={`nav-it ${activePage === 'dash' ? 'act' : ''}`} onClick={() => setActivePage('dash')}>
                  <span className="ni">📊</span>Overview
                </div>
                <div className="sb-sec">Products</div>
                <div className={`nav-it ${activePage === 'add' ? 'act' : ''}`} onClick={() => setActivePage('add')}>
                  <span className="ni">➕</span>Add Product
                </div>
                <div className={`nav-it ${activePage === 'mine' ? 'act' : ''}`} onClick={() => setActivePage('mine')}>
                  <span className="ni">🌿</span>My Products
                </div>
                <div className="sb-sec">Business</div>
                <div className={`nav-it ${activePage === 'orders' ? 'act' : ''}`} onClick={() => setActivePage('orders')}>
                  <span className="ni">📦</span>Orders
                  {pendingOrdersCount > 0 && <span className="nbadge">{pendingOrdersCount}</span>}
                </div>
              </>
            )}
            {currentUser.role === 'delivery' && (
              <>
                <div className="sb-sec">Dashboard</div>
                <div className={`nav-it ${activePage === 'dash' ? 'act' : ''}`} onClick={() => setActivePage('dash')}>
                  <span className="ni">📊</span>Overview
                </div>
                <div className="sb-sec">Deliveries</div>
                <div className={`nav-it ${activePage === 'available' ? 'act' : ''}`} onClick={() => setActivePage('available')}>
                  <span className="ni">📋</span>Available
                  {availableDeliveries.length > 0 && <span className="nbadge">{availableDeliveries.length}</span>}
                </div>
                <div className={`nav-it ${activePage === 'active' ? 'act' : ''}`} onClick={() => setActivePage('active')}>
                  <span className="ni">🚚</span>Active Delivery
                </div>
              </>
            )}
            {currentUser.role === 'admin' && (
              <>
                <div className="sb-sec">Overview</div>
                <div className={`nav-it ${activePage === 'dash' ? 'act' : ''}`} onClick={() => setActivePage('dash')}>
                  <span className="ni">📊</span>Dashboard
                </div>
                <div className="sb-sec">Management</div>
                <div className={`nav-it ${activePage === 'farmers' ? 'act' : ''}`} onClick={() => setActivePage('farmers')}>
                  <span className="ni">🌾</span>Farmers
                </div>
                <div className={`nav-it ${activePage === 'orders' ? 'act' : ''}`} onClick={() => setActivePage('orders')}>
                  <span className="ni">📦</span>All Orders
                </div>
                <div className="sb-sec">Support</div>
                <div className={`nav-it ${activePage === 'complaints' ? 'act' : ''}`} onClick={() => setActivePage('complaints')}>
                  <span className="ni">📢</span>Complaints
                  {complaints.filter(c => c.status === 'open').length > 0 && (
                    <span className="nbadge">{complaints.filter(c => c.status === 'open').length}</span>
                  )}
                </div>
              </>
            )}
          </nav>
          <div className="sb-foot">
            <button className="btn-logout" onClick={logout}>🚪 Sign Out</button>
          </div>
        </div>

        <div className="main">
          {currentUser.role === 'user' && activePage === 'products' && (
            <UserProductsPage
              filteredProducts={filteredProducts}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              addToCart={addToCart}
            />
          )}

          {currentUser.role === 'user' && activePage === 'cart' && (
            <UserCartPage
              cart={cart}
              updateCartQty={updateCartQty}
              placeOrder={placeOrder}
            />
          )}

          {currentUser.role === 'user' && activePage === 'orders' && (
            <UserOrdersPage myOrders={myOrders} />
          )}

          {currentUser.role === 'user' && activePage === 'complaints' && (
            <UserComplaintsPage myOrders={myOrders} submitComplaint={submitComplaint} />
          )}

          {currentUser.role === 'farmer' && activePage === 'add' && (
            <FarmerAddProductPage addProduct={addProduct} />
          )}

          {currentUser.role === 'farmer' && activePage === 'mine' && (
            <FarmerMyProductsPage
              myProducts={myProducts}
              updateProductPrice={updateProductPrice}
              deleteProduct={deleteProduct}
            />
          )}

          {currentUser.role === 'farmer' && activePage === 'orders' && (
            <FarmerOrdersPage myOrders={myOrders} updateOrderStatus={updateOrderStatus} />
          )}

          {currentUser.role === 'delivery' && activePage === 'available' && (
            <DeliveryAvailablePage
              availableDeliveries={availableDeliveries}
              currentUserId={currentUser.id}
              updateOrderStatus={updateOrderStatus}
            />
          )}

          {currentUser.role === 'delivery' && activePage === 'active' && (
            <DeliveryActivePage orders={orders} currentUserId={currentUser.id} updateOrderStatus={updateOrderStatus} />
          )}

          {currentUser.role === 'admin' && activePage === 'dash' && (
            <AdminDashPage farmers={farmers} orders={orders} products={products} />
          )}

          {currentUser.role === 'admin' && activePage === 'farmers' && (
            <AdminFarmersPage farmers={farmers} products={products} loadData={loadData} />
          )}

          {currentUser.role === 'admin' && activePage === 'orders' && (
            <AdminOrdersPage orders={orders} />
          )}

          {currentUser.role === 'admin' && activePage === 'complaints' && (
            <AdminComplaintsPage complaints={complaints} updateComplaintStatus={updateComplaintStatus} />
          )}
        </div>
      </div>
      <div id="toast" className="toast"></div>
    </>
  );
}

function UserProductsPage({ filteredProducts, categoryFilter, setCategoryFilter, searchQuery, setSearchQuery, addToCart }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Fresh Produce 🌾</h1>
          <p>Directly from local farmers</p>
        </div>
      </div>
      <div className="filter-bar">
        <input
          type="text"
          className="search-inp"
          placeholder="Search tomatoes, mangoes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {['All', 'Vegetables', 'Fruits', 'Leafy Greens', 'Spices', 'Grains'].map(cat => (
          <button
            key={cat}
            className={`filter-pill ${categoryFilter === cat ? 'act' : ''}`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="prod-grid">
        {filteredProducts.map((product: Product) => {
          const daysLeft = daysFromNow(product.expiry_date);
          const img = product.image_url || getProductImage(product.name);
          return (
            <div key={product.id} className="prod-card">
              <div className="prod-img">
                <img src={img} alt={product.name} />
                <div className="exp-ribbon">
                  <span className={`tag ${daysLeft <= 2 ? 'r' : daysLeft <= 4 ? 'a' : 'g'}`} style={{ fontSize: '10px' }}>
                    {daysLeft <= 2 ? `⚠️ Exp in ${daysLeft}d` : daysLeft <= 4 ? `📅 ${daysLeft}d left` : '✓ Fresh'}
                  </span>
                </div>
                <div className="farmer-badge">🌾 {(product.farmer as any)?.name || 'Farmer'}</div>
              </div>
              <div className="prod-body">
                <div className="prod-name">{product.name}</div>
                <div className="prod-cat">{product.category}</div>
                <div className="prod-foot">
                  <div>
                    <div className="prod-price">₹{product.price}</div>
                    <div className="prod-unit">{product.unit}</div>
                  </div>
                  <button className="btn-cart" onClick={() => addToCart(product)}>+ Cart</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UserCartPage({ cart, updateCartQty, placeOrder }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>My Cart 🛒</h1>
          <p>Review your selections</p>
        </div>
      </div>
      <div className="two-col">
        <div className="sec">
          <div className="sec-h"><h2>Items</h2></div>
          <div className="sec-b">
            {cart.length === 0 ? (
              <div className="empty-state">
                <div className="es-ico">🛒</div>
                <h3>Your cart is empty</h3>
                <p>Browse products and add items</p>
              </div>
            ) : (
              cart.map((item: CartItem) => (
                <div key={item.id} className="cart-it">
                  <div className="cart-img">
                    <img src={item.image_url || getProductImage(item.name)} alt={item.name} />
                  </div>
                  <div className="cart-info">
                    <div className="cart-name">{item.name}</div>
                    <div className="cart-sub">₹{item.price} {item.unit}</div>
                  </div>
                  <div className="qty-ctrl">
                    <button className="qbtn" onClick={() => updateCartQty(item.id, -1)}>−</button>
                    <span className="qval">{item.qty}</span>
                    <button className="qbtn" onClick={() => updateCartQty(item.id, 1)}>+</button>
                  </div>
                  <div className="cart-price">₹{item.price * item.qty}</div>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="sec">
            <div className="sec-h"><h2>Order Summary</h2></div>
            <div className="sec-b">
              {cart.length > 0 ? (
                <>
                  <div className="sum-row">
                    <span>Subtotal ({cart.reduce((s: number, c: CartItem) => s + c.qty, 0)} items)</span>
                    <span>₹{cart.reduce((s: number, c: CartItem) => s + c.price * c.qty, 0)}</span>
                  </div>
                  <div className="sum-row">
                    <span>Delivery Fee</span>
                    <span>₹25</span>
                  </div>
                  <div className="sum-row">
                    <span>Total</span>
                    <span>₹{cart.reduce((s: number, c: CartItem) => s + c.price * c.qty, 0) + 25}</span>
                  </div>
                  <button className="btn-main" style={{ marginTop: '14px' }} onClick={placeOrder}>
                    Place Order →
                  </button>
                </>
              ) : (
                <div style={{ color: 'var(--txt3)', fontSize: '13px', textAlign: 'center' }}>
                  Cart is empty
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserOrdersPage({ myOrders }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>My Orders 📦</h1>
          <p>Track your deliveries in real-time</p>
        </div>
        <span className="rt-badge">Live Tracking</span>
      </div>
      {myOrders.length === 0 ? (
        <div className="empty-state">
          <div className="es-ico">📦</div>
          <h3>No orders found</h3>
          <p>Your orders will appear here after placing</p>
        </div>
      ) : (
        myOrders.map((order: Order) => (
          <div key={order.id} className="order-card">
            <div className="order-card-head">
              <div>
                <div className="oc-id">{order.order_number}</div>
                <div className="oc-date">{formatDate(order.created_at)} at {formatTime(order.created_at)}</div>
              </div>
              <span className={`tag ${order.status === 'delivered' ? 'g' : order.status === 'cancelled' ? 'r' : order.status === 'out' ? 'b' : 'a'}`}>
                {order.status === 'pending' && '⏳ Pending'}
                {order.status === 'accepted' && '✅ Accepted'}
                {order.status === 'out' && '🚚 Out for Delivery'}
                {order.status === 'delivered' && '✓ Delivered'}
                {order.status === 'cancelled' && '✕ Cancelled'}
              </span>
            </div>
            <div className="oc-items">
              {order.items.map((item: any, i: number) => (
                <span key={i}>
                  <img src={item.img} style={{ width: '22px', height: '22px', borderRadius: '5px', objectFit: 'cover', verticalAlign: 'middle' }} alt="" />
                  {' '}{item.name} ×{item.qty}{i < order.items.length - 1 ? ' · ' : ''}
                </span>
              ))}
              {' '}| <strong>₹{order.total_amount}</strong>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function UserComplaintsPage({ myOrders, submitComplaint }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Complaints & Support 📢</h1>
          <p>We resolve issues within 24 hours</p>
        </div>
      </div>
      <div className="sec">
        <div className="sec-h"><h2>Raise a Complaint</h2></div>
        <div className="sec-b">
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const orderId = formData.get('order_id') as string;
            const type = formData.get('type') as string;
            const description = formData.get('description') as string;
            if (orderId && description) {
              submitComplaint(orderId, type, description);
              e.currentTarget.reset();
            } else {
              showToast('Please fill all fields');
            }
          }}>
            <div className="form-grid">
              <div className="f-field">
                <label>Order ID</label>
                <select name="order_id" required>
                  <option value="">Select order...</option>
                  {myOrders.map((order: Order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_number} — {order.items.map((i: any) => i.name).join(', ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f-field">
                <label>Issue Type</label>
                <select name="type" required>
                  <option>Wrong item delivered</option>
                  <option>Poor quality product</option>
                  <option>Late delivery</option>
                  <option>Missing items</option>
                  <option>Payment issue</option>
                  <option>Damaged packaging</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div className="f-field" style={{ marginBottom: '14px' }}>
              <label>Describe the Issue</label>
              <textarea name="description" placeholder="Please describe in detail..." required></textarea>
            </div>
            <button type="submit" className="btn-main" style={{ maxWidth: '200px' }}>Submit Complaint</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FarmerAddProductPage({ addProduct }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Add New Product</h1>
          <p>List your fresh harvest for consumers</p>
        </div>
      </div>
      <div className="sec">
        <div className="sec-h"><h2>Product Details</h2></div>
        <div className="sec-b">
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const data = {
              name: formData.get('name') as string,
              category: formData.get('category') as string,
              price: parseFloat(formData.get('price') as string),
              unit: formData.get('unit') as string,
              stock: parseFloat(formData.get('stock') as string),
              harvest_date: formData.get('harvest_date') as string,
              expiry_date: formData.get('expiry_date') as string,
              image_url: (formData.get('image_url') as string) || getProductImage(formData.get('name') as string),
              description: formData.get('description') as string,
            };
            addProduct(data);
            e.currentTarget.reset();
          }}>
            <div className="form-grid">
              <div className="f-field">
                <label>Product Name</label>
                <input name="name" required placeholder="e.g. Fresh Tomatoes" />
              </div>
              <div className="f-field">
                <label>Category</label>
                <select name="category" required>
                  <option>Vegetables</option>
                  <option>Fruits</option>
                  <option>Grains</option>
                  <option>Dairy</option>
                  <option>Spices</option>
                  <option>Leafy Greens</option>
                </select>
              </div>
            </div>
            <div className="form-grid t3">
              <div className="f-field">
                <label>Price (₹)</label>
                <input type="number" name="price" required placeholder="40" />
              </div>
              <div className="f-field">
                <label>Unit</label>
                <select name="unit">
                  <option>per kg</option>
                  <option>per 500g</option>
                  <option>per dozen</option>
                  <option>per piece</option>
                  <option>per litre</option>
                  <option>per bunch</option>
                </select>
              </div>
              <div className="f-field">
                <label>Stock (kg)</label>
                <input type="number" name="stock" required placeholder="50" />
              </div>
            </div>
            <div className="form-grid">
              <div className="f-field">
                <label>Harvest Date</label>
                <input type="date" name="harvest_date" required defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="f-field">
                <label>Expiry Date</label>
                <input type="date" name="expiry_date" required defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} />
              </div>
            </div>
            <div className="form-grid">
              <div className="f-field">
                <label>Image URL (Optional)</label>
                <input name="image_url" placeholder="https://..." />
              </div>
              <div className="f-field">
                <label>Description</label>
                <input name="description" placeholder="Organic, fresh, no pesticides" />
              </div>
            </div>
            <button type="submit" className="btn-main" style={{ maxWidth: '200px' }}>Add Product ✓</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FarmerMyProductsPage({ myProducts, updateProductPrice, deleteProduct }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>My Products</h1>
          <p>Manage your listed produce</p>
        </div>
      </div>
      <div className="sec">
        <div className="sec-b tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Harvested</th>
                <th>Expires</th>
                <th>Days Left</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {myProducts.map((product: Product) => {
                const daysLeft = daysFromNow(product.expiry_date);
                return (
                  <tr key={product.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={product.image_url || getProductImage(product.name)} style={{ width: '36px', height: '36px', borderRadius: '7px', objectFit: 'cover' }} alt="" />
                        <div>
                          <div style={{ fontWeight: 600 }}>{product.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--txt3)' }}>{product.category}</div>
                        </div>
                      </div>
                    </td>
                    <td>₹{product.price}<span style={{ fontSize: '10px', color: 'var(--txt3)' }}> {product.unit}</span></td>
                    <td>{product.stock} kg</td>
                    <td>{formatDate(product.harvest_date)}</td>
                    <td>{formatDate(product.expiry_date)}</td>
                    <td>{daysLeft > 0 ? `${daysLeft} days` : 'Expired'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn a" onClick={() => {
                        const newPrice = prompt(`New price for ${product.name} (current: ₹${product.price})`, product.price.toString());
                        if (newPrice && !isNaN(parseFloat(newPrice))) {
                          updateProductPrice(product.id, parseFloat(newPrice));
                        }
                      }}>Edit Price</button>
                      <button className="btn r" style={{ marginLeft: '4px' }} onClick={() => deleteProduct(product.id)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FarmerOrdersPage({ myOrders, updateOrderStatus }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Orders</h1>
          <p>Incoming and past orders</p>
        </div>
        <span className="rt-badge">Real-time</span>
      </div>
      {myOrders.length === 0 ? (
        <div className="empty-state">
          <div className="es-ico">📦</div>
          <h3>No orders found</h3>
        </div>
      ) : (
        myOrders.map((order: Order) => (
          <div key={order.id} className="order-card">
            <div className="order-card-head">
              <div>
                <div className="oc-id">{order.order_number}</div>
                <div className="oc-date">{formatDate(order.created_at)} at {formatTime(order.created_at)}</div>
              </div>
              <span className={`tag ${order.status === 'delivered' ? 'g' : order.status === 'cancelled' ? 'r' : order.status === 'out' ? 'b' : 'a'}`}>
                {order.status === 'pending' && '⏳ Pending'}
                {order.status === 'accepted' && '✅ Accepted'}
                {order.status === 'out' && '🚚 Out for Delivery'}
                {order.status === 'delivered' && '✓ Delivered'}
              </span>
            </div>
            <div className="oc-items">
              👤 {(order.user as any)?.name} | {order.items.map((i: any) => `${i.name} ×${i.qty}`).join(', ')} | <strong>₹{order.total_amount}</strong>
            </div>
            <div className="oc-foot">
              {order.status === 'pending' && (
                <>
                  <button className="btn solid" onClick={() => updateOrderStatus(order.id, 'accepted')}>Accept Order</button>
                  <button className="btn r" style={{ marginLeft: '4px' }} onClick={() => updateOrderStatus(order.id, 'cancelled')}>Cancel</button>
                </>
              )}
              {order.status === 'accepted' && <span className="tag b">Awaiting pickup by delivery partner</span>}
              {order.status === 'out' && <span className="tag b">🚚 Out for delivery</span>}
              {order.status === 'delivered' && <span className="tag g">✓ Delivered successfully</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DeliveryAvailablePage({ availableDeliveries, currentUserId, updateOrderStatus }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Available Orders 📋</h1>
          <p>Orders ready for pickup</p>
        </div>
      </div>
      {availableDeliveries.length === 0 ? (
        <div className="empty-state">
          <div className="es-ico">📭</div>
          <h3>No orders available</h3>
          <p>New orders will appear here automatically</p>
        </div>
      ) : (
        availableDeliveries.map((order: Order) => (
          <div key={order.id} className="sec" style={{ marginBottom: '14px' }}>
            <div className="sec-h">
              <h2>{order.order_number}</h2>
              <span className="tag g">📍 2.5 km away</span>
            </div>
            <div className="sec-b">
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <strong>Customer:</strong> {(order.user as any)?.name}
                </div>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <strong>Items:</strong> {order.items.map((i: any) => `${i.name} ×${i.qty}`).join(', ')}
                </div>
                <div style={{ fontSize: '13px' }}>
                  <strong>Delivery Fee:</strong> ₹90
                </div>
              </div>
              <button
                className="btn solid btn-lg"
                style={{ width: '100%' }}
                onClick={() => updateOrderStatus(order.id, 'out', currentUserId)}
              >
                ✓ Accept Delivery
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DeliveryActivePage({ orders, currentUserId, updateOrderStatus }: any) {
  const activeDelivery = orders.find((o: Order) => o.delivery_partner_id === currentUserId && o.status === 'out');

  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Active Delivery 🗺️</h1>
          <p>Current order in transit</p>
        </div>
      </div>
      {!activeDelivery ? (
        <div className="empty-state">
          <div className="es-ico">🚚</div>
          <h3>No active delivery</h3>
          <p>Accept an order from Available Orders to start</p>
        </div>
      ) : (
        <div className="sec">
          <div className="sec-h"><h2>Delivery Details - {activeDelivery.order_number}</h2></div>
          <div className="sec-b">
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                <strong>Customer:</strong> {(activeDelivery.user as any)?.name}
              </div>
              <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                <strong>Items:</strong> {activeDelivery.items.map((i: any) => `${i.name} ×${i.qty}`).join(', ')}
              </div>
              <div style={{ fontSize: '13px' }}>
                <strong>Amount (COD):</strong> ₹{activeDelivery.total_amount}
              </div>
            </div>
            <button
              className="btn-main"
              onClick={() => updateOrderStatus(activeDelivery.id, 'delivered')}
            >
              Mark as Delivered ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDashPage({ farmers, orders, products }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Admin Dashboard ⚙️</h1>
          <p>Platform-wide real-time overview</p>
        </div>
        <span className="rt-badge">Live</span>
      </div>
      <div className="stats-row">
        <div className="stat-c">
          <div className="si">🌾</div>
          <div className="sl">Farmers</div>
          <div className="sv">{farmers.length}</div>
          <div className="ss">{farmers.filter((f: User) => f.status === 'active').length} active</div>
        </div>
        <div className="stat-c">
          <div className="si">📦</div>
          <div className="sl">Total Orders</div>
          <div className="sv">{orders.length}</div>
          <div className="ss">{orders.filter((o: Order) => o.status === 'delivered').length} delivered</div>
        </div>
        <div className="stat-c">
          <div className="si">💰</div>
          <div className="sl">GMV</div>
          <div className="sv">₹{orders.filter((o: Order) => o.status === 'delivered').reduce((sum: number, o: Order) => sum + o.total_amount, 0).toLocaleString('en-IN')}</div>
          <div className="ss">Gross value</div>
        </div>
        <div className="stat-c">
          <div className="si">🌿</div>
          <div className="sl">Products</div>
          <div className="sv">{products.length}</div>
          <div className="ss">Listed on platform</div>
        </div>
      </div>
    </div>
  );
}

function AdminFarmersPage({ farmers, products, loadData }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Farmers 🌾</h1>
          <p>All registered farmers</p>
        </div>
      </div>
      <div className="sec">
        <div className="sec-b tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Products</th>
                <th>Revenue</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {farmers.map((farmer: User) => (
                <tr key={farmer.id}>
                  <td><div style={{ fontWeight: 600 }}>👨‍🌾 {farmer.name}</div></td>
                  <td>{farmer.phone}</td>
                  <td>{farmer.location}</td>
                  <td>{products.filter((p: Product) => p.farmer_id === farmer.id).length}</td>
                  <td>₹{farmer.revenue.toLocaleString('en-IN')}</td>
                  <td>⭐ {farmer.rating}</td>
                  <td>
                    <span className={`tag ${farmer.status === 'active' ? 'g' : farmer.status === 'pending' ? 'a' : 'r'}`}>
                      {farmer.status === 'active' ? 'Active' : farmer.status === 'pending' ? 'Pending' : 'Suspended'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {farmer.status === 'active' && (
                      <button className="btn r" onClick={async () => {
                        await supabase.from('users').update({ status: 'suspended' }).eq('id', farmer.id);
                        loadData();
                        showToast('Farmer suspended');
                      }}>Suspend</button>
                    )}
                    {farmer.status === 'pending' && (
                      <button className="btn solid" onClick={async () => {
                        await supabase.from('users').update({ status: 'active' }).eq('id', farmer.id);
                        loadData();
                        showToast('Farmer verified ✓');
                      }}>Verify</button>
                    )}
                    {farmer.status === 'suspended' && (
                      <button className="btn g" onClick={async () => {
                        await supabase.from('users').update({ status: 'active' }).eq('id', farmer.id);
                        loadData();
                        showToast('Farmer reinstated ✓');
                      }}>Reinstate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminOrdersPage({ orders }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>All Orders 📦</h1>
          <p>Platform-wide order management</p>
        </div>
        <span className="rt-badge">Real-time</span>
      </div>
      <div className="sec">
        <div className="sec-b tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Farmer</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: Order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600 }}>{order.order_number}</td>
                  <td>{(order.user as any)?.name}</td>
                  <td>{(order.farmer as any)?.name}</td>
                  <td>₹{order.total_amount}</td>
                  <td>{formatDate(order.created_at)}</td>
                  <td>
                    <span className={`tag ${order.status === 'delivered' ? 'g' : order.status === 'cancelled' ? 'r' : order.status === 'out' ? 'b' : 'a'}`}>
                      {order.status === 'pending' && '⏳ Pending'}
                      {order.status === 'accepted' && '✅ Accepted'}
                      {order.status === 'out' && '🚚 Out'}
                      {order.status === 'delivered' && '✓ Delivered'}
                      {order.status === 'cancelled' && '✕ Cancelled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminComplaintsPage({ complaints, updateComplaintStatus }: any) {
  return (
    <div className="pg act">
      <div className="pg-head">
        <div>
          <h1>Complaint Resolution 📢</h1>
          <p>Manage & resolve consumer issues</p>
        </div>
        <span className="rt-badge">Live</span>
      </div>
      {complaints.length === 0 ? (
        <div className="empty-state">
          <div className="es-ico">✅</div>
          <h3>No complaints</h3>
        </div>
      ) : (
        complaints.map((complaint: Complaint) => (
          <div key={complaint.id} style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{(complaint.order as any)?.order_number} — {complaint.type}</div>
                <div style={{ fontSize: '11px', color: 'var(--txt3)', marginTop: '2px' }}>
                  By {(complaint.user as any)?.name} · {formatDate(complaint.created_at)}
                </div>
              </div>
              <span className={`tag ${complaint.status === 'resolved' ? 'g' : complaint.status === 'review' ? 'b' : 'a'}`}>
                {complaint.status === 'resolved' ? '✓ Resolved' : complaint.status === 'review' ? 'Under Review' : 'Open'}
              </span>
            </div>
            <div style={{ fontSize: '13px', marginBottom: '10px' }}>{complaint.description}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {complaint.status !== 'resolved' && (
                <button className="btn solid" onClick={() => updateComplaintStatus(complaint.id, 'resolved')}>
                  Mark Resolved
                </button>
              )}
              {complaint.status === 'open' && (
                <button className="btn b" onClick={() => updateComplaintStatus(complaint.id, 'review')}>
                  Under Review
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default App;
