import { normalizeIpfsPath } from "@dispute-resolver/core";
import { AuthorizationError, useAtlasProvider, type IAtlasProvider } from "@kleros/kleros-app";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getAccount, type Config } from "@wagmi/core";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useConfig } from "wagmi";
import { isUserRejection, useWallet } from "../wallet";
import { failure, reasonOf } from "./failures";
import { LIBRARY_ROLES, refuseFile, roleLimits } from "./limits";
import { browserSessionStorage, clearRejectedToken, isLiveToken, nowInSeconds, readStoredToken, tokenExpiry } from "./session";
import type { AtlasUploader, JsonUpload, UploadPhase, UploadResult, UploadRole } from "./types";

type Failure = Extract<UploadResult, { readonly ok: false }>;

/** How long the wrapper waits, once `authoriseUser()` resolves, for a committed render that carries the new session. */
export const SIGN_IN_SETTLE_MS = 10_000;

/** How long an upload waits for the library's `roles(CourtV1)` query to be fetched again when the limits are unknown. */
export const LIMITS_REFETCH_MS = 10_000;

/**
 * The library's query of the server's role restrictions (`@kleros/kleros-app` 3.1.0, registered in the app's
 * QueryClient). Its query function turns every error into `undefined` and it is never stale, and the app's QueryClient
 * neither retries nor refetches on focus, so one failed request at load would otherwise leave the limits unknown for the
 * whole session.
 */
const ROLE_RESTRICTIONS_KEY = ["RoleRestrictions"] as const;

/**
 * Fetches the library's role restrictions once more and returns what the cache then holds; gives up after
 * `LIMITS_REFETCH_MS`. The cache is read directly: the refetch resolves before React commits the library's new context.
 */
async function refetchRoleRestrictions(queryClient: QueryClient): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, LIMITS_REFETCH_MS);
  });
  try {
    await Promise.race([queryClient.refetchQueries({ queryKey: ROLE_RESTRICTIONS_KEY, exact: true }), timeout]);
  } catch {
    // A failed refetch leaves the cache as it was; the limits stay unknown.
  } finally {
    clearTimeout(timer);
  }
  return queryClient.getQueryData(ROLE_RESTRICTIONS_KEY);
}

interface Session {
  readonly atlas: IAtlasProvider;
  readonly token: string | null;
}

function isSessionLive(session: Session): boolean {
  return session.atlas.isVerified && isLiveToken(session.token, nowInSeconds());
}

function readLibraryToken(): string | null {
  return readStoredToken(browserSessionStorage());
}

/** The library writes the token together with a state update, so every write is followed by a render that reads it. */
function subscribeToRenders(): () => void {
  return () => undefined;
}

function serverToken(): null {
  return null;
}

/** The wallet an upload started with: the sign-in and the upload are refused if it disconnects or changes chain. */
interface WalletSnapshot {
  readonly connected: boolean;
  readonly chainId: number | null;
}

/** Why the wallet no longer matches the one the upload started with, or `null` when it still does. */
function walletChange(started: WalletSnapshot, now: WalletSnapshot): Failure | null {
  if (!now.connected) return failure.noWallet();
  if (now.chainId !== started.chainId) return failure.uploadFailed("the wallet changed chain");
  return null;
}

/** wagmi's current account, not the last committed render's: a `chainChanged` event updates it before React renders. */
function liveWallet(config: Config): WalletSnapshot {
  const account = getAccount(config);
  return account.status === "connected" ? { connected: true, chainId: account.chainId } : { connected: false, chainId: null };
}

/**
 * The mutation key of wagmi's `useSignMessage`, which the library signs in with. `authoriseUser()` awaits the nonce and
 * then asks for the signature with no hook in between, so the wallet is checked again in this mutation's `onMutate`.
 */
const SIGN_MESSAGE_KEY = ["signMessage"] as const;

class WalletChangedError extends Error {
  readonly refusal: Failure;

  constructor(refusal: Failure) {
    super(refusal.message);
    this.name = "WalletChangedError";
    this.refusal = refusal;
  }
}

/**
 * Must render inside the library's `AtlasProvider`. Nothing here runs at mount: the first signature is requested by the
 * first upload that needs one.
 */
export function useLibraryUploader(): AtlasUploader {
  const atlas = useAtlasProvider();
  const wallet = useWallet();
  const wagmiConfig = useConfig();
  const queryClient = useQueryClient();
  const token = useSyncExternalStore(subscribeToRenders, readLibraryToken, serverToken);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const committed = useRef<Session>({ atlas, token });
  const walletConnected = wallet.status === "connected";
  const walletChainId = wallet.status === "connected" ? wallet.chainId : null;
  const walletNow = useRef<WalletSnapshot>({ connected: walletConnected, chainId: walletChainId });
  const listeners = useRef(new Set<() => void>());
  const signingFor = useRef<WalletSnapshot | null>(null);

  // The library's `uploadFile` closes over the session of the render it came from: calling one from before the sign-in
  // silently returns `null`. Each commit is recorded here, so the upload can use the first one that has the new session.
  // The wallet is recorded too: an upload can wait seconds for the limits, and the user can disconnect meanwhile.
  useLayoutEffect(() => {
    committed.current = { atlas, token };
    walletNow.current = { connected: walletConnected, chainId: walletChainId };
    for (const listener of listeners.current) listener();
  }, [atlas, token, walletConnected, walletChainId]);

  // Registered before the library's provider runs its passive effects, where its sign-message mutation takes its options.
  useLayoutEffect(() => {
    queryClient.setMutationDefaults(SIGN_MESSAGE_KEY, {
      onMutate: () => {
        const started = signingFor.current;
        const refusal = started === null ? null : walletChange(started, liveWallet(wagmiConfig));
        if (refusal !== null) throw new WalletChangedError(refusal);
      },
    });
    return () => {
      queryClient.setMutationDefaults(SIGN_MESSAGE_KEY, {});
    };
  }, [queryClient, wagmiConfig]);

  const waitForNewSession = useCallback(
    (previousToken: string | null) =>
      new Promise<Session | null>((resolve) => {
        const pending = listeners.current;
        const finish = (session: Session | null) => {
          clearTimeout(timer);
          pending.delete(check);
          resolve(session);
        };
        const check = () => {
          const session = committed.current;
          if (session.token !== previousToken && isSessionLive(session)) finish(session);
        };
        const timer = setTimeout(() => {
          finish(null);
        }, SIGN_IN_SETTLE_MS);
        pending.add(check);
        check();
      }),
    [],
  );

  const signIn = useCallback(
    async (session: Session, started: WalletSnapshot): Promise<Session | Failure> => {
      signingFor.current = started;
      try {
        await session.atlas.authoriseUser();
      } catch (error) {
        if (error instanceof WalletChangedError) return error.refusal;
        return isUserRejection(error) ? failure.signInRejected() : failure.signInFailed(reasonOf(error));
      } finally {
        signingFor.current = null;
      }
      return (await waitForNewSession(session.token)) ?? failure.signInFailed("the session did not start");
    },
    [waitForNewSession],
  );

  const signInAndUpload = useCallback(
    async (file: File, role: UploadRole, started: WalletSnapshot): Promise<UploadResult> => {
      let session = committed.current;
      if (!isSessionLive(session)) {
        const beforeSignIn = walletChange(started, walletNow.current);
        if (beforeSignIn !== null) return beforeSignIn;
        setPhase("signing-in");
        const signedIn = await signIn(session, started);
        if ("ok" in signedIn) return signedIn;
        session = signedIn;
      }
      const beforeUpload = walletChange(started, walletNow.current);
      if (beforeUpload !== null) return beforeUpload;
      setPhase("uploading");
      let path: string | null;
      try {
        path = await session.atlas.uploadFile(file, LIBRARY_ROLES[role]);
      } catch (error) {
        // The library marks its session unverified on a 401 but keeps the token, which a reload would verify again.
        if (error instanceof AuthorizationError && session.token !== null) clearRejectedToken(browserSessionStorage(), session.token);
        return failure.uploadFailed(reasonOf(error));
      }
      if (path === null) return failure.uploadFailed(null);
      const canonical = normalizeIpfsPath(path);
      return canonical === null ? failure.notContentAddressed() : { ok: true, path: canonical };
    },
    [signIn],
  );

  const upload = useCallback(
    async (file: File, role: UploadRole): Promise<UploadResult> => {
      const started = walletNow.current;
      if (!started.connected) return failure.noWallet();
      const limits = roleLimits(committed.current.atlas.roleRestrictions, role) ?? roleLimits(await refetchRoleRestrictions(queryClient), role);
      if (limits === null) return failure.limitsUnavailable();
      const refusal = refuseFile(file, limits);
      if (refusal !== null) return failure.refused(refusal, limits);
      try {
        return await signInAndUpload(file, role, started);
      } finally {
        setPhase("idle");
      }
    },
    [queryClient, signInAndUpload],
  );

  const uploadJson = useCallback(
    (fileName: string, value: JsonUpload, role: UploadRole) => upload(new File([JSON.stringify(value)], fileName, { type: "application/json" }), role),
    [upload],
  );

  const { roleRestrictions, isVerified } = atlas;
  const limits = useCallback((role: UploadRole) => roleLimits(roleRestrictions, role), [roleRestrictions]);
  // The library re-checks the token at its `exp` and clears `isVerified` then, so the render needs only the `exp` presence.
  const isSignedIn = isVerified && token !== null && tokenExpiry(token) !== null;

  return useMemo(() => ({ availability: "ready", phase, isSignedIn, limits, upload, uploadJson }), [phase, isSignedIn, limits, upload, uploadJson]);
}
