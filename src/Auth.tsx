import { useState } from "react";
import { cloud } from "./storage";
export const accountEmail = (username: string) =>
  username.trim().toLowerCase() + "@household-ledger.invalid";
export function AuthForm({
  onSuccess,
  expectedUser,
  setup = false,
}: {
  onSuccess: (id: string) => void;
  expectedUser?: string;
  setup?: boolean;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!cloud) return;
        setBusy(true);
        setError("");
        try {
          if (!/^[a-zA-Z0-9_]{3,32}$/.test(username.trim()))
            throw Error("帳號請用 3–32 位英文、數字或底線");
          if (setup) {
            if (password !== confirmation) throw Error("兩次密碼不一致");
            const response = await cloud.functions.invoke("setup-household", {
              body: {
                token: token.trim(),
                username: username.trim(),
                password,
              },
            });
            if (response.error) {
              let message = "首次設定未完成，請確認設定碼或稍後再試。";
              try {
                message =
                  (await response.error.context.json()).error || message;
              } catch {}
              throw Error(message);
            }
            if (!response.data?.ok)
              throw Error(response.data?.error || "首次設定未完成");
          }
          const result = await cloud.auth.signInWithPassword({
            email: accountEmail(username),
            password,
          });
          if (result.error || !result.data.user)
            throw Error("登入失敗，請確認帳號、密碼與網路");
          if (expectedUser && result.data.user.id !== expectedUser) {
            await cloud.auth.signOut();
            throw Error("請使用原本的帳號，以保留並同步這個帳本");
          }
          const member = await cloud
            .from("ledger_accounts")
            .select("user_id")
            .eq("user_id", result.data.user.id)
            .maybeSingle();
          if (member.error || !member.data) {
            await cloud.auth.signOut();
            throw Error("這個帳號尚未啟用帳本，請先完成首次設定");
          }
          localStorage.setItem("ledger-last-owner", result.data.user.id);
          onSuccess(result.data.user.id);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {setup && (
        <label className="field">
          <span>首次設定碼</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="off"
            placeholder="貼上提供給你的單次設定碼"
          />
        </label>
      )}
      <label className="field">
        <span>共用帳號</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="例如：ourshop"
        />
      </label>
      <label className="field">
        <span>密碼{setup ? "（至少 12 位）" : ""}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={setup ? 12 : undefined}
          autoComplete={setup ? "new-password" : "current-password"}
        />
      </label>
      {setup && (
        <label className="field">
          <span>再次輸入密碼</span>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={!cloud || busy}>
        {busy
          ? "處理中…"
          : setup
            ? "建立家庭共用帳號"
            : expectedUser
              ? "重新驗證並同步"
              : "登入帳本"}
      </button>
    </form>
  );
}
