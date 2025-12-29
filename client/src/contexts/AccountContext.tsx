import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { accountsApi, Account } from '../api';

interface AccountContextType {
  accounts: Account[];
  selectedAccountId: number | null;
  setSelectedAccountId: (id: number | null) => void;
  loading: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await accountsApi.getAll();
      setAccounts(response.data);
      // Set first account as default if none selected
      if (response.data.length > 0 && selectedAccountId === null) {
        setSelectedAccountId(response.data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccountContext.Provider value={{ accounts, selectedAccountId, setSelectedAccountId, loading }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}

