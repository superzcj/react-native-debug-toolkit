import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addNavigationLog,
  addTrackLog,
  addZustandLog,
  createDebugTab,
  type DebugFeature,
  type DebugFeatureRenderProps,
  DebugView,
  DebugToolkit,
} from 'react-native-debug-toolkit';

// ─── App Types ───────────────────────────────────────────

type RootScreen = 'Explore' | 'Cart' | 'Profile';

type Route =
  | { screen: 'Explore' }
  | { screen: 'Product'; productId: string }
  | { screen: 'Cart' }
  | { screen: 'Profile' };

type Product = {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  description: string;
  tint: string;
  accent: string;
  emoji: string;
  tag: string;
};

type CartItem = {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  quantity: number;
};

type StoreState = {
  cartItems: CartItem[];
  recentlyViewed: string[];
};

type FeedItem = {
  id: number;
  title: string;
  body: string;
};

type Review = {
  id: number;
  name: string;
  body: string;
};

type ProfileData = {
  name: string;
  email: string;
  company: string;
  city: string;
};

// ─── Custom Tab Snapshot Types ───────────────────────────
// Each custom tab defines its own lightweight snapshot shape.
// Keep snapshots small — they are read on every state change.

type CartTabSnapshot = {
  items: Array<{ id: string; title: string; qty: number; lineTotal: number }>;
  total: number;
};

type FlowTabSnapshot = {
  screen: string;
  viewedProducts: string[];
};

// ─── Constants ───────────────────────────────────────────

const PRODUCTS: Product[] = [
  {
    id: 'linen-chair',
    title: 'Linen Lounge Chair',
    subtitle: 'Living room collection',
    price: 699,
    description: 'A soft lounge chair designed for slow evenings and bright reading corners.',
    tint: '#D7E7F7',
    accent: '#2B6CB0',
    emoji: '🪑',
    tag: 'New',
  },
  {
    id: 'oak-desk',
    title: 'Oak Work Desk',
    subtitle: 'Studio essentials',
    price: 1299,
    description: 'Compact oak desk with clean lines, cable storage, and a calm natural finish.',
    tint: '#F5E1C8',
    accent: '#B7791F',
    emoji: '🪵',
    tag: 'Best Seller',
  },
  {
    id: 'arc-lamp',
    title: 'Arc Floor Lamp',
    subtitle: 'Warm light series',
    price: 459,
    description: 'A curved lamp that brings warm diffuse light to small apartments and studios.',
    tint: '#FDE7D8',
    accent: '#DD6B20',
    emoji: '💡',
    tag: 'Editor Pick',
  },
  {
    id: 'cloud-shelf',
    title: 'Cloud Wall Shelf',
    subtitle: 'Storage and display',
    price: 329,
    description: 'A lightweight shelf for books, records, and the little things you want to keep visible.',
    tint: '#E0F2E9',
    accent: '#2F855A',
    emoji: '📚',
    tag: 'Popular',
  },
];

const INITIAL_STORE: StoreState = {
  cartItems: [],
  recentlyViewed: [],
};

const T = {
  background: '#F4EEE4',
  hero: '#1B3653',
  surface: '#FFFDF8',
  surfaceSoft: '#F7EDDF',
  border: '#E5D8C6',
  text: '#1A2333',
  textMuted: '#6B7280',
  textOnHero: '#FFFDF8',
  primary: '#2563EB',
  primarySoft: '#E8F0FE',
  success: '#19925A',
  warning: '#C67A18',
} as const;

function formatPrice(price: number): string {
  return `¥${price.toFixed(0)}`;
}

function getProduct(productId: string): Product | undefined {
  return PRODUCTS.find((item) => item.id === productId);
}

function getRouteLabel(route: Route): string {
  if (route.screen === 'Product') {
    return getProduct(route.productId)?.title ?? 'Product';
  }

  return route.screen;
}

function getActiveRootTab(route: Route): RootScreen {
  if (route.screen === 'Product') {
    return 'Explore';
  }

  return route.screen;
}

// ─── Custom Tab Renderers ────────────────────────────────

function CartDebugTab({ snapshot }: DebugFeatureRenderProps<CartTabSnapshot>) {
  return (
    <ScrollView style={s.tabScroll} contentContainerStyle={s.tabContent}>
      <View style={[s.tabCard, { backgroundColor: T.hero }]}>
        <Text style={[s.tabCardLabel, { color: T.textOnHero }]}>CART TOTAL</Text>
        <Text style={[s.tabCardValue, { color: T.textOnHero }]}>{formatPrice(snapshot.total)}</Text>
        <Text style={[s.tabCardMeta, { color: T.textOnHero }]}>
          {snapshot.items.length} item{snapshot.items.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {snapshot.items.length > 0 ? (
        snapshot.items.map((item) => (
          <View key={item.id} style={[s.tabRow, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
            <Text style={[s.tabRowTitle, { color: T.text }]}>{item.title}</Text>
            <Text style={[s.tabRowMeta, { color: T.textMuted }]}>
              x{item.qty}  {formatPrice(item.lineTotal)}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[s.tabEmpty, { color: T.textMuted }]}>Cart is empty — add some products.</Text>
      )}
    </ScrollView>
  );
}

function FlowDebugTab({ snapshot }: DebugFeatureRenderProps<FlowTabSnapshot>) {
  return (
    <ScrollView style={s.tabScroll} contentContainerStyle={s.tabContent}>
      <View style={[s.tabCard, { backgroundColor: T.hero }]}>
        <Text style={[s.tabCardLabel, { color: T.textOnHero }]}>CURRENT SCREEN</Text>
        <Text style={[s.tabCardValue, { color: T.textOnHero }]}>{snapshot.screen}</Text>
      </View>

      <View style={[s.tabSection, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
        <Text style={[s.tabSectionTitle, { color: T.text }]}>Viewed Products</Text>
        {snapshot.viewedProducts.length > 0 ? (
          snapshot.viewedProducts.map((title) => (
            <Text key={title} style={[s.tabBullet, { color: T.text }]}>
              • {title}
            </Text>
          ))
        ) : (
          <Text style={[s.tabEmpty, { color: T.textMuted }]}>No products viewed yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

// ─── App ─────────────────────────────────────────────────

function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ screen: 'Explore' });
  const [storeState, setStoreState] = useState<StoreState>(INITIAL_STORE);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [reviewsByProduct, setReviewsByProduct] = useState<Record<string, Review[]>>({});
  const [loadingReviewProductId, setLoadingReviewProductId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Refs for getSnapshot (reads latest state outside React render cycle)
  const routeRef = useRef<Route>({ screen: 'Explore' });
  const storeRef = useRef<StoreState>(INITIAL_STORE);
  const exploreLoadedRef = useRef(false);
  const profileLoadedRef = useRef(false);
  const requestedReviewIdsRef = useRef<Set<string>>(new Set());

  // Shared listener pool — both tabs subscribe here
  const debugListeners = useRef(new Set<() => void>());

  const notifyTabs = useCallback(() => {
    debugListeners.current.forEach((fn) => fn());
  }, []);

  // ── Custom features (created once) ──────────────────────

  const cartFeatureRef = useRef<DebugFeature<CartTabSnapshot> | null>(null);
  const flowFeatureRef = useRef<DebugFeature<FlowTabSnapshot> | null>(null);

  if (!cartFeatureRef.current) {
    cartFeatureRef.current = createDebugTab<CartTabSnapshot>({
      name: 'my-cart',
      label: 'My Cart',
      getSnapshot: () => {
        const { cartItems } = storeRef.current;
        return {
          items: cartItems.map((i) => ({ id: i.id, title: i.title, qty: i.quantity, lineTotal: i.price * i.quantity })),
          total: cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
        };
      },
      render: CartDebugTab,
      subscribe: (listener) => {
        debugListeners.current.add(listener);
        return () => { debugListeners.current.delete(listener); };
      },
      badge: () => {
        const count = storeRef.current.cartItems.reduce((sum, i) => sum + i.quantity, 0);
        return count > 0 ? { label: String(count), color: T.primary } : null;
      },
    });
  }

  if (!flowFeatureRef.current) {
    flowFeatureRef.current = createDebugTab<FlowTabSnapshot>({
      name: 'user-flow',
      label: 'User Flow',
      getSnapshot: () => ({
        screen: getRouteLabel(routeRef.current),
        viewedProducts: storeRef.current.recentlyViewed.map((id) => getProduct(id)?.title ?? id),
      }),
      render: FlowDebugTab,
      subscribe: (listener) => {
        debugListeners.current.add(listener);
        return () => { debugListeners.current.delete(listener); };
      },
    });
  }

  const customFeatures = useMemo(
    () => [cartFeatureRef.current!, flowFeatureRef.current!],
    [],
  );

  // ── Sync refs + notify tabs ─────────────────────────────

  useEffect(() => {
    routeRef.current = route;
    storeRef.current = storeState;
    notifyTabs();
  }, [route, storeState, notifyTabs]);

  // ── Store helpers ───────────────────────────────────────

  const updateStore = (
    action: string,
    updater: (prevState: StoreState) => StoreState,
  ): StoreState => {
    const previousState = storeRef.current;
    const startTime = Date.now();
    const nextState = updater(previousState);

    storeRef.current = nextState;
    setStoreState(nextState);
    notifyTabs();
    addZustandLog(
      action,
      previousState,
      nextState,
      Math.max(1, Date.now() - startTime),
      'shopStore',
    );

    return nextState;
  };

  const loadExploreFeed = useCallback(async () => {
    setFeedLoading(true);

    try {
      const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=2');
      const data = (await response.json()) as Array<{ id: number; title: string; body: string }>;

      setFeedItems(
        data.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
        })),
      );
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadProductReviews = useCallback(async (productId: string) => {
    if (reviewsByProduct[productId] || requestedReviewIdsRef.current.has(productId)) {
      return;
    }

    requestedReviewIdsRef.current.add(productId);
    setLoadingReviewProductId(productId);

    try {
      const response = await fetch(
        `https://jsonplaceholder.typicode.com/comments?postId=${Math.max(
          1,
          PRODUCTS.findIndex((item) => item.id === productId) + 1,
        )}`,
      );
      const data = (await response.json()) as Array<{
        id: number;
        name: string;
        body: string;
      }>;

      setReviewsByProduct((prev) => ({
        ...prev,
        [productId]: data.slice(0, 3).map((item) => ({
          id: item.id,
          name: item.name,
          body: item.body,
        })),
      }));
    } finally {
      setLoadingReviewProductId(null);
    }
  }, [reviewsByProduct]);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);

    try {
      const response = await fetch('https://jsonplaceholder.typicode.com/users/1');
      const data = (await response.json()) as {
        name: string;
        email: string;
        address?: { city?: string };
        company?: { name?: string };
      };

      setProfile({
        name: data.name,
        email: data.email,
        company: data.company?.name ?? 'Unknown Studio',
        city: data.address?.city ?? 'Unknown City',
      });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (route.screen === 'Explore' && !exploreLoadedRef.current) {
      exploreLoadedRef.current = true;
      loadExploreFeed().catch(() => undefined);
    }

    if (route.screen === 'Product') {
      loadProductReviews(route.productId).catch(() => undefined);
    }

    if (route.screen === 'Profile' && !profileLoadedRef.current) {
      profileLoadedRef.current = true;
      loadProfile().catch(() => undefined);
    }
  }, [loadExploreFeed, loadProductReviews, loadProfile, route]);

  const navigateTo = (nextRoute: Route) => {
    const currentRoute = routeRef.current;
    const from = getRouteLabel(currentRoute);
    const to = getRouteLabel(nextRoute);

    if (from === to) {
      return;
    }

    routeRef.current = nextRoute;
    setRoute(nextRoute);
    notifyTabs();
    addNavigationLog(
      'navigate',
      from,
      to,
      Date.now(),
      120,
      JSON.stringify({ source: 'demo-app', from, to }),
    );
  };

  const openProduct = (product: Product) => {
    updateStore('product/viewed', (prevState) => ({
      ...prevState,
      recentlyViewed: [product.id, ...prevState.recentlyViewed.filter((id) => id !== product.id)]
        .slice(0, 4),
    }));
    addTrackLog({
      eventName: 'product_viewed',
      productId: product.id,
      productName: product.title,
    });
    navigateTo({ screen: 'Product', productId: product.id });
  };

  const addToCart = (product: Product) => {
    const nextState = updateStore('cart/addItem', (prevState) => {
      const existingItem = prevState.cartItems.find((item) => item.id === product.id);

      if (existingItem) {
        return {
          ...prevState,
          cartItems: prevState.cartItems.map((item) =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
          ),
        };
      }

      return {
        ...prevState,
        cartItems: [
          ...prevState.cartItems,
          {
            id: product.id,
            title: product.title,
            subtitle: product.subtitle,
            price: product.price,
            quantity: 1,
          },
        ],
      };
    });

    console.info('[Demo] Added to cart', {
      productId: product.id,
      productName: product.title,
      cartCount: nextState.cartItems.reduce((total, item) => total + item.quantity, 0),
    });
    addTrackLog({
      eventName: 'add_to_cart',
      productId: product.id,
      productName: product.title,
      cartCount: nextState.cartItems.reduce((total, item) => total + item.quantity, 0),
    });
  };

  const startCheckout = async () => {
    const itemCount = storeState.cartItems.reduce((total, item) => total + item.quantity, 0);
    const totalPrice = storeState.cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );

    console.warn('[Demo] Checkout pending: inventory check required', { itemCount, totalPrice });
    addTrackLog({ eventName: 'checkout_started', itemCount, totalPrice });

    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Order #${Date.now()}`,
          body: JSON.stringify({ items: storeState.cartItems.map((i) => i.id), totalPrice }),
          userId: 1,
        }),
      });
      const data = await res.json();
      console.info('[Demo] Order placed:', data);
      updateStore('cart/clear', () => INITIAL_STORE);
      addTrackLog({ eventName: 'checkout_completed', itemCount, totalPrice });
    } catch (e) {
      console.error('[Demo] Checkout failed:', e);
    }
  };

  const runRawXhrSmoke = () => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://jsonplaceholder.typicode.com/todos/1');
    xhr.onloadend = () => {
      console.info('[Demo] XHR GET completed', {
        status: xhr.status,
        url: 'https://jsonplaceholder.typicode.com/todos/1',
      });
    };
    xhr.onerror = () => {
      console.error('[Demo] XHR GET failed');
    };
    xhr.send();
  };

  const resetDemo = () => {
    DebugToolkit.clearAll();
    routeRef.current = { screen: 'Explore' };
    storeRef.current = INITIAL_STORE;
    requestedReviewIdsRef.current = new Set();
    exploreLoadedRef.current = false;
    profileLoadedRef.current = false;
    setRoute({ screen: 'Explore' });
    setStoreState(INITIAL_STORE);
    setFeedItems([]);
    setReviewsByProduct({});
    setProfile(null);
    setFeedLoading(false);
    setLoadingReviewProductId(null);
    setProfileLoading(false);
  };

  const cartCount = storeState.cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = storeState.cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
  const activeRootTab = getActiveRootTab(route);
  const currentProduct = route.screen === 'Product' ? getProduct(route.productId) : null;
  const currentReviews = currentProduct ? reviewsByProduct[currentProduct.id] ?? [] : [];

  const renderExploreScreen = () => (
    <>
      <View style={[styles.promoCard, { backgroundColor: T.hero }]}>
        <Text style={[styles.promoEyebrow, { color: T.textOnHero }]}>ATELIER HOME</Text>
        <Text style={[styles.promoTitle, { color: T.textOnHero }]}>Quiet Objects For Daily Rooms</Text>
      </View>

      <View style={styles.productGrid}>
        {PRODUCTS.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={[styles.productCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}
            onPress={() => openProduct(product)}
            activeOpacity={0.9}
          >
            <View style={[styles.productArt, { backgroundColor: product.tint }]}>
              <Text style={styles.productEmoji}>{product.emoji}</Text>
            </View>

            <View style={styles.productMetaRow}>
              <Text style={[styles.productTag, { color: product.accent }]}>{product.tag}</Text>
              <Text style={[styles.productPrice, { color: T.text }]}>{formatPrice(product.price)}</Text>
            </View>

            <Text style={[styles.productTitle, { color: T.text }]}>{product.title}</Text>
            <Text style={[styles.productSubtitle, { color: T.textMuted }]}>{product.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {feedLoading ? (
        <Text style={[styles.mutedNote, { color: T.textMuted }]}>Loading...</Text>
      ) : feedItems.length > 0 ? (
        <View style={styles.feedSection}>
          <Text style={[styles.sectionTitle, { color: T.text }]}>From The Journal</Text>
          {feedItems.map((item) => (
            <View
              key={item.id}
              style={[styles.feedCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}
            >
              <Text style={[styles.feedTitle, { color: T.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={[styles.feedBody, { color: T.textMuted }]} numberOfLines={3}>
                {item.body}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );

  const renderProductScreen = () => {
    if (!currentProduct) {
      return null;
    }

    return (
      <>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: T.border, backgroundColor: T.surfaceSoft }]}
          onPress={() => navigateTo({ screen: 'Explore' })}
          activeOpacity={0.9}
        >
          <Text style={[styles.backButtonText, { color: T.text }]}>Back</Text>
        </TouchableOpacity>

        <View style={[styles.detailCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
          <View style={[styles.detailArt, { backgroundColor: currentProduct.tint }]}>
            <Text style={styles.detailEmoji}>{currentProduct.emoji}</Text>
          </View>
          <Text style={[styles.detailTag, { color: currentProduct.accent }]}>{currentProduct.tag}</Text>
          <Text style={[styles.detailTitle, { color: T.text }]}>{currentProduct.title}</Text>
          <Text style={[styles.detailSubtitle, { color: T.textMuted }]}>{currentProduct.subtitle}</Text>
          <Text style={[styles.detailPrice, { color: T.text }]}>{formatPrice(currentProduct.price)}</Text>
          <Text style={[styles.detailDescription, { color: T.textMuted }]}>
            {currentProduct.description}
          </Text>

          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: T.primary }]}
            onPress={() => addToCart(currentProduct)}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryActionText}>Add To Cart</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.feedSection}>
          <Text style={[styles.sectionTitle, { color: T.text }]}>Reviews</Text>
          {loadingReviewProductId === currentProduct.id ? (
            <Text style={[styles.mutedNote, { color: T.textMuted }]}>Loading...</Text>
          ) : null}
          {currentReviews.map((review) => (
            <View
              key={review.id}
              style={[styles.reviewCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}
            >
              <Text style={[styles.reviewName, { color: T.text }]}>{review.name}</Text>
              <Text style={[styles.reviewBody, { color: T.textMuted }]} numberOfLines={3}>
                {review.body}
              </Text>
            </View>
          ))}
        </View>
      </>
    );
  };

  const renderCartScreen = () => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.pageTitle, { color: T.text }]}>Cart</Text>
        <Text style={[styles.pageMeta, { color: T.textMuted }]}>
          {cartCount} item{cartCount === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.cartSummaryRow}>
        <MetricCard label="Items" value={String(cartCount)} />
        <MetricCard label="Total" value={formatPrice(cartTotal)} />
      </View>

      {storeState.cartItems.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
          <Text style={[styles.emptyTitle, { color: T.text }]}>Your cart is empty</Text>
          <TouchableOpacity
            style={[styles.secondaryAction, { borderColor: T.border, backgroundColor: T.surface }]}
            onPress={() => navigateTo({ screen: 'Explore' })}
            activeOpacity={0.9}
          >
            <Text style={[styles.secondaryActionText, { color: T.text }]}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {storeState.cartItems.map((item) => (
            <View
              key={item.id}
              style={[styles.cartItemCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}
            >
              <View style={styles.cartItemTextWrap}>
                <Text style={[styles.cartItemTitle, { color: T.text }]}>{item.title}</Text>
                <Text style={[styles.cartItemSubtitle, { color: T.textMuted }]}>{item.subtitle}</Text>
              </View>
              <View style={styles.cartItemMeta}>
                <Text style={[styles.cartItemQty, { color: T.textMuted }]}>x{item.quantity}</Text>
                <Text style={[styles.cartItemPrice, { color: T.text }]}>
                  {formatPrice(item.price * item.quantity)}
                </Text>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: T.primary }]}
            onPress={startCheckout}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryActionText}>Checkout</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );

  const renderProfileScreen = () => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.pageTitle, { color: T.text }]}>Profile</Text>
      </View>

      <View style={[styles.profileCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
        {profileLoading ? (
          <Text style={[styles.profileLoading, { color: T.textMuted }]}>Loading...</Text>
        ) : profile ? (
          <>
            <Text style={[styles.profileName, { color: T.text }]}>{profile.name}</Text>
            <Text style={[styles.profileMeta, { color: T.textMuted }]}>{profile.email}</Text>
            <Text style={[styles.profileMeta, { color: T.textMuted }]}>{profile.company}</Text>
            <Text style={[styles.profileMeta, { color: T.textMuted }]}>{profile.city}</Text>
            <TouchableOpacity
              style={[styles.smallAction, { backgroundColor: T.primarySoft, borderColor: T.primary }]}
              onPress={async () => {
                if (!profile) return;
                try {
                  const res = await fetch('https://jsonplaceholder.typicode.com/users/1', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...profile, city: 'Updated City' }),
                  });
                  const data = await res.json();
                  console.info('[Demo] Profile updated via PUT:', data);
                  setProfile({ ...profile, city: data.city ?? 'Updated City' });
                } catch (e) {
                  console.error('[Demo] Profile update failed:', e);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.smallActionText, { color: T.primary }]}>Update Profile (PUT)</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <View style={styles.feedSection}>
        <Text style={[styles.sectionTitle, { color: T.text }]}>Recently Viewed</Text>
        {storeState.recentlyViewed.length === 0 ? (
          <Text style={[styles.mutedNote, { color: T.textMuted }]}>No items yet.</Text>
        ) : (
          storeState.recentlyViewed.map((productId) => {
            const product = getProduct(productId);
            if (!product) {
              return null;
            }

            return (
              <View
                key={productId}
                style={[styles.feedCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}
              >
                <Text style={[styles.feedTitle, { color: T.text }]}>{product.title}</Text>
                <Text style={[styles.feedBody, { color: T.textMuted }]}>{product.subtitle}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={[styles.devToolsCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
        <Text style={[styles.devToolsTitle, { color: T.text }]}>Dev Tools</Text>
        <Text style={[styles.devToolsDesc, { color: T.textMuted }]}>
          Programmatic toolkit APIs
        </Text>
        <View style={styles.devToolsRow}>
          <TouchableOpacity
            style={[styles.devToolBtn, { backgroundColor: T.primary }]}
            onPress={() => DebugToolkit.openPanel()}
            activeOpacity={0.8}
          >
            <Text style={styles.devToolBtnText}>Open Panel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.devToolBtn, { backgroundColor: T.primary }]}
            onPress={() => console.log('[Demo] State:', { route: routeRef.current, store: storeRef.current })}
            activeOpacity={0.8}
          >
            <Text style={styles.devToolBtnText}>Log State</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.devToolBtn, { backgroundColor: T.warning }]}
            onPress={async () => {
              try {
                await fetch('https://jsonplaceholder.typicode.com/posts/1', { method: 'DELETE' });
                console.info('[Demo] DELETE /posts/1 succeeded');
              } catch (e) {
                console.error('[Demo] DELETE failed:', e);
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.devToolBtnText}>DELETE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.devToolBtn, { backgroundColor: T.primary }]}
            onPress={runRawXhrSmoke}
            activeOpacity={0.8}
          >
            <Text style={styles.devToolBtnText}>XHR GET</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.devToolsCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
        <Text style={[styles.devToolsTitle, { color: T.text }]}>Native Logs</Text>
        <Text style={[styles.devToolsDesc, { color: T.textMuted }]}>
          Captures platform-level logs — iOS RCTLog, Android logcat —
          from the OS, native modules, and RN bridge.
          Not from JS console.* (those appear in Console tab).
        </Text>
        <Text style={[styles.devToolsDesc, { color: T.textMuted }]}>
          Navigate between screens, load data — native logs accumulate from system activity.
          Open the debug panel and switch to the Native Logs tab to view them.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.secondaryAction, { borderColor: T.border, backgroundColor: T.surfaceSoft }]}
        onPress={resetDemo}
        activeOpacity={0.9}
      >
        <Text style={[styles.secondaryActionText, { color: T.text }]}>Reset Demo Data</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <DebugView
      customFeatures={customFeatures}
      environments={[
        { id: 'dev', label: 'Development', host: 'jsonplaceholder.typicode.com', color: '#34C759' },
        { id: 'staging', label: 'Staging', host: 'staging-api.example.com', color: '#FF9500' },
        { id: 'prod', label: 'Production', host: 'api.example.com', color: '#FF3B30' },
      ]}
    >
      <SafeAreaView style={[styles.safeArea, { backgroundColor: T.background }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.appShell}>
        <ScrollView
          style={styles.topScroll}
          contentContainerStyle={styles.topContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.screenShell, { backgroundColor: T.surface, borderColor: T.border }]}>
            <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
              {route.screen === 'Explore' ? renderExploreScreen() : null}
              {route.screen === 'Product' ? renderProductScreen() : null}
              {route.screen === 'Cart' ? renderCartScreen() : null}
              {route.screen === 'Profile' ? renderProfileScreen() : null}
            </ScrollView>
          </View>
        </ScrollView>

        <View style={[styles.bottomNav, { backgroundColor: T.surface, borderTopColor: T.border }]}>
          <BottomNavItem
            label="Explore"
            active={activeRootTab === 'Explore'}
            badge={0}
            onPress={() => navigateTo({ screen: 'Explore' })}
          />
          <BottomNavItem
            label="Cart"
            active={activeRootTab === 'Cart'}
            badge={cartCount}
            onPress={() => navigateTo({ screen: 'Cart' })}
          />
          <BottomNavItem
            label="Profile"
            active={activeRootTab === 'Profile'}
            badge={0}
            onPress={() => navigateTo({ screen: 'Profile' })}
          />
        </View>
      </View>
      </SafeAreaView>
    </DebugView>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
      <Text style={[styles.metricLabel, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: T.text }]}>{value}</Text>
    </View>
  );
}

function BottomNavItem({
  label,
  active,
  badge,
  onPress,
}: {
  label: string;
  active: boolean;
  badge: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.bottomNavItem,
        {
          backgroundColor: active ? T.primarySoft : T.surface,
          borderColor: active ? T.primary : T.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text style={[styles.bottomNavLabel, { color: active ? T.primary : T.textMuted }]}>
        {label}
      </Text>
      {badge > 0 ? (
        <View style={[styles.bottomNavBadge, { backgroundColor: T.primary }]}>
          <Text style={styles.bottomNavBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────

const s = StyleSheet.create({
  tabScroll: { flex: 1, backgroundColor: T.background },
  tabContent: { padding: 16, gap: 12 },
  tabCard: { borderRadius: 18, padding: 16, gap: 6 },
  tabCardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, opacity: 0.75 },
  tabCardValue: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
  tabCardMeta: { fontSize: 13, fontWeight: '600', opacity: 0.8 },
  tabSection: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  tabSectionTitle: { fontSize: 15, fontWeight: '800' },
  tabRow: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabRowTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  tabRowMeta: { fontSize: 13, fontWeight: '600' },
  tabBullet: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  tabEmpty: { fontSize: 13, lineHeight: 18 },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  appShell: {
    flex: 1,
  },
  topScroll: {
    flex: 1,
  },
  topContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },
  screenShell: {
    minHeight: 520,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  screenContent: {
    padding: 18,
    paddingBottom: 28,
    gap: 16,
  },
  promoCard: {
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  promoEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  promoTitle: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  productGrid: {
    gap: 12,
  },
  productCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  productArt: {
    height: 128,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productEmoji: {
    fontSize: 42,
  },
  productMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productTag: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  productSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  feedSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  feedCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  feedBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  mutedNote: {
    fontSize: 13,
    lineHeight: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  detailArt: {
    height: 180,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailEmoji: {
    fontSize: 54,
  },
  detailTag: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  detailTitle: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
  },
  detailSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  detailPrice: {
    fontSize: 22,
    fontWeight: '700',
  },
  detailDescription: {
    fontSize: 14,
    lineHeight: 22,
  },
  primaryAction: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  reviewName: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  reviewBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
  },
  pageMeta: {
    fontSize: 13,
    fontWeight: '700',
  },
  cartSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryAction: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cartItemCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cartItemTextWrap: {
    flex: 1,
    gap: 4,
  },
  cartItemTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cartItemSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  cartItemMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cartItemQty: {
    fontSize: 12,
    fontWeight: '700',
  },
  cartItemPrice: {
    fontSize: 15,
    fontWeight: '700',
  },
  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  profileLoading: {
    fontSize: 14,
    lineHeight: 21,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
  },
  profileMeta: {
    fontSize: 14,
    lineHeight: 21,
  },
  smallAction: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  smallActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  devToolsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  devToolsTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  devToolsDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  devToolsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  devToolBtn: {
    borderRadius: 10,
    minWidth: 84,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  devToolBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomNav: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    gap: 10,
  },
  bottomNavItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  bottomNavLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  bottomNavBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});

export default App;
