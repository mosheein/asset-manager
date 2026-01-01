import axios from 'axios';

const API_BASE = '/api';

export interface Account {
  id: number;
  name: string;
  ib_account_id: string;
  base_currency: string;
  created_at: string;
}

export interface Holding {
  id: number;
  account_id: number;
  symbol: string;
  isin?: string;
  instrument_name?: string;
  asset_type: string;
  asset_category?: string;
  quantity: number;
  price: number;
  currency: string;
  value_usd: number;
  value_base: number;
  statement_date: string;
  created_at: string;
}

export interface TargetAllocation {
  id: number;
  asset_type: string;
  asset_category?: string;
  symbol?: string;
  alternative_tickers?: string[];
  isin?: string;
  target_percentage: number;
  bucket?: string;
  created_at: string;
  updated_at: string;
  name?: string; // Instrument name from holdings
}

export interface RebalancingAction {
  symbol: string;
  action: 'BUY' | 'SELL' | 'OK';
  quantity: number;
  amount: number;
  currentAllocation: number;
  targetAllocation: number;
  deviation: number;
  status: 'needs_buy' | 'needs_sell' | 'balanced';
}

export interface AssetStatus {
  symbol: string;
  currentAllocation: number;
  targetAllocation: number;
  deviation: number;
  status: 'needs_buy' | 'needs_sell' | 'balanced';
  currentValue: number;
  targetValue: number;
  adjustmentNeeded: number;
  mappedTargetSymbol?: string; // If this holding is mapped to a target symbol
  assetType?: string; // Asset type for grouping in pie charts
}

export interface RebalancingPlan {
  actions: RebalancingAction[];
  allAssets: AssetStatus[];
  totalValue: number;
  totalBuy: number;
  totalSell: number;
  netCashNeeded: number;
}

export interface PortfolioSnapshot {
  id: number;
  snapshot_date: string;
  total_value_usd: number;
  total_value_base: number;
  base_currency: string;
  created_at: string;
}

// Accounts API
export const accountsApi = {
  getAll: () => axios.get<Account[]>(`${API_BASE}/accounts`),
  getById: (id: number) => axios.get<Account>(`${API_BASE}/accounts/${id}`),
  create: (data: { name: string; ib_account_id: string; base_currency?: string }) =>
    axios.post<Account>(`${API_BASE}/accounts`, data),
  update: (id: number, data: { name?: string; base_currency?: string }) =>
    axios.put<Account>(`${API_BASE}/accounts/${id}`, data),
  delete: (id: number) => axios.delete(`${API_BASE}/accounts/${id}`),
};

// Holdings API
export const holdingsApi = {
  getAll: (params?: { account_id?: number; statement_date?: string }) =>
    axios.get<Holding[]>(`${API_BASE}/holdings`, { params }),
  getLatest: (accountId?: number) => 
    axios.get<Holding[]>(`${API_BASE}/holdings/latest`, { params: accountId ? { account_id: accountId } : {} }),
  getSummary: (accountId?: number) => 
    axios.get(`${API_BASE}/holdings/summary`, { params: accountId ? { account_id: accountId } : {} }),
};

// Statements API
export const statementsApi = {
  upload: (accountId: number, file: File) => {
    const formData = new FormData();
    formData.append('statement', file);
    formData.append('account_id', accountId.toString());
    return axios.post<{
      message: string;
      accountId: string;
      statementDate: string;
      holdingsCount: number;
      holdings: Holding[];
      unmatchedCount?: number;
      unmatchedHoldings?: Array<{
        symbol: string;
        suggestedAssetType?: string;
        suggestedMatches: Array<{
          targetId: number;
          assetType: string;
          assetCategory?: string;
          symbol?: string;
          matchReason: string;
        }>;
      }>;
    }>(`${API_BASE}/statements/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Targets API
export const targetsApi = {
  getAll: (accountId?: number) => 
    axios.get<TargetAllocation[]>(`${API_BASE}/targets`, { params: accountId ? { account_id: accountId } : {} }),
  create: (data: {
    asset_type: string;
    asset_category?: string;
    target_percentage: number;
    bucket?: string;
  }) => axios.post<TargetAllocation>(`${API_BASE}/targets`, data),
  update: (id: number, data: { target_percentage: number }) =>
    axios.put<TargetAllocation>(`${API_BASE}/targets/${id}`, data),
  delete: (id: number) => axios.delete(`${API_BASE}/targets/${id}`),
  uploadExcelPreview: (file: File, sheetName?: string) => {
    const formData = new FormData();
    formData.append('excel', file);
    if (sheetName) {
      formData.append('sheetName', sheetName);
    }
    return axios.post<{
      targets: Array<{
        asset_type: string;
        asset_category: string | null;
        target_percentage: number;
        instrument?: string | null;
        isin?: string | null;
        ticker?: string | null;
        alternative_tickers?: string[] | null;
        _needsTickerConfirmation?: boolean;
        _needsAutoDetect?: boolean;
        _missingFields?: string[];
        _validationErrors?: string[];
        _validationWarnings?: string[];
        _autoDetectSuggestions?: Array<{
          ticker: string;
          exchange?: string;
          name?: string;
          confidence: 'high' | 'medium' | 'low';
        }> | null;
        _tickerOptions?: Array<{
          ticker: string;
          exchange?: string;
          name?: string;
          confidence: 'high' | 'medium' | 'low';
        }> | null;
      }>;
      warnings: string[];
      errors: string[];
      totalPercentage: number;
      targetsCount: number;
      validationSummary?: {
        total: number;
        valid: number;
        complete: number;
        needsAutoDetect: number;
      };
      allComplete?: boolean;
      needsAutoDetect?: boolean;
      availableSheets?: string[];
      selectedSheet?: string;
      hasMultipleSheets?: boolean;
      tickerLookups?: Array<{
        index: number;
        isin?: string;
        instrument?: string;
        tickers: Array<{
          ticker: string;
          exchange?: string;
          name?: string;
          confidence: 'high' | 'medium' | 'low';
        }>;
      }>;
    }>(`${API_BASE}/targets/upload-excel-preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  commitExcel: (targets: Array<{
    asset_type: string;
    asset_category: string | null;
    target_percentage: number;
    ticker?: string | null;
    symbol?: string | null;
    isin?: string | null;
    alternative_tickers?: string[] | null;
  }>) => {
    return axios.post<{
      message: string;
      targets: TargetAllocation[];
      targetsCount: number;
      totalPercentage: number;
      insertedCount: number;
      expectedCount: number;
    }>(`${API_BASE}/targets/commit-excel`, { targets });
  },
  getHistory: () => axios.get(`${API_BASE}/targets/history`),
  getTargetHistory: (id: number) => axios.get(`${API_BASE}/targets/${id}/history`),
};

// Rebalancing API
export const rebalancingApi = {
  getPlan: (tolerance?: number, accountId?: number) =>
    axios.get<RebalancingPlan>(`${API_BASE}/rebalancing`, {
      params: { tolerance, account_id: accountId },
    }),
};

// History API
export const historyApi = {
  getSnapshots: () => axios.get<PortfolioSnapshot[]>(`${API_BASE}/history/snapshots`),
  getSnapshot: (id: number) => axios.get(`${API_BASE}/history/snapshots/${id}`),
  createSnapshot: (data?: { snapshot_date?: string; base_currency?: string }) =>
    axios.post<PortfolioSnapshot>(`${API_BASE}/history/snapshots`, data),
};

// Symbol Mappings API
export interface SymbolMapping {
  id: number;
  account_id: number;
  holding_symbol: string;
  target_id: number;
  match_type?: 'exact' | 'same_basket' | null;
  target_symbol?: string;
  target_isin?: string;
  asset_type?: string;
  asset_category?: string;
  created_at: string;
  updated_at: string;
}

export const symbolMappingsApi = {
  create: (data: { account_id: number; holding_symbol: string; target_id: number | null; match_type?: 'exact' | 'same_basket' | null }) =>
    axios.post(`${API_BASE}/symbol-mappings`, data),
  getAll: (accountId: number) =>
    axios.get<SymbolMapping[]>(`${API_BASE}/symbol-mappings`, { params: { account_id: accountId } }),
  delete: (id: number) => axios.delete(`${API_BASE}/symbol-mappings/${id}`),
};

