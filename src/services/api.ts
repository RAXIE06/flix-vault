import {
  Movie,
  TelegramConfig,
  UpiPaymentOrder,
  UpiConfig,
  GmailConfigStatus,
  GmailConnectionTestResult,
  FamPayDiagnosticResult,
  DiagnosticEmailSummary,
  PaymentVerificationScanResponse,
  PosterUploadResponse,
} from '../types';

// Token storage key for fallback in partitioned iframe environments
const TOKEN_KEY = 'flixvault_admin_token';

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  // Do not set Content-Type for FormData; browser sets multipart/form-data with boundary
  if (!(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Include credentials for HttpOnly cookies
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

/**
 * Robust response parser that validates Content-Type before calling res.json().
 * Prevents "Unexpected token '<', '<!doctype '... is not valid JSON" errors
 * by extracting readable status and snippets from non-JSON responses.
 */
async function parseResponse<T = any>(res: Response, defaultError: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `${defaultError} (HTTP ${res.status})`);
    }
    return data;
  }

  // Handle non-JSON responses safely (e.g. HTML 404/500/502 from proxy or static fallback)
  const rawText = await res.text().catch(() => '');
  const cleanSnippet = rawText
    ? rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)
    : res.statusText || 'Unexpected non-JSON response';

  if (!res.ok) {
    throw new Error(`${defaultError} (HTTP ${res.status}: ${cleanSnippet})`);
  }

  return { success: true, text: rawText } as unknown as T;
}

export const api = {
  // =========================================================================
  // PUBLIC APIS
  // =========================================================================

  async getPublicMovies(): Promise<{ movies: Movie[]; storage: string }> {
    const res = await fetch('/api/movies', { credentials: 'include' });
    return parseResponse<{ movies: Movie[]; storage: string }>(
      res,
      'Failed to load movies'
    );
  },

  async getPublicSettings(): Promise<{
    featuredMovieId: string;
    storefrontMaxTitles: number;
    upiConfig?: any;
  }> {
    const res = await fetch('/api/settings', { credentials: 'include' });
    return parseResponse<{
      featuredMovieId: string;
      storefrontMaxTitles: number;
      upiConfig?: any;
    }>(res, 'Failed to load storefront settings');
  },

  async checkHealth(): Promise<{ status: string; database: any; paymentMode: string }> {
    const res = await fetch('/api/health', { credentials: 'include' });
    return parseResponse<{ status: string; database: any; paymentMode: string }>(
      res,
      'Health check failed'
    );
  },

  // =========================================================================
  // UPI ORDER GENERATION (Pay-Per-Movie)
  // =========================================================================

  async createUpiOrder(movieId: string): Promise<{ success: boolean; order: UpiPaymentOrder }> {
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ movieId }),
    });

    return parseResponse<{ success: boolean; order: UpiPaymentOrder }>(
      res,
      'Failed to generate UPI payment order'
    );
  },

  async getOrderStatus(orderId: string): Promise<UpiPaymentOrder> {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      credentials: 'include',
    });
    return parseResponse<UpiPaymentOrder>(res, 'Failed to retrieve order status');
  },

  // =========================================================================
  // ADMIN AUTH APIS
  // =========================================================================

  async loginAdmin(accessCode: string): Promise<{ success: boolean; token?: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode }),
      credentials: 'include',
    });

    const data = await parseResponse<{ success: boolean; token?: string }>(
      res,
      'Invalid access code'
    );

    if (data.token) {
      setStoredToken(data.token);
    }

    return data;
  },

  async logoutAdmin(): Promise<void> {
    setStoredToken(null);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore logout errors — token already cleared locally
    }
  },

  async checkAdminSession(): Promise<boolean> {
    try {
      const res = await fetchWithAuth('/api/auth/me');
      if (!res.ok) return false;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return false;
      const data = await res.json();
      return !!data.authenticated;
    } catch {
      return false;
    }
  },

  async getDbStatus(): Promise<{ success: boolean; dbStatus: any }> {
    const res = await fetchWithAuth('/api/admin/db/status');
    return parseResponse<{ success: boolean; dbStatus: any }>(
      res,
      'Failed to retrieve database status'
    );
  },

  async retryDbConnection(): Promise<{ success: boolean; dbStatus: any; error?: string }> {
    const res = await fetchWithAuth('/api/admin/db/retry', {
      method: 'POST',
    });
    return parseResponse<{ success: boolean; dbStatus: any; error?: string }>(
      res,
      'Failed to retry database connection'
    );
  },

  // =========================================================================
  // PROTECTED ADMIN MOVIE APIS
  // =========================================================================

  async getAdminMovies(): Promise<{ movies: Movie[]; storage: string }> {
    const res = await fetchWithAuth('/api/admin/movies');
    return parseResponse<{ movies: Movie[]; storage: string }>(
      res,
      'Failed to fetch admin movies'
    );
  },

  async createMovie(movie: Partial<Movie>): Promise<Movie> {
    const res = await fetchWithAuth('/api/admin/movies', {
      method: 'POST',
      body: JSON.stringify(movie),
    });

    const data = await parseResponse<{ movie: Movie }>(res, 'Failed to create movie');
    return data.movie;
  },

  async updateMovie(id: string, movie: Partial<Movie>): Promise<Movie> {
    const res = await fetchWithAuth(`/api/admin/movies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(movie),
    });

    const data = await parseResponse<{ movie: Movie }>(res, 'Failed to update movie');
    return data.movie;
  },

  async deleteMovie(id: string): Promise<void> {
    const res = await fetchWithAuth(`/api/admin/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    // DELETE usually returns JSON { success: true } or empty — parseResponse handles both
    await parseResponse(res, 'Failed to delete movie');
  },

  async setFeaturedMovie(id: string): Promise<Movie> {
    const res = await fetchWithAuth(`/api/admin/movies/${encodeURIComponent(id)}/feature`, {
      method: 'PATCH',
    });

    const data = await parseResponse<{ movie: Movie }>(res, 'Failed to set featured movie');
    return data.movie;
  },

  async toggleMovieStatus(id: string): Promise<Movie> {
    const res = await fetchWithAuth(`/api/admin/movies/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
    });

    const data = await parseResponse<{ movie: Movie }>(
      res,
      'Failed to toggle movie publication status'
    );
    return data.movie;
  },

  // =========================================================================
  // ADMIN SETTINGS
  // =========================================================================

  async getAdminSettings(): Promise<{ settings: any; database: any }> {
    const res = await fetchWithAuth('/api/admin/settings');
    return parseResponse<{ settings: any; database: any }>(
      res,
      'Failed to load admin settings'
    );
  },

  async updateAdminSettings(
    settings: Partial<TelegramConfig> | any
  ): Promise<any> {
    const res = await fetchWithAuth('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });

    const data = await parseResponse<{ settings: any }>(
      res,
      'Failed to update settings'
    );
    return data.settings;
  },

  // =========================================================================
  // ADMIN ORDERS
  // =========================================================================

  async getAdminOrders(): Promise<{ orders: UpiPaymentOrder[]; count: number }> {
    const res = await fetchWithAuth('/api/admin/orders');
    return parseResponse<{ orders: UpiPaymentOrder[]; count: number }>(
      res,
      'Failed to load orders'
    );
  },

  // =========================================================================
  // UPI CONFIG
  // =========================================================================

  async getUpiConfig(): Promise<{ upiConfig: UpiConfig }> {
    const res = await fetchWithAuth('/api/admin/upi-config');
    return parseResponse<{ upiConfig: UpiConfig }>(
      res,
      'Failed to load UPI configuration'
    );
  },

  async updateUpiConfig(
    upiConfig: Partial<UpiConfig>
  ): Promise<{ success: boolean; upiConfig: UpiConfig }> {
    const res = await fetchWithAuth('/api/admin/upi-config', {
      method: 'PUT',
      body: JSON.stringify(upiConfig),
    });

    return parseResponse<{ success: boolean; upiConfig: UpiConfig }>(
      res,
      'Failed to update UPI configuration'
    );
  },

  // =========================================================================
  // GMAIL IMAP & FAMPAY VERIFICATION APIS (Phase 3A)
  // =========================================================================

  async getGmailStatus(): Promise<GmailConfigStatus> {
    const res = await fetchWithAuth('/api/admin/gmail/status');
    return parseResponse<GmailConfigStatus>(
      res,
      'Failed to load Gmail IMAP configuration status'
    );
  },

  async testGmailConnection(): Promise<GmailConnectionTestResult> {
    const res = await fetchWithAuth('/api/admin/gmail/test-connection', {
      method: 'POST',
    });
    return parseResponse<GmailConnectionTestResult>(
      res,
      'Gmail IMAP connection test failed'
    );
  },

  async diagnoseGmailParser(payload: {
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    date?: string;
  }): Promise<{ success: boolean; result: FamPayDiagnosticResult }> {
    const res = await fetchWithAuth('/api/admin/gmail/diagnose-parser', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseResponse<{ success: boolean; result: FamPayDiagnosticResult }>(
      res,
      'Diagnostic parse failed'
    );
  },

  async getRecentEmailAlerts(limit: number = 10): Promise<{
    success: boolean;
    count: number;
    emails: DiagnosticEmailSummary[];
    error?: string;
  }> {
    const res = await fetchWithAuth(`/api/admin/gmail/recent-alerts?limit=${limit}`);
    return parseResponse<{
      success: boolean;
      count: number;
      emails: DiagnosticEmailSummary[];
      error?: string;
    }>(res, 'Failed to load recent email alerts');
  },

  // =========================================================================
  // AUTOMATED UPI PAYMENT VERIFICATION APIS (Phase 3B)
  // =========================================================================

  async verifyPayments(limit: number = 20): Promise<PaymentVerificationScanResponse> {
    const res = await fetchWithAuth('/api/admin/orders/verify-payments', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
    return parseResponse<PaymentVerificationScanResponse>(
      res,
      'Payment verification scan failed'
    );
  },

  async verifySpecificOrder(orderId: string): Promise<{
    success: boolean;
    order: UpiPaymentOrder | null;
    scanResult: PaymentVerificationScanResponse;
  }> {
    const res = await fetchWithAuth(`/api/admin/orders/${orderId}/verify`, {
      method: 'POST',
    });
    return parseResponse<{
      success: boolean;
      order: UpiPaymentOrder | null;
      scanResult: PaymentVerificationScanResponse;
    }>(res, 'Order verification failed');
  },

  async resolveOrderReview(
    orderId: string,
    action: 'approve' | 'reject',
    note?: string,
    utr?: string
  ): Promise<{ success: boolean; order: UpiPaymentOrder }> {
    const res = await fetchWithAuth(`/api/admin/orders/${orderId}/resolve-review`, {
      method: 'POST',
      body: JSON.stringify({ action, note, utr }),
    });
    return parseResponse<{ success: boolean; order: UpiPaymentOrder }>(
      res,
      'Failed to update order review status'
    );
  },

  async simulateAlertVerification(payload: {
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    date?: string;
    orderId?: string;
  }): Promise<{
    success: boolean;
    parsedAlert: FamPayDiagnosticResult;
    verificationResult: any;
    order: UpiPaymentOrder;
  }> {
    const res = await fetchWithAuth('/api/admin/orders/simulate-alert-verification', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseResponse<{
      success: boolean;
      parsedAlert: FamPayDiagnosticResult;
      verificationResult: any;
      order: UpiPaymentOrder;
    }>(res, 'Alert verification simulation failed');
  },

  // =========================================================================
  // MOVIE POSTER UPLOAD & STORAGE APIS (Direct MongoDB GridFS)
  // =========================================================================

  async uploadPoster(file: File): Promise<PosterUploadResponse> {
    const formData = new FormData();
    formData.append('poster', file);

    const res = await fetchWithAuth('/api/admin/posters/upload', {
      method: 'POST',
      body: formData,
    });
    return parseResponse<PosterUploadResponse>(
      res,
      'Failed to upload poster image to MongoDB GridFS'
    );
  },

  async uploadMoviePoster(
    movieId: string,
    file: File
  ): Promise<{
    success: boolean;
    movie: Movie;
    poster: PosterUploadResponse;
    message: string;
  }> {
    const formData = new FormData();
    formData.append('poster', file);

    const res = await fetchWithAuth(
      `/api/admin/movies/${encodeURIComponent(movieId)}/poster`,
      {
        method: 'POST',
        body: formData,
      }
    );
    return parseResponse<{
      success: boolean;
      movie: Movie;
      poster: PosterUploadResponse;
      message: string;
    }>(res, 'Failed to attach poster image to movie');
  },

  async removeMoviePoster(
    movieId: string
  ): Promise<{ success: boolean; movie: Movie; message: string }> {
    const res = await fetchWithAuth(
      `/api/admin/movies/${encodeURIComponent(movieId)}/poster`,
      {
        method: 'DELETE',
      }
    );
    return parseResponse<{ success: boolean; movie: Movie; message: string }>(
      res,
      'Failed to remove movie poster'
    );
  },
};
