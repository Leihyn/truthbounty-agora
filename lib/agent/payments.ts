// x402 / Circle Gateway nanopayments — the agent pays for its own intelligence
// in USDC on Arc. Ported from BankOfCronos' x402 client, made server-side: the
// agent (not a browser wallet) signs an EIP-3009 transferWithAuthorization, and
// a Gateway facilitator settles it. A self-funding market participant pays per
// TruthScore query and per decision cycle, so its costs are on-chain and real.
//
// Settlement endpoint (Gateway facilitator) is env-driven; if unset we still
// produce the signed authorization (the payment intent) and record the cost,
// rather than silently skipping — so `costUsd` always reflects real intent.

import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export enum Intelligence {
  TRUTHSCORE_QUERY = 'truthscore_query', // per trader scored
  MARKET_SNAPSHOT = 'market_snapshot',   // per venue pulled
  CYCLE_DECISION = 'cycle_decision',     // per LLM allocation cycle
}

// Prices in USDC (6-decimal) base units. Nanopayment-scale, deliberately tiny.
const PRICE: Record<Intelligence, bigint> = {
  [Intelligence.TRUTHSCORE_QUERY]: BigInt(2_000),   // $0.002
  [Intelligence.MARKET_SNAPSHOT]: BigInt(5_000),    // $0.005
  [Intelligence.CYCLE_DECISION]: BigInt(50_000),    // $0.05
};

export interface PaymentReceipt {
  service: Intelligence;
  amountUsd: number;
  nonce: Hex;
  signature: Hex;
  settled: boolean;
  settleTxHash?: Hex;
}

function randNonce(): Hex {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return ('0x' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

// EIP-3009 TransferWithAuthorization, signed by the agent over Arc USDC.
async function signAuthorization(amount: bigint, nonce: Hex): Promise<Hex> {
  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account, transport: http(process.env.ARC_RPC_URL) });
  const now = Math.floor(Date.now() / 1000);
  return wallet.signTypedData({
    account,
    domain: {
      name: process.env.ARC_USDC_NAME || 'USDC',
      version: process.env.ARC_USDC_VERSION || '2',
      chainId: Number(process.env.ARC_CHAIN_ID || 0),
      verifyingContract: process.env.ARC_USDC as Address,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: (process.env.INTELLIGENCE_PAYEE || account.address) as Address,
      value: amount,
      validAfter: BigInt(0),
      validBefore: BigInt(now + 600),
      nonce,
    },
  });
}

// Hand the signed authorization to the Gateway facilitator to settle on-chain.
async function settleViaGateway(amount: bigint, nonce: Hex, signature: Hex): Promise<Hex | undefined> {
  const url = process.env.GATEWAY_API_URL;
  if (!url) return undefined; // intent recorded; settlement pending Gateway creds
  const r = await fetch(`${url}/x402/settle`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.GATEWAY_API_KEY ? { authorization: `Bearer ${process.env.GATEWAY_API_KEY}` } : {}),
    },
    body: JSON.stringify({ amount: amount.toString(), nonce, signature, asset: process.env.ARC_USDC }),
  });
  if (!r.ok) throw new Error(`Gateway settle ${r.status}`);
  return (await r.json()).txHash as Hex;
}

/** Charge the agent for one intelligence service. Returns a real signed receipt. */
export async function charge(service: Intelligence): Promise<PaymentReceipt> {
  const amount = PRICE[service];
  const nonce = randNonce();
  const signature = await signAuthorization(amount, nonce);
  let settleTxHash: Hex | undefined;
  let settled = false;
  try {
    settleTxHash = await settleViaGateway(amount, nonce, signature);
    settled = !!settleTxHash;
  } catch {
    settled = false; // keep the intent; surface cost regardless
  }
  return { service, amountUsd: Number(amount) / 1e6, nonce, signature, settled, settleTxHash };
}

/** Total USDC the agent spent on intelligence this cycle. */
export function totalCost(receipts: PaymentReceipt[]): number {
  return receipts.reduce((s, r) => s + r.amountUsd, 0);
}
