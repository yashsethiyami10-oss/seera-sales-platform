"use client";
import { useState } from "react";
export function LoginForm() {
  const [error,setError]=useState(""),[loading,setLoading]=useState(false);
  return <form onSubmit={async(event)=>{event.preventDefault();setError("");setLoading(true);try{const form=new FormData(event.currentTarget),response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:form.get("email"),password:form.get("password")})});if(!response.ok)return setError("Sign-in failed. Check your details or try again later.");location.assign("/");}finally{setLoading(false);}}} style={{display:"grid",gap:12}} aria-busy={loading}><label>Email<input required name="email" type="email" autoComplete="username" /></label><label>Password<input required name="password" type="password" autoComplete="current-password" /></label><button type="submit" disabled={loading}>{loading?"Signing in…":"Sign in"}</button>{error&&<p role="alert">{error}</p>}</form>;
}
