"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HoustonAILogo } from "./HoustonAI";

export function LoginGate() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.reload();
        return;
      }
      toast.error("密码错误");
      setPassword("");
    } catch {
      toast.error("验证失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="houston-login-wrap">
      <form onSubmit={handleSubmit} className="houston-login-card">
        <div className="houston-login-logo">
          <HoustonAILogo />
        </div>
        <div>
          <h1 className="houston-login-title">请输入访问密码</h1>
          <p className="houston-login-sub">该应用受密码保护</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          autoFocus
          required
          className="houston-login-input"
        />
        <button
          type="submit"
          disabled={loading || !password}
          className="houston-login-button"
        >
          {loading ? "验证中……" : "进入"}
        </button>
      </form>
    </div>
  );
}
