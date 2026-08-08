"use client";
import { useState } from "react";
export function LoginForm() {
  const [error, setError] = useState("");
  return <form onSubmit={async (event) => { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }); if (!response.ok) return setError("Sign-in failed."); location.assign("/"); }} style={{ display: "grid", gap: 12 }}><label>Email<input required name="email" type="email" autoComplete="username" /></label><label>Password<input required name="password" type="password" autoComplete="current-password" /></label><button type="submit">Sign in</button>{error && <p role="alert">{error}</p>}</form>;
}
