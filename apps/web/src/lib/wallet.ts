import type { Eip1193Provider } from "ethers";
import { api } from "./api";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export const hasWallet = () => typeof window !== "undefined" && Boolean(window.ethereum);

/**
 * Asks the browser wallet (e.g. MetaMask) to sign the server's one-time
 * message. Only a signature is produced; no transaction is sent.
 */
export async function signWalletChallenge(): Promise<{ address: string; signature: string }> {
  if (!window.ethereum) throw new Error("No browser wallet found. Install MetaMask or another Ethereum wallet.");
  // ethers is loaded only when a wallet is actually used.
  const { BrowserProvider } = await import("ethers");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const { message } = await api.walletNonce(address);
  const signature = await signer.signMessage(message);
  return { address, signature };
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
