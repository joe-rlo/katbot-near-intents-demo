import React, { useState, useEffect, useRef } from 'react';
import { NearConnector } from '@hot-labs/near-connect';

// 1Click APIBase
const API_BASE = 'https://1click.chaindefuser.com/v0';

// Default tokens for demo
const COMMON_TOKENS = {
  'near': {
    'wrap.near': { symbol: 'NEAR', name: 'Wrapped NEAR', decimals: 24, assetId: 'nep141:wrap.near' },
  },
  'ethereum': {
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { symbol: 'USDC', name: 'USD Coin', decimals: 6, assetId: 'erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  },
};

function App() {
  const [connector, setConnector] = useState(null);
  const [account, setAccount] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [fromChain, setFromChain] = useState('near');
  const [toChain, setToChain] = useState('ethereum');
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('info');
  const chainSelectRef = useRef(null);
  const statusIntervalRef = useRef(null);

  // Initialize HOT CONNECTOR
  useEffect(() => {
    const nearConnector = new NearConnector({ network: 'mainnet' });
    setConnector(nearConnector);

    nearConnector.on('wallet:signIn', (state) => {
      if (state.accounts && state.accounts.length > 0) {
        setAccount(state.accounts[0]);
      }
    });

    nearConnector.on('wallet:signOut', () => {
      setAccount(null);
    });

    return () => {
      nearConnector.disconnect();
    };
  }, []);

  // Fetch tokens from 1Click API
  useEffect(() => {
    async function fetchTokens() {
      try {
        const response = await fetch(`${API_BASE}/tokens`);
        const data = await response.json();
        setTokens(data || []);
      } catch (error) {
        console.error('Failed to fetch tokens:', error);
        // Fallback to hardcoded tokens
        setTokens(Object.entries(COMMON_TOKENS).flatMap(([chain, tokens]) =>
          Object.entries(tokens).map(([addr, token]) => ({
            blockchain: chain,
            address: addr,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            assetId: token.assetId,
          }))
        ));
      }
    }
    fetchTokens();
  }, []);

  // Get tokens for selected chain
  const getChainTokens = (chain) => {
    if (tokens.length === 0) return [];
    return tokens.filter(t => t.blockchain === chain);
  };

  const chainTokensFrom = getChainTokens(fromChain);
  const chainTokensTo = getChainTokens(toChain);

  // Set default tokens when chain changes
  useEffect(() => {
    if (chainTokensFrom.length > 0 && !fromToken) {
      setFromToken(chainTokensFrom[0].assetId || chainTokensFrom[0].address);
    }
    if (chainTokensTo.length > 0 && !toToken) {
      setToToken(chainTokensTo[0].assetId || chainTokensTo[0].address);
    }
  }, [fromChain, toChain, chainTokensFrom, chainTokensTo, fromToken, toToken]);

  // Connect wallet
  const connectWallet = async () => {
    if (!selector) return;

    const modal = setupModal(selector, {
      contractId: 'wrap.near',
    });

    modal.show();
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    if (!selector) return;
    const wallet = await selector.wallet();
    await wallet.signOut();
  };

  // Get quote
  const getQuote = async (dryRun = true) => {
    if (!wallet && !account?.accountId) {
      setStatus('Please connect wallet first', 'error');
      return;
    }

    const decimals = getDecimals(fromToken);
    const amountBase = parseAmount(amount, decimals);
    const refundTo = wallet || account?.accountId;

    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const body = {
      dry: dryRun,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: fromToken,
      destinationAsset: toToken,
      amount: amountBase,
      depositType: 'ORIGIN_CHAIN',
      refundTo: refundTo,
      refundType: 'ORIGIN_CHAIN',
      recipient: refundTo,
      recipientType: 'INTENTS',
      deadline: deadline,
      quoteWaitingTimeMs: 0,
    };

    try {
      setStatus('Getting quote...', 'info');
      const response = await fetch(`${API_BASE}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Quote failed');
      }

      const result = await response.json();
      setQuote(result);
      setStatus('Quote received', 'success');
      return result;
    } catch (error) {
      setStatus(`Error: ${error.message}`, 'error');
      return null;
    }
  };

  // Execute swap
  const executeSwap = async () => {
    const result = await getQuote(false);
    if (!result) return;

    // Start status polling
    startStatusPolling(result.depositAddress, result.memo);

    // If using NEAR, send funds using wallet
    if (selector && fromToken.includes('wrap.near')) {
      try {
        const walletInstance = await selector.wallet();
        const decimals = 24;
        const amountBase = parseAmount(amount, decimals);

        // Call the transfer method
        // This would need to be completed based on NEAR SDK
        setStatus('Send funds to deposit address to complete swap', 'warning');
      } catch (error) {
        setStatus(`Error: ${error.message}`, 'error');
      }
    }
  };

  // Status polling
  const startStatusPolling = async (depositAddress, memo) => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }

    statusIntervalRef.current = setInterval(async () => {
      try {
        const url = `${API_BASE}/status?depositAddress=${encodeURIComponent(depositAddress)}${memo ? '&depositMemo=' + encodeURIComponent(memo) : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        setStatusMessages(data.status);

        if (['SUCCESS', 'REFUNDED', 'FAILED'].includes(data.status)) {
          clearInterval(statusIntervalRef.current);
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 5000);
  };

  // Helper functions
  const getDecimals = (token) => {
    const allTokens = [...chainTokensFrom, ...chainTokensTo];
    const found = allTokens.find(t => (t.assetId || t.address) === token);
    return found?.decimals || 18;
  };

  const parseAmount = (value, decimals) => {
    const parsed = parseFloat(value);
    const baseValue = BigInt(Math.floor(parsed * Math.pow(10, decimals)));
    return baseValue.toString();
  };

  const formatAmount = (baseValue, decimals) => {
    const value = BigInt(baseValue);
    const divisor = BigInt(Math.pow(10, decimals));
    return (Number(value) / Number(divisor)).toFixed(6).replace(/\.?0+$/, '');
  };

  const updateStatus = (msg, type) => {
    setStatus(msg);
    setStatusType(type);
  };

  const setStatusMessages = (status) => {
    const messages = {
      PENDING_DEPOSIT: '⏳ Waiting for deposit',
      PROCESSING: '🔄 Processing swap',
      SUCCESS: '🎉 Swap complete',
      REFUNDED: '↩️ Swap refunded',
      FAILED: '❌ Swap failed',
    };
    setStatus(messages[status] || status, status === 'SUCCESS' ? 'success' : 'info');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '50px auto', padding: '30px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#00C08B', marginBottom: '30px' }}>🔄 NEAR Intents Swap</h1>

      {/* Wallet Connection */}
      <div style={{ marginBottom: '30px', padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
        {!account ? (
          <button
            onClick={connectWallet}
            style={{
              background: '#00C08B',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Connect Wallet
          </button>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Connected:</strong> {account.accountId}
              <br />
              <small>{account.providerId || 'Unknown wallet'}</small>
            </div>
            <button
              onClick={disconnectWallet}
              style={{ background: '#666', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Swap Form */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>From Chain</label>
          <select
            value={fromChain}
            onChange={(e) => { setFromChain(e.target.value); setQuote(null); }}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
          >
            {[...new Set(tokens.map(t => t.blockchain))].map(chain => (
              <option key={chain} value={chain}>{chain.charAt(0).toUpperCase() + chain.slice(1)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>From Token</label>
          <select
            value={fromToken}
            onChange={(e) => { setFromToken(e.target.value); setQuote(null); }}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
          >
            {chainTokensFrom.map(token => (
              <option key={token.assetId || token.address} value={token.assetId || token.address}>
                {token.symbol} - {token.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
            placeholder="0.1"
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>To Chain</label>
          <select
            value={toChain}
            onChange={(e) => { setToChain(e.target.value); setQuote(null); }}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
          >
            {[...new Set(tokens.map(t => t.blockchain))].map(chain => (
              <option key={chain} value={chain}>{chain.charAt(0).toUpperCase() + chain.slice(1)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>To Token</label>
          <select
            value={toToken}
            onChange={(e) => { setToToken(e.target.value); setQuote(null); }}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
          >
            {chainTokensTo.map(token => (
              <option key={token.assetId || token.address} value={token.assetId || token.address}>
                {token.symbol} - {token.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => getQuote(true)}
            style={{ flex: 1, background: '#444', color: 'white', border: 'none', padding: '14px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}
          >
            Get Quote
          </button>
          {account && (
            <button
              onClick={executeSwap}
              style={{ flex: 1, background: '#00C08B', color: 'white', border: 'none', padding: '14px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}
            >
              Execute Swap
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      {status && (
        <div style={{
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '20px',
          background: statusType === 'error' ? '#fee' : statusType === 'success' ? '#efe' : '#eef',
          color: statusType === 'error' ? '#c00' : statusType === 'success' ? '#080' : '#044',
          fontWeight: 'bold',
        }}>
          {status}
        </div>
      )}

      {/* Quote Result */}
      {quote && !quote.dry && (
        <div style={{ padding: '20px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0 }}>💰 Swap Instructions</h3>
          <p><strong>Send Exactly:</strong> {amount} {getFromTokenSymbol()}</p>
          <p><strong>To:</strong> <code style={{ background: '#eee', padding: '2px 6px', borderRadius: '3px' }}>{quote.depositAddress}</code></p>
          <p><strong>Expected Output:</strong> {formatAmount(quote.amountOut, getDecimals(toToken))} {getToTokenSymbol()}</p>
          <p><strong>Deadline:</strong> {new Date(quote.deadline).toLocaleString()}</p>
          {quote.memo && (
            <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
              <p>⚠️ <strong>Include Memo:</strong> <code>{quote.memo}</code></p>
            </div>
          )}
        </div>
      )}

      {quote && quote.dry && (
        <div style={{ padding: '20px', background: '#f0f8ff', borderRadius: '8px', border: '1px solid #b0d4ff' }}>
          <h3 style={{ marginTop: 0 }}>📊 Quote (Dry Run)</h3>
          <p><strong>From:</strong> {amount} {getFromTokenSymbol()}</p>
          <p><strong>To:</strong> {formatAmount(quote.amountOut, getDecimals(toToken))} {getToTokenSymbol()}</p>
          <p><strong>Est. Time:</strong> ~{Math.floor(quote.estimatedTimeSeconds / 60)} minutes</p>
        </div>
      )}
    </div>
  );

  function getFromTokenSymbol() {
    const token = chainTokensFrom.find(t => (t.assetId || t.address) === fromToken);
    return token?.symbol || fromToken;
  }

  function getToTokenSymbol() {
    const token = chainTokensTo.find(t => (t.assetId || t.address) === toToken);
    return token?.symbol || toToken;
  }
}

export default App;